(() => {
  const POPOVER_SELECTOR = '#cdx-main-popover';
  const TOOLBAR_SELECTOR = '.cdx-popover-toolbar';
  const SVGs = {
    removeHistory:
      '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="m785-289-58-58q16-29 24.5-63t8.5-70q0-117-81.5-198.5T480-760q-35 0-68.5 8.5T348-726l-59-59q43-26 91.5-40.5T480-840q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-480q0 53-14.5 101T785-289ZM520-554l-80-80v-46h80v126ZM792-56 672-176q-42 26-90 41t-102 15q-138 0-240.5-91.5T122-440h82q14 104 92.5 172T480-200q37 0 70.5-8.5T614-234L288-560H120v-168l-64-64 56-56 736 736-56 56Z"/></svg>',
    addHistory: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M480-120q-138 0-240.5-91.5T122-440h82q14 104 92.5 172T480-200q117 0 198.5-81.5T760-480q0-117-81.5-198.5T480-760q-69 0-129 32t-101 88h110v80H120v-240h80v94q51-64 124.5-99T480-840q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-480q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-120Zm112-192L440-464v-216h80v184l128 128-56 56Z"/></svg>`,
    'new-window': `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H600v-80h160v-480H200v480h160v80H200Zm240 0v-246l-64 64-56-58 160-160 160 160-56 58-64-64v246h-80Z"/></svg>`,
  };

  waitForEach(`${POPOVER_SELECTOR} > ${TOOLBAR_SELECTOR}`, async toolbarEl => {
    const popoverEl = toolbarEl.closest(POPOVER_SELECTOR);
    const linkHref = popoverEl.querySelector('#link-href')?.textContent;

    if (linkHref) {
      createPopoverToolbarButton(
        SVGs['new-window'],
        toolbarEl,
        () => {
          chrome.runtime.sendMessage(
            { type: 'open-url-in-window', url: linkHref },
            response => {
              if (chrome.runtime.lastError) {
                console.error(
                  'Failed to open the URL in a new window:',
                  chrome.runtime.lastError.message,
                );
                return;
              }
              if (!response?.success) {
                console.error(
                  'Failed to open the URL in a new window:',
                  response?.error ?? 'Unknown error',
                );
              }
            },
          );
        },
        'Open in new window',
      );
      createPopoverToolbarButton(SVGs.removeHistory, toolbarEl, () => {
        chrome.runtime.sendMessage(
          { type: 'delete-history-url', url: linkHref },
          response => {
            if (chrome.runtime.lastError) {
              console.error(
                'Failed to delete the history entry:',
                chrome.runtime.lastError.message,
              );
              return;
            }
            if (!response?.success) {
              console.error(
                'Failed to delete the history entry:',
                response?.error ?? 'Unknown error',
              );
            }
          },
        );
      });
      createPopoverToolbarButton(SVGs.addHistory, toolbarEl, () => {
        chrome.runtime.sendMessage(
          { type: 'add-history-url', url: linkHref },
          response => {
            if (chrome.runtime.lastError) {
              console.error(
                'Failed to add the history entry:',
                chrome.runtime.lastError.message,
              );
              return;
            }
            if (!response?.success) {
              console.error(
                'Failed to add the history entry:',
                response?.error ?? 'Unknown error',
              );
            }
          },
        );
      });
    }
  });

  function createPopoverToolbarButton(
    svgHtml,
    parentEl,
    onClick,
    tooltipText = '',
  ) {
    const buttonEl = generateElements(`<button>${svgHtml}</button>`, parentEl);
    buttonEl.addEventListener('click', onClick);
    if (tooltipText) {
      buttonEl.setAttribute('title', tooltipText);
    }
    return buttonEl;
  }
})();
