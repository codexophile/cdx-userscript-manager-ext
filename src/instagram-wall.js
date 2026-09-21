const config = {
  VIEWPORT_HEIGHT_PERCENTAGE: 0.85,
  VIEWPORT_WIDTH_PERCENTAGE: 0.6,
  AUTO_SCROLL_DELAY_MS: 900,
  HARVEST_DEBOUNCE_MS: 250,
};

const state = {
  isWallActive: false,
  wallEl: null,
  contentEl: null,
  observer: null,
  seenShortcodes: new Set(),
  autoScrollTimer: null,
  idleRounds: 0,
  isAutoMode: false,
  harvestDebounceTimer: null,
  carouselJobs: new Map(),
};

const QUERY_CAROUSEL_IMGS =
  'li img[style*="object-fit: cover"], [role="dialog"] img';

// --- small DOM builder ---
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(
      typeof child === 'string' ? document.createTextNode(child) : child,
    );
  }
  return node;
}

function injectStyles() {
  const vh = config.VIEWPORT_HEIGHT_PERCENTAGE * 100;
  const vw = config.VIEWPORT_WIDTH_PERCENTAGE * 100;
  const css = `
      #ig-wall-trigger {
        cursor: pointer;
        text-align: center;
        padding: 14px;
        margin: 8px 0;
        font-weight: 600;
        font-family: sans-serif;
        color: #ccc;
        border: 1px solid #363636;
        border-radius: 8px;
      }
      #ig-wall-trigger:hover { background: rgba(255,255,255,0.05); }

      #ig-wall-overlay {
        position: fixed; inset: 0; width: 100vw; height: 100vh;
        background: rgba(10,10,15,0.98); z-index: 9000;
        overflow-y: auto; -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px);
      }
      #ig-wall-content {
        display: flex; flex-wrap: wrap; gap: 14px;
        justify-content: center; align-items: flex-start;
        padding: 70px 20px 100px;
      }
      #ig-wall-close {
        position: fixed; top: 10px; right: 15px; z-index: 1000000;
        background: rgba(255,255,255,0.2); color: #fff; border: none;
        border-radius: 50%; width: 34px; height: 34px; font-size: 22px;
        line-height: 32px; text-align: center; cursor: pointer;
      }
      #ig-wall-close:hover { background: rgba(255,255,255,0.4); }

      #ig-wall-toolbar {
        position: fixed; top: 10px; left: 15px; z-index: 1000000;
        display: flex; gap: 8px;
      }
      #ig-wall-toolbar button {
        background: rgba(255,255,255,0.15); color: #fff; border: none;
        border-radius: 6px; padding: 8px 14px; font-size: 13px; cursor: pointer;
        font-family: sans-serif;
      }
      #ig-wall-toolbar button:hover { background: rgba(255,255,255,0.3); }
      #ig-wall-toolbar button.active { background: #4a9eff; }

      .ig-wall-item {
        /* width: 300px; max-width: ${vw}vw; */
        border: 1px solid #303030; border-radius: 8px; overflow: hidden;
        background: #111;
      }

      .ig-wall-link {
        display: flex;
        flex-wrap: wrap;
      }

      .ig-wall-item img {
        margin: 4px;
        max-width: 300px;
        display: block; width: 100%; max-height: ${vh}vh; object-fit: contain; background: #000;
      }
      .ig-wall-item video {
        display: block; width: 100%; max-height: ${vh}vh; object-fit: contain; background: #000;
      }
      .ig-wall-item .ig-wall-meta {
        display: flex; justify-content: space-between; align-items: center;
        padding: 6px 10px; font-family: sans-serif; font-size: 11px; color: #999;
      }
      .ig-wall-item a { color: #4a9eff; text-decoration: none; }
      .ig-wall-item a:hover { text-decoration: underline; }
      .ig-wall-badge {
        display: inline-block; font-size: 10px; padding: 2px 6px;
        border-radius: 4px; background: #222; color: #ccc; margin-right: 6px;
      }
      #ig-wall-status {
        width: 100%; text-align: center; color: #888; font-family: sans-serif;
        font-size: 13px; padding: 20px;
      }
    `;
  const styleTag = document.createElement('style');
  styleTag.textContent = css;
  document.head.appendChild(styleTag);
}

// --- helpers ---
function getShortcodeFromHref(href) {
  try {
    const path = new URL(href, location.origin).pathname;
    const match = path.match(/\/(p|reel)\/([^/]+)/);
    return match ? match[2] : null;
  } catch {
    return null;
  }
}

