(() => {
  'use strict';

  const PRESET_THEMES = Object.freeze({
    defaultDark: Object.freeze({
      label: 'Default Dark',
      tokens: Object.freeze({
        '--ext-card-fg-val': '255, 255, 255',
        '--ext-card-bg-val': '33, 34, 37',
        '--ext-card-bg-alpha': '1',
        '--ext-card-bg': 'rgba(33, 34, 37, 1)',
        '--ext-el-bg': 'rgba(7, 7, 8, 0.8)',
        '--ext-highlight': '22, 236, 146'
      })
    }),
    defaultLight: Object.freeze({
      label: 'Default Light (beta)',
      tokens: Object.freeze({
        '--ext-card-fg-val': '44, 62, 80',
        '--ext-card-bg-val': '245, 248, 250',
        '--ext-card-bg-alpha': '1',
        '--ext-card-bg': 'rgba(245, 248, 250, 1)',
        '--ext-el-bg': 'rgba(180, 185, 190, 0.8)',
        '--ext-highlight': '255, 0, 0'
      })
    }),
    defaultGlass: Object.freeze({
      label: 'Default Glass',
      tokens: Object.freeze({
        '--ext-card-fg-val': '255, 255, 255',
        '--ext-card-bg-val': '15, 28, 45',
        '--ext-card-bg-alpha': '0.8',
        '--ext-card-bg': 'rgba(15, 28, 45, 0.8)',
        '--ext-el-bg': 'rgba(6, 16, 30, 0.8)',
        '--ext-highlight': '22, 236, 146'
      })
    })
  });

  const PRESET_THEME_ORDER = Object.freeze(['defaultDark', 'defaultLight', 'defaultGlass']);

  if (!globalThis.__EXT_PRESET_THEMES__) {
    Object.defineProperty(globalThis, '__EXT_PRESET_THEMES__', {
      value: PRESET_THEMES,
      writable: false,
      enumerable: false
    });
  }

  if (!globalThis.__EXT_PRESET_THEME_ORDER__) {
    Object.defineProperty(globalThis, '__EXT_PRESET_THEME_ORDER__', {
      value: PRESET_THEME_ORDER,
      writable: false,
      enumerable: false
    });
  }
})();