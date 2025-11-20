// === EXT FULL SCREEN MODULE (extracted) ===
(() => {
  const PANO_FS_SEL = '.location-preview__panorama';

  const S = { active:false, wrap:null, map:null, origParent:null, origNext:null };

  function ensureWrap(host) {
    if (S.wrap && S.wrap.isConnected) return S.wrap;
    const w = document.createElement('div');
    w.className = 'ext-mini-map';
    host.appendChild(w);
    S.wrap = w; return w;
  }

  function moveModeSelectorInto(host) {
    let modegroup = document.querySelector('.ext-mode-group');
    let panel = document.querySelector(host);
    if (!panel || !modegroup) return;
    if (modegroup.parentElement !== panel) {
      panel.appendChild(modegroup);
      modegroup.style.gridArea = 'mode';
    }
  }


  function ensurePageHookInjected() {
    if (window.__extPageHookInjected) return;a
    window.__extPageHookInjected = true;
    try { 
      chrome.runtime?.sendMessage?.({ type: 'INJECT_PAGE_HOOK' }, () => void 0); 
    } catch {}
  }

  function moveMapIntoMini(host) {
    const map = document.querySelector('.map-embed');
    if (!map || !host) return false;
    if (S.map === map && S.active) return true;
    if (!S.active) {
      S.origParent = map.parentNode || null;
      S.origNext = map.nextSibling || null;
    }

    ensureWrap(host);

    map.setAttribute('data-ext-mini', 'true');

    try { S.wrap.appendChild(map); } catch { return false; }
    S.map = map; S.active = true;
    try {
      ensurePageHookInjected();
    } catch {}

    return true;
  }

  function restoreMap() {
    if (!S.active || !S.map) return;
    const map = S.map;

    map.removeAttribute('data-ext-mini');

    if (S.origParent && S.origParent.isConnected) {
      try { S.origParent.insertBefore(map, S.origNext); } catch { S.origParent.appendChild(map); }
    }

    if (S.wrap && S.wrap.isConnected) {
      try { S.wrap.remove(); } catch { S.wrap.parentNode && S.wrap.parentNode.removeChild(S.wrap); }
    }

    S.active = false; S.wrap = null; S.map = null;
  }

  function moveElInto(el, host) {
    if (!host || !el) return;
    if (el.parentElement !== host) {
      host.appendChild(el);
    }
  }

  function isLPFullscreen() {
    const fs = document.fullscreenElement;
    return !!(fs && (fs.matches?.(PANO_FS_SEL) || fs.closest?.(PANO_FS_SEL)));
  }

  function currentFsHost() {
    const fs = document.fullscreenElement;
    if (!fs) return null;
    return fs.matches?.(PANO_FS_SEL) ? fs : (fs.closest?.(PANO_FS_SEL) || fs);
  }

  function onFSChange() {
    const host = currentFsHost();
    const body = document.body;
    const lppanels = document.querySelector('.ext-lp-panels');
    const lppanel3 = document.querySelector('.ext-lp-panel--p3');
    const locprev = document.querySelector('.location-preview');
    const dragui = document.querySelector('.ext-drag-ui');
    const controlpanel = document.querySelector('.ext-controls-panel');
    const modegroup = document.querySelector('.ext-mode-group');
    const lpmeta = document.querySelector('.location-preview__meta');

    const showtaglist = localStorage.getItem('fullscreenTagList');

    if (isLPFullscreen()) {

      moveMapIntoMini(host);
      moveElInto(lppanels, host);
      moveElInto(dragui, host);

      
      if (showtaglist === null ? true : JSON.parse(showtaglist)) {
        moveElInto(lpmeta, lppanel3);
        lppanel3.classList.remove('disabled');
      } else {
        lppanel3.classList.add('disabled');
      }
      
      try { moveModeSelectorInto('.ext-lp-panel--p2'); } catch {}
      try { host.querySelectorAll('.ext-mini-mode-toggle').forEach(n => n.remove()); } catch {}
      try { if (shouldShowFSMeta()) moveLPMetaInto(host); } catch {}
    } else {

      restoreMap();
      moveElInto(dragui, body);
      moveElInto(modegroup, controlpanel);
      if (showtaglist === null ? true : JSON.parse(showtaglist)) moveElInto(lpmeta, locprev);
      try {
        const host = currentFsHost() || document;
        host.querySelectorAll('.ext-mini-mode-toggle').forEach(n => n.remove());
      } catch {}
    }
  }

  document.addEventListener('fullscreenchange', onFSChange, true);

  try { onFSChange(); } catch {};
})();