//  MARK: Central mutation observer

// Central MutationObserver manager
const CentralObserverManager = (function () {
  // Private properties
  let mainObserver = null;
  const callbacks = new Map(); // Maps selectors to arrays of callback functions
  const processedElements = new Map(); // Maps selectors to Sets of processed elements

  // Process mutations for all registered callbacks
  function processMutations(mutations) {
    // Check for added nodes
    mutations.forEach(mutation => {
      if (mutation.type === 'childList') {
        // Process added nodes
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;

          // Check this node against all registered selectors
          callbacks.forEach((callbackArray, selector) => {
            // Check if the node itself matches
            if (node.matches(selector)) {
              executeCallbacks(node, selector, callbackArray);
            }

            // Check if any of its children match
            if (node.querySelector(selector)) {
              node.querySelectorAll(selector).forEach(element => {
                executeCallbacks(element, selector, callbackArray);
              });
            }
          });
        });

        // Handle removed nodes (if needed)
        mutation.removedNodes.forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          // Implementation for tracking removed nodes if needed
        });
      }
    });

    // Also check for all newly added elements that might match existing selectors
    // (this ensures we don't miss elements added through innerHTML or other means)
    callbacks.forEach((callbackArray, selector) => {
      document.querySelectorAll(selector).forEach(element => {
        executeCallbacks(element, selector, callbackArray);
      });
    });
  }

  // Execute callbacks for a matched element
  function executeCallbacks(element, selector, callbackArray) {
    // Get or create the Set of processed elements for this selector
    let processed = processedElements.get(selector);
    if (!processed) {
      processed = new Set();
      processedElements.set(selector, processed);
    }

    // Skip if already processed
    if (processed.has(element)) return;

    // Mark as processed and execute callbacks
    processed.add(element);
    callbackArray.forEach(callback => callback(element));
  }

  // Initialize the main observer
  function initializeObserver() {
    if (mainObserver) return; // Already initialized

    mainObserver = new MutationObserver(processMutations);
    mainObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    // Process existing elements on page
    callbacks.forEach((callbackArray, selector) => {
      document.querySelectorAll(selector).forEach(element => {
        executeCallbacks(element, selector, callbackArray);
      });
    });
  }

  return {
    // Register a callback for a specific selector
    observe: function (selector, callback, processExisting = true) {
      // Create or retrieve callback array for this selector
      if (!callbacks.has(selector)) {
        callbacks.set(selector, []);
        processedElements.set(selector, new Set());
      }

      callbacks.get(selector).push(callback);

      // Initialize observer if not already done
      initializeObserver();

      // Process existing elements if requested
      if (processExisting) {
        document.querySelectorAll(selector).forEach(element => {
          executeCallbacks(element, selector, callbacks.get(selector));
        });
      }

      // Return a function to remove this specific callback
      return function unobserve() {
        const callbackArray = callbacks.get(selector);
        if (callbackArray) {
          const index = callbackArray.indexOf(callback);
          if (index !== -1) {
            callbackArray.splice(index, 1);
          }

          // Remove the selector entry if no callbacks remain
          if (callbackArray.length === 0) {
            callbacks.delete(selector);
            processedElements.delete(selector);
          }
        }
      };
    },

    // Reset tracking for a specific selector
    resetSelector: function (selector) {
      if (processedElements.has(selector)) {
        processedElements.get(selector).clear();
      }
    },

    // Disconnect and clean up everything
    disconnect: function () {
      if (mainObserver) {
        mainObserver.disconnect();
        mainObserver = null;
      }
      callbacks.clear();
      processedElements.clear();
    },
  };
})();

// Modified version of waitForEach using the consolidated observer
function waitForEach(selector, callback, options = {}) {
  const { once = false } = options;
  let stopped = false;
  let unobserve;

  const stop = () => {
    stopped = true;
    unobserve?.();
  };

  const wrappedCallback = element => {
    if (stopped) return;

    const result = callback(element, { stop });
    if (result === false) stop();
  };

  // Register with observer manager
  unobserve = CentralObserverManager.observe(selector, wrappedCallback);

  // observe() may process existing elements synchronously before it returns.
  if (stopped) unobserve();

  // If once is true, unobserve after processing existing elements
  if (once) {
    setTimeout(stop, 0);
  }

  return {
    unobserve: stop,
    reload: () => {
      CentralObserverManager.resetSelector(selector);
    },
  };
}

