// === EXT FULL SCREEN MODULE (extracted) ===
(() => {
  const PANO_FS_SEL = '.location-preview__panorama';

  const S = { active:false, wrap:null, map:null, origParent:null, origNext:null };
  const LP = { node:null, placeholder:null, origParent:null, origNext:null };
  const DU = { node:null, placeholder:null, origParent:null, origNext:null };
  const MButtons = { node:null, placeholder:null, origParent:null, origNext:null, panel:null };
  const LPMeta = { node:null, origParent:null, origNext:null, prevStyles:null, addedClasses:false };

  function ensureWrap(host) {
    if (S.wrap && S.wrap.isConnected) return S.wrap;
    const w = document.createElement('div');
    w.className = 'ext-mini-map';
    host.appendChild(w);
    S.wrap = w; return w;
  }

  function shouldShowFSMeta() {
    try {
      const raw = localStorage.getItem('fullscreenTagList');
      return raw === null ? true : JSON.parse(raw);
    } catch {
      return true;
    }
  }

  function moveLPMetaInto(host) {
    if (!host) return;
    const meta = LPMeta.node && LPMeta.node.isConnected ? LPMeta.node : document.querySelector('.location-preview__meta');
    if (!meta) return;

    if (!LPMeta.node) {
      LPMeta.node = meta;
      LPMeta.origParent = meta.parentNode || null;
      LPMeta.origNext = meta.nextSibling || null;
      LPMeta.prevStyles = {
        position: meta.style.position || '',
        zIndex: meta.style.zIndex || '',
        top: meta.style.top || '',
        left: meta.style.left || '',
        right: meta.style.right || '',
        bottom: meta.style.bottom || '',
        display: meta.style.display || ''
      };
    }

    meta.style.zIndex = 'calc(var(--z-lppanels) - 1)';
    meta.style.position = 'fixed';
    meta.style.top = '16px';
    meta.style.left = '16px';
    meta.style.right = 'auto';
    meta.style.bottom = 'auto';

    if (!LPMeta.addedClasses) {
      try {
        meta.classList.add('ext-lp-panel', 'ext-lp-panel--p3');
        LPMeta.addedClasses = true;
      } catch {}
    }

    if (meta.parentElement !== host) {
      try { host.appendChild(meta); } catch {}
    }
  }

  // Reuse only the mode buttons inside a dedicated FS overlay panel
  function moveModeButtonsInto(host) {
    if (!host) return;
    let modegroup = MButtons.node && MButtons.node.isConnected ? MButtons.node : document.querySelector('.ext-mode-group');
    if (!modegroup) return;
    if (!MButtons.node) {
      MButtons.node = modegroup;
      MButtons.origParent = modegroup.parentNode || null;
      MButtons.origNext = modegroup.nextSibling || null;
      try { MButtons.origParent && MButtons.origParent.insertBefore(MButtons.placeholder, MButtons.origNext); } catch {}
    }

    let panel = MButtons.panel && MButtons.panel.isConnected ? MButtons.panel : host.querySelector('.ext-lp-panel--p2');
    if (!panel) return;
    MButtons.panel = panel;

    if (modegroup.parentElement !== panel) {
      try { panel.appendChild(modegroup); syncFSModeIndicator(); modegroup.style.gridArea = 'mode'; } catch {}
    }
  }

  function restoreModeButtons() {
    if (!MButtons.node) return;
    try {
      const parent = MButtons.origParent;
      const next = MButtons.origNext;
      if (parent && parent.isConnected) {
        if (next && next.parentNode === parent) parent.insertBefore(MButtons.node, next);
        else parent.appendChild(MButtons.node);
      }
    } catch {}
    try { MButtons.placeholder && MButtons.placeholder.remove && MButtons.placeholder.remove(); } catch {}
    MButtons.placeholder = null; MButtons.node = null; MButtons.origParent = null; MButtons.origNext = null; MButtons.panel = null;
  }

  function syncFSModeIndicator() {
    const panel = MButtons.panel && MButtons.panel.isConnected ? MButtons.panel : null;
    if (!panel) return;
    const btnWrap = panel.querySelector('.ext-mode-buttons');
    const ind = panel.querySelector('.ext-mode-indicator');
    if (!btnWrap || !ind) return;
    const cur = (function(){ try { return localStorage.getItem('extClickMode') === 'move' ? 'move' : 'add'; } catch { return 'add'; } })();
    const target = btnWrap.querySelector(`.button[data-kind="${cur}"]`);
    if (!target) return;
    const gr = btnWrap.getBoundingClientRect();
    const br = target.getBoundingClientRect();
    const left = Math.max(1, Math.round(br.left - gr.left) + 4);
    const width = Math.round(br.width);
    ind.style.left = left + 'px';
    ind.style.width = width + 'px';
    ind.style.borderColor = (cur === 'add') ? 'var(--ext-mode-indicator-add)' : 'var(--ext-mode-indicator-move)';
  }

  try { window.__extFSIndicatorSync = syncFSModeIndicator; } catch {}

  function ensurePageHookInjected() {
    if (window.__extPageHookInjected) return;
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

  // --- LP panels: keep visible in fullscreen ---------------------------------

  function moveLPPanelsInto(host) {
    if (!host) return;
    const panels = document.querySelector('.ext-lp-panels');
    if (!panels) return;

    if (!LP.node) {
      LP.node = panels;
      LP.origParent = panels.parentNode || null;
      LP.origNext = panels.nextSibling || null;
      try { LP.origParent && LP.origParent.insertBefore(LP.placeholder, LP.origNext); } catch {}
    }

    if (panels.parentElement !== host) {
      try { host.appendChild(panels); } catch {}
    }
  }

  function moveDragUIInto(host) {
    if (!host) return;
    let ui = DU.node && DU.node.isConnected ? DU.node : document.querySelector('.ext-drag-ui');
    if (!ui) return;
    if (!DU.node) {
      DU.node = ui;
      DU.origParent = ui.parentNode || null;
      DU.origNext = ui.nextSibling || null;
      try { DU.origParent && DU.origParent.insertBefore(DU.placeholder, DU.origNext); } catch {}
    }
    if (ui.parentElement !== host) {
      try { host.appendChild(ui); } catch {}
    }
  }

  function restoreDragUI() {
    if (!DU.node) return;
    const parent = DU.origParent;
    const next = DU.origNext;
    try {
      if (parent && parent.isConnected) {
        if (next && next.parentNode === parent) parent.insertBefore(DU.node, next);
        else parent.appendChild(DU.node);
      }
    } catch {}
    try { DU.placeholder && DU.placeholder.remove && DU.placeholder.remove(); } catch {}
    DU.placeholder = null; DU.node = null; DU.origParent = null; DU.origNext = null;
  }

  function restoreLPMeta() {
    const meta = LPMeta.node && LPMeta.node.isConnected ? LPMeta.node : document.querySelector('.location-preview__meta');
    if (!meta) return;

    const parent = LPMeta.origParent;
    const next = LPMeta.origNext;

    if (parent && parent.isConnected) {
      try {
        if (next && next.parentNode === parent) parent.insertBefore(meta, next);
        else parent.appendChild(meta);
      } catch {}
    }

    if (LPMeta.prevStyles) {
      meta.style.position = LPMeta.prevStyles.position;
      meta.style.zIndex = LPMeta.prevStyles.zIndex;
      meta.style.top = LPMeta.prevStyles.top;
      meta.style.left = LPMeta.prevStyles.left;
      meta.style.right = LPMeta.prevStyles.right;
      meta.style.bottom = LPMeta.prevStyles.bottom;
      meta.style.display = LPMeta.prevStyles.display;
    } else {
      meta.style.position = '';
      meta.style.zIndex = '';
      meta.style.top = '';
      meta.style.left = '';
      meta.style.right = '';
      meta.style.bottom = '';
      meta.style.display = '';
    }

    if (LPMeta.addedClasses) {
      try { meta.classList.remove('ext-lp-panel', 'ext-lp-panel--p3'); } catch {}
    }

    LPMeta.node = null;
    LPMeta.origParent = null;
    LPMeta.origNext = null;
    LPMeta.prevStyles = null;
    LPMeta.addedClasses = false;
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
    if (isLPFullscreen()) {
      const host = currentFsHost();
      moveMapIntoMini(host);
      try { moveLPPanelsInto(host); } catch {}
      try { moveDragUIInto(host); } catch {}
      try { moveModeButtonsInto(host); } catch {}
      try { syncFSModeIndicator(); } catch {}
      try { host.querySelectorAll('.ext-mini-mode-toggle').forEach(n => n.remove()); } catch {}
      try { if (shouldShowFSMeta()) moveLPMetaInto(host); } catch {}
    } else {
      restoreMap();
      try { restoreDragUI(); } catch {}
      try { restoreModeButtons(); } catch {}
      try { restoreLPMeta(); } catch {}
      try {
        const host = currentFsHost() || document;
        host.querySelectorAll('.ext-mini-mode-toggle').forEach(n => n.remove());
      } catch {}
    }
  }

  const handleFullscreenMutations = () => {
    if (S.active && !isLPFullscreen()) restoreMap();
    if (isLPFullscreen()) {
      try {
        const host = currentFsHost();
        if (host) {
          moveLPPanelsInto(host);
          moveDragUIInto(host);
          moveModeButtonsInto(host);
          syncFSModeIndicator();
          applyLPMetaVisibility();
          host.querySelectorAll('.ext-mini-mode-toggle').forEach(n => n.remove()); 
        }
      } catch {}
    }
  };

  const fullscreenMutationHandler = window.__extCreatePanoAwareRunner ? window.__extCreatePanoAwareRunner(handleFullscreenMutations) : handleFullscreenMutations;
  const obs = new MutationObserver(fullscreenMutationHandler);
  obs.observe(document.documentElement, { childList:true, subtree:true });

  document.addEventListener('fullscreenchange', onFSChange, true);

  try { onFSChange(); } catch {};
  try { window.addEventListener('resize', () => { try { syncFSModeIndicator(); } catch {} }, { passive: true }); } catch {}
})();
