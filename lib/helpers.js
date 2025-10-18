'use strict';

// ------------------------------ Config ---------------------------------
const SELECTORS = {
  map: '.map-embed',
  header: '.page-map-editor>header',
  meta: '.map-meta',
  overview: '.map-overview',
  controlMenu: '.map-control--menu',
  modal: '.modal__dialog',
  locprev: '.location-preview',
  locprevPanorama: '.location-preview__panorama',
  tagList: '.tag-list',
  controls: '.ext-controls-panel',
  lpPanels: '.ext-lp-panels',
  lpPanelP1: '.ext-lp-panel--p1',
  lpPanelP2: '.ext-lp-panel--p2',
};

const LOCPREV_MIN_W = 680;
const LOCPREV_BASE_H = 586;
const OVERVIEW_MIN_W = 620;
const OVERVIEW_MIN_H = 1;
const OVERVIEW_MARGIN_RIGHT = 16;
const STORAGE_NS = 'ext_positions';
const PAGE_SCOPE_MODE = 'origin+path';
const CUSTOM_LAYOUT_DEFAULTS_KEY = '__layoutDefaults';

const DRAG_KEYS = {
  [SELECTORS.meta]: 'meta',
  [SELECTORS.overview]: 'overview',
  [SELECTORS.locprev]: 'locprev',
  [SELECTORS.controls]: 'controls',
  [SELECTORS.lpPanelP1]: 'lp:p1',
  [SELECTORS.lpPanelP2]: 'lp:p2'
};

//  ----------------------- Color Helpers --------------------