// Modified version of waitFor using the consolidated observer
function waitFor(selector, textToMatch = null) {
  return new Promise(resolve => {
    // Check if element already exists
    const existing = [...document.querySelectorAll(selector)].find(
      element =>
        textToMatch === null || element.textContent.includes(textToMatch),
    );
    if (existing) {
      resolve(existing);
      return;
    }

    // Set up observer to wait for element
    const unobserve = CentralObserverManager.observe(
      selector,
      element => {
        if (
          textToMatch !== null &&
          !element.textContent.includes(textToMatch)
        ) {
          return;
        }
        unobserve(); // Remove the observer once found
        resolve(element);
      },
      false,
    ); // Don't process existing elements (we already checked)
  });
}

// Example implementation of markAndFilter using the consolidated observer
function markAndFilterCOM(
  itemSelector,
  uidSelector = 'a',
  uidAttribute,
  uidRegex,
) {
  // Initialize filter list from storage
  let filterList = GM_getValue('filterList', []);
  let filteredCountAllTime = GM_getValue('filteredCount', 0);

  createFilteredCountDiv();

  // Set up scroll detection using throttled scroll handler
  const scrollHandler = throttle(event => {
    document.querySelectorAll(itemSelector).forEach(item => {
      if (isScrolledPast(item)) {
        // Extract the unique ID from the element
        const uniqueId = getUid(item);
        if (!uniqueId) return;

        if (!filterList.includes(uniqueId)) {
          // Add the ID to the filter list
          filterList.push(uniqueId);
          // Ensure unique values
          filterList = [...new Set(filterList)];
          // Save to storage
          GM_setValue('filterList', filterList);
        }
      }
    });
  }, 200);

  window.addEventListener('scroll', scrollHandler);

  // Filter items as they appear in the page
  waitForEach(itemSelector, item => {
    // Extract the unique ID using the same method as above
    const uniqueId = getUid(item);

    if (uniqueId && filterList.includes(uniqueId)) {
      // Increase the filtered count
      filteredCountAllTime++;
      GM_setValue('filteredCount', filteredCountAllTime);

      // Update the counter display
      document.getElementById('filteredCountDiv').textContent =
        filteredCountAllTime;

      // Get information for the replacement div
      const title = item.querySelector('h2, h3, a')?.textContent || 'Link';
      const permalink =
        item.getAttribute('permalink') ||
        item.querySelector('a')?.getAttribute('href') ||
        '#';

      // Replace with filtered message
      const filterNoticeEl = replaceWith(
        item,
        `
        <div>
          <hr>
          <div>Filtered</div>
          <a target="_blank" href="${permalink}">${title}</a>
        </div>
      `,
      );
      style(
        filterNoticeEl,
        `
        outline: 2px solid red;
      `,
      );
    }
  });

  function getUid(itemEl) {
    const uidEl = itemEl.querySelector(uidSelector);
    if (!uidEl) return null;

    const uidAttrVal = uidAttribute
      ? uidEl.getAttribute(uidAttribute)
      : uidEl.textContent;

    if (!uidAttrVal) return null;

    const uid = uidRegex ? uidAttrVal.match(uidRegex)?.[1] : uidAttrVal;

    return uid;
  }

  function isScrolledPast(element) {
    const rect = element.getBoundingClientRect();
    return rect.bottom < 0; // Element has scrolled off the top of the viewport
  }

  // Helper throttle function
  function throttle(func, limit) {
    let inThrottle;
    return function () {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  // Create UI for filtered count if it doesn't exist
  function createFilteredCountDiv() {
    if (document.getElementById('filteredCountDiv')) return;

    const countDiv = document.createElement('div');
    countDiv.id = 'filteredCountDiv';
    countDiv.style.position = 'fixed';
    countDiv.style.top = '10px';
    countDiv.style.right = '10px';
    countDiv.style.padding = '5px';
    countDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
    countDiv.style.color = 'white';
    countDiv.style.borderRadius = '5px';
    countDiv.style.zIndex = '9999';
    countDiv.textContent = filteredCountAllTime;
    document.body.appendChild(countDiv);
  }

  // Return methods for manual control
  return {
    addToFilter: uniqueId => {
      if (!filterList.includes(uniqueId)) {
        filterList.push(uniqueId);
        GM_setValue('filterList', filterList);
      }
    },
    removeFromFilter: uniqueId => {
      filterList = filterList.filter(id => id !== uniqueId);
      GM_setValue('filterList', filterList);
    },
    clearFilters: () => {
      GM_setValue('filterList', []);
      GM_setValue('filteredCount', 0);
      document.getElementById('filteredCountDiv').textContent = '0';
    },
    cleanup: () => {
      window.removeEventListener('scroll', scrollHandler);
    },
  };
}

/**
 * Result info passed to the `onProcessed` callback.
 * @typedef {Object} ProcessedInfo
 * @property {string|null} id - The element's unique ID, or null if none was found.
 * @property {'marked'|'unmarked'|'skipped'} status - `marked`: filtered/replaced; `unmarked`: left in place with a Mark button; `skipped`: no ID, left untouched.
 * @property {boolean} isMarked - Shorthand for `status === 'marked'`.
 * @property {Element} currentEl - The element now in the DOM (the replacement if one was created, otherwise the original).
 * @property {Element|null} parentEl - The matched parent container, if `parentSelector` was given.
 */

/**
 * Adds a "Mark" button to each matching element and filters elements that were
 * marked previously. Marks persist via GM storage.
 *
 * @param {Object} options - Configuration options.
 * @param {string} options.mainSelector - Selector for the elements to make markable.
 * @param {string} [options.uidElSelector='a'] - Selector (inside each element) for the node holding the unique ID.
 * @param {string} [options.hrefElSelector=options.uidElSelector] - Selector (inside each element) for the link used by the default replacement.
 * @param {string|null} [options.parentSelector=null] - Ancestor selector; the ancestor is hidden when all its markable children are marked.
 * @param {string} [options.uidAttr='href'] - Attribute of the ID node that holds the unique ID.
 * @param {boolean} [options.dynamic=false] - Use `waitForEach` for content that loads over time. When false, all elements are collected in one pass.
 * @param {ParentNode} [options.root=document] - Root to search in when `dynamic` is false.
 * @param {function(Element): (Element|void)|null} [options.onMarked=null] - Custom handler for marked elements. May return the replacement element.
 * @param {function(Element, ProcessedInfo): void|null} [options.onProcessed=null] - Runs after each element is processed (and again after a manual click-to-mark).
 * @param {function(string): string} [options.normalizeId] - Transforms raw IDs before lookup/storage.
 * @param {string} [options.storageKey='marked'] - GM storage key for the marks object.
 * @returns {void}
 *
 * @example
 * // Static page: one pass, then count what happened
 * let hidden = 0;
 * makeMarkable({
 *   mainSelector: '.card',
 *   parentSelector: '.section',
 *   onProcessed: (el, { isMarked }) => { if (isMarked) hidden++; },
 * });
 *
 * @example
 * // Dynamic page
 * makeMarkable({ mainSelector: '.card', dynamic: true });
 */
function makeMarkable({
  mainSelector,
  uidElSelector = 'a',
  hrefElSelector = uidElSelector,
  parentSelector = null,
  uidAttr = 'href',
  dynamic = false,
  root = document,
  onMarked = null,
  onProcessed = null,
  normalizeId = id => id,
  storageKey = 'marked',
}) {
  mainSelector = `${mainSelector}:has(${uidElSelector})`;
  /**
   * Reads the marks object from storage.
   * @returns {Object<string, number>} Map of ID to the timestamp it was marked.
   */
  const load = () => GM_getValue(storageKey, {});

  let marked = load();

  /**
   * Extracts the normalized unique ID from an element.
   * @param {Element} el - The element to inspect.
   * @returns {string|null} The ID, or null if not found.
   */
  const getId = el => {
    const raw = el.querySelector(uidElSelector)?.getAttribute(uidAttr);
    return raw ? normalizeId(raw) : null;
  };

  /**
   * Persists a mark, re-reading storage first so other tabs' marks survive.
   * @param {string} id - The ID to mark.
   * @returns {void}
   */
  const saveMark = id => {
    marked = { ...load(), [id]: Date.now() };
    GM_setValue(storageKey, marked);
  };

  /**
   * Hides the parent container if it has no unmarked children left, else shows it.
   * @param {Element|null} parentEl - The parent container.
   * @returns {void}
   */
  const updateParent = parentEl => {
    if (!parentEl) return;
    const remaining = parentEl.querySelector(
      `${mainSelector}:not([data-marked])`,
    );
    parentEl.style.display = remaining ? '' : 'none';
  };

  /**
   * Applies the marked treatment (custom handler or default replacement).
   * @param {Element} el - The element to filter.
   * @param {Element|null} parentEl - The parent container to refresh.
   * @returns {Element} The element now representing it in the DOM.
   */
  const applyMarked = (el, parentEl) => {
    el.dataset.marked = '';
    const result = (onMarked || replaceMarkedElement)(el);
    updateParent(parentEl);
    return result instanceof Element ? result : el;
  };

  /**
   * Invokes the `onProcessed` callback, if provided.
   * @param {Element} el - The original element.
   * @param {ProcessedInfo} info - Details about the outcome.
   * @returns {void}
   */
  const notify = (el, info) => {
    if (onProcessed) onProcessed(el, info);
  };

  /**
   * Processes a single element: filters it if marked, otherwise adds the button.
   * Always calls `onProcessed` at the end, whatever the outcome.
   * @param {Element} el - The element to process.
   * @returns {void}
   */
  const processElement = el => {
    console.log(el);
    if ('markableInit' in el.dataset) return;
    el.dataset.markableInit = '';

    const parentEl = parentSelector ? el.closest(parentSelector) : null;
    const id = getId(el);

    if (!id) {
      notify(el, {
        id,
        status: 'skipped',
        isMarked: false,
        currentEl: el,
        parentEl,
      });
      return;
    }

    if (id in marked) {
      const currentEl = applyMarked(el, parentEl);
      notify(el, {
        id,
        status: 'marked',
        isMarked: true,
        currentEl,
        parentEl,
      });
      return;
    }

    if (getComputedStyle(el).position === 'static') {
      style(el, 'position: relative');
    }

    const btn = generateElements('<button type="button">Mark</button>', el);
    style(
      btn,
      `
      position: absolute;
      top: 0;
      right: 0;
      z-index: 1000;
      background-color: red;
      color: white;
      border: none;
      padding: 5px;
      cursor: pointer;
    `,
    );
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      saveMark(id);
      const currentEl = applyMarked(el, parentEl);
      notify(el, {
        id,
        status: 'marked',
        isMarked: true,
        currentEl,
        parentEl,
      });
    });

    updateParent(parentEl);
    notify(el, {
      id,
      status: 'unmarked',
      isMarked: false,
      currentEl: el,
      parentEl,
    });
  };

  if (dynamic) waitForEach(mainSelector, processElement);
  else root.querySelectorAll(mainSelector).forEach(processElement);

  /**
   * Default handler for marked elements: replaces them with a compact link.
   * @param {Element} el - The element to replace.
   * @returns {HTMLAnchorElement} The replacement link.
   */
  function replaceMarkedElement(el) {
    const a = document.createElement('a');
    a.href = el.querySelector(hrefElSelector)?.href || '#';
    a.textContent = el.textContent.replace(/\s+/g, ' ').trim();
    style(
      a,
      `
      display: inline-block;
      margin: 5px;
      padding: 5px;
      border: 1px solid yellow;
    `,
    );
    el.replaceWith(a);
    return a;
  }
}

