'use strict';

// ------------------------------ Right-click Context Menus -------------------------
(() => {
  if (window.__extCtxMenusInit) return;
  window.__extCtxMenusInit = true;

  window.__extPositionPanelAtPoint = function __extPositionPanelAtPoint(wrapperEl, menuEl, x, y, { margin = 8 } = {}) {
    try {
      if (!wrapperEl) return null;
      const el = menuEl || wrapperEl;
      el.style.position = 'fixed';
      el.style.display = '';
      if (el === wrapperEl) el.style.visibility = 'hidden';
      wrapperEl.style.left = `${Math.round(x)}px`;
      wrapperEl.style.top = `${Math.round(y)}px`;

      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width || el.offsetWidth || 240);
      const h = Math.round(rect.height || el.offsetHeight || 120);
      const vw = window.innerWidth || document.documentElement.clientWidth || 1280;
      const vh = window.innerHeight || document.documentElement.clientHeight || 800;

      let left = x;
      let top = y;
      let anchorH = 'left';
      let anchorV = 'top';

      if (left + w + margin > vw) { left = x - w; anchorH = 'right'; }
      if (top + h + margin > vh) { top = y - h; anchorV = 'bottom'; }

      left = Math.max(margin, Math.min(left, vw - w - margin));
      top  = Math.max(margin, Math.min(top,  vh - h - margin));

      wrapperEl.style.left = `${Math.round(left)}px`;
      wrapperEl.style.top = `${Math.round(top)}px`;
      el.style.visibility = 'visible';

      const anchorX = anchorH === 'left' ? Math.round(left) : Math.round(left + w);
      const anchorY = anchorV === 'top'  ? Math.round(top)  : Math.round(top + h);

      return { left: Math.round(left), top: Math.round(top), width: w, height: h, anchorH, anchorV, anchorX, anchorY };
    } catch (e) {
      try { console.error('Context menu positioning failed:', e); } catch {}
      return null;
    }
  };

  function initTagContextMenus() {
    if (window.__extTagMenuAugmented) return;
    window.__extTagMenuAugmented = true;

    document.addEventListener('contextmenu', (e) => {
      const tag = e.target?.closest?.('.tag');
      window.__extLastRightClickedTag = tag || null;
      if (!tag) return;
      tag.dataset.extRightClicked = '1';
      setTimeout(() => { try { delete tag.dataset.extRightClicked; } catch {} }, 800);
    }, true);

    const handleTagMenuMutations = (mutations) => {
      if (!window.__extLastRightClickedTag) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes || []) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (!node.matches?.('[data-radix-popper-content-wrapper]')) continue;
          const menu = node.querySelector?.('.context-menu[data-state="open"]');
          if (!menu) continue;

          const tagElForStyle = window.__extLastRightClickedTag;
          const clickPointForStyle = window.__extLastTagClickPoint;

          requestAnimationFrame(() => {
            if (!menu.isConnected || !tagElForStyle?.isConnected) return;
            try {
              const menuRect = menu.getBoundingClientRect();
              if (clickPointForStyle && menuRect.width > 0) {
                const tagColor = getTagColor(tagElForStyle) || '#008cff';
                const anchorH = Math.abs(clickPointForStyle.x - menuRect.left) < Math.abs(clickPointForStyle.x - menuRect.right) ? 'left' : 'right';
                const direction = (anchorH === 'right') ? 'left' : 'right';
                menu.style.background = `linear-gradient(to bottom ${direction}, ${tagColor}cd -25%, var(--ext-el-bg) 70%)`;
              }
            } catch (err) {
              console.error('Failed to apply tag menu background:', err);
            }
          });

          try {
            const r = node.getBoundingClientRect();
            window.__extEditMenuPosition = {
              left: Math.round(r.left),
              top: Math.round(r.top),
              width: Math.round(r.width),
              height: Math.round(r.height),
              anchorH: 'left',
              anchorV: 'top',
              anchorX: Math.round(r.left),
              anchorY: Math.round(r.top)
            };
          } catch {}

          const editItem = document.createElement('button');
          editItem.type = 'button';
          editItem.className = 'context-menu__item';
          editItem.textContent = 'Edit';
          menu.prepend(editItem);

          const menuItems = menu.querySelectorAll('.context-menu__item');
          const selectionRegex = /selection \((\d+) locations\)/i;

          for (const item of menuItems) {
            const originalText = item.textContent?.trim() || '';
            const match = originalText.match(selectionRegex);

            if (match && match[1]) {
              const count = parseInt(match[1], 10);
              const selections = `${count} selection${count === 1 ? '' : 's'}`;
              if (originalText.startsWith('Remove from')) {
                item.textContent = `Remove from ${selections}`;
              } else if (originalText.startsWith('Rename in')) {
                item.textContent = `Rename in ${selections}`;
              }
            }

            if (originalText.startsWith('Remove')) {
              item.classList.add('context-menu__item--destructive');
            }
            if (originalText.startsWith('Remove from all')) {
              item.textContent = 'Delete';
            }
          }
          
          window.__extLastRightClickedTag = null;
          return;
        }
      }
    };

    const tagMenuObserverCallback = window.__extCreatePanoAwareRunner ? window.__extCreatePanoAwareRunner(handleTagMenuMutations) : handleTagMenuMutations;
    const observer = new MutationObserver(tagMenuObserverCallback);
    try { observer.observe(document.body, { childList: true }); } catch {}
  }

  window.__extOpenShapesContextMenu = function __extOpenShapesContextMenu(e, shape, el) {
    if (!e) return;

    try { e.preventDefault(); e.stopPropagation(); } catch {}

    try { document.querySelectorAll('[data-radix-popper-content-wrapper].ext-shapes-menu-wrapper').forEach(n => n.remove()); } catch {}

    const wrapper = document.createElement('div');
    wrapper.className = 'ext-shapes-menu-wrapper';
    wrapper.setAttribute('data-radix-popper-content-wrapper', '');
    wrapper.style.position = 'fixed';
    wrapper.style.zIndex = '999999';

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.setAttribute('data-state', 'open');

    const mkItem = (label, onClick, { destructive = false } = {}) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'context-menu__item';
      btn.textContent = label;
      if (destructive) btn.classList.add('context-menu__item--destructive');
      btn.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        try { await onClick?.(e); } finally { close(); }
      });
      return btn;
    };

    let removeGuard = null;
    let isInstantDelete = !!(e?.metaKey);
    let deleteBtnRef = null;
    const updateInstantUI = () => {
      try {
        if (!deleteBtnRef) return;
        if (isInstantDelete) deleteBtnRef.setAttribute('data-instant', '1');
        else deleteBtnRef.removeAttribute('data-instant');
      } catch {}
    };
    const close = () => {
      try { document.removeEventListener('pointerdown', onDocDown, true); } catch {}
      try { document.removeEventListener('keydown', onKey, true); } catch {}
      try { document.removeEventListener('keyup', onKeyUp, true); } catch {}
      try { removeGuard && removeGuard(); } catch {}
      try { wrapper.remove(); } catch {}
    };
    const onDocDown = (e) => { if (!wrapper.contains(e.target)) { e.preventDefault(); e.stopPropagation(); close(); } };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key === 'Meta') { isInstantDelete = true; updateInstantUI(); }
    };
    const onKeyUp = (e) => { if (e.key === 'Meta') { isInstantDelete = false; updateInstantUI(); } };

    menu.appendChild(mkItem('Edit', () => {
        try {
          const res = window.__extEditMenuPosition || null;
          if (res && (res.anchorH || res.anchorV)) {
            OpenEditorPopup(shape, el, {
              x: res.anchorX ?? (res.anchorH === 'right' ? (res.left + (res.width||0)) : res.left),
              y: res.anchorY ?? (res.anchorV === 'bottom' ? (res.top + (res.height||0)) : res.top),
              anchorH: res.anchorH || 'left',
              anchorV: res.anchorV || 'top'
            });
          } else {
            OpenEditorPopup(shape, el, { x: e.clientX, y: e.clientY, anchorH: 'left', anchorV: 'top' });
          }
        } catch (e) { console.error('Failed to open shape editor:', e); }
    }));

    menu.appendChild(mkItem('Export GeoJSON', () => { try { exportShapesAsGeoJSON([shape]); } catch {} }));

    deleteBtnRef = mkItem('Delete', async (clickEvt) => {
      let ok = true;
      const msg = `Delete "${shape.name || 'Polygon'}"?`;
      const cap = 'This will remove it from the list and selections.';
      const bypass = !!(clickEvt?.metaKey || isInstantDelete);
      if (!bypass) {
        try { ok = await window.__extNotify(msg, cap, 'confirm', { confirmText: 'Delete', cancelText: 'Cancel' }); } catch {}
        if (!ok) return;
      }
      try { await deleteShapeFromManager(shape, el); } catch {}
    }, { destructive: true });
    try {
      deleteBtnRef.title = 'Delete this shape (hold Ctrl for instant delete)';
      const hint = document.createElement('span');
      hint.className = 'context-menu__instant-icon';
      hint.textContent = ' now';
      deleteBtnRef.appendChild(hint);
    } catch {}
    menu.appendChild(deleteBtnRef);

    wrapper.appendChild(menu);
    document.body.appendChild(wrapper);
    try {
      const resolved = window.__extPositionPanelAtPoint?.(wrapper, menu, e.clientX, e.clientY, { margin: 8 });
      if (resolved) {
        try { window.__extEditMenuPosition = resolved; } catch {}
        try {
          if (!el) return null;
          const baseColor = __extCssColorToHex(getComputedStyle(el, '::after').getPropertyValue('background-color')) || '#008cff';
          const direction = (resolved.anchorH === 'right') ? 'left' : 'right';
          menu.style.background = `linear-gradient(to bottom ${direction}, ${baseColor}cd -25%, var(--ext-el-bg) 70%)`;
          if (typeof window.__extGetContrastTextColor === 'function') {
            menu.style.color = window.__extGetContrastTextColor(baseColor);
          }
        } catch (err) {
            console.error('Failed to apply context menu background:', err);
        }
      }
    } catch {}
    if (window.__extMakeClickGuard) { try { removeGuard = window.__extMakeClickGuard([wrapper], close); } catch {} }
    else { document.addEventListener('pointerdown', onDocDown, true); }
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('keyup', onKeyUp, true);
    updateInstantUI();
  };

  try { initTagContextMenus(); } catch {}
})();

