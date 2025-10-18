'use strict';

(() => {
  if (window.__extWireDrawer) return;
  window.__extWireDrawer = true;

  function enhanceDrawer(el) {
    if (!el || el.dataset.extMounted === '1') return;
    el.dataset.extMounted = '1';

    el.classList.add('ext-drawer');
    if (el.classList.contains('importer')) {
      el.classList.add('ext-drawer--importer');
    } else if (el.classList.contains('duplicates')) {
      el.classList.add('ext-drawer--duplicates');
    }

    el.removeAttribute('hidden');
    try { el.style.removeProperty('display'); } catch (_) {}

    requestAnimationFrame(() => el.classList.add('is-open'));

    const commit = el.querySelector('[data-qa="import-commit"], [data-qa="export-commit"]');
    const discard = el.querySelector('[data-qa="import-discard"], [data-qa="export-discard"]');

    const duplicateKeep = el.querySelector('[data-qa="duplicate-keep"]');
    const duplicateDeleteAll = el.querySelector('[data-qa="duplicate-deleteall"]');
    const duplicateCancel = el.querySelector('[data-qa="duplicate-cancel"]');

    const close = () => {
      el.classList.remove('is-open');
      setTimeout(() => {
        if (!document.body.contains(el)) return;
        const hiddenNow = el.matches('[hidden]') || getComputedStyle(el).display === 'none';
        if (hiddenNow) {
          el.classList.remove('ext-drawer', 'ext-drawer--importer', 'ext-drawer--duplicates');
          el.removeAttribute('data-ext-mounted');
        }
      }, 500);
    };

    if (discard) discard.addEventListener('click', () => setTimeout(close, 0), { capture: false });
    if (commit)  commit.addEventListener('click',  () => setTimeout(close, 120), { capture: false });
    if (duplicateCancel) duplicateCancel.addEventListener('click', () => setTimeout(close, 0), { capture: false });
    if (duplicateKeep) duplicateKeep.addEventListener('click', () => setTimeout(close, 120), { capture: false });
    if (duplicateDeleteAll) duplicateDeleteAll.addEventListener('click', () => setTimeout(close, 120), { capture: false });
  }

  const scan = () => {
    enhanceDrawer(document.querySelector('.importer:not([data-ext-mounted="1"])'));
    enhanceDrawer(document.querySelector('.duplicates:not([data-ext-mounted="1"])'));
  };

  const runScan = window.__extCreatePanoAwareRunner ? window.__extCreatePanoAwareRunner(scan) : scan;

  runScan();
  const mo = new MutationObserver(() => runScan());
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
})();