(() => {
  'use strict';

  const STORAGE_KEY = 'extThemeState';
  const CUSTOM_ID = 'custom';
  const PRESET_THEMES = globalThis.__EXT_PRESET_THEMES__;

  if (!PRESET_THEMES?.defaultDark?.tokens) {
    console.error('Missing preset themes definition.');
    return;
  }

  const DEFAULT_THEME_TOKENS = Object.freeze({ ...PRESET_THEMES.defaultDark.tokens });
  const CUSTOM_TOKEN_KEYS = Object.keys(DEFAULT_THEME_TOKENS);

  const root = document.documentElement;
  if (!root) return;

  let lastSignature = '';

  const {
    __extNormalizeHex: normalizeHex,
    __extHexToRgb: hexToRgb,
    __extClampValue: clampValue = (val, min, max) => Math.min(max, Math.max(min, val)),
  } = globalThis;

  const clampChannel = (value) => {
    const num = Number(value);
    return Math.round(clampValue(Number.isFinite(num) ? num : 0, 0, 255));
  };

  const clamp01 = (value) => {
    const num = Number(value);
    return clampValue(Number.isFinite(num) ? num : 0, 0, 1);
  };

  const formatAlpha = (alpha) => {
    if (alpha === 1) return '1';
    return (Math.round(alpha * 100) / 100).toString();
  };

  const parseColorString = (input) => {
    if (input == null) return null;
    const str = String(input).trim();
    if (!str) return null;

    if (normalizeHex && hexToRgb) {
      const norm = normalizeHex(str);
      if (norm) {
        const rgb = hexToRgb(norm);
        if (rgb) return { ...rgb, a: 1 };
      }
    }

    const rgbaMatch = str.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\)/i);
    if (rgbaMatch) {
      const [, r, g, b, a] = rgbaMatch;
      return {
        r: clampChannel(r),
        g: clampChannel(g),
        b: clampChannel(b),
        a: a != null ? clamp01(a) : 1,
      };
    }
    return null;
  };

  const deriveCardBackground = (source) => {
    const bg = source['--ext-card-bg'];
    const val = source['--ext-card-bg-val'];
    const alpha = source['--ext-card-bg-alpha'];

    const parsedBg = parseColorString(bg);
    const parsedVal = val ? parseColorString(`rgb(${val})`) : null;
    const base = parsedBg || parsedVal || parseColorString(DEFAULT_THEME_TOKENS['--ext-card-bg']);
    const rgb = base || { r: 33, g: 34, b: 37, a: 1 };

    let finalAlpha = clamp01(alpha ?? rgb.a ?? 1);
    if (base?.a != null) finalAlpha = clamp01(base.a);

    const rgbVal = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
    const formattedAlpha = formatAlpha(finalAlpha);
    const rgba = `rgba(${rgbVal}, ${formattedAlpha})`;

    return { rgba, val: rgbVal, alpha: formattedAlpha };
  };

  const filterCustomColors = (value) => {
    if (!value || typeof value !== 'object') return {};
    return CUSTOM_TOKEN_KEYS.reduce((acc, key) => {
      if (value[key] != null) {
        acc[key] = String(value[key]);
      }
      return acc;
    }, {});
  };

  const buildDefaultState = () => ({
    activeColors: { ...DEFAULT_THEME_TOKENS },
    customThemes: {},
  });

  const sanitizeState = (raw) => {
    if (!raw || typeof raw !== 'object') return buildDefaultState();

    let activeColors = {};
    if (raw.activeId && raw.activeId !== CUSTOM_ID && PRESET_THEMES[raw.activeId]) {
      activeColors = { ...PRESET_THEMES[raw.activeId].tokens };
    } else {
      const customColors = raw.activeColors || raw.custom; // Legacy support
      activeColors = { ...DEFAULT_THEME_TOKENS, ...filterCustomColors(customColors) };
    }

    const cardBgDetails = deriveCardBackground(activeColors);
    activeColors['--ext-card-bg'] = cardBgDetails.rgba;
    activeColors['--ext-card-bg-val'] = cardBgDetails.val;
    activeColors['--ext-card-bg-alpha'] = cardBgDetails.alpha;

    const customThemes = {};
    if (typeof raw.customThemes === 'object') {
      for (const [id, theme] of Object.entries(raw.customThemes)) {
        if (typeof theme?.label === 'string' && typeof theme?.tokens === 'object') {
          const sanitizedTokens = { ...DEFAULT_THEME_TOKENS, ...filterCustomColors(theme.tokens) };
          const cardDetails = deriveCardBackground(sanitizedTokens);
          sanitizedTokens['--ext-card-bg'] = cardDetails.rgba;
          sanitizedTokens['--ext-card-bg-val'] = cardDetails.val;
          sanitizedTokens['--ext-card-bg-alpha'] = cardDetails.alpha;
          customThemes[id] = { label: theme.label, tokens: sanitizedTokens };
        }
      }
    }

    return { activeColors, customThemes };
  };

  const applyTheme = (state) => {
    const tokens = state.activeColors;
    const signature = JSON.stringify(tokens);

    if (signature === lastSignature) return;
    lastSignature = signature;

    for (const key of CUSTOM_TOKEN_KEYS) {
        const value = tokens[key] ?? DEFAULT_THEME_TOKENS[key];
        root.style.setProperty(key, String(value));
    }
  };

  const readStateFromStorage = async () => {
    if (!chrome?.storage?.sync?.get) {
      return buildDefaultState();
    }
    try {
      const result = await new Promise((resolve, reject) => {
        chrome.storage.sync.get(STORAGE_KEY, (res) => {
          if (chrome.runtime.lastError) {
            return reject(chrome.runtime.lastError);
          }
          resolve(res);
        });
      });
      return sanitizeState(result?.[STORAGE_KEY]);
    } catch (err) {
      console.error('Storage read failed:', err);
      return buildDefaultState();
    }
  };

  async function init() {
    try {
      const initialState = await readStateFromStorage();
      applyTheme(initialState);
    } catch (err) {
      console.error('Failed to load theme state:', err);
      applyTheme(buildDefaultState());
    }

    chrome?.storage?.onChanged?.addListener((changes, areaName) => {
      if (areaName !== 'sync' || !changes[STORAGE_KEY]) return;
      try {
        const newState = sanitizeState(changes[STORAGE_KEY].newValue);
        applyTheme(newState);
      } catch (err) {
        console.error('Theme update failed:', err);
      }
    });
  }

  init();
})();