// ------------------------------ Layout Popup (button + menu) -------------------------
(() => {
  if (window.__extLayoutPopupInit) return;
  window.__extLayoutPopupInit = true;

  let isOpen = false;
  let metaActive = false;
  let buttonEl = null;
  let menuEl = null;
  let dragBtn = null, dragLabel = null;
  let defaultBtn = null, defaultLabel = null, defaultIcon = null;

  function isLPFullscreen() {
    try {
      const fs = document.fullscreenElement;
      return !!(fs && (fs.matches?.('.location-preview__panorama') || fs.closest?.('.location-preview__panorama')));
    } catch { return false; }
  }

  const DEFAULT_SET_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path fill="currentColor" d="M2 0h11.22a2 2 0 0 1 1.345.52l2.78 2.527A2 2 0 0 1 18 4.527V16a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2m0 2v14h14V4.527L13.22 2zm4 8h6a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2m0 2v4h6v-4zm7-9a1 1 0 0 1 1 1v3a1 1 0 0 1-2 0V4a1 1 0 0 1 1-1M5 3h5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1m1 3h3V5H6z"/></svg>`;
  const DEFAULT_CLEAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.345 3.147A2 2 0 0 1 9.154 2h5.692a2 2 0 0 1 1.81 1.147L18 6H6zM4 6h16l-1.58 14.22A2 2 0 0 1 16.432 22H7.568a2 2 0 0 1-1.988-1.78zm5 5v6m6-6v6m-3-6v6"/></svg>`;

  function createItem(className, iconSvg) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `context-menu__item ext-layout-item ${className}`;
    const icon = document.createElement('span');
    icon.className = 'ext-layout-item__icon';
    icon.innerHTML = iconSvg;
    const label = document.createElement('span');
    label.className = 'ext-layout-item__label';
    btn.append(label, icon);
    return { btn, label, icon };
  }

  function positionMenu(anchorBtn, host) {
    if (!menuEl || !anchorBtn) return;
    const rect = anchorBtn.getBoundingClientRect();
    const GAP = 8;
    if (host && menuEl.parentNode !== host) {
      host.appendChild(menuEl);
    }
    menuEl.style.position = 'fixed';
    menuEl.style.top = Math.round(rect.bottom + GAP) + 'px';
    menuEl.style.left = 'auto';
    menuEl.style.bottom = 'auto';
    const right = Math.max(12, Math.round(window.innerWidth - rect.right));
    menuEl.style.right = right + 'px';
  }

  function onDocMouseDown(e) {
    try {
      if (!menuEl || !buttonEl) return;
      if (menuEl.contains(e.target) || buttonEl.contains(e.target)) return;
      setVisibility(false);
    } catch {}
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { setVisibility(false); return; }
    if ((e.metaKey || e.key === 'Meta') && !metaActive) { metaActive = true; updateUI(); }
  }
  function onKeyUp(e) {
    if (!e.metaKey && metaActive) { metaActive = false; updateUI(); }
  }
  function onResize() {
    if (isOpen) positionMenu(buttonEl, document.fullscreenElement || document.body);
  }

  let callbacksRef = null;
  function updateUI() {
    if (!callbacksRef) return;
    const { getDragMode, hasCustomDefaults } = callbacksRef;
    const drag = !!getDragMode?.();
    const hasCustom = !!hasCustomDefaults?.();
    const inFS = isLPFullscreen();

    try {
      if (buttonEl) {
        buttonEl.classList.toggle('is-drag-active', drag);
        buttonEl.setAttribute('aria-pressed', String(drag));
        if (inFS) {
          buttonEl.disabled = true;
          buttonEl.classList.add('is-disabled');
          buttonEl.setAttribute('aria-disabled', 'true');
          buttonEl.setAttribute('title', 'Layout editing is unavailable in Street View fullscreen');
          if (isOpen) {
            try { setVisibility(false); } catch {}
          }
        } else {
          buttonEl.disabled = false;
          buttonEl.classList.remove('is-disabled');
          buttonEl.removeAttribute('aria-disabled');
          buttonEl.setAttribute('title', drag ? 'Lock the size and positions of the floating panels' : 'Edit the size and positions of the floating panels');
        }
      }
      if (dragBtn) dragBtn.setAttribute('aria-pressed', String(drag));
      if (dragLabel) dragLabel.textContent = drag ? 'Lock panel layout (E)' : 'Edit panel layout (E)';

      if (defaultBtn) {
        const mode = metaActive ? 'clear' : 'set';
        defaultBtn.setAttribute('data-mode', mode);
        const disable = (metaActive && !hasCustom) || inFS;
        defaultBtn.disabled = !!disable;
        if (disable) {
          defaultBtn.classList.add('is-disabled');
          defaultBtn.setAttribute('aria-disabled', 'true');
        } else {
          defaultBtn.classList.remove('is-disabled');
          defaultBtn.removeAttribute('aria-disabled');
        }
      }
      if (defaultLabel) defaultLabel.textContent = metaActive ? 'Clear default layout' : 'Set as default layout';
      if (defaultIcon) {
        const nextSvg = metaActive ? DEFAULT_CLEAR_SVG : DEFAULT_SET_SVG;
        if (defaultIcon.innerHTML !== nextSvg) defaultIcon.innerHTML = nextSvg;
      }
    } catch {}
  }

  function setVisibility(open) {
    if (!buttonEl || !menuEl) return;
    if (open === isOpen) { if (open) { positionMenu(buttonEl, document.fullscreenElement || document.body); updateUI(); } return; }
    isOpen = !!open;
    if (isOpen) {
      menuEl.style.display = 'block';
      menuEl.removeAttribute('aria-hidden');
      buttonEl.setAttribute('aria-expanded', 'true');
      positionMenu(buttonEl, document.fullscreenElement || document.body);
      document.addEventListener('mousedown', onDocMouseDown, true);
      window.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('keyup', onKeyUp, true);
      window.addEventListener('resize', onResize, true);
      callbacksRef?.ensureDefaultsLoaded?.();
      updateUI();
    } else {
      menuEl.style.display = 'none';
      menuEl.setAttribute('aria-hidden', 'true');
      buttonEl.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', onDocMouseDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('resize', onResize, true);
      if (metaActive) metaActive = false;
      updateUI();
    }
  }

  const onButtonClick = (event) => {
    if (buttonEl?.disabled || buttonEl?.getAttribute?.('aria-disabled') === 'true') {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return;
    }
    setVisibility(!isOpen);
  };

  window.__extInitLayoutPopup = function __extInitLayoutPopup(btn, callbacks = {}) {
    callbacksRef = callbacks;
    if (!btn || !(btn instanceof HTMLElement)) return { button: null, menu: null };

    if (buttonEl && buttonEl !== btn) {
      try { buttonEl.removeEventListener('click', onButtonClick); } catch {}
    }
    buttonEl = btn;

    if (!buttonEl.classList.contains('ext-layout-button')) buttonEl.classList.add('ext-layout-button');
    buttonEl.setAttribute('aria-haspopup', 'dialog');
    buttonEl.setAttribute('aria-expanded', buttonEl.getAttribute('aria-expanded') || 'false');
    buttonEl.setAttribute('aria-pressed', buttonEl.getAttribute('aria-pressed') || 'false');

    if (!buttonEl.__extLayoutClickBound) {
      buttonEl.addEventListener('click', onButtonClick);
      buttonEl.__extLayoutClickBound = true;
    }

    if (!menuEl || !menuEl.isConnected) {
      const menu = document.createElement('div');
      menu.className = 'ext-layout-menu context-menu layout-popup';
      menu.setAttribute('role', 'dialog');
      menu.setAttribute('aria-hidden', 'true');
      menu.style.display = 'none';
      menu.id = 'ext-layout-menu';

      const inner = document.createElement('div');
      inner.className = 'ext-layout-menu__content';
      menu.appendChild(inner);
      document.body.appendChild(menu);
      menuEl = menu;

      const drag = createItem('ext-layout-item--drag', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M20.531 2.563c-1.914.185-3.729 5.083-5.593 7.624-4.516-.785-7.235 1.498-7.195 2.962.04 1.464 4.35 5.351 4.35 5.351S3.126 27.016 4 28c.874.984 9.5-8.094 9.5-8.094s4.498 4.944 5.928 4.601c1.43-.343 2.832-3.936 2.384-7.445 2.542-1.864 7.21-3.87 7.625-5.593.415-1.724-6.991-9.092-8.906-8.906z"/></svg>');
      drag.btn.setAttribute('aria-pressed', 'false');
      drag.btn.addEventListener('click', () => { callbacksRef?.onToggleDrag?.(); updateUI(); setVisibility(false); });
      dragBtn = drag.btn; dragLabel = drag.label;

      const res = createItem('ext-layout-item--reset', '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 5V2L7 7l5 5V9c2.76 0 5 2.24 5 5 0 2.76-2.24 5-5 5-1.38 0-2.63-.56-3.54-1.46l-1.42 1.42C8.27 20.37 10.02 21 12 21c3.87 0 7-3.13 7-7s-3.13-7-7-7z"/></svg>');
      res.label.textContent = 'Reset panels to default (Q)';
      res.btn.addEventListener('click', async () => {
        setVisibility(false);
        await callbacksRef?.onReset?.();
      });

      const def = createItem('ext-layout-item--default', DEFAULT_SET_SVG);
      def.btn.addEventListener('click', async () => {
        if (metaActive) {
          if (!callbacksRef?.hasCustomDefaults?.()) return;
          await callbacksRef?.onClearDefaults?.();
          try { window.__extNotify('Default Panel Position Cleared','','error'); } catch {};
        } else {
          await callbacksRef?.onSetDefaults?.();
          try { window.__extNotify('Set New Default Panel Position','','success'); } catch {};
        }
        setVisibility(false);
      });
      defaultBtn = def.btn; defaultLabel = def.label; defaultIcon = def.icon;

      inner.append(drag.btn, res.btn, def.btn);
    }

    if (menuEl && buttonEl) {
      const menuId = menuEl.id || 'ext-layout-menu';
      menuEl.id = menuId;
      buttonEl.setAttribute('aria-controls', menuId);
    }

    try { updateUI(); } catch {}

    return { button: buttonEl, menu: menuEl };
  };

  if (Array.isArray(window.__extPendingLayoutInits) && window.__extPendingLayoutInits.length) {
    const pending = window.__extPendingLayoutInits.splice(0);
    for (const item of pending) {
      try { window.__extInitLayoutPopup(item.btn, item.callbacks); } catch {}
    }
  }

  window.__extUpdateLayoutPopupState = function __extUpdateLayoutPopupState() {
    updateUI();
  };

  try {
    document.addEventListener('fullscreenchange', () => {
      try { updateUI(); } catch {}
      try { if (isOpen) positionMenu(buttonEl, document.fullscreenElement || document.body); } catch {}
    }, true);
  } catch {}
})();

