(() => {
  'use strict';

  let LAST_LOC_SIZE = null;

  let CUSTOM_DEFAULTS = undefined;
  let CUSTOM_DEFAULTS_PROMISE = null;

  const SYNC_STORAGE_KEY = 'extThemeState';
  const DEFAULT_FEATURE_FLAGS = Object.freeze({
    panelLayoutEnabled: true
  });
  const AUTO_SAVE_KEY = 'autoSave';
  const AUTO_SAVE_DEFAULT = -1;
  const SAVE_BUTTON_SELECTOR = '[data-qa="map-save"].button--primary';
  const SAVE_BUTTON_FULL_SELECTOR = `${SELECTORS.meta} ${SAVE_BUTTON_SELECTOR}`;

  let featureFlags = { ...DEFAULT_FEATURE_FLAGS };
  let featureFlagsReady = false;
  let hasRegisteredFlagWatcher = false;

  function isTypingTarget(el) {
    try {
      if (!el) return false;
      if (el.isContentEditable) return true;
      const tag = (el.tagName || '').toUpperCase();
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    } catch {
      return false;
    }
  }

  function sanitizeFeatureFlagPayload(raw) {
    const flags = { ...DEFAULT_FEATURE_FLAGS };
    if (raw && typeof raw === 'object') {
      if (typeof raw.panelLayoutEnabled === 'boolean') {
        flags.panelLayoutEnabled = raw.panelLayoutEnabled;
      }
    }
    return flags;
  }

  function featureFlagsEqual(a, b) {
    const flagsA = sanitizeFeatureFlagPayload(a);
    const flagsB = sanitizeFeatureFlagPayload(b);
    return flagsA.panelLayoutEnabled === flagsB.panelLayoutEnabled;
  }

  function loadFeatureFlags() {
    return new Promise((resolve) => {
      if (!chrome?.storage?.sync?.get) {
        resolve({ ...DEFAULT_FEATURE_FLAGS });
        return;
      }
      try {
        chrome.storage.sync.get(SYNC_STORAGE_KEY, (result) => {
          if (chrome.runtime?.lastError) {
            resolve({ ...DEFAULT_FEATURE_FLAGS });
            return;
          }
          const state = result?.[SYNC_STORAGE_KEY];
          resolve(sanitizeFeatureFlagPayload(state?.featureFlags));
        });
      } catch {
        resolve({ ...DEFAULT_FEATURE_FLAGS });
      }
    });
  }

  function watchFeatureFlagChanges() {
    if (hasRegisteredFlagWatcher || !chrome?.storage?.onChanged) return;
    hasRegisteredFlagWatcher = true;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') return;
      const entry = changes?.[SYNC_STORAGE_KEY];
      if (!entry) return;
      const nextFlags = sanitizeFeatureFlagPayload(entry.newValue?.featureFlags);
      if (!featureFlagsEqual(featureFlags, nextFlags)) {
        featureFlags = nextFlags;
        window.setTimeout(() => {
          try {
            window.location.reload();
          } catch {}
        }, 50);
      }
    });
  }

  function isPanelLayoutEnabled() {
    return !!featureFlags.panelLayoutEnabled;
  }

  const ps = (() => {
    const CFG = {
      overview: { keySize: 'overview:size', minW: OVERVIEW_MIN_W, minHBase: OVERVIEW_MIN_H },
      locprev: { keySize: 'locprev:size', minW: LOCPREV_MIN_W, minHBase: 1 }
    };
    const K = { info: '__extPanelInfo', mo: '__extFitMO', ro: '__extFitRO', te: '__extFitTE' };

    const getPanelInfo = (el) => {
      if (el[K.info]) return el[K.info];
      const kind = el?.matches?.(SELECTORS.overview) ? 'overview' : (el?.matches?.(SELECTORS.locprev) ? 'locprev' : null);
      const cfg = CFG[kind] || null;
      return (el[K.info] = { kind, cfg });
    };

    function apply(el, w, h) {
      const { kind, cfg } = getPanelInfo(el);
      if (!cfg) return;

      const MAX_H = getMaxPanelHeight();
      const W = Math.max(cfg.minW, Math.round(w ?? cfg.minW));
      const H = Math.min(MAX_H, Math.max(cfg.minHBase, Math.round(h ?? cfg.minHBase)));

      el.style.width = `${W}px`;
      el.style.minHeight = `${cfg.minHBase}px`;
      el.style.height = `${H}px`;

      if (kind === 'locprev') {
        updateLocPrevTagListHeight(el);
      }

      if (kind === 'overview') {
        const scroller = el.querySelector('.ext-overview-scroller');
        if (!scroller) return;
        const OVERFLOW_TOGGLE_H = getOverviewOverflowThreshold();
        scroller.style.setProperty('overflow-y', H >= OVERFLOW_TOGGLE_H ? 'auto' : 'hidden', 'important');
      }
    }

    async function persist(el) {
      const { cfg } = getPanelInfo(el);
      if (!cfg) return;
      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      await setSavedPos(cfg.keySize, { w, h, savedAt: Date.now() });
    }

    async function restore(el) {
      const { kind, cfg } = getPanelInfo(el);
      if (!cfg) return;

      const saved = await getSavedPos(cfg.keySize);
      const maxAllowedWidth = window.innerWidth - 100; // Safety margin
      const safeMaxWidth = Number.isFinite(maxAllowedWidth) ? Math.max(1, maxAllowedWidth) : Math.max(1, cfg.minW);

      if (saved?.w && saved?.h) {
        const constrainedWidth = Math.min(saved.w, safeMaxWidth);
        apply(el, constrainedWidth, saved.h);
        try {
          const floor = measureContentFloorForWidth(el, Math.max(cfg.minW, constrainedWidth), cfg.minHBase);
          el.__extLastContentFloor = floor;
          el.__extJustRestored = true;
        } catch {}
        return;
      }

      if (kind === 'locprev' || kind === 'overview') {
        const desiredWidth = Math.max(1, cfg.minW);
        const width = Math.round(Math.max(1, Math.min(desiredWidth, safeMaxWidth)));
        const minHeight = kind === 'locprev'
          ? Math.max(1, LOCPREV_BASE_H)
          : Math.max(1, cfg.minHBase);
        let floor = measureContentFloorForWidth(el, width, minHeight);
        if (!Number.isFinite(floor)) floor = minHeight;
        const maxHeight = getMaxPanelHeight();
        const boundedFloor = Math.max(minHeight, floor);
        const height = Math.round(Math.max(1, Math.min(maxHeight, boundedFloor)));

        apply(el, width, height);
        el.__extLastContentFloor = boundedFloor;
        el.__extJustRestored = true;
        return;
      }

      const r = el.getBoundingClientRect();
      const desired = Math.max(cfg.minW, Math.round(r.width || cfg.minW));
      const w = Math.round(Math.max(1, Math.min(desired, safeMaxWidth)));
      const h = Math.max(cfg.minHBase, Math.round(r.height || cfg.minHBase));
      apply(el, w, h);
      el.__extLastContentFloor = measureContentFloorForWidth(el, w, cfg.minHBase);
      el.__extJustRestored = true;
    }

    async function fit(el) {
      if (!el || !(el.offsetParent || el.getClientRects().length > 0)) return;
      const { kind, cfg } = getPanelInfo(el);
      if (!cfg) return;

      const MAX_H = getMaxPanelHeight();
      const TOL = 2;
      let didResize = false;

      const floorNow = measureContentFloorForWidth(el, el.offsetWidth, cfg.minHBase);
      const desiredH = Math.min(floorNow, MAX_H);
      const currentH = Math.round(el.offsetHeight);

      const prevFloor = el.__extLastContentFloor ?? null;
      const wasAtMinBefore = (prevFloor != null && prevFloor <= MAX_H && Math.abs(currentH - Math.round(prevFloor)) <= TOL);

      const delta = desiredH - currentH;

      if (Math.abs(delta) > TOL) {
        let shouldResize = false;
        if (delta > 0) { // Grow
          shouldResize = true;
        } else { // Shrink
          shouldResize = (kind === 'locprev') || (kind === 'overview' && wasAtMinBefore);
        }

        if (shouldResize) {
          const applyResize = () => apply(el, el.offsetWidth, desiredH);
          if (el.__extJustRestored) {
            __extWithTransitionSuppressed(el, applyResize);
          } else {
            applyResize();
          }
          didResize = true;
          await persist(el);
        }
      }

      el.__extLastContentFloor = floorNow;
      if (el.__extJustRestored) {
        el.__extJustRestored = false;
      }
      if (kind === 'locprev' && !didResize) {
        updateLocPrevTagListHeight(el);
      }
    }

    function observe(el) {
      const { kind } = getPanelInfo(el);
      if (!kind) return;

      const tryFit = rafThrottle(() => {
        if (el.__extDragging || el.__extResizing) return;
        void fit(el);
      });

      if (!el[K.mo]) {
        const mo = new MutationObserver(tryFit);
        const target = (kind === 'overview') ? el.querySelector('.ext-overview-scroller') : el;
        mo.observe(target || el, { childList: true, subtree: true, attributes: true });
        el[K.mo] = mo;
      }

      if (!el[K.ro]) {
        let lastWidth = 0, lastHeight = 0;
        const ro = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry) return;

          const { width, height } = entry.contentRect;
          if (width !== lastWidth || height !== lastHeight) {
            tryFit();
            lastWidth = width;
            lastHeight = height;
          }

          if (kind === 'overview' && entry.target === el) {
            const scroller = el.querySelector('.ext-overview-scroller');
            if (!scroller) return;
            const THRESH = getOverviewOverflowThreshold();
            const newOverflow = (entry.contentRect.height >= THRESH) ? 'auto' : 'hidden';
            if (scroller.style.overflowY !== newOverflow) {
              scroller.style.setProperty('overflow-y', newOverflow, 'important');
            }
          }
        });
        ro.observe(el);
        el[K.ro] = ro;
      }

      if (!el[K.te]) {
        const onTEnd = (e) => {
          if (e?.propertyName === 'height' || e?.propertyName === 'max-height') tryFit();
        };
        el.addEventListener('transitionend', onTEnd, true);
        el[K.te] = onTEnd;
      }

      if (kind === 'overview' && !el.__extMaxWidthSync) {
        el.__extMaxWidthSync = true;
        const ro = new ResizeObserver(() => {
          const scroller = el.querySelector('.ext-overview-scroller');
          if (!scroller) return;
          const newMaxWidth = `${el.offsetWidth - 18}px`;
          scroller.querySelectorAll('.tool-block, .ext-list-block, .selection-manager__selections').forEach(child => {
            child.style.maxWidth = newMaxWidth;
          });
        });
        ro.observe(el);
      }
    }

    return { apply, restore, persist, fit, observe };
  })();

  function measureWithTempStyles(el, targetW, measureFn) {
    const { width, height, minHeight } = el.style;
    el.style.width = `${Math.round(targetW)}px`;
    el.style.height = 'auto';
    el.style.minHeight = '0px';

    try {
      return measureFn();
    } finally {
      el.style.width = width;
      el.style.height = height;
      el.style.minHeight = minHeight;
    }
  }

  function measureContentFloorForWidth(el, targetW, minHBase) {
    const isOverview = el.matches(SELECTORS.overview);
    const isLocPrev = el.matches(SELECTORS.locprev);

    let floor = 0;

    if (isOverview) {
      floor = measureWithTempStyles(el, targetW, () => {
        const measureTarget = el.querySelector('.ext-overview-scroller');
        return measureTarget?.scrollHeight ?? 0;
      });
    } else if (isLocPrev) {
      const tagsContainer = el.querySelector('.location-preview__tags');
      if (!tagsContainer) return LOCPREV_BASE_H;

      floor = measureWithTempStyles(el, targetW, () => {
        const bottomPadding = 8;
        return tagsContainer.offsetTop + tagsContainer.scrollHeight + bottomPadding;
      });
    } else {
      floor = measureWithTempStyles(el, targetW, () => el.scrollHeight ?? 0);
    }

    return Math.max(minHBase, Math.ceil(floor));
  }

  function setPanelToMinSize(el) {
    const MAX_H = getMaxPanelHeight();
    if (!el) return;
    const isOverview = el.matches && el.matches(SELECTORS.overview);
    const minW = isOverview ? OVERVIEW_MIN_W : LOCPREV_MIN_W;
    const minHBase = isOverview ? OVERVIEW_MIN_H : 1;

    let floor = measureContentFloorForWidth(el, minW, minHBase);
    if (isOverview) { floor = Math.min(floor, MAX_H); }

    el.style.minWidth  = minW + 'px';
    el.style.width     = minW + 'px';
    el.style.minHeight = minHBase + 'px';
    el.style.height    = floor + 'px';
    el.__extLastContentFloor = floor;
    el.__extJustRestored = true;
  }

  function updateLocPrevTagListHeight(panelEl) {
    if (!panelEl || !panelEl.isConnected) return;
    const tags = panelEl.querySelector('.location-preview__tags');
    if (!tags) return;

    const panelRect = panelEl.getBoundingClientRect();
    const tagsRect  = tags.getBoundingClientRect();
    const bottomPadding = 8;

    const available = Math.max(20, (panelRect.top + panelRect.height) - tagsRect.top - bottomPadding);

    tags.style.maxHeight = available + 'px';
    tags.style.overflowY = (panelRect.height >= getMaxPanelHeight()) ? 'auto' : 'hidden';
  }

  // ------------------------------ Resizing (helpers) ----------------------

  function setResizeUIEnabled(el, enabled) {
    if (!el) return;
    if (enabled) el.classList.add('ext-resize-on');
    else el.classList.remove('ext-resize-on');
  }

  function updateResizeHandleTitles(el) {
    el.querySelectorAll('.ext-resize-handle').forEach(h => {
      h.title = 'Resize panel';
    });
  }

  // ------------------------------ Corner Resizers -------------------------
  function ensurePanelResizeUI(el) {
    if (!el || el.__extResizerBound) return;
    el.__extResizerBound = true;

    const isOverview = el.matches(SELECTORS.overview);
    const minW = isOverview ? OVERVIEW_MIN_W : LOCPREV_MIN_W;
    const minHBase = isOverview ? OVERVIEW_MIN_H : 1;
    const corners = ['br', 'bl', 'tr', 'tl'];
    const pad = 8;

    const makeHandle = (corner) => {
      const handle = document.createElement('div');
      handle.className = `ext-resize-handle ext-resize-${corner}`;
      const rotationMap = { br: '0deg', bl: '90deg', tl: '180deg', tr: '270deg' };
      handle.style.transform = `rotate(${rotationMap[corner] ?? '0deg'})`;
      handle.style.transformOrigin = '50% 50%';
      el.appendChild(handle);

      const onDown = (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();

        el.__extResizing = true;
        el.__extAtCurrentMin = false;
        const bodyStyle = document.body.style;
        bodyStyle.userSelect = 'none';
        try { handle.setPointerCapture?.(ev.pointerId); } catch {}

        if (isOverview) {
          try { __extCloseAllOverlays(); } catch {}
        }

        const isLocPrev = !isOverview;
        const MAX_H = getMaxPanelHeight();
        const computedStyle = getComputedStyle(el);
        let cssMaxW = Infinity;
        const v = parseFloat(computedStyle.maxWidth);
        if (v > 0) cssMaxW = Math.max(v, minW);

        const rect = el.getBoundingClientRect();
        const w0 = rect.width, h0 = rect.height;
        const left0 = __extLeftFromStyleOrRect(el), top0 = Math.round(rect.top);

        let ax, ay; // Anchor point
        switch (corner) {
          case 'bl': ax = left0 + w0; ay = top0; break;
          case 'tr': ax = left0; ay = top0 + h0; break;
          case 'tl': ax = left0 + w0; ay = top0 + h0; break;
          default:   ax = left0; ay = top0; break; // 'br'
        }

        const maxW = (corner === 'br' || corner === 'tr') ? Math.max(minW, window.innerWidth - ax - pad) : Math.max(minW, ax - pad);
        const maxH = (corner === 'br' || corner === 'bl') ? Math.max(1, window.innerHeight - ay - pad) : Math.max(1, ay - pad);

        if (typeof el.__extLastFittingW !== 'number') {
          el.__extLastFittingW = Math.round(el.offsetWidth || minW);
        }

        const applyAtCorner = (w, h) => {
          let L = ax, T = ay;
          if (corner === 'bl' || corner === 'tl') L = ax - w;
          if (corner === 'tr' || corner === 'tl') T = ay - h;
          el.style.width = `${Math.round(w)}px`;
          el.style.height = `${Math.round(h)}px`;
          el.style.left = `${Math.round(L)}px`;
          el.style.top = `${Math.round(T)}px`;
        };

        let raf = 0, lastEvt = null;
        const onFrame = () => {
          const e = lastEvt;
          raf = 0;
          if (!e) return;

          const mx = Math.min(Math.max(e.clientX, pad), window.innerWidth - pad);
          const my = Math.min(Math.max(e.clientY, pad), window.innerHeight - pad);
          let w = Math.abs(mx - ax);

          if (isLocPrev) {
            const finalW = Math.max(minW, Math.min(w, maxW, cssMaxW));
            const requiredH = measureContentFloorForWidth(el, finalW, minHBase);
            const finalH = Math.min(requiredH, MAX_H, maxH);
            applyAtCorner(finalW, finalH);
            el.style.minHeight = `${requiredH}px`;
            updateLocPrevTagListHeight(el);
          } else { // isOverview
            const hFromMouse = Math.abs(my - ay);
            const Wmouse = Math.min(Math.max(minW, w), maxW, cssMaxW);
            let contentFloor = measureContentFloorForWidth(el, Wmouse, minHBase);
            contentFloor = measureContentFloorForWidth(el, Wmouse, minHBase);
            const finalH = Math.min(Math.max(Math.min(contentFloor, MAX_H), hFromMouse), maxH);
            applyAtCorner(Wmouse, finalH);
            el.style.minHeight = `${Math.min(contentFloor, MAX_H)}px`;
          }
        };

        const onMove = (e) => { lastEvt = e; if (!raf) raf = requestAnimationFrame(onFrame); };

        const cleanup = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', cleanup);
          el.__extResizing = false;
          bodyStyle.userSelect = '';
        };

        const onUp = async () => {
          cleanup();
          el.style.minHeight = `${minHBase}px`; // Release temp min-height
          if (isOverview) {
            await ps.persist(el);
            await ps.fit(el);
          } else {
            await ps.persist(el);
            await ps.fit(el);
          }
        };

        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp, { passive: true });
        window.addEventListener('pointercancel', cleanup, { passive: true });
      };

      handle.addEventListener('pointerdown', onDown, { passive: false });
      return handle;
    };

    corners.forEach(makeHandle);
    updateResizeHandleTitles(el);
  }

  // ------------------------------ Drag mode (global) ----------------------
  let DRAG_MODE = (window.extState?.getState('isLayoutEditing') ?? false);
  let SETTINGS_OPEN = false;

  function isLPFullscreen() {
    const fe = document.fullscreenElement;
    return !!(fe && (fe.matches?.(SELECTORS.locprevPanorama) || fe.closest?.(SELECTORS.locprevPanorama)));
  }

  function getLPPanelElements() {
    try {
      return Array.from(document.querySelectorAll(`${SELECTORS.lpPanelP1}, ${SELECTORS.lpPanelP2}`));
    } catch {
      return [];
    }
  }

  function getDraggables() {
    const els = [];
    const add = (el) => {
      if (!el) return;
      if (!els.includes(el)) els.push(el);
    };

    add(document.querySelector(SELECTORS.meta));
    if (isPanelLayoutEnabled()) {
      add(document.querySelector(SELECTORS.overview));
      add(document.querySelector(SELECTORS.locprev));
    }
    add(document.querySelector(SELECTORS.controls));

    return els;
  }

  function getPanelStorageKey(el) {
    if (!el) return null;
    if (el.__extKey) return el.__extKey;
    try {
      if (el.matches?.(SELECTORS.meta)) return DRAG_KEYS[SELECTORS.meta];
      if (el.matches?.(SELECTORS.overview)) return DRAG_KEYS[SELECTORS.overview];
      if (el.matches?.(SELECTORS.locprev)) return DRAG_KEYS[SELECTORS.locprev];
      if (el.matches?.(SELECTORS.controls)) return DRAG_KEYS[SELECTORS.controls];
    } catch {}
    return null;
  }

  function hasCustomLayoutDefaults() {
    try {
      return !!(CUSTOM_DEFAULTS && Object.keys(CUSTOM_DEFAULTS).length);
    } catch {
      return false;
    }
  }

  async function ensureCustomDefaultsLoaded(force = false) {
    if (!force && CUSTOM_DEFAULTS !== undefined && CUSTOM_DEFAULTS_PROMISE === null) {
      return CUSTOM_DEFAULTS;
    }
    if (!force && CUSTOM_DEFAULTS_PROMISE) {
      return CUSTOM_DEFAULTS_PROMISE;
    }
    CUSTOM_DEFAULTS_PROMISE = (async () => {
      try {
        const stored = await getCustomLayoutDefaults();
        CUSTOM_DEFAULTS = stored && typeof stored === 'object' ? stored : null;
      } catch {
        CUSTOM_DEFAULTS = null;
      } finally {
        CUSTOM_DEFAULTS_PROMISE = null;
      }
      try { window.__extUpdateLayoutPopupState?.(); } catch {}
      return CUSTOM_DEFAULTS;
    })();
    return CUSTOM_DEFAULTS_PROMISE;
  }

  async function collectCurrentLayoutSnapshot() {
    const snapshot = {};
    const els = getDraggables();
    const vw = Math.max(1, window.innerWidth || 1);
    const vh = Math.max(1, window.innerHeight || 1);
    const nowTs = Date.now();

    for (const el of els) {
      if (!el) continue;
      const key = getPanelStorageKey(el);
      if (!key) continue;
      const rect = el.getBoundingClientRect();

      if (el.matches?.(SELECTORS.overview)) {
        const currentLeft = __extLeftFromStyleOrRect(el);
        const elementWidth = __extWidthFromStyleOrLayout(el, OVERVIEW_MIN_W);
        const r = Math.max(0, vw - currentLeft - elementWidth);
        snapshot[key] = {
          anchor: 'right',
          r,
          rp: r / vw,
          t: Math.round(rect.top),
          tp: rect.top / vh,
          vw,
          vh,
          savedAt: nowTs
        };
      } else {
        snapshot[key] = {
          l: Math.round(rect.left),
          t: Math.round(rect.top),
          vw,
          vh,
          lp: rect.left / vw,
          tp: rect.top / vh,
          savedAt: nowTs
        };
      }
    }

    return snapshot;
  }

  async function setLayoutDefaultsFromCurrentPositions() {
    if (!isPanelLayoutEnabled()) return;
    try {
      const snapshot = await collectCurrentLayoutSnapshot();
      await setCustomLayoutDefaults(snapshot);
      CUSTOM_DEFAULTS = snapshot;
      CUSTOM_DEFAULTS_PROMISE = null;
    } catch {
      CUSTOM_DEFAULTS = CUSTOM_DEFAULTS || null;
      CUSTOM_DEFAULTS_PROMISE = null;
    }
    try { window.__extUpdateLayoutPopupState?.(); } catch {}
  }

  async function clearLayoutDefaults() {
    try {
      await clearCustomLayoutDefaults();
    } catch {}
    CUSTOM_DEFAULTS = null;
    CUSTOM_DEFAULTS_PROMISE = null;
    try { window.__extUpdateLayoutPopupState?.(); } catch {}
  }

  async function persistAllVisiblePositions() {
    const els = getDraggables();
    const vw = window.innerWidth, vh = window.innerHeight;
    const currentBucket = await getPageBucket();
    const nextBucket = { ...(currentBucket || {}) };

    for (const el of els) {
      if (!el || !el.__extKey) continue;
      if (!isPanelLayoutEnabled() && (el.matches?.(SELECTORS.controls) || el.matches?.(SELECTORS.meta))) continue;
      const rect = el.getBoundingClientRect();

      if (el.matches(SELECTORS.overview)) {
        const currentLeft = __extLeftFromStyleOrRect(el);
        const elementWidth = __extWidthFromStyleOrLayout(el, OVERVIEW_MIN_W);
        const r = Math.max(0, vw - currentLeft - elementWidth);
        nextBucket[el.__extKey] = {
          anchor: 'right',
          r,
          rp: r / Math.max(1, vw),
          t: Math.round(rect.top),
          tp: rect.top / Math.max(1, vh),
          vw, vh, savedAt: Date.now()
        };
      } else {
        nextBucket[el.__extKey] = {
          l: Math.round(rect.left), t: Math.round(rect.top),
          vw, vh,
          lp: rect.left / Math.max(1, vw),
          tp: rect.top  / Math.max(1, vh),
          savedAt: Date.now()
        };
      }
    }

    await savePageBucket(nextBucket);
  }

  function setDragMode(enabled) {
    const effective = !!enabled && isPanelLayoutEnabled();
    try { window.extState?.setState('isLayoutEditing', effective); } catch {}
    DRAG_MODE = effective;
    try { window.__extUpdateLayoutPopupState?.(); } catch {}

    if (effective) {
      document.body.classList.add('ext-edit-mode-active');
    } else {
      document.body.classList.remove('ext-edit-mode-active');
    }

    getDraggables().forEach(el => {
      el.__extDragEnabled = effective;
      if (effective) el.classList.add('ext-draggable-active');
      else el.classList.remove('ext-draggable-active');
      if (el && el.matches && (el.matches(SELECTORS.locprev) || el.matches(SELECTORS.overview))) setResizeUIEnabled(el, effective);
    });
    if (!effective) { void persistAllVisiblePositions(); }
  }

  function installLayoutHotkeys() {
    if (window.__extLayoutHotkeysInstalled) return;
    window.__extLayoutHotkeysInstalled = true;

    document.addEventListener('keydown', (e) => {
      try {
        if (e.defaultPrevented) return;
        if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
        if (e.repeat) return;
        if (isTypingTarget(e.target)) return;
        if (!isPanelLayoutEnabled()) return;
        const key = (e.key || '').toLowerCase();
        if (key === 'e') {
          e.preventDefault();
          e.stopPropagation();
          setDragMode(!DRAG_MODE);
        } else if (key === 'q') {
          e.preventDefault();
          e.stopPropagation();
          void (async () => {
            try {
              if (isLPFullscreen() && typeof resetLPanelsToDefaultsFS === 'function') {
                await resetLPanelsToDefaultsFS();
              } else {
                await clearSavedPositionsNormal();
                await resetPanelsToDefaults();
              }
            } catch (err) {
              try { console.error('[ext] Failed to reset layout via shortcut', err); } catch {}
            }
          })();
        }
      } catch {}
    }, true);
  }

  const MARKER_VISIBILITY_LABEL = 'Adjust visibility of unselected markers';
  function findMarkerVisibilityButton() {
    const selectors = [
      `${SELECTORS.overview} button[aria-label="${MARKER_VISIBILITY_LABEL}"]`,
      `.ext-proxied-original button[aria-label="${MARKER_VISIBILITY_LABEL}"]`,
      `button[aria-label="${MARKER_VISIBILITY_LABEL}"]`
    ];
    for (const selector of selectors) {
      const btn = document.querySelector(selector);
      if (btn && btn.isConnected) return btn;
    }
    return null;
  }

  function installEditorHotkeys() {
    if (window.__extEditorHotkeysInstalled) return;
    window.__extEditorHotkeysInstalled = true;

    document.addEventListener('keydown', (e) => {
      try {
        if (e.defaultPrevented) return;
        const key = (e.key || '').toLowerCase();

        if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat && key === 'v') {
          if (!isPanelLayoutEnabled()) return;
          if (isTypingTarget(e.target)) return;
          const toggleBtn = findMarkerVisibilityButton();
          if (!toggleBtn) return;
          const disabled = typeof isDisabled === 'function'
            ? isDisabled(toggleBtn)
            : (!!toggleBtn.disabled || toggleBtn.getAttribute?.('aria-disabled') === 'true');
          if (disabled) return;
          e.preventDefault();
          e.stopPropagation();
          toggleBtn.click();
          return;
        }

        if (!e.repeat && e.metaKey && !e.altKey && !e.ctrlKey && key === 'f') {
          const overview = document.querySelector(SELECTORS.overview);
          if (!overview) return;
          const filterInput = overview.querySelector('.ext-proxy-input:not(.ext-proxy-bulkadd)') ||
            overview.querySelector('input[placeholder*="Search tag" i], input[placeholder*="Filter tag" i], input[aria-label*="Filter" i]');
          const targetInput = filterInput || document.querySelector('.ext-proxy-input:not(.ext-proxy-bulkadd)');
          if (!(targetInput && typeof targetInput.focus === 'function')) return;
          e.preventDefault();
          e.stopPropagation();
          try { targetInput.focus({ preventScroll: true }); } catch { targetInput.focus(); }
          if (typeof targetInput.select === 'function') {
            try { targetInput.select(); } catch {}
          }
          return;
        }
      } catch {}
    }, true);
  }

  function updateLayoutButtonState(btn) {
    const layoutBtn = btn || document.querySelector('.ext-layout-button');
    if (!layoutBtn) return;
    const disabled = !isPanelLayoutEnabled();
    layoutBtn.disabled = disabled;
    if (disabled) {
      layoutBtn.classList.add('is-disabled');
      layoutBtn.setAttribute('aria-disabled', 'true');
      layoutBtn.setAttribute('title', 'Panel layout disabled');
    } else {
      layoutBtn.classList.remove('is-disabled');
      layoutBtn.removeAttribute('aria-disabled');
      layoutBtn.setAttribute('title', 'Edit the positions of the floating panels');
    }
  }

  function ensureDragToggle() {
    const existing = document.querySelector('.ext-layout-button');
    if (existing) {
      updateLayoutButtonState(existing);
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'ext-float ext-drag-ui';

    const settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.className = 'button ext-settings-button';
    settingsBtn.title = 'Map settings';
    settingsBtn.setAttribute('aria-haspopup', 'dialog');
    settingsBtn.setAttribute('aria-expanded', 'false');
    settingsBtn.innerHTML = '<svg class="ext-settings-icon" viewBox="0 0 50 50" aria-hidden="true" focusable="false";"><path d="m47.16 21.221-5.91-.966c-.346-1.186-.819-2.326-1.411-3.405l3.45-4.917c.279-.397.231-.938-.112-1.282l-3.889-3.887c-.347-.346-.893-.391-1.291-.104l-4.843 3.481c-1.089-.602-2.239-1.08-3.432-1.427l-1.031-5.886C28.607 2.35 28.192 2 27.706 2h-5.5c-.49 0-.908.355-.987.839l-.956 5.854c-1.2.345-2.352.818-3.437 1.412l-4.83-3.45c-.399-.285-.942-.239-1.289.106L6.82 10.648c-.343.343-.391.883-.112 1.28l3.399 4.863c-.605 1.095-1.087 2.254-1.438 3.46l-5.831.971c-.482.08-.836.498-.836.986v5.5c0 .485.348.9.825.985l5.831 1.034c.349 1.203.831 2.362 1.438 3.46L6.655 38c-.284.397-.239.942.106 1.289l3.888 3.891c.343.343.884.391 1.281.112l4.87-3.411c1.093.601 2.248 1.078 3.445 1.424l.976 5.861c.079.481.496.834.985.834h5.5c.485 0 .9-.348.984-.825l1.045-5.89c1.199-.353 2.348-.833 3.43-1.435l4.905 3.441c.398.281.938.232 1.282-.111l3.888-3.891c.346-.347.391-.894.104-1.292l-3.498-4.857c.593-1.08 1.064-2.222 1.407-3.408l5.918-1.039c.479-.084.827-.5.827-.985v-5.5c.001-.49-.354-.908-.838-.987zM25 35c-5.523 0-10-4.477-10-10s4.477-10 10-10 10 4.477 10 10-4.477 10-10 10z"></path></svg>';
    const settingsMenu = document.createElement('div');
    settingsMenu.className = 'ext-settings-menu context-menu settings-popup';
    settingsMenu.setAttribute('role', 'dialog');
    settingsMenu.style.display = 'none';
    const inner = document.createElement('div');
    inner.className = 'ext-settings-menu__content';
    settingsMenu.appendChild(inner);
    document.body.appendChild(settingsMenu);
    settingsBtn.addEventListener('click', () => setSettingsMenuVisibility(!SETTINGS_OPEN));

    const layoutBtn = document.createElement('button');
    layoutBtn.type = 'button';
    layoutBtn.className = 'button ext-layout-button';
    layoutBtn.title = 'Edit the positions of the floating panels';
    layoutBtn.setAttribute('aria-haspopup', 'dialog');
    layoutBtn.setAttribute('aria-expanded', 'false');
    layoutBtn.setAttribute('aria-pressed', 'false');
    layoutBtn.innerHTML = '<svg class="ext-layout-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z"/></svg>';

    const layoutPopupCallbacks = {
      getDragMode: () => DRAG_MODE,
      onToggleDrag: () => setDragMode(!DRAG_MODE),
      onReset: async () => {
        if (isLPFullscreen()) {
          await resetLPanelsToDefaultsFS();
        } else {
          await clearSavedPositionsNormal();
          await resetPanelsToDefaults();
        }
      },
      onSetDefaults: async () => { await setLayoutDefaultsFromCurrentPositions(); },
      onClearDefaults: async () => { await clearLayoutDefaults(); },
      hasCustomDefaults: () => hasCustomLayoutDefaults(),
      ensureDefaultsLoaded: () => { void ensureCustomDefaultsLoaded(); }
    };

    const initFn = window.__extInitLayoutPopup;
    if (typeof initFn === 'function') {
      initFn(layoutBtn, layoutPopupCallbacks);
    } else {
      const pending = window.__extPendingLayoutInits || (window.__extPendingLayoutInits = []);
      pending.push({ btn: layoutBtn, callbacks: layoutPopupCallbacks });
    }

    wrap.appendChild(settingsBtn);
    wrap.appendChild(layoutBtn);
    document.body.appendChild(wrap);
    updateLayoutButtonState(layoutBtn);
  }

  const inited = new WeakSet();
  let lastMutationAt = now();
  const __extTooltipProcessed = new WeakSet();

  function ensureCompassEnhanced() {
    try {
      const compass = document.querySelector('.compass-control');
      if (!compass) return;
      const holder = compass.closest('.embed-controls__control');
      const wrap = compass.closest('.map-control');
      if (wrap && !wrap.classList.contains('ext-compass-wrap')) {
        wrap.classList.add('ext-compass-wrap');
      }
      if (holder) {
        holder.classList.add('ext-compass-enhanced');
        holder.setAttribute('data-position', 'top-left');
        try {
          holder.style.top = '8px';
          holder.style.left = '8px';
          holder.style.bottom = 'auto';
          holder.style.right = 'auto';
          holder.style.inset = '';
        } catch {}
      }
    } catch {}
  }

  function setSettingsMenuVisibility(enabled) {
    const btn = document.querySelector('.ext-settings-button');
    const menu = document.querySelector('.ext-settings-menu');
    const svg = btn.querySelector('svg');

    function spinIcon(svg) {
      if (!svg) return;
      svg.classList.remove('spin');
      void svg.offsetWidth;
      svg.classList.add('spin');
      setTimeout(() => { try { svg.classList.remove('spin'); } catch {} }, 480);
    }

    function onDocumentClick(e) {
      try {
        const svPopup = document.querySelector('.sv-color-editor-wrapper');
        if (svPopup && svPopup.contains(e.target)) {
          return; // do not close settings when interacting with the picker
        }
      } catch {}

      try {
        const dd = e.target && e.target.closest('.ext-sorter-dropdown');
        if (dd && (dd.querySelector('.ext-style-dropdown__header') || dd.querySelector('.ext-style-dropdown__item'))) {
          return; // do not close settings when interacting with the style dropdown
        }
      } catch {}
      if (!menu.contains(e.target) && !btn.contains(e.target)) {
        setSettingsMenuVisibility(false);
        document.removeEventListener('mousedown', onDocumentClick, true);
      }
    }

    if (isLPFullscreen()) {
      const fsHost = document.fullscreenElement;
      if (fsHost && menu.parentNode !== fsHost) {
        fsHost.appendChild(menu);
      }
    } else {
      if (menu.parentNode !== document.body) {
        document.body.appendChild(menu);
      }
    }

    if (!btn) return;
    if (enabled) {
      SETTINGS_OPEN = true;
      btn.setAttribute('aria-expanded', 'true');
      menu.style.display = 'block';
      spinIcon(svg);
      document.addEventListener('mousedown', onDocumentClick, true);
    } else {
      SETTINGS_OPEN = false;
      btn.setAttribute('aria-expanded', 'false');
      menu.style.display = 'none';
      spinIcon(svg);
      document.removeEventListener('mousedown', onDocumentClick, true);
    }
  }

  function ensureNativeTooltips(root = document) {
    try {
      const hosts = root.querySelectorAll('[role="tooltip"], [aria-label]');
      hosts.forEach(el => {
        if (el.matches('.location-preview__panorama') || el.closest('.location-preview__panorama')) return;
        if (!el || __extTooltipProcessed.has(el)) {
          if (el && el.getAttribute) {
            const al = el.getAttribute('aria-label');
            if (al && !el.getAttribute('title')) try { el.setAttribute('title', al); } catch {}
          }
          return;
        }

        const txt = el.getAttribute('aria-label') || el.getAttribute('title');
        if (txt) {
          try { el.setAttribute('title', txt); } catch {}
        }

        try { if (el.getAttribute('role') === 'tooltip') el.removeAttribute('role'); } catch {}

        __extTooltipProcessed.add(el);
      });
    } catch {}
  }

  function ensure(selector, setup) {
    document.querySelectorAll(selector).forEach(el => {
      if (!inited.has(el)) { setup(el); inited.add(el); }
    });
  }

  function lockFixedBox(el, { minWidth = 0, minHeight = 0 } = {}) {
    const rect = el.getBoundingClientRect();
    const left = Math.round(rect.left), top = Math.round(rect.top);
    if (el.style.left !== left + 'px') el.style.left = left + 'px';
    if (el.style.top  !== top  + 'px') el.style.top  = top + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    if (minWidth)  el.style.minWidth  = minWidth  + 'px';
    if (minHeight) el.style.minHeight = minHeight + 'px';
    el.style.willChange = 'left, top';
    el.style.boxSizing = 'border-box';
    el.style.touchAction = 'none';
  }

  function __extPxFromStyle(el, prop) {
    try {
      const v = parseFloat(el?.style?.[prop] || '');
      return Number.isFinite(v) ? v : null;
    } catch { return null; }
  }
  function __extWidthFromStyleOrLayout(el, fallbackMin = 0) {
    const sw = __extPxFromStyle(el, 'width');
    if (sw != null) return Math.round(sw);
    const ow = Math.round(el?.offsetWidth || 0);
    return Math.max(fallbackMin, ow);
  }
  function __extLeftFromStyleOrRect(el) {
    const sl = __extPxFromStyle(el, 'left');
    if (sl != null) return Math.round(sl);
    const r = el.getBoundingClientRect();
    return Math.round(r.left);
  }

  function clampToViewport(el, desiredLeft, desiredTop, sizeHint = null) {
    const vw = window.innerWidth, vh = window.innerHeight;
    let w = sizeHint && Number.isFinite(sizeHint.width) ? Math.max(0, Math.round(sizeHint.width)) : Math.round(el.offsetWidth || 0);
    let hgt = sizeHint && Number.isFinite(sizeHint.height) ? Math.max(0, Math.round(sizeHint.height)) : Math.round(el.offsetHeight || 0);
    if (!Number.isFinite(w)) w = 0;
    if (!Number.isFinite(hgt)) hgt = 0;
    const maxL = Math.max(0, vw - w), maxT = Math.max(0, vh - hgt);
    const left = Math.min(Math.max(Math.round(desiredLeft), 0), maxL);
    const top  = Math.min(Math.max(Math.round(desiredTop),  0), maxT);
    return { left, top };
  }

  function computeSitePresetLeftTop(el) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.round(el.offsetWidth || 0), h = Math.round(el.offsetHeight || 0);
    if (el.matches(SELECTORS.controls)) {
      return { left: Math.max(0, vw - w - 20), top: Math.max(0, vh - h - 16)};
    }
    if (el.matches(SELECTORS.meta)) {
      return { left: 16, top: Math.max(0, vh - h - 16) };
    }
    if (el.matches(SELECTORS.overview)) {
      return { left: Math.max(0, vw - w - OVERVIEW_MARGIN_RIGHT), top: 80 };
    }
    if (el.matches(SELECTORS.locprev)) {
      const vw = window.innerWidth;
      const w  = Math.round(el.offsetWidth || LOCPREV_MIN_W);
      return { left: Math.max(0, vw - w - 20), top: 80 };
    }
    if (el.matches(SELECTORS.lpPanelP1)) {
      const w = Math.round(el.offsetWidth || 0);
      return { left: Math.max(0, window.innerWidth - w - 20), top: 80 };
    }
    if (el.matches(SELECTORS.lpPanelP2)) {
      const h = Math.round(el.offsetHeight || 0);
      return { left: 16, top: Math.max(0, window.innerHeight - h - 16) };
    }
    return { left: Math.max(0, Math.round((vw - w) / 2)), top: Math.max(0, Math.round((vh - h) / 2)) };
  }

  function computeCustomDefaultLeftTop(el, key, fallback) {
    if (!CUSTOM_DEFAULTS || !key) return fallback;
    const stored = CUSTOM_DEFAULTS[key];
    if (!stored || typeof stored !== 'object') return fallback;

    const vw = Math.max(1, window.innerWidth || 1);
    const vh = Math.max(1, window.innerHeight || 1);

    const toFinite = (value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    };

    let left = fallback.left;
    let top = fallback.top;

    const lp = toFinite(stored.lp);
    const tp = toFinite(stored.tp);
    const l = toFinite(stored.l);
    const t = toFinite(stored.t);
    const r = toFinite(stored.r);
    const rp = toFinite(stored.rp);

    if (tp != null) {
      top = Math.round(tp * vh);
    } else if (t != null) {
      top = Math.round(t);
    }

    if (el.matches?.(SELECTORS.overview) && (stored.anchor === 'right' || r != null || rp != null)) {
      const panelWidth = __extWidthFromStyleOrLayout(el, OVERVIEW_MIN_W);
      let rightOffset = null;
      if (rp != null) {
        rightOffset = Math.round(rp * vw);
      } else if (r != null) {
        rightOffset = Math.round(r);
      }
      if (rightOffset != null) {
        left = Math.round(vw - panelWidth - rightOffset);
      } else if (lp != null) {
        left = Math.round(lp * vw);
      } else if (l != null) {
        left = Math.round(l);
      }
    } else {
      if (lp != null) {
        left = Math.round(lp * vw);
      } else if (l != null) {
        left = Math.round(l);
      }
    }

    if (!Number.isFinite(left)) left = fallback.left;
    if (!Number.isFinite(top)) top = fallback.top;
    return { left, top };
  }

  function computeDefaultLeftTop(el) {
    const fallback = computeSitePresetLeftTop(el);
    if (!el) return fallback;
    const key = getPanelStorageKey(el);
    if (!key) return fallback;
    if (CUSTOM_DEFAULTS === undefined) {
      void ensureCustomDefaultsLoaded();
      return fallback;
    }
    return computeCustomDefaultLeftTop(el, key, fallback);
  }

  function resetElementToDefault(el) {
    lockFixedBox(el);
    const { left: defaultVisualLeft, top: defaultVisualTop } = computeDefaultLeftTop(el);

    const { left: clampedVisualLeft, top: clampedTop } = clampToViewport(el, defaultVisualLeft, defaultVisualTop);
    
    let finalStyleLeft = clampedVisualLeft;

    el.style.left = finalStyleLeft + 'px';
    el.style.top = clampedTop + 'px';
  }

  async function resetPanelsToDefaults() {
    await ensureCustomDefaultsLoaded();
    const vw = window.innerWidth, vh = window.innerHeight;
    const els = getDraggables();

    for (const el of els) {
      if (!el) continue;

      if (el.matches && (el.matches(SELECTORS.overview) || el.matches(SELECTORS.locprev))) {
        const isVisible = el.offsetParent !== null || el.getClientRects().length > 0;
        if (isVisible) {
          setPanelToMinSize(el);
          el.__extAtCurrentMin = true;
          el.__extJustRestored = true;
          if (el.matches(SELECTORS.overview)) {
            await setSavedPos('overview:size', {
              w: Math.round(el.offsetWidth),
              h: Math.round(el.offsetHeight),
              savedAt: Date.now()
            });
          } else {
            await setSavedPos('locprev:size', {
              w: Math.round(el.offsetWidth),
              h: Math.round(el.offsetHeight),
              savedAt: Date.now()
            });
          }
        }
      }

      resetElementToDefault(el);
      if (el.__extKey) {
        const rect = el.getBoundingClientRect();
        if (el.matches && el.matches(SELECTORS.overview)) {
          const currentLeft = __extLeftFromStyleOrRect(el);
          const elementWidth = __extWidthFromStyleOrLayout(el, OVERVIEW_MIN_W);
          const r = Math.max(0, vw - currentLeft - elementWidth);
          await setSavedPos(el.__extKey, {
            anchor: 'right',
            r, rp: r / Math.max(1, vw),
            t: Math.round(rect.top), tp: rect.top / Math.max(1, vh),
            vw, vh, savedAt: Date.now()
          });
        } else {
          await setSavedPos(el.__extKey, {
            l: Math.round(rect.left), t: Math.round(rect.top),
            vw, vh,
            lp: rect.left / Math.max(1, vw),
            tp: rect.top  / Math.max(1, vh),
            savedAt: Date.now()
          });
        }
      }
    }

    const hasLocPrev = !!document.querySelector(SELECTORS.locprev);
    if (!hasLocPrev) {
      const left = Math.max(0, vw - LOCPREV_MIN_W - 20);
      const top  = 80;
      await setSavedPos(DRAG_KEYS[SELECTORS.locprev], {
        l: left, t: top, vw, vh,
        lp: left / Math.max(1, vw),
        tp: top  / Math.max(1, vh),
        savedAt: Date.now()
      });
      await setSavedPos('locprev:size', { w: LOCPREV_MIN_W, h: LOCPREV_BASE_H, savedAt: Date.now() });
      await setSavedPos('locprev:pendingReset', { apply: true, ts: Date.now() });
    }

    const hasOverview = !!document.querySelector(SELECTORS.overview);
    if (!hasOverview) {
      const r = OVERVIEW_MARGIN_RIGHT;
      const t = 80;
      await setSavedPos(DRAG_KEYS[SELECTORS.overview], {
        anchor: 'right', r, rp: r / Math.max(1, vw),
        t, tp: t / Math.max(1, vh),
        vw, vh, savedAt: Date.now()
      });
      await setSavedPos('overview:size', { w: OVERVIEW_MIN_W, h: OVERVIEW_MIN_H, savedAt: Date.now() });
    }
  }

  async function restoreSavedPosition(el, key, options = {}) {
    if (!key) return;
    const saved = await getSavedPos(key);

    if (!saved) {
      resetElementToDefault(el);
      return;
    }

    const vw = window.innerWidth, vh = window.innerHeight;
    const dvw = Math.abs(vw - (saved.vw || vw));
    const dvh = Math.abs(vh - (saved.vh || vh));
    const largeChange = dvw > 64 || dvh > 64;
    lockFixedBox(el);
    let desiredLeft, desiredTop;
    desiredTop = largeChange && saved.tp != null ? Math.round(saved.tp * vh) : (saved.t ?? 0);

    const sizeHintOpt = options.sizeHint || null;
    let widthHint = sizeHintOpt && Number.isFinite(sizeHintOpt.width) ? Math.round(sizeHintOpt.width) : null;
    let heightHint = sizeHintOpt && Number.isFinite(sizeHintOpt.height) ? Math.round(sizeHintOpt.height) : null;

    const wantsSize = (!widthHint || !heightHint) && el.matches && (el.matches(SELECTORS.overview) || el.matches(SELECTORS.locprev));
    if (wantsSize) {
      try {
        const sizeKey = el.matches(SELECTORS.overview) ? 'overview:size' : 'locprev:size';
        const savedSize = await getSavedPos(sizeKey);
        if (savedSize && typeof savedSize === 'object') {
          if (widthHint == null && Number.isFinite(savedSize.w)) widthHint = Math.round(savedSize.w);
          if (heightHint == null && Number.isFinite(savedSize.h)) heightHint = Math.round(savedSize.h);
        }
      } catch {}
    }

    const clampHint = { width: widthHint ?? undefined, height: heightHint ?? undefined };

    if (el.matches && el.matches(SELECTORS.overview) && (saved.anchor === 'right' || saved.r != null || saved.rp != null)) {
      const r = largeChange && saved.rp != null ? Math.round(saved.rp * vw) : (saved.r ?? OVERVIEW_MARGIN_RIGHT);
      const maxAllowedWidth = Math.max(OVERVIEW_MIN_W, window.innerWidth - 100);
      const widthForPlacement = widthHint != null ? widthHint : __extWidthFromStyleOrLayout(el, OVERVIEW_MIN_W);
      const w = Math.max(OVERVIEW_MIN_W, Math.min(Math.round(widthForPlacement), maxAllowedWidth));
      if (clampHint.width === undefined) clampHint.width = w;
      desiredLeft = vw - w - r;
    } else {
      desiredLeft = largeChange && saved.lp != null ? Math.round(saved.lp * vw) : (saved.l ?? 0);
    }
    
    const { left: clampedVisualLeft, top: clampedTop } = clampToViewport(el, desiredLeft, desiredTop, clampHint);
    
    let finalStyleLeft = clampedVisualLeft;

    if (el.style.left !== finalStyleLeft + 'px') el.style.left = finalStyleLeft + 'px';
    if (el.style.top  !== clampedTop  + 'px') el.style.top  = clampedTop + 'px';
    el.__extRestored = true;
  }

  async function positionLPPanels() {
    const panels = getLPPanelElements();
    if (!panels.length) return;

    const inFS = isLPFullscreen();
    if (!inFS) {
      panels.forEach((panel) => {
        if (!panel) return;
        panel.style.transform = '';
        panel.style.left = '';
        panel.style.top = '';
        panel.style.right = '';
        panel.style.bottom = '';
        panel.style.willChange = '';
        panel.style.touchAction = '';
        panel.classList.remove('ext-is-dragging');
      });
      return;
    }
  }
  
  // ------------------------------ Drag Shield Manager ------------------------
  const DragShieldManager = (() => {
      let shield = null;
      let observer = null;
      const updateSize = () => {
        if (!shield) return;
        shield.style.width = `${window.innerWidth}px`;
        shield.style.height = `${window.innerHeight}px`;
        shield.style.top = '0px';
        shield.style.left = '0px';
      };
      const init = () => {
        if (shield && document.body.contains(shield)) return;
        shield = document.createElement('div');
        shield.className = 'ext-drag-shield';
        document.body.appendChild(shield);
        observer = new ResizeObserver(updateSize);
        observer.observe(document.body);
      };
      return {
        show: () => {
          init();
          updateSize();
          shield.style.display = 'block';
        },
        hide: () => {
          if (shield) {
            shield.style.display = 'none';
          }
        },
      };
    })();

  // ------------------------------ Dragging --------------------------------

  function makeDraggable(el) {
    if (el.__extDragBound) return;
    el.__extDragBound = true;

    lockFixedBox(el);

    const DRAG_MOVE_THRESHOLD = 5;
    const isLargePanel = el.matches(`${SELECTORS.overview}, ${SELECTORS.locprev}`);

    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;
    let isDragging = false;
    let raf = 0;

    const onMouseMove = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      if (!isDragging && (Math.abs(deltaX) > DRAG_MOVE_THRESHOLD || Math.abs(deltaY) > DRAG_MOVE_THRESHOLD)) {
        isDragging = true;
        DragShieldManager.show();
        el.classList.add('ext-is-dragging');
        document.body.style.userSelect = 'none';

        if (el.matches(SELECTORS.overview)) { try { __extCloseAllOverlays(); } catch {} }

        startLeft = __extLeftFromStyleOrRect(el);
        startTop = parseFloat(el.style.top) || el.getBoundingClientRect().top;
      }

      if (isDragging) {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          raf = 0;
          const newLeft = startLeft + deltaX;
          const newTop = startTop + deltaY;

          if (isLargePanel) {
            el.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
          } else {
            el.style.left = `${newLeft}px`;
            el.style.top = `${newTop}px`;
          }
        });
      }
    };

    const persistFinalPosition = async () => {
      if (!isDragging) return;

      if (isLargePanel) {
        const computedTransform = getComputedStyle(el).transform;
        if (computedTransform && computedTransform !== 'none') {
          const transform = new DOMMatrix(computedTransform);
          if (transform.m41 !== 0 || transform.m42 !== 0) {
            el.style.transform = '';
            const finalLeft = Math.round(startLeft + transform.m41);
            const finalTop = Math.round(startTop + transform.m42);
            el.style.left = `${finalLeft}px`;
            el.style.top = `${finalTop}px`;
            startLeft = finalLeft;
            startTop = finalTop;
          }
        }
      }

      void persistAllVisiblePositions();
    };

    const onMouseUp = async () => {
      window.removeEventListener('pointermove', onMouseMove, { passive: false });
      window.removeEventListener('pointerup', onMouseUp, { passive: true });
      window.removeEventListener('pointercancel', onMouseUp, { passive: true });

      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      
      if (isDragging) {
        DragShieldManager.hide();
        el.classList.remove('ext-is-dragging');
        document.body.style.userSelect = '';

        if (isLargePanel) {
          const transform = new DOMMatrix(getComputedStyle(el).transform);
          el.style.transform = '';
          el.style.left = `${Math.round(startLeft + transform.m41)}px`;
          el.style.top = `${Math.round(startTop + transform.m42)}px`;
        }

        await persistFinalPosition();
      }

      isDragging = false;
    };

    const onMouseDown = (e) => {
      if (e.button !== 0 || !el.__extDragEnabled || el.__extResizing || e.target?.closest?.('.ext-resize-handle')) return;

      const tag = (e.target?.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select', 'button'].includes(tag) && !e.target.closest('.tool-block__title')) {
        return;
      }
      
      if ((el.matches(SELECTORS.locprev) && e.target.closest(SELECTORS.locprevPanorama))
        || (el.matches(SELECTORS.overview) && (e.target.closest(SELECTORS.tagList) || e.target.closest('.ext-search-toggle') || e.target.closest('.ext-search-header')))
        || (e.target?.closest?.('.tool-block__title')))
      {
        return;
      }
      
      if (el.matches(SELECTORS.overview)) { try { __extCloseAllOverlays(); } catch {} }

      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;

      window.addEventListener('pointermove', onMouseMove, { passive: false });
      window.addEventListener('pointerup', onMouseUp, { passive: true });
      window.addEventListener('pointercancel', onMouseUp, { passive: true });
    };

    el.addEventListener('pointerdown', onMouseDown, { capture: true });
  }

  function bindHeaderHoverPortal() {
    const header = document.querySelector(SELECTORS.header);
    if (!header || header.__extPortalBound) return;
    header.__extPortalBound = true;

    const headerParent = header.parentElement;
    let shell = headerParent;
    if (headerParent && !headerParent.matches('.ext-header-shell')) {
      shell = document.createElement('div');
      shell.className = 'ext-header-shell';
      shell.dataset.extHeaderShell = 'true';
      headerParent.insertBefore(shell, header);
      shell.appendChild(header);
    }
    if (shell) {
      header.__extShell = shell;
      header.classList.add('ext-header-main');
    }

    const moveBackLink = () => {
      if (!shell) return null;
      const backLink =
        header.querySelector('a[aria-label="Back to map list"]') ||
        shell.querySelector('[data-ext-back-link="true"]');
      if (!backLink) return null;
      if (!backLink.dataset.extBackLink) {
        backLink.dataset.extBackLink = 'true';
        backLink.classList.add('ext-float', 'ext-header-back-link', 'ext-header-back');
        backLink.removeAttribute('style');
      }
      if (backLink.parentElement !== shell) {
        shell.insertBefore(backLink, header);
      }
      header.__extBackLink = backLink;
      return backLink;
    };
    const positionedBackLink = moveBackLink();
    if (!positionedBackLink && shell && !header.__extBackObserver) {
      const mo = new MutationObserver(() => {
        const next = moveBackLink();
        if (next) {
          mo.disconnect();
          header.__extBackObserver = null;
        }
      });
      mo.observe(header, { childList: true, subtree: true });
      header.__extBackObserver = mo;
    }
    let reveal = header.querySelector('.ext-header-reveal');
    if (!reveal) {
      reveal = document.createElement('div');
      reveal.className = 'ext-header-reveal';
      header.appendChild(reveal);
    }
    header.__extReveal = reveal;
    let topWrapper = header.querySelector('.ext-header-top');
    if (!topWrapper) {
      topWrapper = document.createElement('div');
      topWrapper.className = 'ext-header-top';
      header.insertBefore(topWrapper, reveal);
    }
    const children = Array.from(header.children).filter(
      (c) => c !== reveal && c !== topWrapper
    );
    children.forEach((c) => topWrapper.appendChild(c));

    let state = 'collapsed';

    function captureMetaNodesIntoReveal() {
      const meta = document.querySelector(SELECTORS.meta);
      if (!meta) return;

      const nodesToMove = [
        meta.querySelector('.map-meta__total'),
        meta.querySelector('.map-meta__import')
      ].filter(Boolean);

      nodesToMove.forEach(node => {
        if (node.parentElement !== reveal) {
          if (!node.__extPh) {
            const placeholder = document.createComment(`ph_${node.className.split(' ')[0]}`);
            node.parentNode.insertBefore(placeholder, node);
            node.__extPh = placeholder;
          }
          reveal.appendChild(node);
        }
      });
    }

    function restoreNodesFromReveal() {
      const nodesToRestore = Array.from(reveal.children);
      nodesToRestore.forEach(node => {
        const placeholder = node.__extPh;
        if (placeholder && placeholder.parentNode) {
          placeholder.parentNode.insertBefore(node, placeholder);
          placeholder.remove();
          node.__extPh = null;
        }
      });
    }

    function expandHeader() {
      if (state === 'expanded' || state === 'expanding') return;

      if (state === 'collapsing') {
        header.classList.add('ext-header-expanded');
        if (header.__extExpandedW) {
          header.style.width = `${header.__extExpandedW}px`;
        }
        state = 'expanded';
        return;
      }

      state = 'expanding';

      const oldWidth = header.style.width;
      header.style.width = '';
      const collapsedW = Math.round(header.getBoundingClientRect().width);
      header.__extCollapsedW = collapsedW;
      header.style.width = oldWidth;

      captureMetaNodesIntoReveal();

      const revealW = Math.round(reveal.scrollWidth) + 24;
      const expandedW = Math.max(collapsedW, revealW);
      header.__extExpandedW = expandedW;
      header.style.width = `${collapsedW}px`;

      requestAnimationFrame(() => {
        header.classList.add('ext-header-expanded');
        requestAnimationFrame(() => {
          header.style.width = `${expandedW}px`;
          state = 'expanded';
        });
      });
    }

    function collapseHeader() {
      if (state === 'collapsed' || state === 'collapsing') return;

      state = 'collapsing';
      const collapsedW = header.__extCollapsedW || Math.round(header.getBoundingClientRect().width);
      header.classList.remove('ext-header-expanded');

      requestAnimationFrame(() => {
        header.style.width = `${collapsedW}px`;
      });
    }

    function onRevealTransitionEnd(e) {
      if (e.target !== reveal || !['opacity', 'max-height'].includes(e.propertyName)) {
        return;
      }

      if (state === 'collapsing' && !header.classList.contains('ext-header-expanded')) {
        restoreNodesFromReveal();
        header.style.width = '';
        state = 'collapsed';
      }
    }

    header.addEventListener('pointerenter', expandHeader, { passive: true });
    header.addEventListener('pointerleave', collapseHeader, { passive: true });
    reveal.addEventListener('transitionend', onRevealTransitionEnd);
  }

  function wireLocPrevObservers(el) {
    const pano = el.querySelector(SELECTORS.locprevPanorama);

    if (!el.__extPanoHoverWired && pano) {
      el.__extPanoHoverWired = true;
      const set = (value) => {
        const next = !!value;
        if (el.__extPanoActive === next) return;
        el.__extPanoActive = next;
        try {
          const activity = window.__extPanoramaActivity;
          const fsHost = document.fullscreenElement;
          const inFullscreen = !!(fsHost && (fsHost.matches?.(SELECTORS.locprevPanorama) || fsHost.closest?.(SELECTORS.locprevPanorama)));
          if (!inFullscreen && activity) {
            if (next) activity.enter(); else activity.leave();
          }
        } catch {}
      };
      pano.addEventListener('pointerenter', () => set(true), { passive: true });
      pano.addEventListener('pointerdown',  () => set(true), { passive: true });
      pano.addEventListener('pointerleave', () => set(false), { passive: true });
      pano.addEventListener('pointerup',    () => set(false), { passive: true });
      pano.addEventListener('pointercancel', () => set(false), { passive: true });
    }

    const scheduleReflow = rafThrottle(() => {
      if (el.__extDragging || el.__extResizing) return;
      if (el.__extPanoActive && !document.fullscreenElement) return;
      void ps.fit(el);
    });

    if (!el.__extFitRO) {
      let lastWidth = -1;
      let lastHeight = -1;
      const ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;

        const { width, height } = entry.contentRect;
        if (width === lastWidth && height === lastHeight) return;
        lastWidth = width;
        lastHeight = height;

        scheduleReflow();
      });
      ro.observe(el);
      el.__extFitRO = ro;
    }

    if (!el.__extFitMO) {
      const mo = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (pano && (m.target === pano || pano.contains(m.target))) {
            continue;
          }

          scheduleReflow();
          return;
        }
      });

      const metaRoot = el.querySelector('.location-preview__meta');
      const observeConfig = {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['hidden', 'class', 'style']
      };

      if (metaRoot) {
        mo.observe(metaRoot, observeConfig);
      } else {
        mo.observe(el, observeConfig);
      }
      el.__extFitMO = mo;
    }
  }

  // MARK: ASV
  // ------------------------------ auto save -------------------------------
  const autoSaveManager = (() => {
    let timerId = null;
    let intervalSec = AUTO_SAVE_DEFAULT;
    let metaEl = null;

    const readStoredInterval = () => {
      try {
        const raw = localStorage.getItem(AUTO_SAVE_KEY);
        const value = raw ? JSON.parse(raw) : AUTO_SAVE_DEFAULT;
        return typeof value === 'number' ? value : AUTO_SAVE_DEFAULT;
      } catch {
        return AUTO_SAVE_DEFAULT;
      }
    };

    const clearTimer = () => {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
    };

    const scheduleNext = () => {
      clearTimer();
      if (intervalSec > 0) {
        timerId = window.setTimeout(runAutoSave, intervalSec * 1000);
      }
    };

    const findSaveButton = () => {
      if (metaEl?.isConnected) {
        const btn = metaEl.querySelector(SAVE_BUTTON_SELECTOR);
        if (btn) return btn;
      }
      return document.querySelector(SAVE_BUTTON_FULL_SELECTOR);
    };

    const runAutoSave = () => {
      timerId = null;
      if (intervalSec <= 0) return;

      const btn = findSaveButton();
      if (!btn || isDisabled(btn)) {
        scheduleNext();
        return;
      }
      try {
        btn.click();
      } catch {}
      scheduleNext();
    };

    const applyInterval = (value) => {
      const num = Number(value);
      intervalSec = Number.isFinite(num) ? num : AUTO_SAVE_DEFAULT;
      scheduleNext();
    };

    const handleStorageEvent = (event) => {
      if (event?.key !== AUTO_SAVE_KEY) return;
      try {
        const value = event.newValue === null ? AUTO_SAVE_DEFAULT : JSON.parse(event.newValue);
        applyInterval(value);
      } catch {
        applyInterval(AUTO_SAVE_DEFAULT);
      }
    };

    const handleSettingEvent = (ev) => {
      if (ev?.detail?.key !== AUTO_SAVE_KEY) return;
      applyInterval(ev.detail.value);
    };

    const handleManualClick = (ev) => {
      if (ev.isTrusted === false || intervalSec <= 0) return;
      const btn = ev.target?.closest(SAVE_BUTTON_FULL_SELECTOR);
      if (!btn || isDisabled(btn)) return;
      scheduleNext();
    };

    window.addEventListener('storage', handleStorageEvent);
    window.addEventListener('ext:setting', handleSettingEvent);
    document.addEventListener('click', handleManualClick, true);

    applyInterval(readStoredInterval());

    return {
      attachMeta(el) {
        metaEl = el || null;
      },
    };
  })();

  // MARK: STP
  // ------------------------------ setups ----------------------------------
  const setupMap = (el) => {
    if (isPanelLayoutEnabled()) {
      el.classList.add('ext-map-embed-bg');
    } else {
      el.classList.remove('ext-map-embed-bg');
    }
  };

  const setupHeader = (el) => {
    bindHeaderHoverPortal();
    el.dataset.extPageHeader = 'true';
    el.classList.add('ext-float', 'ext-float--header', 'ext-header-left');
  };

  const setupMeta = (el) => {
    el.__extKey = DRAG_KEYS[SELECTORS.meta];
    el.classList.add('ext-float', 'ext-float--meta', 'ext-meta');
    el.classList.remove('ext-meta-expanded');

    if (el.__extMetaResizeObserver && isPanelLayoutEnabled()) {
      try { el.__extMetaResizeObserver.disconnect(); } catch {}
      el.__extMetaResizeObserver = null;
    }

    if (isPanelLayoutEnabled()) {
      if (!el.style.left) el.style.left = '16px';
      if (!el.style.top)  el.style.top  = '92px';
      el.style.bottom = 'auto';
      lockFixedBox(el);
      makeDraggable(el);
      el.__extDragEnabled = DRAG_MODE;
      if (DRAG_MODE) el.classList.add('ext-draggable-active'); else el.classList.remove('ext-draggable-active');
      if (!el.__extRestored) { void restoreSavedPosition(el, el.__extKey); }
    } else {
      el.style.left = '16px';
      el.style.right = 'auto';
      el.style.top = 'auto';
      el.style.bottom = '16px';
      el.style.minWidth = '';
      el.style.minHeight = '';
      el.style.willChange = '';
      el.style.touchAction = '';
      el.__extDragEnabled = false;
      el.classList.remove('ext-draggable-active');
      try {
        if (!el.__extMetaResizeObserver && typeof ResizeObserver === 'function') {
          const ro = new ResizeObserver(() => { try { syncDefaultLayoutControlsPosition(); } catch {} });
          ro.observe(el);
          el.__extMetaResizeObserver = ro;
        }
      } catch {}
      syncDefaultLayoutControlsPosition();
    }

    autoSaveManager.attachMeta(el);

    if (!window.__extMetaClickListenerBound) {
      window.__extMetaClickListenerBound = true;
      document.addEventListener('click', (e) => {
        if (!window.__extNotify) return;
        const undoBtn = e.target?.closest?.('button.icon-button[aria-label="Undo"]');
        if (undoBtn && !isDisabled(undoBtn)) {
          window.__extNotify('Undo', '', 'info');
          return;
        }
        const redoBtn = e.target?.closest?.('button.icon-button[aria-label="Redo"]');
        if (redoBtn && !isDisabled(redoBtn)) {
          window.__extNotify('Redo', '', 'info');
          return;
        }
        const saveBtn = e.target?.closest?.('[data-qa="map-save"].button--primary');
        if (saveBtn && !isDisabled(saveBtn)) {
          window.__extNotify('Saved', '', 'success');
          return;
        }
      }, true);
    }
  };
  const setupOverview = (el) => {
    el.__extKey = DRAG_KEYS[SELECTORS.overview];
    const panelEnabled = isPanelLayoutEnabled();

    let scroller = el.querySelector('.ext-overview-scroller');
    if (!scroller) {
      scroller = document.createElement('div');
      scroller.className = 'ext-overview-scroller';
      while (el.firstChild) {
        scroller.appendChild(el.firstChild);
      }
      el.appendChild(scroller);
    }

    const resetFloatingStyles = () => {
      el.style.left = '';
      el.style.top = '';
      el.style.right = '';
      el.style.bottom = '';
      el.style.width = '';
      el.style.height = '';
      el.style.minHeight = '';
      el.style.minWidth = '';
      el.style.maxWidth = '';
      scroller.style.width = '100%';
      scroller.style.maxWidth = '100%';
      scroller.style.height = '';
      scroller.style.maxHeight = '';
      scroller.style.overflowY = 'auto';
      el.querySelectorAll('.ext-resize-handle').forEach((handle) => { try { handle.remove(); } catch {} });
    };

    if (panelEnabled) {
      el.classList.add('ext-float', 'ext-float--overview');
      el.classList.remove('is-ready', 'is-sized');

      const currentWidth = el.offsetWidth || parseInt(el.style.width || OVERVIEW_MIN_W, 10) || OVERVIEW_MIN_W;
      const constrainedWidth = Math.max(OVERVIEW_MIN_W, Math.min(currentWidth, window.innerWidth - 100));

      el.style.width = constrainedWidth + 'px';
      el.style.maxWidth = constrainedWidth + 'px';

      scroller.style.width = '100%';
      scroller.style.maxWidth = '100%';
      scroller.querySelectorAll('.tool-block, .ext-list-block, .tag-list').forEach(child => {
        child.style.maxWidth = '100%';
        child.style.boxSizing = 'border-box';
      });
      void el.offsetHeight;

      lockFixedBox(el, { minWidth: OVERVIEW_MIN_W, minHeight: OVERVIEW_MIN_H });
      makeDraggable(el);
      ensurePanelResizeUI(el);
      setResizeUIEnabled(el, DRAG_MODE);
      el.__extDragEnabled = DRAG_MODE;
      if (DRAG_MODE) el.classList.add('ext-draggable-active'); else el.classList.remove('ext-draggable-active');
    } else {
      el.classList.remove('ext-float', 'ext-float--overview', 'ext-draggable-active', 'is-sized');
      el.__extDragEnabled = false;
      resetFloatingStyles();
      setResizeUIEnabled(el, false);
      scroller.querySelectorAll('.tool-block, .ext-list-block, .tag-list').forEach(child => {
        child.style.maxWidth = '100%';
        child.style.boxSizing = 'border-box';
      });
      el.classList.add('is-ready');
    }

    const overviewStore = window.__extOverviewStorage || null;
    const overviewReady = overviewStore?.ready?.().catch(() => {}) ?? Promise.resolve();

    moveSearchBar(el);

    const tagManagerReady = Promise.resolve(initAdvancedTagManager(el));
    const shapesReady = Promise.resolve(initShapesManager(el));
    const selectionReady = Promise.resolve(initAdvancedSelectionManager(el));
    const toolsReady = Promise.resolve(initCollapsibleTools(el));

    (async () => {
      await overviewReady;
      await Promise.allSettled([tagManagerReady, shapesReady, selectionReady, toolsReady]);
      if (panelEnabled) {
        await ps.restore(el);
        await ps.fit(el);

        if (!el.__extRestored) {
          const sizeHint = {
            width: Math.round(el.offsetWidth || OVERVIEW_MIN_W),
            height: Math.round(el.offsetHeight || OVERVIEW_MIN_H)
          };
          await restoreSavedPosition(el, el.__extKey, { sizeHint });
        }

        el.classList.add('is-sized', 'is-ready');
      } else {
        el.classList.add('is-ready');
      }
    })();
    if (panelEnabled) {
      ps.observe(el);
    }
  };
  const setupLocPrev = (el) => {
    el.__extKey = DRAG_KEYS[SELECTORS.locprev];
    if (isPanelLayoutEnabled()) {
      el.classList.add('ext-float', 'ext-float--locprev');
      (function() {
        try {
          const mem = LAST_LOC_SIZE;
          if (mem && mem.w && mem.h) {
            __extWithTransitionSuppressed(el, () => ps.apply(el, mem.w, mem.h));
            el.__extJustRestored = true;
          } else {
            const floor = measureContentFloorForWidth(el, LOCPREV_MIN_W, 1);
            __extWithTransitionSuppressed(el, () => ps.apply(el, LOCPREV_MIN_W, floor));
            el.__extJustRestored = true;
          }
        } catch {}
      })();

      (async () => {
        const pending = await getSavedPos('locprev:pendingReset');
        if (pending && pending.apply) {
          setPanelToMinSize(el);
          el.style.top = '80px';
          const w = Math.round(el.offsetWidth || LOCPREV_MIN_W);
          el.style.left = Math.max(0, window.innerWidth - w - 20) + 'px';
          await setSavedPos('locprev:size', { w: Math.round(el.offsetWidth), h: Math.round(el.offsetHeight), savedAt: Date.now() });
          const rect = el.getBoundingClientRect();
          const vw2 = window.innerWidth, vh2 = window.innerHeight;
          await setSavedPos(DRAG_KEYS[SELECTORS.locprev], {
            l: Math.round(rect.left), t: Math.round(rect.top),
            vw: vw2, vh: vh2,
            lp: rect.left / Math.max(1, vw2),
            tp: rect.top  / Math.max(1, vh2),
            savedAt: Date.now()
          });
          await setSavedPos('locprev:pendingReset', { apply: false, ts: pending.ts || Date.now() });
          el.__extRestored = true;
        } else {
          if (!el.__extRestored) {
            await ps.restore(el);
            await ps.fit(el);
            await restoreSavedPosition(el, el.__extKey);
          }
        }
      })();

      if (!el.style.top)  el.style.top  = '80px';
      if (!el.style.left) {
        const w = Math.round(el.offsetWidth || LOCPREV_MIN_W);
        el.style.left = Math.max(0, window.innerWidth - w - 20) + 'px';
      }
      (async () => {
        const pending = await getSavedPos('locprev:pendingReset');
        if (pending && pending.apply) {
          setPanelToMinSize(el);
          el.style.top = '80px';
          const w = Math.round(el.offsetWidth || LOCPREV_MIN_W);
          el.style.left = Math.max(0, window.innerWidth - w - 20) + 'px';

          await setSavedPos('locprev:size', {
            w: Math.round(el.offsetWidth),
            h: Math.round(el.offsetHeight),
            savedAt: Date.now()
          });
          const rect = el.getBoundingClientRect();
          const vw2 = window.innerWidth, vh2 = window.innerHeight;
          await setSavedPos(DRAG_KEYS[SELECTORS.locprev], {
            l: Math.round(rect.left),
            t: Math.round(rect.top),
            vw: vw2, vh: vh2,
            lp: rect.left / Math.max(1, vw2),
            tp: rect.top  / Math.max(1, vh2),
            savedAt: Date.now()
          });

          await setSavedPos('locprev:pendingReset', { apply: false, ts: pending.ts || Date.now() });

          el.__extRestored = true;
        }
      })();

      lockFixedBox(el, { minWidth: LOCPREV_MIN_W });
      ensurePanelResizeUI(el);
      updateResizeHandleTitles(el);
      makeDraggable(el);
      setResizeUIEnabled(el, DRAG_MODE);
      el.__extDragEnabled = DRAG_MODE;
      if (DRAG_MODE) el.classList.add('ext-draggable-active'); else el.classList.remove('ext-draggable-active');
    } else {
      el.classList.remove('ext-float', 'ext-float--locprev', 'ext-draggable-active');
      el.__extDragEnabled = false;
      el.style.left = '';
      el.style.top = '';
      el.style.right = '';
      el.style.bottom = '';
      el.style.width = '';
      el.style.height = '';
      el.style.minHeight = '';
      el.style.minWidth = '';
    }

    if (!el.__extTagClickListenerBound) {
      el.__extTagClickListenerBound = true;

      el.addEventListener('click', (e) => {
        const tag = e.target.closest('.tag.has-button');

        if (!tag) return;

        if (e.target !== tag && e.target.closest('a, button, input')) {
            return;
        }

        const isAddTag = tag.closest('.tag-list[id^="downshift-"]');
        const isRemoveTag = tag.closest('.location-preview__tags > .tag-list');

        if (isRemoveTag && !isAddTag) {
          const removeButton = tag.querySelector('.tag__button--delete');
          if (removeButton) {
            e.preventDefault();
            e.stopPropagation();
            removeButton.click();
          }
        } else if (isAddTag) {
          const addButton = tag.querySelector('.tag__button--add');
          if (addButton) {
            e.preventDefault();
            e.stopPropagation();
            addButton.click();
          }
        }
      });
    }
    wireLocPrevObservers(el);
  }
  
  const setupModal = (el) => { el.classList.add('ext-float', 'ext-float--modal'); };

  const proxiedControls = new WeakSet();
  const lpProcessed = new WeakSet();

  function consolidateControls() {
    let panel = document.querySelector(SELECTORS.controls);
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'ext-controls-panel ext-float';
      document.body.appendChild(panel);
    }

    const applyBadgeStructure = (clonedContainer) => {
      const storeBtn = clonedContainer.querySelector('button[aria-label="Store map position"]');
      const returnBtn = clonedContainer.querySelector('button[aria-label="Return to stored map position"]');

      if (storeBtn && returnBtn) {
        if (storeBtn.parentElement.classList.contains('ext-store-pos-wrapper')) {
          return;
        }
        const wrapper = document.createElement('div');
        wrapper.className = 'ext-store-pos-wrapper';
        storeBtn.parentElement.insertBefore(wrapper, storeBtn);
        wrapper.appendChild(storeBtn);
        wrapper.appendChild(returnBtn);
        returnBtn.classList.add('ext-return-badge');
      }
    };

    const buttonLabelsToProxy = [
      "Store map position", "Return to stored map position",
      "Zoom in",
      "Adjust visibility of unselected markers",
      "Draw a polygon selection",
      "Draw a rectangle selection"
    ];

    const allControls = document.querySelectorAll('.embed-controls__control');

    allControls.forEach(originalControl => {
      if (originalControl.closest(SELECTORS.controls) || originalControl.closest(SELECTORS.locprev)) {
        return;
      }
      
      if (proxiedControls.has(originalControl)) {
        return;
      }

      const button = originalControl.querySelector('button[aria-label]');
      if (button && buttonLabelsToProxy.includes(button.getAttribute('aria-label'))) {
        
        const clonedControl = originalControl.cloneNode(true);
        panel.appendChild(clonedControl);
        originalControl.classList.add('ext-proxied-original');
        proxiedControls.add(originalControl);

        const syncProxy = () => {
          clonedControl.innerHTML = originalControl.innerHTML;

          const originalButtons = Array.from(originalControl.querySelectorAll('button, a'));
          const clonedButtons = Array.from(clonedControl.querySelectorAll('button, a'));

          clonedButtons.forEach((clonedButton, index) => {
            const originalButton = originalButtons[index];
            if (originalButton) {
              clonedButton.addEventListener('click', e => {
                e.preventDefault(); e.stopPropagation(); originalButton.click();
              });
            }
          });
          
          applyBadgeStructure(clonedControl);
        };
        
        syncProxy();

        const observer = new MutationObserver(syncProxy);
        observer.observe(originalControl, {
          childList: true,
          attributes: true,
          subtree: true,
          attributeFilter: ['class', 'data-state', 'disabled', 'src', 'aria-label', 'aria-pressed']
        });
      }
    });

    const selectionLabels = [
      'Draw a polygon selection',
      'Draw a rectangle selection'
    ];
    selectionLabels.forEach((label) => {
      document.querySelectorAll(`.embed-controls__control button[aria-label="${label}"]`).forEach((btn) => {
        if (btn.closest('.ext-controls-panel')) return;
        if (btn.__extSelWired) return;
        btn.__extSelWired = true;
        btn.addEventListener('click', (e) => {
          try {
            const was = btn.getAttribute('aria-pressed') === 'true';
            selectionLabels.forEach((lbl) => {
              document.querySelectorAll(`button[aria-label="${lbl}"]`).forEach((b) => {
                try { b.setAttribute('aria-pressed', 'false'); } catch {}
              });
            });
            if (!was) {
              document.querySelectorAll(`button[aria-label="${label}"]`).forEach((b) => {
                try { b.setAttribute('aria-pressed', 'true'); } catch {}
              });
            }
          } catch {}
        }, true);
      });
    });

    const PREF_KEY = 'extClickModePref';
    function getMode() {
      try { return localStorage.getItem('extClickMode') === 'move' ? 'move' : 'add'; } catch { return 'add'; }
    }
    function getPref() {
      try { return localStorage.getItem(PREF_KEY) === 'move' ? 'move' : 'add'; } catch { return 'add'; }
    }
    function setPref(m) {
      const v = m === 'move' ? 'move' : 'add';
      try { localStorage.setItem(PREF_KEY, v); } catch {}
    }
    function hasSelection() {
      try { return localStorage.getItem('extHasSelection') === '1'; } catch { return false; }
    }
    function setMode(m) {
      const want = m === 'move' ? 'move' : 'add';
      setPref(want);
      const sel = hasSelection();
      const effective = sel ? want : 'add';
      try { localStorage.setItem('extClickMode', effective); } catch {}
      syncModeButtons();
    }

    function ensureModeGroup() {
      panel.querySelectorAll('[data-ext-mode-kind]')?.forEach(el => { try { el.remove(); } catch {} });
      let group = panel.querySelector('.ext-mode-group');
      if (!group) {
        group = document.createElement('div');
        group.className = 'embed-controls__control ext-mode-group';
        const indicator = document.createElement('div');
        indicator.className = 'ext-mode-indicator';
        const btnWrap = document.createElement('div');
        btnWrap.className = 'ext-mode-buttons';
        const mkBtn = (kind, label) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'button';
          b.dataset.kind = kind;
          b.setAttribute('aria-label', `${label} locations on map click`);
          b.textContent = label;
          b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setMode(kind); }, true);
          return b;
        };
        btnWrap.appendChild(mkBtn('add','Add'));
        btnWrap.appendChild(mkBtn('move','Move'));
        group.appendChild(indicator);
        group.appendChild(btnWrap);
        panel.appendChild(group);
      }
      return group;
    }

    function syncModeButtons() {
      const cur = getMode();
      const hasSel = (function(){ try { return localStorage.getItem('extHasSelection') === '1'; } catch { return false; } })();
      const group = ensureModeGroup();
      document.querySelectorAll('.ext-mode-buttons > .button').forEach(b => {
        const kind = b.dataset.kind;
        const on = (kind === cur);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.dataset.state = on ? 'on' : 'off';
        if (kind === 'move') { b.disabled = !hasSel; }
      });
      const ind = group.querySelector('.ext-mode-indicator');
      const target = group.querySelector(`.ext-mode-buttons > .button[data-kind="${cur}"]`);
      try { group.setAttribute('data-mode', cur); } catch {}
      if (ind && target) {
        const gr = group.getBoundingClientRect();
        const br = target.getBoundingClientRect();
        const left = Math.max(1, Math.round(br.left - gr.left) + 12);
        const width = Math.round(br.width);
        ind.style.left = left + 'px';
        ind.style.width = width + 'px';
        ind.style.borderColor = (cur === 'add') ? 'var(--ext-mode-indicator-add)' : 'var(--ext-mode-indicator-move)';
      }
      try { window.__extFSIndicatorSync && window.__extFSIndicatorSync(); } catch {}
      document.querySelectorAll('.ext-mini-mode-toggle button').forEach(b => {
        const kind = b.dataset.kind;
        const on = (kind === cur);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.dataset.state = on ? 'on' : 'off';
        if (kind === 'move') { b.disabled = !hasSel; }
      });
    }

    ensureModeGroup();
    syncModeButtons();
    
    if (!window.__extModeHotkeysInstalled) {
      window.__extModeHotkeysInstalled = true;
      document.addEventListener('keydown', (e) => {
        try {
          if (e.defaultPrevented) return;
          const t = e.target;
          if (isTypingTarget(t)) return; // do not hijack when typing
          if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
          const k = e.key;
          const c = e.code;
          if (k === '1' || c === 'Digit1') {
            e.preventDefault(); e.stopPropagation();
            setMode('add');
          } else if (k === '2' || c === 'Digit2') {
            e.preventDefault(); e.stopPropagation();
            setMode('move');
          }
        } catch {}
      }, true);
    }
    if (!window.__extModeSyncBound) {
      window.__extModeSyncBound = true;
      window.addEventListener('storage', (ev) => {
        if (!ev) return;
        if (ev.key === 'extClickMode' || ev.key === 'extHasSelection') {
          const sel = localStorage.getItem('extHasSelection') === '1';
          const pref = getPref();
          let mode = localStorage.getItem('extClickMode') === 'move' ? 'move' : 'add';
          if (!sel && mode === 'move') {
            try { localStorage.setItem('extClickMode', 'add'); } catch {}
          }
          if (sel && pref === 'move' && mode !== 'move') {
            try { localStorage.setItem('extClickMode', 'move'); } catch {}
          }
          syncModeButtons();
        }
      });
      window.addEventListener('ext:selection', (ev) => {
        try {
          const sel = !!(ev && ev.detail && ev.detail.hasSelection);
          const pref = getPref();
          let mode = localStorage.getItem('extClickMode') === 'move' ? 'move' : 'add';
          if (!sel && mode === 'move') {
            localStorage.setItem('extClickMode', 'add');
          } else if (sel && pref === 'move' && mode !== 'move') {
            localStorage.setItem('extClickMode', 'move');
          }
        } catch {}
        syncModeButtons();
      });
      window.__extModeSyncPoll = setInterval(() => {
        const sel = localStorage.getItem('extHasSelection') === '1';
        const pref = getPref();
        const mode = localStorage.getItem('extClickMode') === 'move' ? 'move' : 'add';
        if (!sel && mode === 'move') {
          try { localStorage.setItem('extClickMode', 'add'); } catch {}
        } else if (sel && pref === 'move' && mode !== 'move') {
          try { localStorage.setItem('extClickMode', 'move'); } catch {}
        }
        syncModeButtons();
      }, 700);
      window.addEventListener('pagehide', () => { try { clearInterval(window.__extModeSyncPoll); } catch {} });
    }
  }

  function consolidateLocPrevControls() {
    const lp = document.querySelector(SELECTORS.locprev);
    if (!lp) return;
    if (lpProcessed.has(lp)) return; // build once per mount

    const root = lp;
    const controls = Array.from(root.querySelectorAll('.embed-controls__control'));
    if (!controls.length) return;

    const findBtn = (label) => root.querySelector(`.embed-controls__control button[aria-label="${label}"]`);

    const pano = root.querySelector(SELECTORS.locprevPanorama) || root;
    let panels = pano.querySelector('.ext-lp-panels') || root.querySelector('.ext-lp-panels');
    if (!panels) {
      panels = document.createElement('div');
      panels.className = 'ext-lp-panels';
      pano.appendChild(panels);
    } else if (panels.parentElement !== pano) {
      try { pano.appendChild(panels); } catch {}
    }
    let p1 = panels.querySelector('.ext-lp-panel--p1');
    if (!p1) { p1 = document.createElement('div'); p1.className = 'ext-lp-panel ext-lp-panel--p1'; panels.appendChild(p1); }
    let p2 = panels.querySelector('.ext-lp-panel--p2');
    if (!p2) { p2 = document.createElement('div'); p2.className = 'ext-lp-panel ext-lp-panel--p2'; panels.appendChild(p2); }

    const makeProxyBtn = (origBtn) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ext-lp-btn';
      btn.innerHTML = origBtn.innerHTML || origBtn.textContent || '';
      btn.title = origBtn.getAttribute('aria-label') || '';
      btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); origBtn.click(); }, true);
      return btn;
    };

    p1.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'ext-lp-row';
    row.style.display = 'flex';
    row.style.gap = '8px';

    ['Open in maps', 'Copy link - hold Shift to copy without tags','Toggle fullscreen (F)'].forEach(lbl => {
      const b = findBtn(lbl);
      if (b) {
        const proxy = makeProxyBtn(b);
        row.appendChild(proxy);
        b.closest('.embed-controls__control')?.classList.add('ext-hidden-orig-control');
      }
    });

    p1.appendChild(row);

    p2.innerHTML = '';
    const stackZoom = document.createElement('div');
    stackZoom.className = 'ext-lp-stack';
    stackZoom.setAttribute('data-span','3');
    ['Zoom in','Reset zoom','Zoom out'].forEach(lbl => {
      const b = findBtn(lbl);
      if (b) {
        const proxy = makeProxyBtn(b);
        stackZoom.appendChild(proxy);
        b.closest('.embed-controls__control')?.classList.add('ext-hidden-orig-control');
      }
    });
    p2.appendChild(stackZoom);

    const stackMove = document.createElement('div');
    stackMove.className = 'ext-lp-stack';
    stackMove.setAttribute('data-span','3');
    ['Jump forward 100 metres (Hotkey: 4)','Jump backward 100 metres (Hotkey: 3)','Return to spawn (R)'].forEach(lbl => {
      const b = findBtn(lbl);
      if (b) {
        const proxy = makeProxyBtn(b);
        stackMove.appendChild(proxy);
        b.closest('.embed-controls__control')?.classList.add('ext-hidden-orig-control');
      }
    });
    p2.appendChild(stackMove);

    lpProcessed.add(lp);

    void positionLPPanels();
  }

  async function positionLPPanels() {
    const panels = getLPPanelElements();
    if (!panels.length) return;

    const inFS = isLPFullscreen();
    if (!inFS) {
      panels.forEach((panel) => {
        if (!panel) return;
        panel.style.transform = '';
        panel.style.left = '';
        panel.style.top = '';
        panel.style.right = '';
        panel.style.bottom = '';
        panel.style.willChange = '';
        panel.style.touchAction = '';
      });
      return;
    }

    await Promise.all(panels.map(async (panel) => {
      if (!panel) return;
      try {
        lockFixedBox(panel);
        panel.style.transform = '';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';

        const defaults = computeDefaultLeftTop(panel);
        const { left, top } = clampToViewport(panel, defaults.left, defaults.top);
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;

      } catch {}
    }));

  }

  const setupControls = (el) => {
    el.__extKey = DRAG_KEYS[SELECTORS.controls];
    el.classList.add('ext-float');
    if (isPanelLayoutEnabled()) {
      if (!el.style.left && !el.style.top) {
        resetElementToDefault(el);
      }
      lockFixedBox(el);
      makeDraggable(el);
      el.__extDragEnabled = DRAG_MODE;
      if (DRAG_MODE) el.classList.add('ext-draggable-active');
      else el.classList.remove('ext-draggable-active');
      if (!el.__extRestored) {
        void restoreSavedPosition(el, el.__extKey);
      }
    } else {
      el.__extDragEnabled = false;
      el.classList.remove('ext-draggable-active');
      el.style.left = '16px';
      el.style.right = 'auto';
      el.style.top = 'auto';
      el.style.bottom = '120px';
      el.style.minWidth = '';
      el.style.minHeight = '';
      el.style.willChange = '';
      el.style.touchAction = '';
      syncDefaultLayoutControlsPosition(el);
    }
  };

  function syncDefaultLayoutControlsPosition(controlsEl = null) {
    if (isPanelLayoutEnabled()) return;
    const el = controlsEl || document.querySelector(SELECTORS.controls);
    if (!el) return;
    const meta = document.querySelector(SELECTORS.meta);
    let bottomPx = 120;
    if (meta) {
      const rect = meta.getBoundingClientRect();
      const metaHeight = Math.max(0, Math.round(rect.height || 0));
      const gap = 16;
      bottomPx = Math.max(16 + gap + metaHeight, 64);
    }
    el.style.left = '16px';
    el.style.right = 'auto';
    el.style.top = 'auto';
    el.style.bottom = `${bottomPx}px`;
  }

  function tagElementsForHiding() {
    const selector = '.map-control.map-control--menu .map-control__menu-button';
    const buttons = document.querySelectorAll(selector);

    buttons.forEach(button => {
        if (button.textContent.trim() === 'Map settings') {
            const parentDiv = button.closest('.map-control--menu');
            if (parentDiv && !parentDiv.hasAttribute('data-ext-hidden')) {
                parentDiv.setAttribute('data-ext-hidden', 'true');
            }
        }
    });
  }

  document.addEventListener('fullscreenchange', () => {
    void positionLPPanels();
    if (!isPanelLayoutEnabled()) return;
    const el = document.querySelector(SELECTORS.locprev);
    ps.fit(el);
  }, true);
  try {
    window.__extRestoreFSLP = () => { void positionLPPanels(); };
  } catch {}

  // MARK: CRE
  // ------------------------------ core apply -------------------------------
  function applyAll() {
    if (!featureFlagsReady) return;
    consolidateControls();
    consolidateLocPrevControls();
    tagElementsForHiding();
    ensureCompassEnhanced();
    ensureNativeTooltips();
    document.documentElement.classList.add('ext-floating-layout');
    document.documentElement.classList.toggle('ext-panel-layout-disabled', !isPanelLayoutEnabled());
    ensureDragToggle();
    updateLayoutButtonState();
    installLayoutHotkeys();
    installEditorHotkeys();
    ensure(SELECTORS.map, setupMap);
    ensure(SELECTORS.header, setupHeader);
    ensure(SELECTORS.meta, setupMeta);
    ensure(SELECTORS.overview, setupOverview);
    ensure(SELECTORS.modal, setupModal);
    ensure(SELECTORS.locprev, setupLocPrev);
    ensure(SELECTORS.controls, setupControls);
    if (!isPanelLayoutEnabled()) {
      syncDefaultLayoutControlsPosition();
    }
  }

  const applyAllThrottled = throttle(applyAll, 120);
  const runApplyAll = window.__extCreatePanoAwareRunner ? window.__extCreatePanoAwareRunner(applyAllThrottled) : applyAllThrottled;
  watchFeatureFlagChanges();

  async function bootstrapPanelLayout() {
    try {
      featureFlags = await loadFeatureFlags();
    } catch {
      featureFlags = { ...DEFAULT_FEATURE_FLAGS };
    }
    featureFlagsReady = true;
    runApplyAll();
  }

  const startBootstrap = () => { void bootstrapPanelLayout(); };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startBootstrap, { once: true });
  } else {
    startBootstrap();
  }

  try {
    if (!localStorage.getItem('extClickMode')) localStorage.setItem('extClickMode', 'add');
    if (!localStorage.getItem('extClickModePref')) localStorage.setItem('extClickModePref', localStorage.getItem('extClickMode') || 'add');
  } catch {}

  try { chrome.runtime?.sendMessage?.({ type: 'INJECT_PAGE_HOOK' }, () => void 0); } catch {}

  const observer = new MutationObserver((muts) => {
    const relevant = muts.some(m => (m.addedNodes && m.addedNodes.length) || (m.removedNodes && m.removedNodes.length));
    if (relevant) {
      runApplyAll();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // MARK: VPC
  // ------------------------------ viewport clamps -------------------------
  function pushPanelIntoView(el) {
    if (!el || !el.isConnected) return;
    if (!isPanelLayoutEnabled() && (el.matches?.(SELECTORS.meta) || el.matches?.(SELECTORS.controls))) return;
    const rect = el.getBoundingClientRect();
    const styleLeft = parseFloat(el.style.left);
    const styleTop = parseFloat(el.style.top);
    const desiredLeft = Number.isFinite(styleLeft) ? Math.round(styleLeft) : Math.round(rect.left);
    const desiredTop = Number.isFinite(styleTop) ? Math.round(styleTop) : Math.round(rect.top);

    const { left: clampedLeft, top: clampedTop } = clampToViewport(el, desiredLeft, desiredTop);

    let finalStyleLeft = clampedLeft;

    const curLeft = parseFloat(el.style.left) || 0;
    const curTop = parseFloat(el.style.top) || 0;
    if (Math.round(curLeft) !== finalStyleLeft || Math.round(curTop) !== clampedTop) {
      el.style.left = `${finalStyleLeft}px`;
      el.style.top = `${clampedTop}px`;
    }
  }

  function clampAllPanelsToViewport() {
    const els = getDraggables();
    els.forEach(pushPanelIntoView);
  }

  let __extClampRAF = 0;
  let __extPersistTO = 0;
  function onResize() {
    if (!__extClampRAF) {
      __extClampRAF = requestAnimationFrame(() => {
        __extClampRAF = 0;
        clampAllPanelsToViewport();
      });
    }
    if (!isPanelLayoutEnabled()) {
      syncDefaultLayoutControlsPosition();
    }
    if (__extPersistTO) clearTimeout(__extPersistTO);
    __extPersistTO = setTimeout(() => { void persistAllVisiblePositions(); }, 400);
  }

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('pagehide', () => { void persistAllVisiblePositions(); });
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { void persistAllVisiblePositions(); } });
})();