function isReelHref(href) {
  return getPostTypeFromHref(href) === 'Reel';
}

function getPostTypeFromHref(href) {
  try {
    const path = new URL(href, location.origin).pathname;
    if (path.startsWith('/reel/')) return 'Reel';
    if (path.startsWith('/p/')) return 'Post';
  } catch {
    // Ignore malformed links and let the caller use its fallback type.
  }
  return 'Unknown';
}

// Grid items for multi-media posts carry a small "stacked squares" icon
// purely for accessibility, so look for an aria-label rather than a class
// name � labels tend to survive redesigns much better than class names.
function isCarouselLink(link) {
  const labelled = link.querySelectorAll('[aria-label]');
  for (const node of labelled) {
    const label = node.getAttribute('aria-label') || '';
    if (/carousel|album|multiple photos/i.test(label)) return true;
  }
  return false;
}

function mediaFromNode(node) {
  if (node.tagName === 'VIDEO') {
    return {
      type: 'video',
      src: node.currentSrc || node.src || '',
      poster: node.poster || '',
      alt: '',
    };
  }
  return {
    type: 'image',
    src: bestSrcFromImg(node),
    poster: '',
    alt: node.getAttribute('alt') || '',
  };
}

function findCarouselMedia() {
  const media = [];
  const seen = new Set();
  for (const node of document.querySelectorAll(QUERY_CAROUSEL_IMGS)) {
    const item = mediaFromNode(node);
    if (!item.src || seen.has(item.src)) continue;
    seen.add(item.src);
    media.push(item);
  }
  return media;
}

function carouselImageSources() {
  return Array.from(document.querySelectorAll(QUERY_CAROUSEL_IMGS))
    .map(image => bestSrcFromImg(image))
    .filter(Boolean);
}

function waitForCarouselImages(previousSources = []) {
  return new Promise(resolve => {
    const finish = () => {
      clearTimeout(timeout);
      observer.disconnect();
      document.removeEventListener('load', check, true);
      resolve(carouselImageSources());
    };
    const timeout = setTimeout(finish, 1500);
    const check = () => {
      const sources = carouselImageSources();
      const hasNewSource = sources.some(src => !previousSources.includes(src));
      const next = findCarouselNextButton();
      if ((sources.length && hasNewSource) || !next || next.disabled) finish();
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'src',
        'srcset',
        'aria-label',
        'aria-disabled',
        'disabled',
      ],
    });
    document.addEventListener('load', check, true);
    check();
  });
}

function findCarouselNextButton() {
  const root = document.querySelector('[role="dialog"]') || document;
  return Array.from(
    root.querySelectorAll('button, [role="button"], [aria-label], [title]'),
  ).find(node => {
    const label = `${node.getAttribute('aria-label') || ''} ${
      node.getAttribute('title') || ''
    }`.trim();
    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return (
      /\bnext(?:\s+(?:slide|photo|item))?\b/i.test(label) &&
      !node.disabled &&
      node.getAttribute('aria-disabled') !== 'true' &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      rect.width > 0 &&
      rect.height > 0
    );
  });
}

function clickCarouselNextButton(button) {
  button.focus({ preventScroll: true });
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
    button.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, view: window }),
    );
  }
  button.click();
}

function findCarouselExpectedCount() {
  const root = document.querySelector('[role="dialog"]') || document.body;
  const labels = root.querySelectorAll(
    'button[aria-label], [role="button"][aria-label], [aria-label], [title]',
  );
  const texts = [root.innerText || ''];
  let slideButtonCount = 0;

  for (const node of labels) {
    const text = `${node.getAttribute('aria-label') || ''} ${
      node.getAttribute('title') || ''
    }`;
    texts.push(text);
    if (/\b(?:go to|view) slide\s+\d+/i.test(text)) slideButtonCount++;
  }

  let expectedCount = slideButtonCount;
  for (const text of texts) {
    for (const match of text.matchAll(
      /(?:\b\d+\s*\/\s*(\d+)\b|\b\d+\s+of\s+(\d+)\b|\btotal\s*[:.]?\s*(\d+)\b)/gi,
    )) {
      expectedCount = Math.max(
        expectedCount,
        Number(match[1] || match[2] || match[3]),
      );
    }
  }
  return expectedCount;
}