// --------------- Snackbar Interceptor ---------------
(() => {
  if (window.__extSnackbarInterceptorInit) return;
  window.__extSnackbarInterceptorInit = true;

  const SNACKBAR_TEXT_TO_MATCH = "No coverage found at this location";
  
  let isSnackbarSuppressed = false;

  const handleSnackbarMutations = (mutations) => {
    if (isSnackbarSuppressed) return;

    for (const mutation of mutations) {
      if (mutation.addedNodes.length === 0) continue;

      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        const targetSnackbars = [];
        if (node.matches && node.matches('.snackbar')) {
          targetSnackbars.push(node);
        }
        if (node.querySelectorAll) {
          targetSnackbars.push(...node.querySelectorAll('.snackbar'));
        }

        for (const snackbar of targetSnackbars) {
          const textEl = snackbar.querySelector('.snackbar--text');
          if (!textEl) continue;

          if (textEl.textContent.trim() === SNACKBAR_TEXT_TO_MATCH) {
            isSnackbarSuppressed = true;
            setTimeout(() => { isSnackbarSuppressed = false; }, 200);

            if (window.__extNotify) {
              window.__extNotify(SNACKBAR_TEXT_TO_MATCH, '', 'info');
            }

            snackbar.style.setProperty('display', 'none', 'important');
            snackbar.style.setProperty('visibility', 'hidden', 'important');
            snackbar.style.setProperty('opacity', '0', 'important');
            return;
          }
        }
      }
    }
  };

  const snackbarMutationHandler = window.__extCreatePanoAwareRunner ? window.__extCreatePanoAwareRunner(handleSnackbarMutations) : handleSnackbarMutations;

  const observer = new MutationObserver(snackbarMutationHandler);

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();

// ------------------------------ Notifications --------------------------
(function initNotify() {
  if (window.__extNotifyInit) return;
  window.__extNotifyInit = true;

  let host = null;
  const GAP_PX = 8;
  function ensureHost() {
    if (host && host.isConnected) return host;
    const existing = document.querySelector('.ext-notify-host');
    if (existing) { host = existing; return host; }
    host = document.createElement('div');
    host.className = 'ext-notify-host';
    (document.body || document.documentElement).appendChild(host);
    return host;
  }

  function relayoutToasts() {
    if (!host) return;
    const items = Array.from(host.querySelectorAll('.ext-notify'));
    let offset = 0;
    for (const item of items) {
      item.style.setProperty('--ext-notify-offset', offset + 'px');
      const h = item.offsetHeight || 0;
      offset += h + GAP_PX;
    }
  }

  function showNotification(msg, cap, type = 'info', durOrOpts) {
    try { ensureHost(); } catch {}
    if (String(type) === 'confirm') {
      const opts = (durOrOpts && typeof durOrOpts === 'object') ? durOrOpts : {};
      const confirmText = opts.confirmText || 'Confirm';
      const cancelText = opts.cancelText || 'Cancel';

      return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'ext-confirm-overlay';


        const dialog = document.createElement('div');
        dialog.className = 'ext-confirm-dialog'

        const title = document.createElement('div');
        title.className = 'ext-confirm-title';
        title.textContent = String(msg || 'Are you sure?');
        title.style.marginBottom = cap ? '4px' : '12px';
        dialog.appendChild(title);

        if (cap && cap !== '') {
          const caption = document.createElement('div');
          caption.className = 'ext-confirm-caption';
          caption.textContent = String(cap);
          dialog.appendChild(caption);
        }

        const actions = document.createElement('div');
        actions.className = 'ext-confirm-actions';

        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.className = 'button';
        btnCancel.textContent = cancelText;

        const btnOk = document.createElement('button');
        btnOk.type = 'button';
        btnOk.className = 'button button--destructive';
        btnOk.textContent = confirmText;

        actions.appendChild(btnCancel);
        actions.appendChild(btnOk);
        dialog.appendChild(actions);

        overlay.appendChild(dialog);
        (document.body || document.documentElement).appendChild(overlay);

        try { window.__extCloseAllOverlays?.(); } catch {}
        try { document.body?.click?.(); } catch {}
        try {
          const evt = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
          document.documentElement?.dispatchEvent?.(evt);
        } catch {}

        let isDone = false;
        const resolveAndCleanup = (value) => {
          if (isDone) return;
          isDone = true;
          document.removeEventListener('keydown', handleEvents, true);
          overlay.remove();

          resolve(!!value);
        };

        const handleEvents = (e) => {
          const isKeyEvent = e.type === 'keydown';
          const isClickEvent = e.type === 'pointerdown' || e.type === 'click';

          let shouldPrevent = true;

          if (isKeyEvent) {
            if (e.key === 'Escape') return resolveAndCleanup(false);
            if (e.key === 'Enter') return resolveAndCleanup(true);
            return;
          }

          if (isClickEvent) {
            const target = e.target;
            if (target === btnCancel) return resolveAndCleanup(false);
            if (target === btnOk) return resolveAndCleanup(true);
            if (target === overlay) return resolveAndCleanup(false);
          }

          shouldPrevent = false;

          if (shouldPrevent) {
            e.preventDefault();
            e.stopPropagation();
          }
        };

        overlay.addEventListener('click', handleEvents, true);
        document.addEventListener('keydown', handleEvents, true);

        try { btnOk.focus?.(); } catch {}
      });
    }

    const duration = durOrOpts || 3000;
    const el = document.createElement('div');
    el.className = `ext-notify ext-notify--${type}`;
    el.style.gap = '0px';
    const text = document.createElement('div');
    text.className = 'ext-notify__text';
    text.textContent = String(msg || '');
    el.appendChild(text);

    if (cap !== '') {
        const caption = document.createElement('div');
        caption.className = 'ext-notify__caption';
        caption.textContent = String(cap);
        el.appendChild(caption);
        el.style.gap = '6px';
    }

    if (host.firstChild) host.insertBefore(el, host.firstChild);
    else host.appendChild(el);

    relayoutToasts();

    requestAnimationFrame(() => {
      el.classList.add('is-visible');
      requestAnimationFrame(() => { relayoutToasts(); });
    });

    const hide = () => {
      if (el.__extHiding) return; el.__extHiding = true;
      el.classList.add('is-hiding');
      el.classList.remove('is-visible');
      const remove = () => {
        try { el.remove(); } catch {}
        try { relayoutToasts(); } catch {}
        try {
          if (host && host.querySelectorAll('.ext-notify').length === 0) {
            host.remove();
            host = null;
          }
        } catch {}
      };
      el.addEventListener('transitionend', remove, { once: true });
      setTimeout(remove, 450);
    };
    setTimeout(hide, duration);

    return { el, hide };
  }

  window.__extNotify = showNotification;

  window.addEventListener('resize', () => { try { relayoutToasts(); } catch {} }, { passive: true });
})();

// --- Shared floating helpers (exported) ---
if (!window.__extFloatingPopup) {
  window.__extFloatingPopup = {
    positionBox(anchorEl, boxEl, { minWidth = 180, maxHeight = 400, extraClass } = {}) {
      if (!anchorEl || !boxEl) return;
      const rect = anchorEl.getBoundingClientRect();
      boxEl.style.position = 'fixed';
      boxEl.style.display = '';
      boxEl.style.visibility = 'hidden';
      boxEl.style.right = '';
      boxEl.style.bottom = '';
      boxEl.style.left = rect.left + 'px';
      const width = Math.max(minWidth, rect.width);
      boxEl.style.width = width + 'px';
      boxEl.style.maxWidth = width + 'px';
      if (extraClass) boxEl.classList.add(extraClass);

      const margin = 8;
      const vh = window.innerHeight || document.documentElement.clientHeight || 800;
      const spaceAbove = Math.max(0, rect.top - margin);
      const spaceBelow = Math.max(0, vh - rect.bottom - margin);
      const desired = Math.min(maxHeight, Math.max(120, boxEl.scrollHeight || 200));
      let placeAbove = false;
      if (spaceBelow < desired) {
        placeAbove = (spaceAbove >= desired) || (spaceAbove > spaceBelow);
      }

      if (placeAbove) {
        const maxH = Math.max(80, Math.min(desired, spaceAbove));
        boxEl.style.maxHeight = maxH + 'px';
        const top = rect.top - Math.min(desired, maxH);
        boxEl.style.top = Math.max(0, top) + 'px';
      } else {
        const maxH = Math.max(80, Math.min(desired, spaceBelow));
        boxEl.style.maxHeight = maxH + 'px';
        boxEl.style.top = Math.min(vh - maxH, rect.bottom) + 'px';
      }

      boxEl.style.visibility = 'visible';
    },
  };
}