// MARK: Mutation Observer

async function waitForThenObserve(selector, callback) {
  const element = await waitFor(selector);
  const observer = new MutationObserver(() => {
    callback(element);
  });
  observer.observe(element, {
    childList: true,
    subtree: true,
    attributes: true,
  });
}

function waitNotExist(selector) {
  return new Promise(resolve => {
    if (!document.querySelector(selector)) {
      return resolve('at start');
    }

    const observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) {
        observer.disconnect();
        return resolve('observer');
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
}
function waitForAll(selector) {
  // waitFor( '[role=main]' ).then( ( els ) => {} )

  return new Promise(resolve => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelectorAll(selector));
    }

    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        resolve(document.querySelectorAll(selector));
        observer.disconnect();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function waitForNew(selector) {
  document.querySelectorAll(selector).forEach(item => {
    item.classList.add('waitForNewDone');
  });

  return new Promise(async resolve => {
    const newEl = await waitFor(`${selector}:not(.waitForNewDone)`);
    resolve(newEl);
  });
}


//  MARK: Dom

/**
 * Trusted Types policy that passes HTML through unchanged.
 * Created once at module level, since creating a policy with the same name twice throws.
 * @type {TrustedTypePolicy}
 */
const htmlPolicy = trustedTypes.createPolicy('forceInner', {
  createHTML: input => input,
});

/**
 * Re-applies deferred `data-style` attributes through the CSSOM, which is
 * allowed under a strict CSP (unlike `style="..."` attributes).
 *
 * @param {ParentNode} root - Node whose descendants should be processed.
 * @returns {void}
 * @example
 * applyDeferredStyles(fragment); // <div data-style="color:red"> becomes red
 */
function applyDeferredStyles(root) {
  for (const el of root.querySelectorAll('[data-style]')) {
    el.style.cssText = el.getAttribute('data-style');
    el.removeAttribute('data-style');
  }
}

/**
 * Parses an HTML string into a DocumentFragment without tripping an
 * inline-style CSP. Any `style="..."` attribute is renamed to `data-style`
 * before parsing, then applied via the CSSOM.
 *
 * Note: the rename is a plain regex, so it can also match the literal text
 * ` style=` inside text content. Prefer writing `data-style` directly in
 * your templates if that matters.
 *
 * @param {string} html - HTML markup to parse.
 * @returns {DocumentFragment} The parsed content with styles applied.
 * @example
 * const frag = generateDoc('<div style="color:red">Hi</div>');
 * document.body.append(frag);
 */
function generateDoc(html) {
  const safeHtml = html.trim().replace(/(\s)style=/gi, '$1data-style=');

  const template = document.createElement('template');
  template.innerHTML = htmlPolicy.createHTML(safeHtml);

  const content = template.content;
  applyDeferredStyles(content);
  return content;
}

/**
 * Creates DOM elements from an HTML string, optionally appending them to a parent.
 *
 * @param {string} html - HTML markup to parse.
 * @param {Element} [parent] - If given, the created elements are appended to it.
 * @returns {Element|Element[]} A single element if exactly one was created, otherwise an array.
 * @example
 * const btn = generateElements('<button style="color:red">Go</button>', document.body);
 */
function generateElements(html, parent) {
  const doc = generateDoc(html);
  const created = [...doc.children];

  if (parent) parent.append(...created);

  return created.length === 1 ? created[0] : created;
}

function setInnerHTML(element, html, parent) {
  const escapeHTMLPolicy = trustedTypes.createPolicy('forceInner', {
    createHTML: to_escape => to_escape,
  });

  element.innerHTML = escapeHTMLPolicy.createHTML(html.trim());

  const children = [...element.children];
  let returnChildren = children;
  if (parent) {
    returnChildren = children.map(child => parent.appendChild(child));
  }
  return returnChildren.length === 1 ? returnChildren[0] : returnChildren;
}