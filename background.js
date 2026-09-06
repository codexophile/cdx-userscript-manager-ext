const carouselJobs = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'ig-wall-open-carousel') return;

  const jobId = crypto.randomUUID();
  carouselJobs.set(jobId, {
    parentTabId: sender.tab?.id,
    childTabId: null,
  });

  chrome.tabs.create({ url: message.url, active: false }, tab => {
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
  carouselJobs.delete(message.jobId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  for (const [jobId, job] of carouselJobs) {
    if (job.childTabId !== tabId) continue;
    chrome.tabs.sendMessage(tabId, {
      type: 'ig-wall-start-carousel-harvest',
      jobId,
    });
    break;
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  for (const [jobId, job] of carouselJobs) {
    if (job.childTabId === tabId) carouselJobs.delete(jobId);
  }
});