function __extCloseFloatingTagDropdown() {
  try {
    const dd = document.querySelector('.ext-tag-dd.ext-floating-dd');
    if (dd) dd.style.display = 'none';
  } catch {}
}
function getTagText(el) {
  const label = el.querySelector('.tag__text') || el;

  let text = '';
  for (const node of label.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || '';
    }
  }
  return text.trim() || (label.textContent || '').trim();
}
function getTagColor(el) {
  const DEFAULT = '#008cff';
  if (!el) {
    const s = new String(DEFAULT);
    s.bg = DEFAULT; s.fg = '#fff';
    s.toString = () => DEFAULT; s.valueOf = () => DEFAULT;
    return s;
  }

  const pickBg = () => {
    const inline = __extCssColorToHex(el?.style?.backgroundColor);
    if (inline) return inline;
    try {
      const cs = getComputedStyle(el);
      const bg = __extCssColorToHex(cs.backgroundColor);
      if (bg) return bg;
      const border = __extCssColorToHex(cs.borderColor);
      if (border) return border;
    } catch {}
    return DEFAULT;
  };

  const bg = pickBg();
  const fg = (typeof window.__extGetContrastTextColor === 'function')
    ? window.__extGetContrastTextColor(bg)
    : '#fff';

  const out = new String(bg);
  out.bg = bg;
  out.fg = fg;
  out.toString = () => bg;
  out.valueOf = () => bg;
  return out;
}

// MARK: TSD
// --------------- Tag Search Dropdown ---------------
(() => {
  const OVERVIEW_SEL = '.map-overview';
  const TAG_LABEL_SEL = [
    '.map-overview .tag-list .tag .tag__text',
    '.location-preview__tags .tag-list .tag .tag__text',
    '.ext-lp-tag-manager .tag-list .tag .tag__text',
    '.tag-list .tag .tag__text'
  ].join(', ');
  const CLICK_TARGETS_SEL = '.map-overview .tag-list li.tag, .ext-lp-tag-manager .tag-list li.tag, .location-preview__tags .tag-list li.tag';

  const raf = (fn) => new Promise(r => requestAnimationFrame(() => r(fn())));

  let TAG_POOL = [];
  let TAG_MAP = new Map();
  function rebuildTagPool() {
    const nodes = document.querySelectorAll(TAG_LABEL_SEL);
    const map = new Map();
    for (const label of nodes) {
      const li = label.closest('li.tag');
      if (!li) continue;
      const name = getTagText(label);
      if (!name) continue;
      let srcPriority = 3;
      if (li.closest('.map-overview')) srcPriority = 0;
      else if (li.closest('.ext-lp-tag-manager')) srcPriority = 1;
      else if (li.closest('.location-preview__tags')) srcPriority = 2;
      const { bg, fg } = getTagColor(li);
      const prev = map.get(name);
      if (!prev || srcPriority < prev.srcPriority) {
        map.set(name, { name, li, bg, fg, srcPriority });
      }
    }
    TAG_MAP = map;
    TAG_POOL = Array.from(map.values());
  }
  let moPool;
  const handlePoolMutations = () => {
    clearTimeout(moPool?._t);
    moPool._t = setTimeout(rebuildTagPool, 60);
  };
  const poolMutationHandler = window.__extCreatePanoAwareRunner ? window.__extCreatePanoAwareRunner(handlePoolMutations) : handlePoolMutations;
  moPool = new MutationObserver(poolMutationHandler);
  moPool.observe(document.documentElement, { childList: true, subtree: true });
  raf(rebuildTagPool);

  function fuzzyScore(q, s) {
    q = q.toLowerCase().trim(); s = s.toLowerCase();
    if (!q) return -Infinity; if (s === q) return 1e9; if (s.startsWith(q)) return 1e8; if (s.includes(q)) return 1e7;
    let qi = 0, score = 0, last = -1;
    for (let i = 0; i < s.length && qi < q.length; i++) {
      if (s[i] === q[qi]) { score += 100 - Math.min(i, 100); if (last >= 0) score -= (i - last - 1) * 5; last = i; qi++; }
    }
    if (qi < q.length) return -Infinity; return score - s.length;
  }
  function searchTags(query, limit = 50) {
    if (!query) return [];
    const arr = [];
    for (const item of TAG_POOL) {
      const sc = fuzzyScore(query, item.name);
      if (sc === -Infinity) continue;
      arr.push({ ...item, _sc: sc });
    }
    arr.sort((a, b) => b._sc - a._sc);
    return arr.slice(0, limit);
  }

  function ensureAnchor(input) {
    let anchor = input.closest('.ext-filter-anchor');
    if (!anchor) {
      anchor = document.createElement('div');
      anchor.className = 'ext-filter-anchor';
      anchor.style.position = 'relative';
      anchor.style.top = '-16px';
      input.parentNode.insertBefore(anchor, input);
      anchor.appendChild(input);
    }
    return anchor;
  }
  function createProxyInput(realInput, host) {
    const parent = host || realInput.parentNode;
    let proxy = parent && parent.querySelector('.ext-proxy-input');
    const placeholder = 'Search tags...';
    if (!proxy) {
      proxy = document.createElement('input');
      proxy.type = 'text';
      proxy.className = 'ext-proxy-input';
      proxy.autocomplete = 'off';
      proxy.spellcheck = false;
      proxy.style.position = 'absolute';
      proxy.style.inset = '0';
      proxy.style.zIndex = '2';
      proxy.style.background = 'transparent';
      parent.appendChild(proxy);
    }
    if (proxy.placeholder !== placeholder) {
      proxy.placeholder = placeholder;
    }
    return proxy;
  }
  function ensureDropdown(anchor) {
    let dd = anchor.querySelector(':scope > .ext-tag-dd');
    if (!dd) { dd = document.createElement('div'); dd.className = 'ext-tag-dd'; dd.setAttribute('role', 'listbox'); dd.style.display = 'none'; anchor.appendChild(dd); }
    return dd;
  }
  function __extRenderDDItems(ddListEl, items) {
    ddListEl.innerHTML = '';
    const list = ddListEl;
    const selectedTagNames = new Set();
    const selectedTagElements = document.querySelectorAll('.map-overview .tag-list li.tag.is-selected');
    for (const tagEl of selectedTagElements) {
        const name = getTagText(tagEl);
        if (name) {
            selectedTagNames.add(name);
        }
    }

    for (const it of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ext-tag-dd__item';
      btn.dataset.name = it.name;
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('class', 'ext-tag-dd__swatch');
      svg.setAttribute('viewBox', '0 0 25 24');
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', 'M 17.63 5.84 C 17.27 5.33 16.67 5 16 5 L 5 5.01 C 3.9 5.01 3 5.9 3 7 v 10 c 0 1.1 0.9 1.99 2 1.99 L 16 19 c 0.67 0 1.27 -0.33 1.63 -0.84 L 22 12 l -4.37 -6.16 Z');
      if (it.bg) path.setAttribute('fill', it.bg);
      svg.appendChild(path);
      const label = document.createElement('span');
      label.className = 'ext-tag-dd__label';
      label.textContent = it.name;
      btn.appendChild(svg);
      btn.appendChild(label);
      list.appendChild(btn);
      
      if (selectedTagNames.has(it.name)) {
          btn.style.background = 'rgba(255,255,255,0.1)';
          btn.style.outline = '2px solid white';
          btn.dataset.extToggled = '1';
      }

      btn.addEventListener('click', () => {
        const name = btn.dataset.name;
        if (!name) return;
        if (btn.dataset.extToggled === '1') {
          btn.style.background = '';
          btn.style.outline = '';
          btn.dataset.extToggled = '0';
        } else {
          btn.style.background = 'rgba(255,255,255,0.1)';
          btn.style.outline = '2px solid white';
          btn.dataset.extToggled = '1';
        }
        const best = TAG_MAP.get(name);
        const li = best?.li || Array.from(document.querySelectorAll(CLICK_TARGETS_SEL))
          .find(el => (el.querySelector('.tag__text')?.textContent || '').trim() === name);
        if (li) {
          li.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        }
      });
    }
  }
  function portalizeTagDropdown(proxy, dd) {
    if (!proxy || !dd) return;
    if (!dd.__extPortaled) { try { document.body.appendChild(dd); } catch {} dd.__extPortaled = true; dd.classList.add('ext-floating-dd'); const anchor = ensureAnchor(proxy); anchor.__extFloatingPopupDD = dd; }
    const reposition = () => {
      window.__extFloatingPopup.positionBox(proxy, dd, { minWidth: 200, maxHeight: 260, extraClass: 'ext-floating-dd' });
      const rect = proxy.getBoundingClientRect();
      dd.style.left = Math.round(rect.left - 1) + 'px';
      dd.style.top = Math.round(rect.bottom) + 'px';
    };
    reposition();
    if (dd.__extFloatingPopupCtx) { try { window.__extFloatingPopup.detachObservers(dd.__extFloatingPopupCtx); } catch {} dd.__extFloatingPopupCtx = null; }
    if (!dd.__extDocDown) {
      dd.__extDocDown = (e) => {
        const insideDD = dd.contains(e.target);
        const insideProxy = proxy && proxy.contains(e.target);
        if (!insideDD && !insideProxy) { dd.style.display = 'none'; }
      };
      document.addEventListener('mousedown', dd.__extDocDown, true);
    }
    dd.style.display = 'block';
  }
  function renderDropdown(input, items) {
    const proxy = input; const anchor = ensureAnchor(proxy);
    let dd = anchor.__extFloatingPopupDD || anchor.querySelector(':scope > .ext-tag-dd');
    if (!dd) { dd = document.createElement('div'); dd.className = 'ext-tag-dd'; dd.setAttribute('role', 'listbox'); dd.style.display = 'none'; anchor.appendChild(dd); }
    dd.innerHTML = '';
    portalizeTagDropdown(proxy, dd);
    let list = dd.querySelector(':scope > .ext-tag-dd__list');
    if (!list) { list = document.createElement('div'); list.className = 'ext-tag-dd__list'; dd.appendChild(list); }
    if (!items || !items.length) {
      const emptyBtn = document.createElement('button');
      emptyBtn.type = 'button';
      emptyBtn.className = 'ext-tag-dd__item ext-tag-dd__item--empty';
      emptyBtn.textContent = 'No tag matches';
      emptyBtn.disabled = true;
      list.appendChild(emptyBtn);
      return;
    }
    __extRenderDDItems(list, items);
    portalizeTagDropdown(proxy, dd);
    if (!dd.__extWired) { dd.__extWired = true; dd.addEventListener('click', (ev) => { const li = ev.target.closest('.ext-tag-dd__item'); if (!li) return; ev.preventDefault(); }); }
  }
  function closeDropdown(dd) { if (dd) { dd.style.display = 'none'; dd.innerHTML = ''; } }

  function install() {
    const FILTER_INPUT_SEL = `${OVERVIEW_SEL} input[placeholder*="Search tag" i], ${OVERVIEW_SEL} input[placeholder*="Filter tag" i], ${OVERVIEW_SEL} input[aria-label*="Filter" i]`;
    const realInput = document.querySelector(FILTER_INPUT_SEL);
    if (!realInput) return;
    const headerAnchor = (function () {
      try {
        const block = realInput.closest('.tool-block.tag-manager') || realInput.closest('.tag-manager.tool-block') || realInput.closest('.tool-block');
        const header = block ? block.querySelector('.tool-block__header') : null;
        if (!header) return null;
        let a = header.querySelector('.ext-filter-anchor');
        if (!a) {
          a = document.createElement('div');
          a.className = 'ext-filter-anchor';
          a.style.position = 'relative';
          a.style.top = '-16px';
          header.appendChild(a);
        }
        return a;
      } catch { return null; }
    })();
    const anchor = headerAnchor || ensureAnchor(realInput);
    const proxy = createProxyInput(realInput, headerAnchor);
    const dd = ensureDropdown(anchor);
    const onType = () => {
      const q = proxy.value.trim();
      if (!q) { closeDropdown(dd); return; }
      const matches = searchTags(q, 60);
      renderDropdown(proxy, matches);
    };
    proxy.addEventListener('input', onType);
    proxy.addEventListener('focus', onType);
    proxy.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeDropdown(dd); proxy.blur(); }
      else if (e.key === 'Enter') {
        const first = dd.querySelector('.ext-tag-dd__item');
        if (first) {
          const name = first.getAttribute('data-name');
          const best = TAG_MAP.get(name);
          const li = best?.li;
          if (li) li.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          proxy.value = '';
          closeDropdown(dd);
          e.preventDefault();
        }
      }
    });
    if (!dd.__extLegacyCloseWired) { dd.__extLegacyCloseWired = true; }
  }
  install();
  const handleFilterBoot = () => {
    const FILTER_INPUT_SEL = `${OVERVIEW_SEL} input[placeholder*="Search tag" i], ${OVERVIEW_SEL} input[placeholder*=\"Filter tag\" i], ${OVERVIEW_SEL} input[aria-label*=\"Filter\" i]`;
    if (!document.querySelector('.ext-proxy-input') && document.querySelector(FILTER_INPUT_SEL)) { install(); }
  };
  const filterBootHandler = window.__extCreatePanoAwareRunner ? window.__extCreatePanoAwareRunner(handleFilterBoot) : handleFilterBoot;
  const moBoot = new MutationObserver(filterBootHandler);
  moBoot.observe(document.documentElement, { childList: true, subtree: true });
})();

