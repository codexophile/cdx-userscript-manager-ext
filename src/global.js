(() => {
  const POPOVER_SELECTOR = '#cdx-main-popover';
  const TOOLBAR_SELECTOR = '.cdx-popover-toolbar';
  const SVGs = {
    removeHistory:
      '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="m785-289-58-58q16-29 24.5-63t8.5-70q0-117-81.5-198.5T480-760q-35 0-68.5 8.5T348-726l-59-59q43-26 91.5-40.5T480-840q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-480q0 53-14.5 101T785-289ZM520-554l-80-80v-46h80v126ZM792-56 672-176q-42 26-90 41t-102 15q-138 0-240.5-91.5T122-440h82q14 104 92.5 172T480-200q37 0 70.5-8.5T614-234L288-560H120v-168l-64-64 56-56 736 736-56 56Z"/></svg>',
  };

  waitFor('#cdx-main-popover > .cdx-popover-toolbar').then(el => {
    const removeHistoryBtnEl = generateElements(
      `<button>${SVGs.removeHistory}</button>`,
      el,
    );
    console.log(el, removeHistoryBtnEl);
  });

  function ensureTestButton() {
    const toolbar = document.querySelector(
      `${POPOVER_SELECTOR} ${TOOLBAR_SELECTOR}`,
    );
    if (!toolbar) return;

    const { generateElements } = globalThis.CDXUserscriptManager ?? {};
    if (typeof generateElements !== 'function') {
      console.error(
        'Cdx Userscripts Manager: generateElements is unavailable from lib.js.',
      );
      return;
    }

    const hasTestButton = Array.from(toolbar.querySelectorAll('button')).some(
      button => button.textContent.trim() === 'test',
    );
    if (hasTestButton) return;

    const removeHistoryBtnEl = document.createElement('button');
    generateElements(`${SVGs.removeHistory}`, removeHistoryBtnEl);
    toolbar.appendChild(removeHistoryBtnEl);
  }

  // const observer = new MutationObserver(ensureTestButton);
  // observer.observe(document.documentElement, {
  //   childList: true,
  //   subtree: true,
  //   attributes: true,
  //   attributeFilter: ['id', 'class'],
  //   characterData: true,
  // });

  // ensureTestButton();
})();