// MARK: AZL
// Auto-zoom to level 3 on load
(() => {
  let applied = false;

  async function setZoomTo3() {
    if (applied) return;
    const zoomIn = document.querySelector("button[aria-label='Zoom in']");
    if (!zoomIn) return;
    applied = true;

    try {
      for (let i = 0; i < 2; i++) {
        zoomIn.click();
        await new Promise(r => setTimeout(r, 80));
      }
    } catch {}
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    setZoomTo3();
  } else {
    document.addEventListener("DOMContentLoaded", setZoomTo3, { once: true });
  }

  const zoomObserverRaw = () => { if (!applied) setZoomTo3(); };
  const zoomObserverCallback = window.__extCreatePanoAwareRunner
    ? window.__extCreatePanoAwareRunner(zoomObserverRaw)
    : zoomObserverRaw;

  const mo = new MutationObserver(zoomObserverCallback);
  mo.observe(document.documentElement, { childList: true, subtree: true });

})();

// MARK: SVP
// Street view preview
(() => {
  const PREVIEW_SEL = '.sv-preview-control';
  const LOC_PANO_SEL = '.location-preview__panorama';

  let lastX = 0, lastY = 0;
  let previewEl = null;
  let ghost = null;
  let raf = 0;

  const isMiniMapMode = () => {
    const fs = document.fullscreenElement;
    return !!(fs && (fs.matches?.(LOC_PANO_SEL) || fs.closest?.(LOC_PANO_SEL)));
  };

  function clampPos(w, h) {
    const pad = 8;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = Math.round(lastX - Math.round(w / 2));
    let top  = Math.round(lastY - h - 12);
    if (left < pad) left = pad;
    if (left > vw - w - pad) left = vw - w - pad;
    if (top < pad) top = pad;
    if (top > vh - h - pad) top = vh - h - pad;
    return { left, top };
  }

  function ensureGhost() {
    if (ghost && ghost.isConnected) return ghost;
    const g = document.createElement('div');
    g.className = 'ext-sv-preview-ghost';
    document.body.appendChild(g);
    ghost = g; return g;
  }

  function extractCaptionText(root) {
    try {
      const cap = root.querySelector('.sv-preview-control__caption');
      const txt = (cap && cap.textContent) ? cap.textContent.trim() : '';
      return txt;
    } catch { return ''; }
  }

  function ensureDecorations(container, sourceForData) {
    if (!container) return;
    let badge = container.querySelector(':scope > .ext-sv-caption-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'ext-sv-caption-badge';
      container.appendChild(badge);
    }
    const capText = extractCaptionText(sourceForData || container) || extractCaptionText(container);
    badge.textContent = capText || '';
    badge.style.display = capText ? '' : 'none';
  }

  function updatePosition() {
    if (!previewEl || !previewEl.isConnected) return;
    if (isMiniMapMode()) return;
    try {
      const g = ensureGhost();
      try { g.className = (previewEl.className ? previewEl.className + ' ' : '') + 'ext-sv-preview-ghost'; } catch {}
      const fig = previewEl.querySelector('figure');
      const nextHTML = fig ? fig.outerHTML : previewEl.innerHTML;
      const contentChanged = (g.__html !== nextHTML);
      if (contentChanged) { g.innerHTML = nextHTML; g.__html = nextHTML; }
      g.style.position = 'fixed';
      g.style.bottom = 'auto';
      g.style.right  = 'auto';
      const measEl = g.firstElementChild || g;
      const r = measEl.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width || 320));
      const h = Math.max(1, Math.round(r.height || 180));
      const { left, top } = clampPos(w, h);
      g.style.left = left + 'px';
      g.style.top  = top  + 'px';
      ensureDecorations(g, previewEl);
      if (contentChanged || !g.__appeared) {
        g.classList.add('ext-sv-initial');
        requestAnimationFrame(() => requestAnimationFrame(() => { g.classList.remove('ext-sv-initial'); g.__appeared = true; }));
      }
      if (w > 2 && h > 2) {
        previewEl.classList.add('ext-sv-preview-hidden');
      } else {
        previewEl.classList.remove('ext-sv-preview-hidden');
      }
    } catch {}
  }

  function restoreDefaultPosition() {
    if (!previewEl) return;
    try {
      previewEl.classList.remove('ext-sv-preview-hidden');
      if (ghost && ghost.isConnected) { try { ghost.remove(); } catch {} }
    } catch {}
  }

  function bindMouseTracking() {
    if (window.__extSvMouseBound) return;
    window.__extSvMouseBound = true;
    const onMove = (e) => {
      lastX = e.clientX; lastY = e.clientY;
      if (!raf) {
        raf = requestAnimationFrame(() => { raf = 0; if (!isMiniMapMode()) updatePosition(); });
      }
    };
    window.addEventListener('mousemove', onMove, { passive: true });
  }

  const handlePreviewMutations = () => {
    const found = document.querySelector(PREVIEW_SEL);
    if (found !== previewEl) {
      previewEl = found || null;
      if (previewEl) {
        if (!isMiniMapMode()) updatePosition();
        else ensureDecorations(previewEl, previewEl);
      } else {
        if (ghost && ghost.isConnected) { try { ghost.remove(); } catch {} }
      }
    }

    bindMouseTracking();

    if (isMiniMapMode()) restoreDefaultPosition();
  };

  const previewMutationHandler = window.__extCreatePanoAwareRunner ? window.__extCreatePanoAwareRunner(handlePreviewMutations) : handlePreviewMutations;
  const mo = new MutationObserver(previewMutationHandler);
  mo.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('fullscreenchange', () => {
    if (isMiniMapMode()) {
      restoreDefaultPosition();
    } else {
      updatePosition();
    }
  }, true);

  try { bindMouseTracking(); } catch {}
})();
