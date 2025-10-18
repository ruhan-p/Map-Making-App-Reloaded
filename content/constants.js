(() => {
  try {
    window.EXT_CONSTANTS = {
      // TODO: Expand this file out with more of the query selectors etc.
      // Selectors & layout constants
      SELECTORS: typeof SELECTORS !== 'undefined' ? SELECTORS : {},
      LOCPREV_MIN_W: (typeof LOCPREV_MIN_W !== 'undefined' ? LOCPREV_MIN_W : 420),
      LOCPREV_BASE_H: (typeof LOCPREV_BASE_H !== 'undefined' ? LOCPREV_BASE_H : 320),
      OVERVIEW_MIN_W: (typeof OVERVIEW_MIN_W !== 'undefined' ? OVERVIEW_MIN_W : 420),
      OVERVIEW_MIN_H: (typeof OVERVIEW_MIN_H !== 'undefined' ? OVERVIEW_MIN_H : 320),
      OVERVIEW_MARGIN_RIGHT: (typeof OVERVIEW_MARGIN_RIGHT !== 'undefined' ? OVERVIEW_MARGIN_RIGHT : 16),

      // Storage & page-scope
      STORAGE_NS: (typeof STORAGE_NS !== 'undefined' ? STORAGE_NS : '__ext_map_maker_v2__'),
      PAGE_SCOPE_MODE: (typeof PAGE_SCOPE_MODE !== 'undefined' ? PAGE_SCOPE_MODE : 'bucket'), // 'bucket' | 'page'
      CUSTOM_LAYOUT_DEFAULTS_KEY: (typeof CUSTOM_LAYOUT_DEFAULTS_KEY !== 'undefined' ? CUSTOM_LAYOUT_DEFAULTS_KEY : 'custom:defaults'),

      // Input keys, etc.
      DRAG_KEYS: (typeof DRAG_KEYS !== 'undefined' ? DRAG_KEYS : { AltKey: 'Alt', MetaKey: 'Meta', CtrlKey: 'Control', ShiftKey: 'Shift' })
    };
  } catch (err) {
    console.warn('[Ext] constants.js failed to initialize:', err);
  }
})();