/* ==== EXT: Commands popup as floating dropdown (seamless proxy) ==== */
(() => {
  if (window.__extCmdkDDInstalled) return; window.__extCmdkDDInstalled = true;
  const CMD_BTN_FINDER = () => {
    const candidates = Array.from(document.querySelectorAll('.map-overview .tool-block > header .button'));
    const byText = candidates.find(b => /\bcommands\b/i.test((b.textContent || '').trim()));
    return byText || candidates[0] || null;
  };
  function waitFor(elSelector, {timeout = 2000} = {}) {
    return new Promise((resolve, reject) => {
      const found = typeof elSelector === 'function' ? elSelector() : document.querySelector(elSelector);
      if (found) return resolve(found);
      let obs;
      const handleSearch = () => {
        const el = typeof elSelector === 'function' ? elSelector() : document.querySelector(elSelector);
        if (el) { try { obs?.disconnect(); } catch {}; resolve(el); }
      };
      const panoAwareSearch = window.__extCreatePanoAwareRunner ? window.__extCreatePanoAwareRunner(handleSearch) : handleSearch;
      obs = new MutationObserver(panoAwareSearch);
      obs.observe(document.documentElement, {childList: true, subtree: true});
      setTimeout(() => { try { obs?.disconnect(); } catch {}; reject(new Error('timeout')); }, timeout);
    });
  }
  let ctx = null;
  function detachGlobalClosers() { if (!ctx) return; if (ctx.onDocDown) document.removeEventListener('mousedown', ctx.onDocDown, true); if (ctx.onEsc) document.removeEventListener('keydown', ctx.onEsc, true); ctx.onDocDown = null; ctx.onEsc = null; }
  function positionAsDropdown(btnEl, modalEl) {
    const rect = btnEl && btnEl.getBoundingClientRect ? btnEl.getBoundingClientRect() : null;
    window.__extFloatingPopup.positionBox(btnEl, modalEl, { extraClass: 'ext-command-dd' });
    requestAnimationFrame(() => {
      const cs = getComputedStyle(modalEl);
      let left = parseFloat(modalEl.style.left || cs.left) || 0; let top  = parseFloat(modalEl.style.top  || cs.top)  || 0;
      const vh = window.innerHeight; const w  = modalEl.offsetWidth  || 560; const h  = modalEl.offsetHeight || 400;
      left = left - w - rect?.width - 28; top  = Math.max(8, Math.min(top,  vh - h - 8));
      modalEl.style.left = `${left}px`; modalEl.style.top  = `${top}px`; modalEl.style.transform = 'none';
      modalEl.style.width = '';
      modalEl.style.maxWidth = '';
    });
  }
  function attachReposition(btnEl, modalEl) {
    if (!window.__extFloatingPopup || !window.__extFloatingPopup.attachObservers) return null;
    const handle = window.__extFloatingPopup.attachObservers({ anchorEl: btnEl, boxEl: modalEl, onReposition() { positionAsDropdown(btnEl, modalEl); } });
    return handle;
  }
  function detachReposition(handle) { try { if (handle && window.__extFloatingPopup.detachObservers) { window.__extFloatingPopup.detachObservers(handle); } else if (handle && typeof handle.disconnect === 'function') { handle.disconnect(); } } catch {} }
  function openCommandsAsDropdown(btnEl, modalEl) {
    if (ctx && ctx.modalEl && ctx.modalEl !== modalEl) { cleanup(); }
    ctx = ctx || {};
    const backdrop = modalEl.previousElementSibling && modalEl.previousElementSibling.classList?.contains('modal__backdrop') ? modalEl.previousElementSibling : document.querySelector('.modal__backdrop');
    if (backdrop) { ctx.prevBackdropDisplay = backdrop.style.display; backdrop.style.display = 'none'; ctx.backdrop = backdrop; }
    modalEl.classList.add('ext-command-dd');
    positionAsDropdown(btnEl, modalEl);
    const input = modalEl.querySelector('.command-palette__input'); if (input) { try { input.focus({preventScroll: true}); } catch {} }
    ctx.repositionHandle = attachReposition(btnEl, modalEl);
    ctx.modalEl = modalEl; ctx.btnEl = btnEl;
  }
  function cleanup() {
    if (!ctx) return;
    detachGlobalClosers();
    detachReposition(ctx.repositionHandle);
    if (ctx.modalEl) { try { ctx.modalEl.classList.remove('ext-command-dd'); } catch {} }
    if (ctx.backdrop) { try { ctx.backdrop.style.display = ctx.prevBackdropDisplay || ''; } catch {} }
    ctx = null;
  }
  const handleCommandUnmount = () => { if (ctx && !document.contains(ctx.modalEl)) { cleanup(); } };
  const commandUnmountHandler = window.__extCreatePanoAwareRunner ? window.__extCreatePanoAwareRunner(handleCommandUnmount) : handleCommandUnmount;
  const unmountObserver = new MutationObserver(commandUnmountHandler);
  unmountObserver.observe(document.documentElement, {childList: true, subtree: true});
  async function handleTriggerClick(ev) { setTimeout(async () => {
    const modal = await waitFor('div[role="dialog"].modal.command-palette', {timeout: 1500}).catch(() => null);
    if (!modal) return; const btn = CMD_BTN_FINDER(); if (!btn) return; openCommandsAsDropdown(btn, modal);
  }, 0); }
  function ensureWired() { const btn = CMD_BTN_FINDER(); if (!btn) return; if (btn.__extCmdkWired) return; btn.__extCmdkWired = true; btn.addEventListener('click', handleTriggerClick, true); }
  function watchForDialogOpen() {
    const handleDialogChanges = () => {
      const modal = document.querySelector('div[role="dialog"].modal.command-palette[data-state="open"]');
      if (modal && (!ctx || ctx.modalEl !== modal)) { const btn = CMD_BTN_FINDER(); if (btn) openCommandsAsDropdown(btn, modal); }
    };
    const dialogMutationHandler = window.__extCreatePanoAwareRunner ? window.__extCreatePanoAwareRunner(handleDialogChanges) : handleDialogChanges;
    const obs = new MutationObserver(dialogMutationHandler);
    obs.observe(document.documentElement, {childList: true, subtree: true});
  }
  ensureWired(); watchForDialogOpen();
  const overviewHandleRaw = () => ensureWired();
  const overviewHandle = window.__extCreatePanoAwareRunner ? window.__extCreatePanoAwareRunner(overviewHandleRaw) : overviewHandleRaw;
  const overviewObserver = new MutationObserver(overviewHandle);
  overviewObserver.observe(document.documentElement, {childList: true, subtree: true});
})();

