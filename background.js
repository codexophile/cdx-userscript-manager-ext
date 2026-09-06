const carouselJobs = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'ig-wall-open-carousel') return;

  const jobId = crypto.randomUUID();
  carouselJobs.set(jobId, {
    parentTabId: sender.tab?.id,
    childTabId: null,
    started: false,
  });

  chrome.tabs.create({ url: message.url, active: true }, tab => {
    const job = carouselJobs.get(jobId);
    if (job && tab?.id) job.childTabId = tab.id;
  });
  sendResponse({ jobId });
  return true;
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'ig-wall-carousel-ready') {
    for (const [jobId, job] of carouselJobs) {
      if (job.childTabId !== sender.tab?.id) continue;
      if (job.started) break;
      job.started = true;
      chrome.tabs.sendMessage(sender.tab.id, {
        type: 'ig-wall-start-carousel-harvest',
        jobId,
      });
      break;
    }
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
  chrome.tabs.remove(job.childTabId);
  if (job.parentTabId != null) {
    chrome.tabs.update(job.parentTabId, { active: true });
  }
  carouselJobs.delete(message.jobId);
});

chrome.tabs.onRemoved.addListener(tabId => {
  for (const [jobId, job] of carouselJobs) {
    if (job.childTabId === tabId) carouselJobs.delete(jobId);
  }
});