function __extClampValue(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return min;
  }
  return Math.min(Math.max(num, min), max);
}
function __extNormalizeHex(hex) {
  if (!hex) {
    return null;
  }
  const trimmedHex = `${hex}`.trim().toLowerCase();
  if (/^#([0-9a-f]{6})$/.test(trimmedHex)) {
    return trimmedHex;
  }
  const shorthandMatch = trimmedHex.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (shorthandMatch) {
    const [, r, g, b] = shorthandMatch;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}
function __extRgbToHsl(r, g, b) {
  const red = __extClampValue(r, 0, 255) / 255;
  const green = __extClampValue(g, 0, 255) / 255;
  const blue = __extClampValue(b, 0, 255) / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);

  let hue = 0;
  let saturation = 0;
  const lightness = (max + min) / 2;

  if (max !== min) {
    const delta = max - min;
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case red:
        hue = (green - blue) / delta + (green < blue ? 6 : 0);
        break;
      case green:
        hue = (blue - red) / delta + 2;
        break;
      case blue:
        hue = (red - green) / delta + 4;
        break;
    }
    hue /= 6;
  }

  return { h: hue, s: saturation, l: lightness };
}
function __extHslToRgb(h, s, l) {
  const hueToRgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  if (s === 0) {
    const light = Math.round(l * 255);
    return { r: light, g: light, b: light };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const red = hueToRgb(p, q, h + 1 / 3);
  const green = hueToRgb(p, q, h);
  const blue = hueToRgb(p, q, h - 1 / 3);

  return {
    r: Math.round(red * 255),
    g: Math.round(green * 255),
    b: Math.round(blue * 255),
  };
}
function __extHexToRgb(hex) {
  const normalizedHex = __extNormalizeHex(hex);
  if (!normalizedHex) {
    return null;
  }
  const hexValue = normalizedHex.slice(1);
  return {
    r: parseInt(hexValue.slice(0, 2), 16),
    g: parseInt(hexValue.slice(2, 4), 16),
    b: parseInt(hexValue.slice(4, 6), 16),
  };
}
function __extRgbToHex(r, g, b) {
  const toHex = (value) => {
    const clampedValue = Math.round(__extClampValue(value, 0, 255));
    return clampedValue.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
function __extRgbStringToHex(rgbString) {
  if (!rgbString) {
    return null;
  }
  const normalizedHex = __extNormalizeHex(rgbString);
  if (normalizedHex) {
    return normalizedHex;
  }
  const match = String(rgbString).trim().match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) {
    return null;
  }
  const [, r, g, b] = match;
  return __extRgbToHex(Number(r), Number(g), Number(b)).toLowerCase();
}
function __extHslByIndex(index) {
  const hue = Math.round(((index * 47) % 360 + 360) % 360);
  return `hsl(${hue} 64% 54%)`;
}
function __extCssColorToHex(cssColor) {
  if (!cssColor) {
    return null;
  }
  const trimmedColor = String(cssColor).trim().toLowerCase();
  if (!trimmedColor || trimmedColor === 'transparent' || /rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(trimmedColor)) {
    return null;
  }
  return __extRgbStringToHex(trimmedColor);
}
function __extRgbToHsv(r, g, b) {
  const red = __extClampValue(r, 0, 255) / 255;
  const green = __extClampValue(g, 0, 255) / 255;
  const blue = __extClampValue(b, 0, 255) / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  const saturation = max === 0 ? 0 : delta / max;
  const value = max;

  if (delta !== 0) {
    switch (max) {
      case red:
        hue = (green - blue) / delta + (green < blue ? 6 : 0);
        break;
      case green:
        hue = (blue - red) / delta + 2;
        break;
      case blue:
        hue = (red - green) / delta + 4;
        break;
    }
    hue /= 6;
  }

  return { h: hue, s: saturation, v: value };
}
function __extHsvToRgb(h, s, v) {
  const hue = ((h % 1) + 1) % 1;
  const saturation = __extClampValue(s, 0, 1);
  const value = __extClampValue(v, 0, 1);

  const i = Math.floor(hue * 6);
  const f = hue * 6 - i;
  const p = value * (1 - saturation);
  const q = value * (1 - f * saturation);
  const t = value * (1 - (1 - f) * saturation);

  let red, green, blue;
  switch (i % 6) {
    case 0: red = value; green = t; blue = p; break;
    case 1: red = q; green = value; blue = p; break;
    case 2: red = p; green = value; blue = t; break;
    case 3: red = p; green = q; blue = value; break;
    case 4: red = t; green = p; blue = value; break;
    case 5: red = value; green = p; blue = q; break;
  }

  return {
    r: Math.round(red * 255),
    g: Math.round(green * 255),
    b: Math.round(blue * 255),
  };
}
function __extRgbCssFromArray(rgbArray) {
  if (!Array.isArray(rgbArray) || rgbArray.length < 3) {
    return null;
  }
  const [r, g, b] = rgbArray.map(n => Math.round(__extClampValue(n, 0, 255)));
  return `rgb(${r}, ${g}, ${b})`;
}
function __extContrastTextForRgbArray(rgbArray) {
  if (!Array.isArray(rgbArray) || rgbArray.length < 3) {
    return '#fff';
  }

  const [r, g, b] = rgbArray.map(n => __extClampValue(n, 0, 255));

  const toLinear = (c) => {
    const val = c / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  };

  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

  return luminance > 0.5 ? '#000' : '#fff';
}

// ------------------------------ Storage ---------------------------------
function hasChromeStorage() {
  try { return !!(typeof chrome !== 'undefined' && chrome?.storage?.local); } catch { return false; }
}

const _ls = {
  async getRoot() {
    if (hasChromeStorage()) {
      return new Promise(res => chrome.storage.local.get([STORAGE_NS], r => res(r?.[STORAGE_NS] || {})));
    }
    try {
      const raw = localStorage.getItem(STORAGE_NS);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  },
  async setRoot(root) {
    if (hasChromeStorage()) {
      return new Promise(res => chrome.storage.local.set({ [STORAGE_NS]: root }, () => res()));
    }
    try { localStorage.setItem(STORAGE_NS, JSON.stringify(root)); } catch {}
  },
};

function getPageScopeKey() {
  const { origin, pathname } = location;
  return PAGE_SCOPE_MODE === 'origin' ? origin : origin + pathname;
}

let __extPageBucketCache = null;
let __extBucketLoadPromise = null;
let __extBucketWriteQueue = Promise.resolve();

async function getPageBucket() {
  await __extBucketWriteQueue;
  if (__extPageBucketCache) return __extPageBucketCache;
  if (!__extBucketLoadPromise) {
    const pageKey = getPageScopeKey();
    __extBucketLoadPromise = (async () => {
      const root = await _ls.getRoot();
      const fromRoot = root[pageKey];
      const bucket = (fromRoot && typeof fromRoot === 'object') ? { ...fromRoot } : {};
      __extPageBucketCache = bucket;
      return bucket;
    })().finally(() => { __extBucketLoadPromise = null; });
  }
  return __extBucketLoadPromise;
}

async function savePageBucket(bucket) {
  const pageKey = getPageScopeKey();
  const safeBucket = bucket && typeof bucket === 'object' ? bucket : {};
  __extPageBucketCache = safeBucket;
  __extBucketWriteQueue = __extBucketWriteQueue.then(async () => {
    try {
      const root = await _ls.getRoot();
      root[pageKey] = safeBucket;
      await _ls.setRoot(root);
    } catch {}
  }).catch(() => {}).then(() => {});
  return __extBucketWriteQueue;
}

async function getSavedPos(key) {
  const bucket = await getPageBucket();
  return bucket[key] || null;
}

async function setSavedPos(key, pos) {
  const bucket = await getPageBucket();
  bucket[key] = pos;
  await savePageBucket(bucket);
}

async function clearSavedPositionsNormal() {
  const bucket = await getPageBucket();
  const KEYS = ['meta','overview','locprev','controls','lp:p1','lp:p2','overview:size','locprev:size'];
  KEYS.forEach(k => { try { delete bucket[k]; } catch {} });
  await savePageBucket(bucket);
}

async function getCustomLayoutDefaults() {
  const bucket = await getPageBucket();
  const stored = bucket[CUSTOM_LAYOUT_DEFAULTS_KEY];
  return stored && typeof stored === 'object' ? stored : null;
}

async function setCustomLayoutDefaults(defaults) {
  const bucket = await getPageBucket();
  if (defaults && Object.keys(defaults).length) {
    bucket[CUSTOM_LAYOUT_DEFAULTS_KEY] = defaults;
  } else {
    delete bucket[CUSTOM_LAYOUT_DEFAULTS_KEY];
  }
  await savePageBucket(bucket);
}

async function clearCustomLayoutDefaults() {
  const bucket = await getPageBucket();
  if (bucket && Object.prototype.hasOwnProperty.call(bucket, CUSTOM_LAYOUT_DEFAULTS_KEY)) {
    delete bucket[CUSTOM_LAYOUT_DEFAULTS_KEY];
    await savePageBucket(bucket);
    return true;
  }
  return false;
}

// ------------------------------ Shared Panel Sizing --------------------
function getMaxPanelHeight() {
  try {
    const vh = window?.innerHeight || document.documentElement?.clientHeight || 0;
    const h = Math.max(0, Math.round(vh - 96));
    return Math.max(1, h);
  } catch {
    return 1222;
  }
}

function getOverviewOverflowThreshold() {
  const maxH = getMaxPanelHeight();
  return Math.max(1, maxH - 18);
}

function __extWithTransitionSuppressed(el, fn) {
  if (!el || typeof fn !== 'function') { try { return fn?.(); } catch { return; } }
  const prev = el.style.transition;
  try {
    el.style.transition = 'none';
    void el.offsetHeight;
    const out = fn();
    void el.offsetHeight;
    requestAnimationFrame(() => { el.style.transition = prev; });
    return out;
  } catch (e) {
    try { el.style.transition = prev; } catch {}
  }
}

// ------------------------------ utils -----------------------------------

function isDisabled(btn) {
    try {
        return !!(btn?.disabled || btn?.getAttribute('disabled') != null || btn?.getAttribute('aria-disabled') === 'true' || btn?.classList?.contains('is-disabled'));
    } catch { return false; }
}

const now = () => Date.now();
function throttle(fn, delay = 100) {
  let t = 0, pending = false, lastArgs, lastThis;
  return function throttled(...args) {
    lastArgs = args; lastThis = this;
    const n = now(), remaining = delay - (n - t);
    if (remaining <= 0) { t = n; fn.apply(lastThis, lastArgs); }
    else if (!pending) {
      pending = true;
      setTimeout(() => { pending = false; t = now(); fn.apply(lastThis, lastArgs); }, remaining);
    }
  };
}

function rafThrottle(fn) {
  let raf = 0, lastArgs, lastThis;
  return function throttled(...args) {
    lastArgs = args; lastThis = this;
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; try { fn.apply(lastThis, lastArgs); } catch {} });
  };
}

const PanoramaActivity = (() => {
  let depth = 0;
  const listeners = new Set();
  const emit = (active) => {
    listeners.forEach(fn => { try { fn(!!active); } catch {} });
  };
  const api = {
    enter() { depth++; if (depth === 1) emit(true); },
    leave() { if (depth > 0) { depth--; if (depth === 0) emit(false); } },
    isActive() { return depth > 0; },
    onChange(fn) {
      if (typeof fn !== 'function') return () => {};
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    runWhenIdle(fn) {
      if (typeof fn !== 'function') return;
      if (!api.isActive()) { fn(); return; }
      const off = api.onChange((active) => {
        if (!active) { try { off(); } catch {}; fn(); }
      });
    }
  };
  return api;
})();

try { window.__extPanoramaActivity = PanoramaActivity; } catch {}

function createPanoramaAwareRunner(fn) {
  if (typeof fn !== 'function') return fn;
  let pending = false;
  let lastArgs = null;
  let lastThis = null;
  let unsubscribe = null;

  const flush = () => {
    const args = lastArgs || [];
    const ctx = lastThis || null;
    lastArgs = null;
    lastThis = null;
    try { fn.apply(ctx, args); } catch {}
  };

  const runner = function panoramaAwareRunner(...args) {
    const activity = window.__extPanoramaActivity;
    const shouldDefer = activity && activity.isActive() && !document.fullscreenElement;
    if (!shouldDefer) {
      try { fn.apply(this, args); } catch {}
      return;
    }

    lastArgs = args;
    lastThis = this;

    if (pending) return;
    pending = true;
    unsubscribe = activity.onChange((active) => {
      if (active) return;
      const off = unsubscribe;
      unsubscribe = null;
      pending = false;
      try { off && off(); } catch {}
      flush();
    });
  };

  runner.flush = () => {
    if (!pending) return;
    const off = unsubscribe;
    unsubscribe = null;
    pending = false;
    try { off && off(); } catch {}
    flush();
  };

  return runner;
}

try { window.__extCreatePanoAwareRunner = createPanoramaAwareRunner; } catch {}

async function getOpenFlag(key, fallback = true) {
  try {
    const bucket = await getPageBucket();
    const v = bucket[key];
    return typeof v === 'boolean' ? v : fallback;
  } catch { return fallback; }
}

async function setOpenFlag(key, value) {
  try {
    const bucket = await getPageBucket();
    bucket[key] = !!value;
    await savePageBucket(bucket);
  } catch {}
}