// MARK: BAT
/* ==== EXT: Bulk-add Tags — queue persistence across overview re-renders ==== */
(() => {
  if (window.__extBulkAddReplacerInstalledV7) return;
  window.__extBulkAddReplacerInstalledV7 = true;

  const OVERVIEW_SEL = '.map-overview';

  const raf = (fn) => new Promise(r => requestAnimationFrame(() => r(fn())));
  function waitFor(selector, { root = document, timeout = 20000, poll = 150 } = {}) {
    const start = performance.now();
    return new Promise((resolve, reject) => {
      (function tick() {
        const el = typeof selector === 'function' ? selector() : root.querySelector(selector);
        if (el) return resolve(el);
        if (performance.now() - start > timeout) return reject(new Error('timeout:' + (selector?.toString?.() || selector)));
        setTimeout(tick, poll);
      })();
    });
  }
  function setReactInputValue(input, value) {
    const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    const setter = desc && desc.set;
    setter ? setter.call(input, value) : (input.value = value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const esc = (s) => (s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cssEscape = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));
  const isExcludedTag = (name) => (name || '').trim().toLowerCase() === 'untagged';

  const TAG_LABEL_SEL = [
    '.map-overview .tag-list .tag .tag__text',
    '.location-preview__tags .tag-list .tag .tag__text',
    '.ext-lp-tag-manager .tag-list .tag .tag__text',
    '.tag-list .tag .tag__text'
  ].join(', ');
  let TAG_POOL = [];
  function rebuildTagPool() {
    const nodes = document.querySelectorAll(TAG_LABEL_SEL);
    const map = new Map();
    for (const label of nodes) {
      const li = label.closest('li.tag'); if (!li) continue;
      const name = getTagText(label); if (!name) continue;
      if (isExcludedTag(name)) continue;
      let src = 3;
      if (li.closest('.map-overview')) src = 0;
      else if (li.closest('.ext-lp-tag-manager')) src = 1;
      else if (li.closest('.location-preview__tags')) src = 2;
      const { bg, fg } = getTagColor(li);
      const prev = map.get(name);
      if (!prev || src < prev.src) map.set(name, { name, bg, fg, src });
    }
    TAG_POOL = [...map.values()];
  }
  function fuzzyScore(q, s) {
    q = (q||'').toLowerCase().trim(); s = (s||'').toLowerCase();
    if (!q) return -Infinity;
    if (s === q) return 1e9;
    if (s.startsWith(q)) return 1e8;
    if (s.includes(q)) return 1e7;
    let qi = 0, score = 0, last = -1;
    for (let i = 0; i < s.length && qi < q.length; i++) {
      if (s[i] === q[qi]) { score += 100 - Math.min(i, 100); if (last >= 0) score -= (i - last - 1) * 5; last = i; qi++; }
    }
    if (qi < q.length) return -Infinity;
    return score - s.length;
  }
  function searchTags(query, limit = 60) {
    const arr = [];
    for (const item of TAG_POOL) {
      const sc = fuzzyScore(query, item.name);
      if (sc === -Infinity) continue;
      arr.push({ ...item, _sc: sc });
    }
    arr.sort((a,b) => b._sc - a._sc);
    return arr.slice(0, limit);
  }

  function ensureDropdown(container) {
    let dd = container.querySelector(':scope > .ext-tag-dd');
    if (!dd) {
      dd = document.createElement('div');
      dd.className = 'ext-tag-dd';
      dd.style.display = 'none';
      container.appendChild(dd);
    }
    return dd;
  }

  function ensureQueue(content, applyHandler) {
    if (!content) return null;

    let queue = content.querySelector(':scope > .ext-bulkadd-queue');
    if (!queue) {
      queue = document.createElement('div');
      queue.className = 'ext-bulkadd-queue';
      content.appendChild(queue);

      const header = document.createElement('div');
      header.className = 'ext-bulkadd-header';
      queue.appendChild(header);

      const inputSlot = document.createElement('div');
      inputSlot.className = 'ext-bulkadd-inputslot';
      header.appendChild(inputSlot);

      const actions = document.createElement('div');
      actions.className = 'ext-bulkadd-actions';
      const applyBtn = document.createElement('button');
      applyBtn.type = 'button';
      applyBtn.className = 'ext-bulkadd-apply';
      applyBtn.textContent = 'Apply all';
      applyBtn.disabled = true;
      actions.appendChild(applyBtn);
      header.appendChild(actions);

      const list = document.createElement('div');
      list.className = 'ext-bulkadd-list';
      queue.appendChild(list);

      queue._header = header;
      queue._inputSlot = inputSlot;
      queue._actions = actions;
      queue._list = list;
      queue._apply = applyBtn;

      applyBtn.addEventListener('click', () => applyHandler?.());
    }
    return queue;
  }
  function hasQueueItem(queue, tagName) {
    return !!queue._list.querySelector(`.ext-bulkadd-item[data-tag="${cssEscape(tagName)}"]`);
  }
    function pushQueueItem(queue, tagName) {
    if (hasQueueItem(queue, tagName)) {
        queue._updateApply?.();
        return;
    }
    const item = document.createElement('div');
    item.className = 'ext-bulkadd-item';
    item.dataset.tag = tagName;
    item.innerHTML = `
        <button type="button" class="ext-bulkadd-item__close" aria-label="Remove &quot;${esc(tagName)}&quot;">×</button>
        <span class="ext-bulkadd-item__label">${esc(tagName)}</span>
    `;
    queue._list.appendChild(item);
    queue._updateApply?.();

    item.querySelector('.ext-bulkadd-item__close').addEventListener('click', () => {
        removeQueueItem(queue, tagName);
    });
    }
    function removeQueueItem(queue, tagName) {
    queue._list
        .querySelectorAll(`.ext-bulkadd-item[data-tag="${cssEscape(tagName)}"]`)
        .forEach(el => el.remove());
    setDDSelectionState(queue, tagName, false);
    queue._updateApply?.();
    }
  function collectQueuedTags(queue, { dedupe = true } = {}) {
    const names = [];
    const seen = new Set();
    for (const el of queue._list.querySelectorAll('.ext-bulkadd-item')) {
      const name = el.dataset.tag || '';
      if (!name) continue;
      if (!dedupe || !seen.has(name)) { names.push(name); seen.add(name); }
    }
    return names;
  }
function clearQueue(queue) {
  queue._list.innerHTML = '';
  queue._updateApply?.();
}

  const DD_SELECTED = new Set();
  function setDDSelectionState(queue, tagName, isOn) {
    if (isOn) DD_SELECTED.add(tagName); else DD_SELECTED.delete(tagName);
    const root = (queue && queue._dd) ? queue._dd : document;
    root.querySelectorAll(`.ext-tag-dd__item[data-name="${cssEscape(tagName)}"]`).forEach((btn) => {
      btn.dataset.extToggled = isOn ? '1' : '0';
      btn.style.background = isOn ? 'rgba(255,255,255,0.1)' : '';
      btn.style.outline = isOn ? '2px solid white' : '';
    });
  }
  function clearDDSelections(queue) {
    if (!queue) return;
    DD_SELECTED.forEach((name) => setDDSelectionState(queue, name, false));
    DD_SELECTED.clear();
  }

  async function installOnce() {
    const block = await waitFor(() => document.querySelector(`${OVERVIEW_SEL} .tool-block.selection-manager, ${OVERVIEW_SEL} .selection-manager.tool-block`)).catch(() => null);
    if (!block) return;
    const content = block.querySelector('.tool-block__content');
    const form = content && Array.from(content.querySelectorAll('form')).find(f =>
      f.querySelector('input.tag-input__value[placeholder*="Bulk-add" i]') || f.querySelector('input[placeholder*="Bulk-add a tag" i]')
    );
    if (!form) return;

    const realInput = form.querySelector('input.tag-input__value') || form.querySelector('input[type="text"]');
    const realSpan  = form.querySelector('.tag-input');
    if (!realInput || !realSpan) return;

    if (form.__extBulkAddProxyReadyV7) return;
    form.__extBulkAddProxyReadyV7 = true;

    realSpan.style.display = 'none';

    let queue = ensureQueue(content, applyAllQueued);

    const proxy = document.createElement('input');
    proxy.type = 'text';
    proxy.className = 'ext-proxy-input ext-proxy-bulkadd';
    proxy.placeholder = 'Bulk-add tags';
    proxy.autocomplete = 'off';
    proxy.spellcheck = false;
    proxy.setAttribute('aria-label', 'Bulk-add tags');
    proxy.style.height = '32px';
    proxy.style.minWidth = '220px';
    proxy.style.flex = '1 1 auto';
    queue._inputSlot.appendChild(proxy);

    const dd = ensureDropdown(queue._inputSlot);
    queue._dd = dd;

    queue._updateApply = () => {
    if (!queue?._apply) return;
    queue._apply.disabled = !!proxy.disabled || queue._list.children.length === 0;
    };
    queue._updateApply();

    const syncDisabled = () => {
    proxy.disabled = !!realInput.disabled;
    proxy.style.opacity = proxy.disabled ? '50%': '100%';
    proxy.placeholder = 'Bulk-add tags...';
    queue._updateApply?.();
    };
    syncDisabled();
    new MutationObserver(syncDisabled).observe(realInput, { attributes: true, attributeFilter: ['disabled'] });

    let bulkMoPool;
    const handleBulkPool = () => {
      clearTimeout(bulkMoPool?._t);
      bulkMoPool._t = setTimeout(rebuildTagPool, 60);
    };
    const bulkPoolHandler = window.__extCreatePanoAwareRunner ? window.__extCreatePanoAwareRunner(handleBulkPool) : handleBulkPool;
    bulkMoPool = new MutationObserver(bulkPoolHandler);
    bulkMoPool.observe(document.documentElement, { childList: true, subtree: true });
    await raf(rebuildTagPool);

    function renderDropdownList(items, query) {
      dd.style.display = '';
      dd.setAttribute('role', 'listbox');

      let list = dd.querySelector(':scope > .ext-tag-dd__list');
      if (!list) {
        list = document.createElement('div');
        list.className = 'ext-tag-dd__list';
        dd.appendChild(list);
      }
      list.innerHTML = '';

      const trimmedQuery = (query || '').trim();
      if (!items || items.length === 0) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ext-tag-dd__item ext-tag-dd__item--new';
        btn.dataset.extNew = '1';
        btn.dataset.name = trimmedQuery;
        btn.textContent = '+ New tag';
        btn.disabled = !trimmedQuery;
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          addNewTag(trimmedQuery);
        });
        list.appendChild(btn);
        return;
      }

      const svgNS = 'http://www.w3.org/2000/svg';
      for (const it of items) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ext-tag-dd__item';
        btn.dataset.name = it.name;

        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('class', 'ext-tag-dd__swatch');
        svg.setAttribute('viewBox', '0 0 25 24');
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d','M 17.63 5.84 C 17.27 5.33 16.67 5 16 5 L 5 5.01 C 3.9 5.01 3 5.9 3 7 v 10 c 0 1.1 0.9 1.99 2 1.99 L 16 19 c 0.67 0 1.27 -0.33 1.63 -0.84 L 22 12 l -4.37 -6.16 Z');
        if (it.bg) path.setAttribute('fill', it.bg);
        svg.appendChild(path);

        const label = document.createElement('span');
        label.className = 'ext-tag-dd__label';
        label.textContent = it.name;

        btn.appendChild(svg);
        btn.appendChild(label);

        if (DD_SELECTED.has(it.name)) {
          btn.dataset.extToggled = '1';
          btn.style.background = 'rgba(255,255,255,0.1)';
          btn.style.outline = '2px solid white';
        }

        list.appendChild(btn);

        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          const name = btn.dataset.name;
          if (!name || proxy.disabled) return;
          const nowOn = btn.dataset.extToggled !== '1';
          if (nowOn) {
            btn.dataset.extToggled = '1';
            btn.style.background = 'rgba(255,255,255,0.1)';
            btn.style.outline = '2px solid white';
            setDDSelectionState(queue, name, true);
            pushQueueItem(queue, name);
          } else {
            btn.dataset.extToggled = '0';
            btn.style.background = '';
            btn.style.outline = '';
            setDDSelectionState(queue, name, false);
            removeQueueItem(queue, name);
          }
          queue._apply.disabled = queue._list.children.length === 0 || proxy.disabled;
        }, { capture: true });
      }
    }

    function addNewTag(tagName) {
      const name = (tagName || '').trim();
      if (!name || proxy.disabled) return;
      pushQueueItem(queue, name);
      proxy.value = '';
      dd.style.display = 'none';
      dd.innerHTML = '';
      queue._updateApply?.();
      proxy.focus();
    }

    function openForQuery() {
      const q = proxy.value.trim();
      if (!q) { dd.style.display = 'none'; dd.innerHTML = ''; return; }
      const matches = searchTags(q, 60).filter(it => !isExcludedTag(it.name));
      renderDropdownList(matches, q);
      try { document.body.appendChild(dd); } catch {}
      dd.classList.add('ext-floating-dd');
      window.__extFloatingPopup.positionBox(proxy, dd, { minWidth: 200, maxHeight: 260, extraClass: 'ext-floating-dd' });
      try {
        const rect = proxy.getBoundingClientRect();
        dd.style.left = Math.round(rect.left) + 'px';
        dd.style.top = Math.round(rect.bottom) + 'px';
      } catch {}
      if (!dd.__extDocDown) {
        dd.__extDocDown = (e) => {
          const insideDD = dd.contains(e.target);
          const insideProxy = proxy.contains(e.target);
          if (!insideDD && !insideProxy) dd.style.display = 'none';
        };
        document.addEventListener('mousedown', dd.__extDocDown, true);
      }
      dd.style.display = 'block';
    }

    async function submitOne(tagName) {
      setReactInputValue(realInput, tagName);
      try {
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      } catch {
        const plus = form.querySelector('button[type="submit"]');
        if (plus && !plus.disabled) plus.click();
      }
      await new Promise(r => requestAnimationFrame(() => r()));
    }

    async function applyAllQueued() {
      if (!queue) return;
      const names = collectQueuedTags(queue, { dedupe: true });
      if (names.length === 0 || proxy.disabled) return;
      queue._apply.disabled = true;

      for (const name of names) { await submitOne(name); }
      clearQueue(queue);
      queue._updateApply?.();
      clearDDSelections(queue);
    }

    proxy.addEventListener('input', () => { if (!proxy.disabled) openForQuery(); });
    proxy.addEventListener('focus', () => { if (!proxy.disabled) openForQuery(); });
    proxy.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { dd.style.display = 'none'; proxy.blur(); }
      else if (e.key === 'Enter') {
        if (proxy.disabled) return;
        const trimmed = proxy.value.trim();
        const newOption = dd.querySelector('.ext-tag-dd__item[data-ext-new="1"]');
        if (newOption) {
          if (!trimmed) return;
          e.preventDefault();
          addNewTag(trimmed);
          return;
        }

        const first = dd.querySelector('.ext-tag-dd__item');
        if (!first) return;
        const name = first.getAttribute('data-name');
        if (!name) return;

        e.preventDefault();
        const nowOn = first.dataset.extToggled !== '1';
        if (nowOn) {
          first.dataset.extToggled = '1';
          first.style.background = 'rgba(255,255,255,0.1)';
          first.style.outline = '2px solid white';
          setDDSelectionState(queue, name, true);
          pushQueueItem(queue, name);
        } else {
          first.dataset.extToggled = '0';
          first.style.background = '';
          first.style.outline = '';
          setDDSelectionState(queue, name, false);
          removeQueueItem(queue, name);
        }
        queue._apply.disabled = queue._list.children.length === 0 || proxy.disabled;
      }
    });

    const queueRef = queue;
    const moQueueRemoval = new MutationObserver(() => {
      if (!document.body.contains(queueRef)) {
        clearDDSelections({ _dd: document.querySelector('.ext-tag-dd') || null });
        moQueueRemoval.disconnect();
      }
    });
    moQueueRemoval.observe(content, { childList: true });
  }

  const boot = throttle(() => installOnce().catch(() => {}), 250);
  const hostRoot = document.querySelector('.page-map-editor') || document.body;

  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      const t = m.target;
      if (t.closest && (t.closest('.map-overview') || t.closest('.location-preview'))) {
        boot();
        break;
      }
    }
  });
  mo.observe(hostRoot, { childList: true, subtree: true });
})();

