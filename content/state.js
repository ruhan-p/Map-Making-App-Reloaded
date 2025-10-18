(() => {
  'use strict';

  const state = {
    isDraggingTag: false,
    isLayoutEditing: false,
    hasCustomLayoutDefaults: false
  };

  function getState(key) { return state[key]; }
  function setState(key, value) {
    const prev = state[key];
    if (prev === value) return;
    state[key] = value;
    try {
      window.dispatchEvent(new CustomEvent('ext-state-change', { detail: { key, value, prev } }));
    } catch {}
  }

  window.extState = { getState, setState };

  const tryBindCustomDefaults = () => {
    try {
      if (typeof window.getCustomLayoutDefaults === 'function') {
        Promise.resolve(window.getCustomLayoutDefaults()).then(v => setState('hasCustomLayoutDefaults', !!v));
      }
      if (typeof window.setCustomLayoutDefaults === 'function' && !window.setCustomLayoutDefaults.__extPatched) {
        const orig = window.setCustomLayoutDefaults;
        window.setCustomLayoutDefaults = async (...args) => {
          const res = await orig.apply(window, args);
          setState('hasCustomLayoutDefaults', true);
          return res;
        };
        window.setCustomLayoutDefaults.__extPatched = true;
      }
      if (typeof window.clearCustomLayoutDefaults === 'function' && !window.clearCustomLayoutDefaults.__extPatched) {
        const orig = window.clearCustomLayoutDefaults;
        window.clearCustomLayoutDefaults = async (...args) => {
          const res = await orig.apply(window, args);
          setState('hasCustomLayoutDefaults', false);
          return res;
        };
        window.clearCustomLayoutDefaults.__extPatched = true;
      }
    } catch {}
  };

  tryBindCustomDefaults();
  window.addEventListener('DOMContentLoaded', tryBindCustomDefaults, { once: true });

  if (!('DRAG_MODE' in window)) {
    Object.defineProperty(window, 'DRAG_MODE', {
      get() { return state.isLayoutEditing; },
      set(v) { setState('isLayoutEditing', !!v); },
      configurable: true
    });
  }

  if (!('IS_DRAGGING_TAG' in window)) {
    Object.defineProperty(window, 'IS_DRAGGING_TAG', {
      get() { return state.isDraggingTag; },
      set(v) { setState('isDraggingTag', !!v); },
      configurable: true
    });
  }
})();