function waitForCarouselPageReady() {
  return new Promise(resolve => {
    const finish = () => {
      clearTimeout(timeout);
      observer.disconnect();
      document.removeEventListener('load', check, true);
      resolve();
    };
    const timeout = setTimeout(finish, 5000);
    const check = () => {
      const images = document.querySelectorAll(QUERY_CAROUSEL_IMGS);
      const hasLoadedImage = Array.from(images).some(image => image.complete);
      const hasPageCount = findCarouselExpectedCount() > 1;
      const hasNextSlide = Boolean(findCarouselNextButton());
      if (hasLoadedImage && (hasPageCount || hasNextSlide)) finish();
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('load', check, true);
    check();
  });
}

async function harvestCarouselInPostTab(jobId) {
  const shortcode = getShortcodeFromHref(location.href);
  await waitForCarouselPageReady();
  const expectedCountFromPage = findCarouselExpectedCount();
  const media = [];
  const seen = new Set();
  let previousSources = await waitForCarouselImages();

  for (let slide = 0; slide < 20; slide++) {
    for (const image of document.querySelectorAll(QUERY_CAROUSEL_IMGS)) {
      const currentSrc = bestSrcFromImg(image);
      if (currentSrc && !seen.has(currentSrc)) {
        seen.add(currentSrc);
        media.push(mediaFromNode(image));
      }
    }

    const next = findCarouselNextButton();
    if (!next || next.disabled || next.getAttribute('aria-disabled') === 'true')
      break;
    clickCarouselNextButton(next);
    previousSources = await waitForCarouselImages(previousSources);
  }

  const expectedCount = Math.max(expectedCountFromPage, media.length);

  chrome.runtime.sendMessage({
    type: 'ig-wall-carousel-result',
    jobId,
    shortcode,
    expectedCount,
    successfulCount: media.length,
    failedCount: Math.max(0, expectedCount - media.length),
    media,
  });
}

function bestSrcFromImg(img) {
  const srcset = img.getAttribute('srcset');
  if (!srcset) return img.currentSrc || img.src || '';
  let best = { url: img.currentSrc || img.src || '', width: 0 };
  for (const part of srcset.split(',')) {
    const [url, size] = part.trim().split(/\s+/);
    const width = parseInt(size, 10) || 0;
    if (url && width > best.width) best = { url, width };
  }
  return best.url;
}

function findPostLinks() {
  return Array.from(
    document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]'),
  ).filter(a => getShortcodeFromHref(a.href));
}

function harvestFromDocument() {
  if (!state.contentEl) return 0;
  const links = findPostLinks();
  let added = 0;
  for (const link of links) {
    const shortcode = getShortcodeFromHref(link.href);
    if (!shortcode || state.seenShortcodes.has(shortcode)) continue;
    const img = link.querySelector('img');
    if (!img) continue;
    state.seenShortcodes.add(shortcode);
    addWallItem({
      shortcode,
      href: new URL(link.href, location.origin).href,
      postType: getPostTypeFromHref(link.href),
      imgSrc: bestSrcFromImg(img),
      alt: img.getAttribute('alt') || '',
      isReel: isReelHref(link.href),
      isCarousel: isCarouselLink(link),
      media: [
        {
          type: 'image',
          src: bestSrcFromImg(img),
          poster: '',
          alt: img.getAttribute('alt') || '',
        },
      ],
    });
    added++;
  }
  return added;
}

function scheduleHarvest() {
  if (state.harvestDebounceTimer) return;
  state.harvestDebounceTimer = setTimeout(() => {
    state.harvestDebounceTimer = null;
    harvestFromDocument();
  }, config.HARVEST_DEBOUNCE_MS);
}

function addWallItem(item) {
  const card = createWallCard(item);
  state.contentEl.insertBefore(card, document.getElementById('ig-wall-status'));
  if (item.isCarousel) requestCarouselExpansion(item);
}

function getMediaTypeLabels(item) {
  const labels = [];
  const media = item.media || [];

  labels.push(item.postType || (item.isReel ? 'Reel' : 'Post'));
  if (item.isCarousel) labels.push('Carousel');
  if (media.some(entry => entry.type === 'video')) labels.push('Video');

  return labels;
}

