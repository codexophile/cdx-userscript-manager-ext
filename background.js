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