// MARK: OEP
// Open Editor Popup
function OpenEditorPopup(shape, el, position) {
  (async () => {
    try {
      const initialName = (shape && shape.name) || 'Polygon';
      const initialHex  = (() => {
        try {
          if (el) {
            const cs = getComputedStyle(el, '::after');
            const bg = cs && (cs.getPropertyValue('background-color') || cs.backgroundColor);
            if (window.__extCssColorToHex) {
              const parsed = __extCssColorToHex(bg);
              if (parsed) return parsed;
            }
          }
        } catch {}
        const fallback = shape?.style?.fillColor;
        const normalized = window.__extCssColorToHex ? __extCssColorToHex(fallback) : null;
        return normalized || (window.__extNormalizeHex ? __extNormalizeHex(fallback) : null) || '#008cff';
      })();

      const { name: newName, hex: newHexColor } = await __extColorPicker.openEditor({
        anchor: position,
        initial: { name: initialName, hex: initialHex }
      });

      const rgbObject = __extHexToRgb(newHexColor);
      const newRgbArray = rgbObject ? [rgbObject.r, rgbObject.g, rgbObject.b] : [0, 0, 0];
      const newTextColor = (() => {
        if (typeof __extGetContrastTextColor === 'function') {
          return __extGetContrastTextColor(newRgbArray);
        }
        if (typeof window.__extGetContrastTextColor === 'function') {
          return window.__extGetContrastTextColor(newHexColor);
        }
        return '';
      })();

      shape.name = newName;
      shape.style = shape.style || {};
      shape.style.fillColor = newHexColor;
      shape.color = newRgbArray;

      try { if (el && el.querySelector('.shape__text')) el.querySelector('.shape__text').textContent = newName; } catch {}
      if (el) {
        try { el.style.setProperty('--shape-bg', newHexColor); } catch {}
        try {
          if (newTextColor) el.style.color = newTextColor;
        } catch {}
      }

      try {
        const shapes = await loadShapes();
        await saveShapes(shapes.map(s => s.id === shape.id ? shape : s));
      } catch (e) { console.error('Failed to save shape changes:', e); }

      try {
        const norm = (h) => (window.__extNormalizeHex ? __extNormalizeHex(h) : h);
        const nameChanged  = (newName || '') !== (initialName || '');
        const colorChanged = (norm(newHexColor) || '') !== (norm(initialHex) || '');
        if (nameChanged || colorChanged) {
          const key = await (async () => {
            if (shape.__selectionKey) return shape.__selectionKey;
            return new Promise((resolve) => {
              const id = `sync_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
              const to = setTimeout(() => { try { window.removeEventListener('message', handler, false); } catch {}; resolve(null); }, 1500);
              function handler(e) {
                const d = e?.data; if (!d || d.source !== 'EXT_SHAPES' || d.id !== id) return;
                try { window.removeEventListener('message', handler, false); } catch {}
                clearTimeout(to);
                if (d.type === 'EXT_CURRENT_SHAPE_SELECTIONS_RESPONSE' && Array.isArray(d.selections)) {
                  const hit = d.selections.find(s => s.extId === shape.id);
                  resolve(hit?.key || null);
                } else { resolve(null); }
              }
              window.addEventListener('message', handler, false);
              window.postMessage({ type: 'EXT_GET_CURRENT_SHAPE_SELECTIONS', id }, '*');
            });
          })();

          if (key) {
            if (nameChanged) {
              await new Promise((resolve) => {
                const id = `n${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
                function handler(e) {
                  const d = e?.data; if (!d || d.source !== 'EXT_SHAPES' || d.id !== id) return;
                  try { window.removeEventListener('message', handler, false); } catch {}
                  resolve(true);
                }
                window.addEventListener('message', handler, false);
                window.postMessage({ type: 'EXT_SET_SELECTION_NAME', id, key, name: newName }, '*');
              });
            }
            if (colorChanged) {
              await new Promise((resolve) => {
                const id = `c${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
                function handler(e) {
                  const d = e?.data; if (!d || d.source !== 'EXT_SHAPES' || d.id !== id) return;
                  try { window.removeEventListener('message', handler, false); } catch {}
                  resolve(true);
                }
                window.addEventListener('message', handler, false);
                window.postMessage({ type: 'EXT_SET_SELECTION_COLOR', id, key, color: newRgbArray }, '*');
              });
            }
          }
        }
      } catch {}
    } catch {}
  })();
}
;

// MARK: TEB
// Tag Editor Bridge

(function tagEditorBridge() {
  if (window.__extTagEditorBridgeInstalled_v3) return;
  window.__extTagEditorBridgeInstalled_v3 = true;

  function wait(ms) { return new Promise(res => setTimeout(res, ms)); }

  async function waitFor(selectorOrFn, { timeout = 2000, interval = 50 } = {}) {
    const isFn = typeof selectorOrFn === 'function';
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = isFn ? selectorOrFn() : document.querySelector(selectorOrFn);
      if (el) return el;
      await wait(interval);
    }
    return null;
  }
  
  function setReactInputValue(input, value) {
    try {
      const lastValue = input.value;
      input.value = value;
      const tracker = input._valueTracker || input._wrapperState;
      if (tracker) tracker.setValue ? tracker.setValue(lastValue) : (tracker.value = lastValue);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch {
      try {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {}
    }
  }

  function isValidHex(s) { return !!(s && /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(s.trim())); }

  const SUPPRESS_CLASS = 'ext-suppress-tag-modal';
  const STYLE_ID = 'ext-modal-suppress-style';

  function beginHideNativeModalAndBackdrop() {
    if (!document.getElementById(STYLE_ID)) {
      const css = `
        html.${SUPPRESS_CLASS} [role="dialog"],
        html.${SUPPRESS_CLASS} [data-radix-portal] [data-state="open"] {
          opacity: 0 !important; pointer-events: none !important;
          transform: translate3d(-9999px, -9999px, 0) !important;
          transition: none !important; visibility: hidden !important;
        }
        html.${SUPPRESS_CLASS} .modal__backdrop,
        html.${SUPPRESS_CLASS} [class*="backdrop" i] {
          opacity: 0 !important; pointer-events: none !important;
          transition: none !important; visibility: hidden !important;
        }
        html.${SUPPRESS_CLASS} .tag__button--edit {
          display: none !important;
        }
      `.replace(/\s+/g, ' ');
      const st = document.createElement('style');
      st.id = STYLE_ID;
      st.textContent = css;
      document.head.appendChild(st);
    }
    document.documentElement.classList.add(SUPPRESS_CLASS);
  }

  function endHideNativeModalAndBackdrop() {
    document.documentElement.classList.remove(SUPPRESS_CLASS);
  }

  async function waitForModalClose({ timeout = 4000 } = {}) {
    return waitFor(() => !document.querySelector('form.edit-tag-modal'), { timeout });
  }

  async function clickHiddenNativeEditButton(tagEl) {
    const btn = tagEl.querySelector('.tag__button--edit, button[aria-label*="edit tag" i], button[title*="edit tag" i]');
    if (!btn) return false;
    try {
      btn.click();
      await wait(10);
      return true;
    } catch {
      return false;
    }
  }

  async function ensureNativeTagModalOpenFor(tagEl) {
    const formSel = 'form.edit-tag-modal';
    if (document.querySelector(formSel)) return document.querySelector(formSel);

    beginHideNativeModalAndBackdrop();

    try {
      if (await clickHiddenNativeEditButton(tagEl)) {
        const form = await waitFor(formSel, { timeout: 1200 });
        if (form) return form;
      }
    } catch {}

    try {
      (tagEl.querySelector('.tag__text') || tagEl).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      const form = await waitFor(formSel, { timeout: 800 });
      if (form) return form;
    } catch {}

    const editCandidate = tagEl.querySelector('button[aria-label*="edit" i], button[title*="edit" i], .icon-button');
    if (editCandidate) {
      try {
        editCandidate.click();
        const form = await waitFor(formSel, { timeout: 800 });
        if (form) return form;
      } catch {}
    }
    return null;
  }

  async function saveViaNativeTagModal(tagEl, { name, hex }) {
    if (!isValidHex(hex)) throw new Error('Invalid hex color');

    try {
      const form = await ensureNativeTagModalOpenFor(tagEl);
      if (!form) throw new Error('Could not open the native Edit tag modal automatically.');

      const nameInput = form.querySelector('.edit-tag-modal__name input[type="text"], .edit-tag-modal__name .input');
      if (nameInput) setReactInputValue(nameInput, name ?? '');

      const hexInput = form.querySelector('.edit-tag-modal__color .hex-color, .hex-color');
      if (hexInput) setReactInputValue(hexInput, hex);

      const saveBtn = form.querySelector('[data-qa="tag-save"], form.edit-tag-modal button[type="submit"]');
      if (!saveBtn) throw new Error('Native Save button not found.');
      saveBtn.click();

      await waitForModalClose({ timeout: 5000 });
    } finally {
      endHideNativeModalAndBackdrop();
    }
    return true;
  }

  document.addEventListener('contextmenu', (e) => {
    const tag = e.target?.closest?.('.tag-list > .tag');
    if (tag) {
      window.__extLastTagForEdit = tag;
      window.__extLastTagClickPoint = { x: e.clientX, y: e.clientY };
    }
  }, true);

  const handleMenuMutations = (muts) => {
    for (const m of muts) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const menu = node.querySelector?.('.context-menu, [role="menu"]') || node;
        if (!menu) continue;
        if (menu.closest && menu.closest('.ext-shapes-menu-wrapper')) continue;
        if (!window.__extLastTagForEdit) continue;

        const items = Array.from(menu.querySelectorAll('.context-menu__item, [role="menuitem"]'));
        if (!items.length) continue;

        const editItem = items.find(n => (n.textContent || '').trim() === 'Edit');
        if (!editItem || editItem.__extTagEditPatched) continue;
        editItem.__extTagEditPatched = true;

        editItem.addEventListener('click', async (e) => {
          try { e.preventDefault(); e.stopPropagation(); } catch {}
          const tagEl = window.__extLastTagForEdit || document.querySelector('.tag.is-context-target') || null;
          if (!tagEl) return;

          const menuEl = menu.closest?.('[data-radix-menu], [data-radix-popper-content], [role="menu"]') || menu;
          const r = menuEl?.getBoundingClientRect?.();
          const clickPoint = window.__extLastTagClickPoint || null;

          let pos;
          if (r && clickPoint) {
            const anchorH = Math.abs(clickPoint.x - r.left) < Math.abs(clickPoint.x - r.right) ? 'left' : 'right';
            const anchorV = Math.abs(clickPoint.y - r.top) < Math.abs(clickPoint.y - r.bottom) ? 'top' : 'bottom';
            pos = { x: clickPoint.x, y: clickPoint.y, anchorH, anchorV };
          } else {
            const rect = r || { left: 0, top: 0 };
            pos = { x: Math.round(rect.left), y: Math.round(rect.top), anchorH: 'left', anchorV: 'top' };
          }
          
          const initialName = getTagText(tagEl);
          const initialHex = getTagColor(tagEl);
          
          try {
            const { name, hex } = await window.__extColorPicker.openEditor({ anchor: pos, initial: { name: initialName, hex: initialHex } });
            try {
              await saveViaNativeTagModal(tagEl, { name, hex });
            } catch (err) {
              console.error('Tag save failed:', err);
              return;
            }
            try {
              const label = tagEl.querySelector('.tag__text');
              if (label) {
                label.childNodes.forEach(n => { if (n.nodeType === Node.TEXT_NODE && n.textContent.trim() !== '') n.nodeValue = name; });
              }
              tagEl.style.backgroundColor = hex;
              try {
                const rgb = (typeof __extHexToRgb === 'function') ? __extHexToRgb(hex) : null;
                const rgbArray = rgb ? [rgb.r, rgb.g, rgb.b] : null;
                const resolver = (value) => {
                  if (typeof __extGetContrastTextColor === 'function') return __extGetContrastTextColor(value);
                  if (typeof window.__extGetContrastTextColor === 'function') return window.__extGetContrastTextColor(value);
                  return null;
                };
                const nextColor = resolver(rgbArray || hex);
                if (nextColor) tagEl.style.color = nextColor;
              } catch {}
            } catch {}
          } catch (err) {
          }
        });
      }
    }
  };
  const menuMutationHandler = window.__extCreatePanoAwareRunner ? window.__extCreatePanoAwareRunner(handleMenuMutations) : handleMenuMutations;
  const menuObserver = new MutationObserver(menuMutationHandler);
  menuObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });
})();