function createWallCard(item) {
  const card = el('div', {
    className: 'ig-wall-item',
  });
  card.setAttribute('data-shortcode', item.shortcode);
  card.__igWallItem = item;
  const linkEl = el('a', {
    href: item.href,
    target: '_blank',
    rel: 'noopener noreferrer',
  });
  linkEl.classList.add('ig-wall-link');
  for (const media of item.media || []) {
    linkEl.appendChild(
      media.type === 'video'
        ? el('video', {
            src: media.src,
            poster: media.poster,
            controls: true,
            preload: 'metadata',
          })
        : el('img', {
            src: media.src,
            alt: media.alt || item.alt,
            loading: 'lazy',
          }),
    );
  }
  card.appendChild(linkEl);

  const meta = el('div', { className: 'ig-wall-meta' });
  for (const label of getMediaTypeLabels(item)) {
    meta.appendChild(el('span', { className: 'ig-wall-badge' }, label));
  }
  if (item.isCarousel) {
    meta.appendChild(
      el('span', { className: 'ig-wall-badge' }, `${item.media.length} items`),
    );
    if (item.expectedCount) {
      meta.appendChild(
        el(
          'span',
          { className: 'ig-wall-badge' },
          `Total ${item.expectedCount} | Success ${item.successfulCount} | Failed ${item.failedCount}`,
        ),
      );
    }
  }
  meta.appendChild(
    el(
      'a',
      { href: item.href, target: '_blank', rel: 'noopener noreferrer' },
      item.isCarousel ? 'View all slides' : 'Open original',
    ),
  );
  if (item.isCarousel && item.failedCount > 0) {
    const retryButton = el('button', {}, 'Retry failed items');
    retryButton.type = 'button';
    retryButton.onclick = event => {
      event.preventDefault();
      requestCarouselExpansion(item, true);
    };
    meta.appendChild(retryButton);
  }
  card.appendChild(meta);
  return card;
}

function requestCarouselExpansion(item, isRetry = false) {
  if (!item.isCarousel || state.carouselJobs.has(item.shortcode)) return;
  if (isRetry) {
    item.media = item.media.slice(0, 1);
    item.expectedCount = 0;
    item.successfulCount = 0;
    item.failedCount = 0;
  }
  state.carouselJobs.set(item.shortcode, true);
  chrome.runtime.sendMessage(
    {
      type: 'ig-wall-open-carousel',
      url: new URL(
        `/${item.isReel ? 'reel' : 'p'}/${item.shortcode}/`,
        location.origin,
      ).href,
    },
    response => {
      if (chrome.runtime.lastError || !response?.jobId) {
        state.carouselJobs.delete(item.shortcode);
      }
    },
  );
}

function onCarouselResult(message) {
  if (message.shortcode) state.carouselJobs.delete(message.shortcode);
  if (!state.contentEl || !message.shortcode || !message.media?.length) return;
  const card = Array.from(state.contentEl.children).find(
    node => node.dataset.shortcode === message.shortcode,
  );
  if (!card?.__igWallItem) return;
  const item = card.__igWallItem;
  item.media = message.media;
  item.expectedCount = message.expectedCount || message.media.length;
  item.successfulCount = message.successfulCount ?? message.media.length;
  item.failedCount =
    message.failedCount ??
    Math.max(0, item.expectedCount - item.successfulCount);
  card.replaceWith(createWallCard(item));
  updateCarouselStatus();
}

function updateCarouselStatus() {
  const carouselItems = Array.from(state.contentEl?.children || []).filter(
    node => node.__igWallItem?.isCarousel,
  );
  if (!carouselItems.length) return;
  const total = carouselItems.reduce(
    (sum, node) => sum + (node.__igWallItem.expectedCount || 0),
    0,
  );
  const successful = carouselItems.reduce(
    (sum, node) => sum + (node.__igWallItem.successfulCount || 0),
    0,
  );
  const failed = carouselItems.reduce(
    (sum, node) => sum + (node.__igWallItem.failedCount || 0),
    0,
  );
  setStatus(
    `Carousel media - Total: ${total} | Successful: ${successful} | Failed: ${failed}`,
  );
}

chrome.runtime.onMessage.addListener(message => {
  if (message?.type === 'ig-wall-start-carousel-harvest') {
    harvestCarouselInPostTab(message.jobId);
  } else if (message?.type === 'ig-wall-carousel-result') {
    onCarouselResult(message);
  }
});

function setStatus(text) {
  const status = document.getElementById('ig-wall-status');
  if (status) status.textContent = text;
}

function scrollRealPage(amount) {
  const scroller = document.scrollingElement || document.documentElement;
  scroller.scrollBy(0, amount);
  window.scrollBy(0, amount);
}

