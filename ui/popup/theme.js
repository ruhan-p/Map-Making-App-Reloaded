(() => {
  'use strict';

  const STORAGE_KEY = 'extThemeState';
  const CUSTOM_ID = 'custom';
  const PRESET_THEMES = globalThis.__EXT_PRESET_THEMES__;
  if (!PRESET_THEMES?.defaultDark) {
    console.error('Missing preset themes definition.');
    return;
  }

  const DEFAULT_CUSTOM = Object.freeze({
    '--ext-card-fg-val': PRESET_THEMES.defaultDark.tokens['--ext-card-fg-val'],
    '--ext-card-bg-val': PRESET_THEMES.defaultDark.tokens['--ext-card-bg-val'],
    '--ext-card-bg-alpha': PRESET_THEMES.defaultDark.tokens['--ext-card-bg-alpha'],
    '--ext-card-bg': PRESET_THEMES.defaultDark.tokens['--ext-card-bg'],
    '--ext-el-bg': PRESET_THEMES.defaultDark.tokens['--ext-el-bg'],
    '--ext-highlight': PRESET_THEMES.defaultDark.tokens['--ext-highlight']
  });

  const CUSTOM_TOKEN_KEYS = Object.keys(DEFAULT_CUSTOM);

  const root = document.documentElement;
  if (!root) return;

  let lastSignature = '';

  init();

  async function init() {
    try {
      const initial = await readStateFromStorage();
      applyTheme(initial);
    } catch (err) {
      console.error('Failed to load theme state:', err);
      applyTheme(buildDefaultState());
    }

    if (chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync') return;
        const entry = changes?.[STORAGE_KEY];
        if (!entry) return;
        try {
          applyTheme(sanitizeState(entry.newValue));
        } catch (err) {
          console.error('Theme update failed:', err);
        }
      });
    }
  }

  function applyTheme(state) {
    const style = root.style;
    const tokens = resolveTokens(state);
    const signature = JSON.stringify(tokens);
    if (signature === lastSignature) return;
    lastSignature = signature;
    for (const [prop, value] of Object.entries(tokens)) {
      if (value != null) style.setProperty(prop, String(value));
    }
  }

  function resolveTokens(state) {
    const safeState = sanitizeState(state);
    const source = safeState.activeColors;
    ensureCardTokens(source);
    return finalizeTokens(source);
  }

  function finalizeTokens(source) {
    ensureCardTokens(source);
    return {
      '--ext-card-fg-val': source['--ext-card-fg-val'] || DEFAULT_CUSTOM['--ext-card-fg-val'],
      '--ext-card-bg-val': source['--ext-card-bg-val'] || DEFAULT_CUSTOM['--ext-card-bg-val'],
      '--ext-card-bg-alpha': source['--ext-card-bg-alpha'] || DEFAULT_CUSTOM['--ext-card-bg-alpha'],
      '--ext-card-bg': source['--ext-card-bg'] || DEFAULT_CUSTOM['--ext-card-bg'],
      '--ext-el-bg': normalizeColorString(source['--ext-el-bg'] || DEFAULT_CUSTOM['--ext-el-bg'], true),
      '--ext-highlight': source['--ext-highlight'] || DEFAULT_CUSTOM['--ext-highlight']
    };
  }

  function ensureCardTokens(target) {
    const details = deriveCardBackground(target);
    target['--ext-card-bg'] = details.rgba;
    target['--ext-card-bg-val'] = details.val;
    target['--ext-card-bg-alpha'] = details.alpha;
  }

  async function readStateFromStorage() {
    return new Promise((resolve) => {
      if (!chrome?.storage?.sync?.get) {
        resolve(buildDefaultState());
        return;
      }
      chrome.storage.sync.get(STORAGE_KEY, (result) => {
        const err = chrome.runtime?.lastError;
        if (err) {
          console.error('Storage read failed:', err);
          resolve(buildDefaultState());
          return;
        }
        resolve(sanitizeState(result?.[STORAGE_KEY]));
      });
    });
  }

  function sanitizeState(raw) {
    const base = buildDefaultState();
    if (!raw || typeof raw !== 'object') return base;

    const rawActiveColors = raw.activeColors || raw.custom;
    const activeColors = Object.assign({}, base.activeColors, filterCustomColors(rawActiveColors));
    ensureCardTokens(activeColors);

    const customThemes = {};
    if (raw.customThemes && typeof raw.customThemes === 'object') {
      Object.entries(raw.customThemes).forEach(([id, theme]) => {
        if (typeof theme?.label === 'string' && theme.tokens && typeof theme.tokens === 'object') {
          const sanitizedTokens = Object.assign({}, DEFAULT_CUSTOM, filterCustomColors(theme.tokens));
          ensureCardTokens(sanitizedTokens);
          customThemes[id] = { label: theme.label, tokens: sanitizedTokens };
        }
      });
    }
    
    if (raw.activeId && raw.activeId !== CUSTOM_ID && PRESET_THEMES[raw.activeId] && (!raw.activeColors || Object.keys(raw.activeColors).length === 0)) {
       Object.assign(activeColors, PRESET_THEMES[raw.activeId].tokens);
       ensureCardTokens(activeColors);
    }
    
    if (raw.activeId === CUSTOM_ID && raw.custom && !raw.activeColors) {
        Object.assign(activeColors, raw.custom);
        ensureCardTokens(activeColors);
    }

    return { activeColors, customThemes };
  }

  function buildDefaultState() {
    return {
      activeColors: Object.assign({}, PRESET_THEMES.defaultDark.tokens),
      customThemes: {}
    };
  }

  function filterCustomColors(value) {
    if (!value || typeof value !== 'object') return {};
    const clean = {};
    CUSTOM_TOKEN_KEYS.forEach((key) => {
      if (value[key] != null) clean[key] = String(value[key]);
    });
    return clean;
  }

  function deriveCardBackground(source) {
    const parsedBg = parseColorString(source['--ext-card-bg']);
    const parsedVal = parseColorString(`rgb(${source['--ext-card-bg-val'] || ''})`);
    const base = parsedBg || parsedVal || parseColorString(DEFAULT_CUSTOM['--ext-card-bg']);
    const rgb = base || { r: 33, g: 34, b: 37, a: 1 };
    let alpha = clamp01(source['--ext-card-bg-alpha'] != null ? source['--ext-card-bg-alpha'] : rgb.a != null ? rgb.a : 1);
    if (base && base.a != null) alpha = clamp01(base.a);
    const val = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
    const rgba = `rgba(${val}, ${formatAlpha(alpha)})`;
    return { rgba, val, alpha: formatAlpha(alpha) };
  }

  function normalizeColorString(value, allowAlpha) {
    const parsed = parseColorString(value);
    if (!parsed) return String(value || '');
    if (!allowAlpha || parsed.a == null || parsed.a === 1) {
      return `rgb(${parsed.r}, ${parsed.g}, ${parsed.b})`;
    }
    return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${formatAlpha(parsed.a)})`;
  }

  function parseColorString(input) {
    if (input == null) return null;
    const str = String(input).trim();
    if (!str) return null;
    const norm = globalThis.__extNormalizeHex?.(str);
    if (norm) {
      const rgb = globalThis.__extHexToRgb?.(norm);
      if (rgb) return { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 };
    }
    const rgbaMatch = str.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\)/i);
    if (rgbaMatch) {
      const [, r, g, b, a] = rgbaMatch;
      return {
        r: clampChannel(Number(r)),
        g: clampChannel(Number(g)),
        b: clampChannel(Number(b)),
        a: a != null ? clamp01(Number(a)) : 1
      };
    }
    const nums = str.match(/\d+(?:\.\d+)?/g);
    if (nums && nums.length >= 3) {
      return {
        r: clampChannel(Number(nums[0])),
        g: clampChannel(Number(nums[1])),
        b: clampChannel(Number(nums[2])),
        a: nums.length >= 4 ? clamp01(Number(nums[3])) : undefined
      };
    }
    return null;
  }

  function clampChannel(value) {
    const num = Number(value);
    return Math.round(globalThis.__extClampValue ? globalThis.__extClampValue(Number.isFinite(num) ? num : 0, 0, 255) : Math.min(255, Math.max(0, Math.round(Number.isFinite(num) ? num : 0))));
  }

  function clamp01(value) {
    const num = Number(value);
    if (globalThis.__extClampValue) return globalThis.__extClampValue(Number.isFinite(num) ? num : 0, 0, 1);
    if (!Number.isFinite(num)) return 0;
    if (num < 0) return 0;
    if (num > 1) return 1;
    return num;
  }

  function formatAlpha(alpha) {
    if (alpha === 1) return '1';
    const fixed = (Math.round(alpha * 100) / 100).toString();
    return fixed;
  }
})();
