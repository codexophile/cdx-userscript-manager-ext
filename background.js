const carouselJobs = new Map();
const carouselQueue = [];
let activeJobId = null;

function startNextCarouselJob() {
  if (activeJobId != null || carouselQueue.length === 0) return;

  const jobId = carouselQueue.shift();
  const job = carouselJobs.get(jobId);
  if (!job) return startNextCarouselJob();

  activeJobId = jobId;
  chrome.tabs.create({ url: job.url, active: true }, tab => {
    if (chrome.runtime.lastError || !tab?.id) {
      carouselJobs.delete(jobId);
      activeJobId = null;
      startNextCarouselJob();
      return;
    }
    job.childTabId = tab.id;
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'open-url-in-window') {
    if (typeof message.url !== 'string' || message.url.length === 0) {
      sendResponse({ success: false, error: 'A valid URL is required.' });
      return;
    }

    chrome.windows.create({ url: message.url, type: 'normal' }, window => {
      if (chrome.runtime.lastError || !window?.id) {
        sendResponse({
          success: false,
          error: chrome.runtime.lastError?.message ?? 'Failed to create window.',
        });
        return;
      }
      sendResponse({ success: true });
    });
    return true;
  }

  if (message?.type === 'add-history-url') {
    if (typeof message.url !== 'string' || message.url.length === 0) {
      sendResponse({ success: false, error: 'A valid URL is required.' });
      return;
    }

    chrome.history.addUrl({ url: message.url }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({
          success: false,
          error: chrome.runtime.lastError.message,
        });
        return;
      }
      sendResponse({ success: true });
    });
    return true;
  }

  if (message?.type === 'delete-history-url') {
    if (typeof message.url !== 'string' || message.url.length === 0) {
      sendResponse({ success: false, error: 'A valid URL is required.' });
      return;
    }

    chrome.history.deleteUrl({ url: message.url }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({
          success: false,
          error: chrome.runtime.lastError.message,
        });
        return;
      }
      sendResponse({ success: true });
    });
    return true;
  }

  if (message?.type !== 'ig-wall-open-carousel') return;

  const jobId = crypto.randomUUID();
  carouselJobs.set(jobId, {
    parentTabId: sender.tab?.id,
    childTabId: null,
    started: false,
    url: message.url,
  });
  carouselQueue.push(jobId);
  startNextCarouselJob();
  sendResponse({ jobId });
  return true;
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'ig-wall-carousel-ready') {
    const job = carouselJobs.get(activeJobId);
    if (!job || job.childTabId !== sender.tab?.id || job.started) return;
    job.started = true;
    chrome.tabs.sendMessage(sender.tab.id, {
      type: 'ig-wall-start-carousel-harvest',
      jobId: activeJobId,
    });
    return;
  }
  if (message?.type !== 'ig-wall-carousel-result') return;
  const job = carouselJobs.get(message.jobId);
  if (!job || sender.tab?.id !== job.childTabId) return;

  if (job.parentTabId != null) {
    chrome.tabs.sendMessage(job.parentTabId, {
      type: 'ig-wall-carousel-result',
      shortcode: message.shortcode,
      expectedCount: message.expectedCount,
      successfulCount: message.successfulCount,
      failedCount: message.failedCount,
      media: message.media,
    });
  }
  carouselJobs.delete(message.jobId);
  activeJobId = null;
  chrome.tabs.remove(job.childTabId, () => {
    if (job.parentTabId != null) {
      chrome.tabs.update(job.parentTabId, { active: true });
    }
    startNextCarouselJob();
  });
});

chrome.tabs.onRemoved.addListener(tabId => {
  for (const [jobId, job] of carouselJobs) {
    if (job.childTabId !== tabId) continue;
    carouselJobs.delete(jobId);
    if (activeJobId === jobId) {
      activeJobId = null;
      startNextCarouselJob();
    }
    break;
  }
});