function stopAutoScroll() {
  if (state.autoScrollTimer) {
    clearInterval(state.autoScrollTimer);
    state.autoScrollTimer = null;
  }
  state.isAutoMode = false;
  const btn = document.getElementById('ig-wall-auto-btn');
  if (btn) {
    btn.classList.remove('active');
    btn.textContent = 'Auto-load: off';
  }
}

function startAutoScroll() {
  if (state.autoScrollTimer) return;
  state.isAutoMode = true;
  state.idleRounds = 0;
  const btn = document.getElementById('ig-wall-auto-btn');
  if (btn) {
    btn.classList.add('active');
    btn.textContent = 'Auto-load: on';
  }
  setStatus('Auto-loading�');

  state.autoScrollTimer = setInterval(() => {
    scrollRealPage(window.innerHeight * 2);
    setTimeout(() => {
      const added = harvestFromDocument();
      if (added === 0) {
        setStatus(
          `Still auto-loading (${state.seenShortcodes.size} posts loaded); waiting for more posts�`,
        );
      } else {
        state.idleRounds = 0;
        setStatus(`Loaded ${state.seenShortcodes.size} posts so far�`);
      }
    }, 500);
  }, config.AUTO_SCROLL_DELAY_MS);
}

function onKeyDown(e) {
  if (e.key === 'Escape' && state.isWallActive) closeWall();
}

function openWall() {
  if (state.isWallActive) return;
  state.isWallActive = true;

  const overlay = el('div', { id: 'ig-wall-overlay' });
  const content = el('div', { id: 'ig-wall-content' });
  const status = el(
    'div',
    { id: 'ig-wall-status' },
    'Scroll, click "Load more", or turn on Auto-load to pull in more posts',
  );
  content.appendChild(status);

  const closeBtn = el(
    'button',
    { id: 'ig-wall-close', title: 'Close (Esc)' },
    '�',
  );
  closeBtn.onclick = closeWall;

  const toolbar = el('div', { id: 'ig-wall-toolbar' });
  const loadMoreBtn = el('button', {}, 'Load more');
  loadMoreBtn.onclick = () => {
    scrollRealPage(window.innerHeight * 3);
    setTimeout(harvestFromDocument, 600);
  };
  const autoBtn = el('button', { id: 'ig-wall-auto-btn' }, 'Auto-load: off');
  autoBtn.onclick = () => {
    if (state.isAutoMode) stopAutoScroll();
    else startAutoScroll();
  };
  toolbar.appendChild(loadMoreBtn);
  toolbar.appendChild(autoBtn);

  overlay.appendChild(closeBtn);
  overlay.appendChild(toolbar);
  overlay.appendChild(content);
  document.body.appendChild(overlay);

  state.wallEl = overlay;
  state.contentEl = content;

  harvestFromDocument();

  state.observer = new MutationObserver(scheduleHarvest);
  state.observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('keydown', onKeyDown);
}

function closeWall() {
  stopAutoScroll();
  if (state.observer) {
    state.observer.disconnect();
    state.observer = null;
  }
  if (state.harvestDebounceTimer) {
    clearTimeout(state.harvestDebounceTimer);
    state.harvestDebounceTimer = null;
  }
  document.removeEventListener('keydown', onKeyDown);
  if (state.wallEl) state.wallEl.remove();
  state.wallEl = null;
  state.contentEl = null;
  state.isWallActive = false;
  state.seenShortcodes = new Set();
}

function insertTriggerButton() {
  if (document.getElementById('ig-wall-trigger')) return;

  const target =
    document.querySelector('main header') || document.querySelector('main');
  if (!target || !target.parentElement) {
    setTimeout(insertTriggerButton, 500);
    return;
  }

  const trigger = el(
    'div',
    { id: 'ig-wall-trigger' },
    'Open Full-Size Media Wall',
  );
  trigger.onclick = openWall;
  target.parentElement.insertBefore(trigger, target.nextSibling);
}

function initialize() {
  injectStyles();
  insertTriggerButton();
  if (/\/(p|reel)\/[^/]+/.test(location.pathname)) {
    chrome.runtime.sendMessage({ type: 'ig-wall-carousel-ready' });
  }
  // Instagram is a client-rendered SPA that swaps out the DOM on
  // navigation, so keep checking that the trigger button still exists.
  setInterval(insertTriggerButton, 2000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
