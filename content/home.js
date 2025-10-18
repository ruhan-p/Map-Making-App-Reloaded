(function () {
  "use strict";

  // ---- Constants and Configuration ----
  const PRESETS = {
    mountainous: { biome: 'mountainous' },
    desert: { biome: 'desert' },
    meadow: { biome: 'meadow' },
    alpine: { biome: 'alpine' }
  };
  const HOME_TERRAIN_BUCKET_KEY = 'home:terrainSettings:v1';
  const DEFAULT_PRESET_KEY = 'mountainous';
  const STORAGE_NS = 'ext_positions';
  const PAGE_SCOPE_MODE = 'origin+path';
  const SYNC_STORAGE_KEY = 'extThemeState';
  const DEFAULT_FEATURE_FLAGS = Object.freeze({
    homepageEnabled: true,
    homepageTerrainEnabled: true
  });

  // ---- State ----
  const backgroundInstances = new Map();
  let activeSettingsPopup = null;
  let isAzimuthDragging = false;
  let featureFlags = { ...DEFAULT_FEATURE_FLAGS };
  let defaultSolidColor = null;
  const solidPickerBindings = new WeakMap();
  const pendingSolidColorWrites = new Map();
  let hasRegisteredFlagWatcher = false;

  const closeSettingsPopup = (popup) => {
    if (!popup) return;
    popup.classList.remove('visible');
    const card = popup.closest('.ext-map-card');
    if (card) card.classList.remove('ext-map-card--settings-open');
    if (activeSettingsPopup === popup) {
      activeSettingsPopup = null;
    }
  };

  // ---- Utility Functions ----
  const clamp = (num, min, max) => Math.min(Math.max(num, min), max);

  const hashSeed = (input) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  const getTerrainStorageKey = (map) => {
    if (!map) return null;
    if (map.id != null) return `id:${map.id}`;
    const name = typeof map.name === 'string' && map.name.trim() ? map.name.trim() : 'map';
    return `name:${hashSeed(name)}`;
  };

  const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

  const normalizeSearchValue = (value) => {
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase();
  };

  const fuzzyMatchScore = (candidate, query) => {
    const source = normalizeSearchValue(candidate);
    const target = normalizeSearchValue(query);
    if (!target) return 0;
    if (!source) return -1;
    if (source === target) return 1000;

    let score = 0;
    const substringIndex = source.indexOf(target);
    if (substringIndex === 0) {
      score += 220;
    } else if (substringIndex > 0) {
      score += Math.max(0, 120 - substringIndex * 10);
    }

    let lastIndex = -1;
    for (let i = 0; i < target.length; i++) {
      const char = target[i];
      const position = source.indexOf(char, lastIndex + 1);
      if (position === -1) {
        return -1;
      }
      const sequential = position === lastIndex + 1;
      score += sequential ? 18 : 6;
      score += Math.max(0, 12 - position);
      lastIndex = position;
    }

    score += Math.max(0, 40 - (source.length - target.length));
    return score;
  };

  const hasChromeStorage = (() => {
    try {
      return !!(typeof chrome !== 'undefined' && chrome?.storage?.local);
    } catch {
      return false;
    }
  })();

  // ---- Storage Abstraction ----
  const getStorageRoot = async () => {
    try {
      if (hasChromeStorage) {
        return new Promise((resolve) => {
          chrome.storage.local.get([STORAGE_NS], (result) => {
            if (chrome.runtime?.lastError) {
              console.warn("Chrome storage error:", chrome.runtime.lastError.message);
              resolve({});
              return;
            }
            const payload = result?.[STORAGE_NS];
            resolve(payload && typeof payload === 'object' ? payload : {});
          });
        });
      }
      const raw = localStorage.getItem(STORAGE_NS);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      console.error("Failed to get storage root:", e);
      return {};
    }
  };

  const setStorageRoot = async (root) => {
    const nextRoot = root && typeof root === 'object' ? root : {};
    try {
      if (hasChromeStorage) {
        return new Promise((resolve, reject) => {
          chrome.storage.local.set({ [STORAGE_NS]: nextRoot }, () => {
            if (chrome.runtime?.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        });
      }
      localStorage.setItem(STORAGE_NS, JSON.stringify(nextRoot));
    } catch (e) {
      console.error("Failed to set storage root:", e);
    }
  };

  const getPageKey = () => (PAGE_SCOPE_MODE === 'origin' ? location.origin : location.origin + location.pathname);

  const getStoredTerrainSettings = async (mapKey) => {
    if (!mapKey) return null;
    try {
      const root = await getStorageRoot();
      const bucket = root?.[getPageKey()]?.[HOME_TERRAIN_BUCKET_KEY];
      const record = bucket?.[mapKey];
      return record && typeof record === 'object' ? { ...record } : null;
    } catch {
      return null;
    }
  };

  const saveStoredTerrainSettings = async (mapKey, record) => {
    if (!mapKey) return;
    try {
      const pageKey = getPageKey();
      const root = await getStorageRoot();

      root[pageKey] = root[pageKey] ?? {};
      root[pageKey][HOME_TERRAIN_BUCKET_KEY] = root[pageKey][HOME_TERRAIN_BUCKET_KEY] ?? {};
      const store = root[pageKey][HOME_TERRAIN_BUCKET_KEY];

      if (record && Object.keys(record).length) {
        const existing = store[mapKey] && typeof store[mapKey] === 'object' ? { ...store[mapKey] } : {};
        Object.entries(record).forEach(([key, value]) => {
          if (value === null) {
            delete existing[key];
          } else if (value !== undefined) {
            existing[key] = value;
          }
        });
        if (Object.keys(existing).length) {
          store[mapKey] = existing;
        } else {
          delete store[mapKey];
        }
      } else {
        delete store[mapKey];
        if (Object.keys(store).length === 0) {
          delete root[pageKey][HOME_TERRAIN_BUCKET_KEY];
          if (Object.keys(root[pageKey]).length === 0) {
            delete root[pageKey];
          }
        }
      }
      await setStorageRoot(root);
    } catch (e) {
      console.error("Failed to save terrain settings:", e);
    }
  };

  const sanitizeFeatureFlagPayload = (raw) => {
    const flags = { ...DEFAULT_FEATURE_FLAGS };
    if (raw && typeof raw === 'object') {
      if (typeof raw.homepageEnabled === 'boolean') flags.homepageEnabled = raw.homepageEnabled;
      if (typeof raw.homepageTerrainEnabled === 'boolean') flags.homepageTerrainEnabled = raw.homepageTerrainEnabled;
    }
    if (!flags.homepageEnabled) {
      flags.homepageTerrainEnabled = false;
    }
    return flags;
  };

  const featureFlagsEqual = (a, b) => {
    const flagsA = sanitizeFeatureFlagPayload(a);
    const flagsB = sanitizeFeatureFlagPayload(b);
    return flagsA.homepageEnabled === flagsB.homepageEnabled &&
      flagsA.homepageTerrainEnabled === flagsB.homepageTerrainEnabled;
  };

  const loadFeatureFlags = () => new Promise((resolve) => {
    if (!chrome?.storage?.sync?.get) {
      resolve({ ...DEFAULT_FEATURE_FLAGS });
      return;
    }
    try {
      chrome.storage.sync.get(SYNC_STORAGE_KEY, (result) => {
        if (chrome.runtime?.lastError) {
          console.warn('Failed to read homepage flags:', chrome.runtime.lastError.message);
          resolve({ ...DEFAULT_FEATURE_FLAGS });
          return;
        }
        const state = result?.[SYNC_STORAGE_KEY];
        resolve(sanitizeFeatureFlagPayload(state?.featureFlags));
      });
    } catch (err) {
      console.warn('Failed to load homepage flags:', err);
      resolve({ ...DEFAULT_FEATURE_FLAGS });
    }
  });

  const watchFeatureFlagChanges = () => {
    if (hasRegisteredFlagWatcher || !chrome?.storage?.onChanged) return;
    hasRegisteredFlagWatcher = true;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') return;
      const entry = changes?.[SYNC_STORAGE_KEY];
      if (!entry) return;
      const nextFlags = sanitizeFeatureFlagPayload(entry.newValue?.featureFlags);
      if (!featureFlagsEqual(featureFlags, nextFlags)) {
        featureFlags = nextFlags;
        window.setTimeout(() => window.location.reload(), 50);
      }
    });
  };

  const disableExtensionHomepageStyles = () => {
    try {
      const selectors = [
        'link[rel="stylesheet"][href*="styles/home.css"]',
        'link[rel="stylesheet"][href*="styles%2Fhome.css"]'
      ];
      selectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((link) => {
          if (link?.parentElement) link.parentElement.removeChild(link);
        });
      });
      document.body?.classList?.remove('ext-homepage-rework');
    } catch (err) {
      console.warn('Failed to disable homepage styles:', err);
    }
  };

  const clampChannel = (value) => {
    if (!Number.isFinite(value)) return 0;
    return Math.min(255, Math.max(0, Math.round(value)));
  };

  const clampAlpha01 = (value) => {
    if (!Number.isFinite(value)) return 1;
    return clamp(value, 0, 1);
  };

  const parseRgbaString = (value) => {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\)/i);
    if (!match) return null;
    return {
      r: clampChannel(Number(match[1])),
      g: clampChannel(Number(match[2])),
      b: clampChannel(Number(match[3])),
      a: match[4] != null ? clampAlpha01(Number(match[4])) : 1
    };
  };

  const sanitizeSolidColor = (value) => {
    if (value == null) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      try {
        const normalized = window.__extNormalizeHex?.(trimmed);
        if (normalized) return normalized;
      } catch {}
      const rgba = parseRgbaString(trimmed);
      if (rgba) {
        return rgba.a !== 1
          ? `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a.toFixed(3)})`
          : `rgb(${rgba.r}, ${rgba.g}, ${rgba.b})`;
      }
      if (/^#([0-9a-f]{3,8})$/i.test(trimmed)) return trimmed;
    }
    return null;
  };

  const resolveDefaultSolidColor = () => {
    if (defaultSolidColor) return defaultSolidColor;
    try {
      const styles = getComputedStyle(document.documentElement);
      const candidate = sanitizeSolidColor(styles.getPropertyValue('--ext-el-bg'));
      if (candidate) {
        defaultSolidColor = candidate;
        return defaultSolidColor;
      }
    } catch {}
    defaultSolidColor = '#2f343d';
    return defaultSolidColor;
  };

  const setSolidBackgroundColor = (element, color) => {
    if (!element) return;
    const normalized = sanitizeSolidColor(color) || resolveDefaultSolidColor();
    
    // Convert to RGB for gradient calculation
    const rgb = window.__extHexToRgb?.(normalized) || window.__extHexToRgb?.(window.__extRgbStringToHex?.(normalized));
    
    if (rgb) {
      // Create a subtle gradient: slightly lighter top-left to slightly darker bottom-right
      const hsl = window.__extRgbToHsl?.(rgb.r, rgb.g, rgb.b);
      if (hsl) {
        const lighterRgb = window.__extHslToRgb?.(hsl.h, hsl.s, Math.min(1, hsl.l + 0.08));
        const darkerRgb = window.__extHslToRgb?.(hsl.h, hsl.s, Math.max(0, hsl.l - 0.06));
        
        if (lighterRgb && darkerRgb) {
          const lighter = window.__extRgbToHex?.(lighterRgb.r, lighterRgb.g, lighterRgb.b);
          const darker = window.__extRgbToHex?.(darkerRgb.r, darkerRgb.g, darkerRgb.b);
          element.style.background = `linear-gradient(135deg, ${lighter} 0%, ${normalized} 50%, ${darker} 100%)`;
          element.style.backgroundColor = normalized;
          element.style.backgroundImage = `linear-gradient(135deg, ${lighter} 0%, ${normalized} 50%, ${darker} 100%)`;
        } else {
          element.style.background = normalized;
          element.style.backgroundColor = normalized;
          element.style.backgroundImage = 'none';
        }
      } else {
        element.style.background = normalized;
        element.style.backgroundColor = normalized;
        element.style.backgroundImage = 'none';
      }
    } else {
      element.style.background = normalized;
      element.style.backgroundColor = normalized;
      element.style.backgroundImage = 'none';
    }
    
    element.dataset.cardColor = normalized;
    const card = element.closest('.ext-map-card');
    if (card) card.dataset.cardColor = normalized;
  };

  const persistSolidColor = (storageKey, color) => {
    if (!storageKey) return;
    const normalized = sanitizeSolidColor(color);
    if (!normalized) return;
    const existing = pendingSolidColorWrites.get(storageKey);
    if (existing) {
      clearTimeout(existing);
    }
    const timeoutId = window.setTimeout(async () => {
      pendingSolidColorWrites.delete(storageKey);
      try {
        await saveStoredTerrainSettings(storageKey, { solidColor: normalized });
      } catch (err) {
        console.warn('Failed to persist solid color:', err);
      }
    }, 160);
    pendingSolidColorWrites.set(storageKey, timeoutId);
  };

  const createSolidColorSettings = (cardElement, storageKey, initialColor) => {
    if (!cardElement) return;
    const existingPopup = cardElement.querySelector('.ext-map-card__settings-popup');
    if (existingPopup) {
      closeSettingsPopup(existingPopup);
      const existingBinding = solidPickerBindings.get(existingPopup);
      if (existingBinding?.destroy) {
        try { existingBinding.destroy(); } catch {}
      }
      solidPickerBindings.delete(existingPopup);
      existingPopup.remove();
    }

    const settingsPopup = document.createElement('div');
    settingsPopup.className = 'ext-map-card__settings-popup ext-map-card__settings-popup--solid';
    settingsPopup.addEventListener('click', (e) => e.stopPropagation());
    settingsPopup.innerHTML = `
      <div class="solid-color-settings">
        <div class="solid-color-settings__header">
          <span class="solid-color-settings__label">Card color</span>
          <span class="solid-color-settings__preview" style="background:${initialColor};"></span>
        </div>
        <div class="solid-color-settings__picker" data-role="picker"></div>
      </div>
    `;
    cardElement.appendChild(settingsPopup);

    const pickerHost = settingsPopup.querySelector('[data-role="picker"]');
    if (!pickerHost) return;

    if (!window.__extColorPicker?.mountInlinePicker) {
      pickerHost.classList.add('solid-color-settings__unavailable');
      pickerHost.textContent = 'Color picker unavailable';
      return;
    }

    try {
      const pickerRef = window.__extColorPicker?.mountInlinePicker?.(pickerHost, {
        allowAlpha: false,
        initialColor: initialColor,
        initialHex: window.__extNormalizeHex?.(initialColor),
        onChange: (hex) => {
          const nextColor = sanitizeSolidColor(hex) || resolveDefaultSolidColor();
          const background = cardElement.querySelector('.ext-map-card__background');
          setSolidBackgroundColor(background, nextColor);
          const preview = settingsPopup.querySelector('.solid-color-settings__preview');
          if (preview) preview.style.background = nextColor;
          persistSolidColor(storageKey, nextColor);
        }
      });
      if (pickerRef?.api) {
        solidPickerBindings.set(settingsPopup, pickerRef.api);
      }
    } catch {};
  };

  async function initializeSolidBackground(backgroundElement, cardElement, storageKey) {
    try {
      const storedRecord = await getStoredTerrainSettings(storageKey);
      const storedColor = sanitizeSolidColor(storedRecord?.solidColor);
      const color = storedColor || resolveDefaultSolidColor();
      setSolidBackgroundColor(backgroundElement, color);
      cardElement.classList.remove('is-loading');
      createSolidColorSettings(cardElement, storageKey, color);
    } catch {}
  }

  // ---- UI: Settings Popup ----
  function createAndWireUpSettings(cardElement, cardInstance, storageKey, initialPresetKey) {
    const settingsPopup = document.createElement('div');
    settingsPopup.className = 'ext-map-card__settings-popup';
    settingsPopup.addEventListener('click', (e) => e.stopPropagation());

    const presetOptions = Object.keys(PRESETS).map(key =>
      `<option value="${key}">${key.charAt(0).toUpperCase() + key.slice(1)}</option>`
    ).join('');

    settingsPopup.innerHTML = `
      <div class="settings-main-controls">
        <div class="settings-control-wrapper settings-control-wrapper--azimuth">
          <label>Sun Azimuth</label>
          <div class="settings-azimuth">
            <div class="settings-azimuth__handle"></div>
          </div>
        </div>
        <div class="settings-vertical-sliders">
          <div class="settings-control-wrapper settings-control-wrapper--vertical">
            <label>Sun Angle</label>
            <input type="range" class="settings-slider settings-slider--vertical" min="5" max="85" orient="vertical">
          </div>
        </div>
      </div>
      <div class="settings-control-wrapper">
        <label>Triangle Density <span class="settings-value settings-value--density"></span></label>
        <input type="range" class="settings-slider" min="8" max="42">
      </div>
      <div class="settings-control-wrapper settings-control-wrapper--seed">
        <label for="seed-input-${storageKey}">Seed</label>
        <div class="seed-input-group">
          <input type="text" class="settings-seed-input" id="seed-input-${storageKey}">
          <button class="settings-seed-randomize" title="Randomize seed">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 512 512"><path d="M488.1 101.2 263.5 12.4c-4.8-1.9-10.2-1.9-15 0L23.9 101.2c-.1 0-12.4 4.3-12.9 19v287.2c0 8.8 5.7 16.7 14.1 19.4L249.7 500c.3.1 3 1 6.3 1 3.5 0 6-.9 6.3-1l224.6-73.2c8.4-2.7 14.1-10.6 14.1-19.4V120.2c-.7-14.7-12.8-19-12.9-19M235.6 452.5 51.8 392.6V148.3l183.8 59.9zM256 171.9 91.6 118.3l164.4-65 164.4 65zm204.2 220.7-183.7 59.9V208.2L460 148.4h.1v244.2z"/><path d="M258.6 102.6h-6.9c-12.4 0-22.4 10-22.4 22.4s10 22.4 22.4 22.4h6.9c12.4 0 22.4-10 22.4-22.4s-10-22.4-22.4-22.4m73.3 190c-14.3 0-25.8 11.6-25.8 25.8 0 14.3 11.6 25.8 25.8 25.8 14.3 0 25.8-11.6 25.8-25.8.1-14.3-11.5-25.8-25.8-25.8m72.8-36.1c-14.3 0-25.8 11.6-25.8 25.8 0 14.3 11.6 25.8 25.8 25.8 14.3 0 25.8-11.6 25.8-25.8s-11.6-25.8-25.8-25.8m-238.2 27c14.3 0 25.8-11.6 25.8-25.8 0-14.3-11.6-25.8-25.8-25.8-14.3 0-25.8 11.6-25.8 25.8 0 14.3 11.5 25.8 25.8 25.8m-61.9 59.2c14.3 0 25.8-11.6 25.8-25.8 0-14.3-11.6-25.8-25.8-25.8-14.3 0-25.8 11.6-25.8 25.8s11.6 25.8 25.8 25.8m78.2-25.5c-14.3 0-25.8 11.6-25.8 25.8 0 14.3 11.6 25.8 25.8 25.8 14.3 0 25.8-11.6 25.8-25.8s-11.5-25.8-25.8-25.8"/></svg>
          </button>
        </div>
      </div>
      <select class="ext-card-preset-selector" title="Change card background">${presetOptions}</select>
    `;

    const S = {
      azimuthControl: settingsPopup.querySelector('.settings-azimuth'),
      azimuthHandle: settingsPopup.querySelector('.settings-azimuth__handle'),
      elevationSlider: settingsPopup.querySelector('.settings-slider--vertical'),
      densitySlider: settingsPopup.querySelector('.settings-slider:not([orient="vertical"])'),
      densityCaption: settingsPopup.querySelector('.settings-value--density'),
      seedInput: settingsPopup.querySelector('.settings-seed-input'),
      randomizeButton: settingsPopup.querySelector('.settings-seed-randomize'),
      presetSelect: settingsPopup.querySelector('.ext-card-preset-selector')
    };

    let lastSavedSignature = '';
    const makeStoredPayload = (instance, presetKeyValue) => {
      if (!instance) return null;
      const { azimuth, elevation, triDensity } = instance.settings;
      const payload = {
        azimuth,
        elevation,
        triDensity,
        seed: instance.seed,
        preset: (presetKeyValue && PRESETS[presetKeyValue]) ? presetKeyValue : DEFAULT_PRESET_KEY
      };
      return payload;
    };

    const persistTerrainSettings = (overridePresetKey) => {
      const preferredPreset = overridePresetKey ?? S.presetSelect.value;
      const payload = makeStoredPayload(cardInstance, preferredPreset);
      const signature = JSON.stringify(payload);
      if (signature !== lastSavedSignature) {
        lastSavedSignature = signature;
        saveStoredTerrainSettings(storageKey, payload).catch(() => { lastSavedSignature = null; });
      }
    };

    const updateAzimuthHandle = (degrees) => {
      const rect = S.azimuthControl.getBoundingClientRect();
      const r = Math.max(0, rect.width / 2 - 8);
      S.azimuthHandle.style.transform = `rotate(${degrees}deg) translate(${r}px) rotate(${-degrees}deg)`;
    };

    const updateAllControls = (instance) => {
      const { azimuth, elevation, triDensity } = instance.settings;
      updateAzimuthHandle(azimuth);
      S.elevationSlider.value = elevation;
      S.densitySlider.value = triDensity;
      S.densityCaption.textContent = String(triDensity);
      S.seedInput.value = String(instance.seed);
    };

    S.azimuthControl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isAzimuthDragging = true;
      const rect = S.azimuthControl.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const handleAzimuthInteraction = (event) => {
        const angleRad = Math.atan2(event.clientY - centerY, event.clientX - centerX);
        let angleDeg = (angleRad * (180 / Math.PI) + 360) % 360;
        updateAzimuthHandle(angleDeg);
        cardInstance.updateSettings({ azimuth: angleDeg }, true);
      };

      const onMouseMove = (moveE) => handleAzimuthInteraction(moveE);
      const onMouseUp = () => {
        cardInstance.updateSettings({}, false);
        persistTerrainSettings();
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        setTimeout(() => { isAzimuthDragging = false; }, 0);
      };

      handleAzimuthInteraction(e);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    ['input', 'change'].forEach(type => {
        S.elevationSlider.addEventListener(type, () => {
            const value = parseFloat(S.elevationSlider.value);
            cardInstance.updateSettings({ elevation: value }, type === 'input');
            if (type === 'change') persistTerrainSettings();
        });
        S.densitySlider.addEventListener(type, () => {
            const value = parseFloat(S.densitySlider.value);
            if (type === 'input') S.densityCaption.textContent = String(value);
            cardInstance.updateSettings({ triDensity: value }, type === 'input');
            if (type === 'change') persistTerrainSettings();
        });
    });

    S.randomizeButton.addEventListener('click', () => {
      const newSeed = (Math.random() * 0xFFFFFFFF) >>> 0;
      S.seedInput.value = String(newSeed);
      cardInstance.updateSettings({ seed: newSeed }, false);
      persistTerrainSettings();
    });

    S.seedInput.addEventListener('change', () => {
      const newSeed = hashSeed(S.seedInput.value);
      S.seedInput.value = String(newSeed);
      cardInstance.updateSettings({ seed: newSeed }, false);
      persistTerrainSettings();
    });

    S.presetSelect.addEventListener('change', (e) => {
      const newPreset = PRESETS[e.target.value];
      if (newPreset) {
        cardInstance.updateSettings({ biome: newPreset.biome });
        updateAllControls(cardInstance);
        persistTerrainSettings(e.target.value);
      }
    });

    S.presetSelect.value = initialPresetKey;
    cardElement.appendChild(settingsPopup);
    updateAllControls(cardInstance);
    lastSavedSignature = JSON.stringify(makeStoredPayload(cardInstance, initialPresetKey));
  }


  // ---- UI: Card Creation and Initialization ----
  async function initializeTerrainBackground(canvas, cardElement, map, storageKey) {
    if (!featureFlags.homepageTerrainEnabled) {
      cardElement.classList.remove('is-loading');
      return;
    }
    try {
      const storedRecord = await getStoredTerrainSettings(storageKey);

      const presetKey = (storedRecord?.preset && PRESETS[storedRecord.preset])
        ? storedRecord.preset
        : (storedRecord?.theme && PRESETS[storedRecord.theme])
          ? storedRecord.theme
          : DEFAULT_PRESET_KEY;

      const basePreset = PRESETS[presetKey] ?? PRESETS[DEFAULT_PRESET_KEY];
      const initialSettings = { ...basePreset };

      if (storedRecord) {
        if (isFiniteNumber(storedRecord.azimuth)) initialSettings.azimuth = storedRecord.azimuth;
        const storedAngle = storedRecord.angle ?? storedRecord.elevation;
        if (isFiniteNumber(storedAngle)) initialSettings.elevation = storedAngle;
        if (isFiniteNumber(storedRecord.triDensity)) initialSettings.triDensity = storedRecord.triDensity;
      }

      const initialSeed = isFiniteNumber(storedRecord?.seed)
        ? storedRecord.seed
        : hashSeed(String(map.id ?? map.name ?? "map"));

      const instanceOptions = {
        seed: initialSeed,
        onReady: () => cardElement.classList.remove('is-loading')
      };

      const cardInstance = new (window.TerrainBackground)(canvas, initialSettings, instanceOptions);
      backgroundInstances.set(storageKey, cardInstance);

      createAndWireUpSettings(cardElement, cardInstance, storageKey, presetKey);

    } catch (error) {
      console.error("Failed to initialize terrain background:", error);
      cardElement.classList.remove('is-loading');
    }
  }

  const waitForVisible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return !!(el.offsetParent !== null || (rect.width && rect.height));
  };

  const createMapThroughSite = (name, originalPageContainer) => {
    if (!originalPageContainer) return; //{
    //   console.warn('No original container; falling back to direct POST form submit');
    //   const f = document.createElement('form');
    //   f.action = '/maps';
    //   f.method = 'post';
    //   f.style.display = 'none';
    //   const input = document.createElement('input');
    //   input.type = 'hidden';
    //   input.name = 'name';
    //   input.value = name;
    //   f.appendChild(input);
    //   document.body.appendChild(f);
    //   f.submit();
    //   return;
    // }

    const listRoot = originalPageContainer.querySelector('[data-replace="InteractiveMapList"]') || originalPageContainer;
    if (!listRoot) return;

    const newMapBtn = Array.from(listRoot.querySelectorAll('button.button, a.button'))
      .find(b => (b.textContent || '').trim().toLowerCase() === 'new map');

    if (!newMapBtn) return;

    let done = false;
    const stopLegacyObserver = () => { if (!done) { done = true; obs.disconnect(); } };
    const obs = new MutationObserver(() => {
      if (done) return;
      const form = listRoot.querySelector('form[action*="/maps"][method="post"]') || listRoot.querySelector('form[action="/maps"]');
      if (!form) return;

      const nameInput = form.querySelector('input[name="name"]') || form.querySelector('input[type="text"]');
      if (!nameInput) return;

      nameInput.focus();
      nameInput.value = name;
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));

      const submitBtn = form.querySelector('button[type="submit"].button--primary, button[type="submit"]');
      if (submitBtn) {
        submitBtn.click();
      } else {
        form.submit();
      }
      stopLegacyObserver();
    });

    obs.observe(listRoot, { childList: true, subtree: true });
    setTimeout(stopLegacyObserver, 4000);

    let modalTimeoutId;
    const modalObserver = new MutationObserver(() => {
      const dialog = document.querySelector('.edit-map-modal, [role="dialog"], .modal');
      if (!dialog || !waitForVisible(dialog)) return;

      let input = dialog.querySelector('form.edit-map-modal__rename input.input, form input#name, form input[id$="name"].input, form input[type="text"].input');
      if (!input) input = dialog.querySelector('input[type="text"].input, input[type="text"]');

      if (input && waitForVisible(input)) {
        input.focus();
        input.value = name;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        const form = input.closest('form');
        let submit = form?.querySelector('button[type="submit"], .button[type="submit"]');
        if (!submit) submit = dialog.querySelector('button[type="submit"], .edit-map-modal__actions button');

        if (submit) {
          setTimeout(() => submit.click(), 50);
        }

        clearTimeout(modalTimeoutId);
        modalObserver.disconnect();
      }
    });

    modalObserver.observe(document.body, { childList: true, subtree: true });
    modalTimeoutId = setTimeout(() => modalObserver.disconnect(), 5000);

    newMapBtn.click();
  };

  
  const openEditDialogForMap = (id, originalPageContainer) => {
    try {
      const root = originalPageContainer || document;
      const anchor = root.querySelector(`a[href$="/maps/${id}"]`);
      const li = anchor ? anchor.closest('.map-list__entry, li, div') : null;
      if (!li) return;

      const editBtn = li.querySelector('.map-list__edit');
      if (editBtn) editBtn.click();
    } catch {};
  };


  function createMapCard(map) {
    const isArchived = !!map.downloadUrl;
    const mapName = (typeof map.name === 'string' && map.name.trim()) ? map.name.trim() : 'Untitled Map';
    const locationCount = map.locationCount ?? 0;

    const useTerrainBackground = !isArchived && featureFlags.homepageTerrainEnabled;
    const backgroundElementTag = useTerrainBackground ? 'canvas' : 'div';

    const backgroundClasses = ['ext-map-card__background'];
    if (isArchived) backgroundClasses.push('ext-map-card__background--archived');
    else if (!useTerrainBackground) backgroundClasses.push('ext-map-card__background--solid');

    const cardHTML = `
      <${backgroundElementTag} class="${backgroundClasses.join(' ')}"></${backgroundElementTag}>
      <div class="ext-map-card__content">
        <div>
          <h2 class="ext-map-card__title" title="${mapName}">${mapName}</h2>
          <p class="ext-map-card__meta">${locationCount.toLocaleString()} location${locationCount !== 1 ? 's' : ''}</p>
        </div>
        ${isArchived ? `<a href="${map.downloadUrl}" class="button ext-card-download-btn" onclick="event.stopPropagation()"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download JSON</a>` : ''}
      </div>
      ${!isArchived ? `
        <div class="ext-map-card__actions">
          <a href="https://map-making.app/maps/${map.id}" class="button ext-map-card__open-btn" onclick="event.stopPropagation()">Open</a>
          <button class="ext-map-card__edit-btn" title="Edit map">
            <svg class="ext-map-card__edit-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M 20.71 7.04 C 21.1 6.65 21.1 6 20.71 5.63 L 18.37 3.29 C 18 2.9 17.35 2.9 16.96 3.29 L 15.12 5.12 L 18.87 8.87 M 3 17.25 V 21 H 6.75 L 17.81 9.93 L 14.06 6.18 L 3 17.25 Z"></path></svg>
          </button>
          <button class="ext-map-card__settings-btn" title="Customize background">
            <svg class="ext-map-card__settings-icon" width="18" height="18" viewBox="0 0 50 50" aria-hidden="true" focusable="false"><path d="m47.16 21.221-5.91-.966c-.346-1.186-.819-2.326-1.411-3.405l3.45-4.917c.279-.397.231-.938-.112-1.282l-3.889-3.887c-.347-.346-.893-.391-1.291-.104l-4.843 3.481c-1.089-.602-2.239-1.08-3.432-1.427l-1.031-5.886C28.607 2.35 28.192 2 27.706 2h-5.5c-.49 0-.908.355-.987.839l-.956 5.854c-1.2.345-2.352.818-3.437 1.412l-4.83-3.45c-.399-.285-.942-.239-1.289.106L6.82 10.648c-.343.343-.391.883-.112 1.28l3.399 4.863c-.605 1.095-1.087 2.254-1.438 3.46l-5.831.971c-.482.08-.836.498-.836.986v5.5c0 .485.348.9.825.985l5.831 1.034c.349 1.203.831 2.362 1.438 3.46L6.655 38c-.284.397-.239.942.106 1.289l3.888 3.891c.343.343.884.391 1.281.112l4.87-3.411c1.093.601 2.248 1.078 3.445 1.424l.976 5.861c.079.481.496.834.985.834h5.5c.485 0 .9-.348.984-.825l1.045-5.89c1.199-.353 2.348-.833 3.43-1.435l4.905 3.441c.398.281.938.232 1.282-.111l3.888-3.891c.346-.347.391-.894.104-1.292l-3.498-4.857c.593-1.08 1.064-2.222 1.407-3.408l5.918-1.039c.479-.084.827-.5.827-.985v-5.5c.001-.49-.354-.908-.838-.987zM25 35c-5.523 0-10-4.477-10-10s4.477-10 10-10 10 4.477 10 10-4.477 10-10 10z"></path></svg>
          </button>
        </div>` : ''}
    `;

    const cardElement = document.createElement('div');
    cardElement.className = 'ext-map-card is-loading';
    if (isArchived) cardElement.classList.add('is-archived');
    if (!isArchived && !useTerrainBackground) cardElement.classList.add('ext-map-card--solid');
    
    const folderPath = typeof map.folderPath === 'string' ? map.folderPath.trim() : '';
    const explicitSearch = typeof map.searchValue === 'string' ? map.searchValue.trim() : '';
    const compositeSearch = explicitSearch || (folderPath ? `${mapName} ${folderPath}` : mapName);

    cardElement.dataset.mapName = mapName;
    cardElement.dataset.mapSearchValue = normalizeSearchValue(compositeSearch);
    if (folderPath) cardElement.dataset.mapFolder = folderPath;
    else delete cardElement.dataset.mapFolder;
    if (map.id != null) cardElement.dataset.mapId = String(map.id);
    
    cardElement.innerHTML = cardHTML;
    
    // Defer background initialization to unblock main thread
    setTimeout(() => {
      if (isArchived) {
        cardElement.classList.remove('is-loading');
        return;
      }
      const backgroundElement = cardElement.querySelector('.ext-map-card__background');
      const storageKey = getTerrainStorageKey(map);
      if (useTerrainBackground) {
        initializeTerrainBackground(backgroundElement, cardElement, map, storageKey);
      } else {
        initializeSolidBackground(backgroundElement, cardElement, storageKey);
      }
    }, 0);

    return cardElement;
  }

  function updateMapCardFromMap(cardElement, map) {
    if (!cardElement || !map) return;
    const mapName = (typeof map.name === 'string' && map.name.trim()) ? map.name.trim() : 'Untitled Map';
    const folderPath = typeof map.folderPath === 'string' ? map.folderPath.trim() : '';
    const explicitSearch = typeof map.searchValue === 'string' ? map.searchValue.trim() : '';
    const compositeSearch = explicitSearch || (folderPath ? `${mapName} ${folderPath}` : mapName);

    cardElement.dataset.mapName = mapName;
    cardElement.dataset.mapSearchValue = normalizeSearchValue(compositeSearch);
    if (folderPath) cardElement.dataset.mapFolder = folderPath;
    else delete cardElement.dataset.mapFolder;

    const titleEl = cardElement.querySelector('.ext-map-card__title');
    if (titleEl) {
      titleEl.textContent = mapName;
      titleEl.setAttribute('title', mapName);
    }

    const locationCount = map.locationCount ?? 0;
    const metaEl = cardElement.querySelector('.ext-map-card__meta');
    if (metaEl) {
      metaEl.textContent = `${locationCount.toLocaleString()} location${locationCount !== 1 ? 's' : ''}`;
    }

    if (map.id != null) {
      const idValue = String(map.id);
      cardElement.dataset.mapId = idValue;
      const openBtn = cardElement.querySelector('.ext-map-card__open-btn');
      if (openBtn) {
        openBtn.setAttribute('href', `https://map-making.app/maps/${idValue}`);
      }
    }
  }
  
  // ---- Close Popup Logic ----
  const setupGlobalListeners = () => {
    document.addEventListener('click', (e) => {
      if (activeSettingsPopup && !isAzimuthDragging && !activeSettingsPopup.contains(e.target) && !e.target.closest('.ext-map-card__settings-btn')) {
        closeSettingsPopup(activeSettingsPopup);
      }
    });

    document.addEventListener('pointerover', (e) => {
      if (!activeSettingsPopup) return;
      const targetCard = e.target.closest?.('.ext-map-card');
      if (!targetCard) return;
      const activeCard = activeSettingsPopup.closest('.ext-map-card');
      if (activeCard && targetCard !== activeCard) {
        closeSettingsPopup(activeSettingsPopup);
      }
    });
  };


  // ---- Main Init Function ----
  async function initializeHomepageRework() {
    try {
      featureFlags = await loadFeatureFlags();
      watchFeatureFlagChanges();
      if (!featureFlags.homepageEnabled) {
        disableExtensionHomepageStyles();
        return;
      }
      document.body?.classList?.add('ext-homepage-rework');
      setupGlobalListeners();

      const dataElement = document.getElementById('data');
      if (!dataElement) throw new Error("Data element (#data) not found.");
      
      const pageData = JSON.parse(dataElement.textContent);
      const activeMaps = (pageData?.maps ?? []).filter(map => map.storage === 'active');

      const originalPageContainer = document.querySelector('.page-map-list');
      if (!originalPageContainer) throw new Error("Original page container not found.");
      
      const originalUpdatesSection = originalPageContainer.querySelector('section.updates');
      if (!originalUpdatesSection) throw new Error("Original updates section not found.");
      
      const originalCtas = originalUpdatesSection.querySelector('.ctas');
      const originalDownloadLink = originalPageContainer.querySelector('details:last-of-type a.button')?.href;
      const originalActiveList = originalPageContainer.querySelector('[data-replace="InteractiveMapList"] ul.map-list');

      const userLinksParagraph = originalUpdatesSection.querySelector('a[href="/auth"]')?.parentElement;
      const userSettingsLink = userLinksParagraph?.querySelector('a[href="/auth"]');
      const logoutLink = userLinksParagraph?.querySelector('a[href="/logout"]');
      if (userLinksParagraph) userLinksParagraph.remove();

      const parsedArchivedMaps = Array.from(
          originalPageContainer.querySelectorAll('details.collapse summary ~ ul.map-list li.map-list__entry')
        ).map(li => {
          const name = li.querySelector('strong')?.textContent.trim();
          const locationCountText = li.querySelector('.location-count')?.textContent.trim();
          const downloadUrl = li.querySelector('a.map-link')?.href;
          return (name && downloadUrl) ? { name, downloadUrl, locationCount: parseInt(locationCountText, 10) || 0 } : null;
        }).filter(Boolean);

      const fragment = document.createDocumentFragment();
      const newContainer = document.createElement('div');
      newContainer.className = 'ext-homepage-container';

      newContainer.innerHTML = `
        <header class="ext-header">
          <h1 class="ext-title">Map Making App</h1>
          <div class="ext-header-actions">
            ${originalDownloadLink ? `<a href="${originalDownloadLink}" class="button ext-header-btn"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Download All</a>` : ''}
            <button class="ext-header-btn" id="ext-changelog-btn"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> Changelog</button>
          </div>
        </header>
        <nav class="ext-tabs">
          <button class="ext-tab-btn active" data-tab="active">Maps (${activeMaps.length})</button>
          <button class="ext-tab-btn" data-tab="archived">Archived (${parsedArchivedMaps.length})</button>
        </nav>
      `;

      const tabsNav = newContainer.querySelector('.ext-tabs');
      const mapsTabButton = tabsNav?.querySelector('.ext-tab-btn[data-tab="active"]');

      const activeCardRegistry = new Map();
      const activeGrid = document.createElement('div');
      activeGrid.className = 'ext-map-grid';
      activeGrid.dataset.grid = 'active';
      if (activeMaps.length > 0) {
        activeMaps.forEach((map, index) => {
          const card = createMapCard(map);
          card.dataset.originalIndex = String(index);
          if (map.id != null) {
            activeCardRegistry.set(String(map.id), card);
          }
          activeGrid.appendChild(card);
        });
      } else {
        activeGrid.innerHTML = '<p class="grid-placeholder">No active maps found.</p>';
      }

      const archivedGrid = document.createElement('div');
      archivedGrid.className = 'ext-map-grid ext-hidden';
      archivedGrid.dataset.grid = 'archived';
      if (parsedArchivedMaps.length > 0) {
        parsedArchivedMaps.forEach((map, index) => {
          const card = createMapCard(map);
          card.dataset.originalIndex = String(index);
          archivedGrid.appendChild(card);
        });
      } else {
        archivedGrid.innerHTML = '<p class="grid-placeholder">No archived maps found.</p>';
      }

      const addBar = document.createElement('div');
      addBar.className = 'ext-add-map';
      addBar.innerHTML = `
        <div class="ext-map-search">
          <svg class="ext-map-search__icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 7.5-7.5a7.5 7.5 0 0 1-7.5 7.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
          <input type="search" class="ext-map-search__input" placeholder="Search maps…" aria-label="Search maps" autocomplete="off">
        </div>
        <div class="ext-new-map">
          <button type="button" class="button button--primary ext-new-map__btn" title="Create a new map">+</button>
          <div class="ext-new-map-popup">
            <form class="ext-new-map-form">
              <label class="ext-new-map-form__label" id="ext-new-map-label" for="ext-new-map-name">Map name</label>
              <input type="text" id="ext-new-map-name" class="ext-new-map-form__input" placeholder="Enter map name..." autocomplete="off" required>
              <button type="submit" class="button button--primary ext-new-map-form__submit">Create</button>
            </form>
          </div>
        </div>
      `;
      const searchInput = addBar.querySelector('.ext-map-search__input');
      const newMapBtn = addBar.querySelector('.ext-new-map__btn');
      const newMapPopup = addBar.querySelector('.ext-new-map-popup');
      const newMapForm = addBar.querySelector('.ext-new-map-form');
      const newMapInput = addBar.querySelector('.ext-new-map-form__input');
      newMapBtn.setAttribute('aria-haspopup', 'dialog');
      newMapBtn.setAttribute('aria-expanded', 'false');
      newMapPopup.setAttribute('role', 'dialog');
      newMapPopup.setAttribute('aria-hidden', 'true');
      newMapPopup.setAttribute('aria-labelledby', 'ext-new-map-label');
      const mapGrids = [activeGrid, archivedGrid];
      const noResultsPlaceholders = new Map();

      const getNoResultsPlaceholder = (grid) => {
        let placeholder = noResultsPlaceholders.get(grid);
        if (!placeholder) {
          placeholder = document.createElement('p');
          placeholder.className = 'grid-placeholder ext-search-no-results';
          placeholder.textContent = 'No maps match your search.';
          noResultsPlaceholders.set(grid, placeholder);
        }
        return placeholder;
      };

      const restoreDefaultOrder = (grid) => {
        const cards = Array.from(grid.querySelectorAll('.ext-map-card'));
        if (!cards.length) return;
        cards.sort((a, b) => Number(a.dataset.originalIndex ?? 0) - Number(b.dataset.originalIndex ?? 0));
        const fragment = document.createDocumentFragment();
        cards.forEach((card) => {
          card.classList.remove('ext-map-card--hidden');
          fragment.appendChild(card);
        });
        grid.appendChild(fragment);
        const placeholder = noResultsPlaceholders.get(grid);
        if (placeholder?.isConnected) placeholder.remove();
      };

      const applySearch = (rawValue) => {
        const query = normalizeSearchValue(rawValue);
        const isSearching = !!query;
        mapGrids.forEach((grid) => {
          const cards = Array.from(grid.querySelectorAll('.ext-map-card'));
          if (!cards.length) return;

          if (!isSearching) {
            restoreDefaultOrder(grid);
            return;
          }

          const matches = [];
          const nonMatches = [];
          cards.forEach((card) => {
            const source = card.dataset.mapSearchValue || normalizeSearchValue(card.dataset.mapName || card.querySelector('.ext-map-card__title')?.textContent || '');
            const score = fuzzyMatchScore(source, query);
            if (score >= 0) {
              matches.push({ card, score });
            } else {
              nonMatches.push(card);
            }
          });

          matches.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return Number(a.card.dataset.originalIndex ?? 0) - Number(b.card.dataset.originalIndex ?? 0);
          });

          const fragment = document.createDocumentFragment();
          matches.forEach(({ card }) => {
            card.classList.remove('ext-map-card--hidden');
            fragment.appendChild(card);
          });
          grid.appendChild(fragment);

          nonMatches.forEach((card) => card.classList.add('ext-map-card--hidden'));

          const placeholder = getNoResultsPlaceholder(grid);
          if (matches.length === 0) {
            if (!placeholder.isConnected) grid.appendChild(placeholder);
          } else if (placeholder.isConnected) {
            placeholder.remove();
          }
        });
      };

      const clearSearch = () => {
        if (searchInput.value) {
          searchInput.value = '';
        }
        applySearch('');
      };

      searchInput.addEventListener('input', (event) => applySearch(event.target.value));
      searchInput.addEventListener('search', (event) => applySearch(event.target.value));
      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          clearSearch();
          searchInput.blur();
        }
      });

      const openNewMapPopup = () => {
        newMapInput.value = '';
        newMapPopup.classList.add('visible');
        newMapBtn.setAttribute('aria-expanded', 'true');
        newMapPopup.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => newMapInput.focus());
      };

      const closeNewMapPopup = () => {
        if (!newMapPopup.classList.contains('visible')) return;
        newMapPopup.classList.remove('visible');
        newMapBtn.setAttribute('aria-expanded', 'false');
        newMapPopup.setAttribute('aria-hidden', 'true');
      };

      const submitNewMap = () => {
        const name = (newMapInput.value || '').trim();
        if (!name) {
          newMapInput.focus();
          return;
        }
        const hiddenOriginal = document.querySelector('.page-map-list');
        if (hiddenOriginal) {
          createMapThroughSite(name, hiddenOriginal);
          closeNewMapPopup();
          newMapInput.value = '';
        }
      };

      newMapBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (newMapPopup.classList.contains('visible')) {
          closeNewMapPopup();
        } else {
          openNewMapPopup();
        }
      });
      newMapPopup.addEventListener('click', (event) => event.stopPropagation());
      newMapForm.addEventListener('submit', (event) => {
        event.preventDefault();
        submitNewMap();
      });
      newMapInput.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          closeNewMapPopup();
          newMapBtn.focus();
        }
      });

      const removeDefaultPlaceholder = (grid) => {
        const placeholder = grid.querySelector('.grid-placeholder:not(.ext-search-no-results)');
        if (placeholder) placeholder.remove();
      };

      const ensureDefaultPlaceholder = (grid, message) => {
        if (grid.childElementCount > 0) return;
        const existing = grid.querySelector('.grid-placeholder:not(.ext-search-no-results)');
        if (!existing) {
          const placeholder = document.createElement('p');
          placeholder.className = 'grid-placeholder';
          placeholder.textContent = message;
          grid.appendChild(placeholder);
        }
      };

      const MAP_ID_PATTERN = /\/maps\/([^/?#]+)/;

      const waitForCondition = (check, timeoutMs = 800) => new Promise((resolve) => {
        const start = Date.now();
        const tick = () => {
          if (check()) {
            resolve(true);
            return;
          }
          if (Date.now() - start >= timeoutMs) {
            resolve(false);
            return;
          }
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(tick);
          } else {
            setTimeout(tick, 16);
          }
        };
        tick();
      });

      const extractLocationCount = (entry) => {
        if (!entry) return 0;
        const locationText = entry.textContent || '';
        const locationMatch = locationText.match(/([0-9][0-9,]*)\s+locations?/i);
        if (!locationMatch) return 0;
        const numeric = parseInt(locationMatch[1].replace(/,/g, ''), 10);
        return Number.isFinite(numeric) ? numeric : 0;
      };

      const resolveFolderName = (folderElement) => {
        if (!folderElement) return '';
        const datasetName = folderElement.getAttribute('data-folder');
        if (datasetName && datasetName.trim()) return datasetName.trim();
        const label = folderElement.querySelector(':scope > .map-folder__head strong');
        if (!label) return '';
        const text = label.textContent || '';
        return text.trim();
      };

      const locateFolderSublist = (folderElement) => {
        if (!folderElement) return null;
        const toggle = folderElement.querySelector(':scope > .map-folder__head button[aria-controls]');
        const controlsId = toggle?.getAttribute('aria-controls');
        if (controlsId) {
          const byId = document.getElementById(controlsId);
          if (byId) return byId;
        }
        return folderElement.querySelector(':scope > ul.map-sublist');
      };

      const ensureFoldersExpandedForScrape = async (rootList) => {
        if (!rootList) return () => {};
        const togglesToRestore = [];
        const queue = Array.from(rootList.querySelectorAll(':scope > li.map-folder'));

        const enqueueChildFolders = (folderElement) => {
          const sublist = locateFolderSublist(folderElement);
          if (!sublist) return;
          const childFolders = Array.from(sublist.querySelectorAll(':scope > li.map-folder'));
          if (childFolders.length) {
            queue.push(...childFolders);
          }
        };

        while (queue.length) {
          const folder = queue.shift();
          if (!(folder instanceof HTMLElement)) continue;
          const toggle = folder.querySelector(':scope > .map-folder__head button[aria-controls]');
          if (!toggle) {
            enqueueChildFolders(folder);
            continue;
          }

          const isOpen = toggle.getAttribute('aria-expanded') === 'true' ||
            toggle.getAttribute('data-state') === 'open' ||
            folder.getAttribute('data-state') === 'open';

          if (!isOpen) {
            toggle.click();
            togglesToRestore.push(toggle);
            await waitForCondition(() => {
              const folderState = folder.getAttribute('data-state');
              const buttonState = toggle.getAttribute('data-state');
              const ariaExpanded = toggle.getAttribute('aria-expanded');
              return folderState === 'open' || buttonState === 'open' || ariaExpanded === 'true';
            }, 600);
          }

          enqueueChildFolders(folder);
        }

        return () => {
          while (togglesToRestore.length) {
            const toggle = togglesToRestore.pop();
            try {
              toggle?.click();
            } catch {}
          }
        };
      };

      const collectMapsFromList = (listElement, folderTrail, accumulator, seenIds) => {
        if (!listElement) return;
        const children = Array.from(listElement.children || []);
        if (!children.length) return;

        children.forEach((child) => {
          if (!(child instanceof HTMLElement)) return;

          if (child.classList.contains('map-folder')) {
            const folderName = resolveFolderName(child);
            const nextTrail = folderName ? [...folderTrail, folderName] : folderTrail;
            const sublist = locateFolderSublist(child);
            if (sublist) {
              collectMapsFromList(sublist, nextTrail, accumulator, seenIds);
            }
            return;
          }

          if (!child.classList.contains('map-list__entry')) return;

          const link = child.querySelector('a.map-link[href*="/maps/"]') || child.querySelector('a.map-link[data-id]');
          if (!link) return;

          const href = link.getAttribute('href') || '';
          const idMatch = href.match(MAP_ID_PATTERN);
          const rawId = idMatch ? idMatch[1] : (link.dataset.id || link.dataset.mapId || '');
          const mapId = rawId ? rawId.trim() : '';
          if (!mapId) return;

          const name = (link.textContent || '').trim() || 'Untitled Map';
          const locationCount = extractLocationCount(child);
          const folderPath = folderTrail.length ? folderTrail.join(' / ') : '';
          const searchValue = folderPath ? `${name} ${folderPath}` : name;

          if (seenIds.has(mapId)) {
            const existing = accumulator.find((item) => item.id === mapId);
            if (existing) {
              if (Number.isFinite(locationCount) && locationCount !== existing.locationCount) {
                existing.locationCount = locationCount;
              }
              if (folderPath && folderPath !== existing.folderPath) {
                existing.folderPath = folderPath;
                existing.searchValue = searchValue;
              }
            }
            return;
          }

          accumulator.push({ id: mapId, name, locationCount, folderPath, searchValue });
          seenIds.add(mapId);
        });
      };

      const parseActiveMapsFromOriginal = async () => {
        if (!originalActiveList) return [];
        const restoreFolders = await ensureFoldersExpandedForScrape(originalActiveList);
        try {
          const accumulator = [];
          const seenIds = new Set();
          collectMapsFromList(originalActiveList, [], accumulator, seenIds);
          return accumulator.map((map, index) => ({ ...map, index }));
        } finally {
          restoreFolders();
        }
      };

      const syncActiveMapsFromOriginal = async () => {
        if (!originalActiveList) return;
        const parsedMaps = await parseActiveMapsFromOriginal();
        const seenIds = new Set();
        const fragment = document.createDocumentFragment();

        if (parsedMaps.length > 0) removeDefaultPlaceholder(activeGrid);

        parsedMaps.forEach(({ id, name, locationCount, index, folderPath, searchValue }) => {
          const key = String(id);
          let card = activeCardRegistry.get(key);
          const mapPayload = { id: key, name, locationCount, folderPath, searchValue };
          if (!card) {
            card = createMapCard(mapPayload);
            activeCardRegistry.set(key, card);
          } else {
            updateMapCardFromMap(card, mapPayload);
          }
          card.dataset.originalIndex = String(index);
          fragment.appendChild(card);
          seenIds.add(key);
        });

        const staleIds = [];
        activeCardRegistry.forEach((_, storedId) => {
          if (!seenIds.has(storedId)) staleIds.push(storedId);
        });
        
        staleIds.forEach((staleId) => {
          const staleCard = activeCardRegistry.get(staleId);
          if (staleCard) {
            const storageKey = `id:${staleId}`;
            const terrainInstance = backgroundInstances.get(storageKey);
            if (terrainInstance && typeof terrainInstance.destroy === 'function') {
                terrainInstance.destroy();
            }
            backgroundInstances.delete(storageKey);
            
            staleCard.remove();
            activeCardRegistry.delete(staleId);
          }
        });

        if (parsedMaps.length > 0) {
          activeGrid.appendChild(fragment);
        } else {
          ensureDefaultPlaceholder(activeGrid, 'No active maps found.');
        }

        if (mapsTabButton) {
          mapsTabButton.textContent = `Maps (${parsedMaps.length})`;
        }

        if (searchInput) applySearch(searchInput.value);
      };

      if (originalActiveList) {
        let syncScheduled = false;
        let syncInFlight = false;

        const runSyncOnce = () => {
          syncScheduled = false;
          if (syncInFlight) return;
          syncInFlight = true;
          Promise.resolve(syncActiveMapsFromOriginal()).finally(() => {
            syncInFlight = false;
          });
        };

        const scheduleActiveSync = () => {
          if (syncScheduled) return;
          syncScheduled = true;
          if (typeof queueMicrotask === 'function') {
            queueMicrotask(runSyncOnce);
          } else {
            Promise.resolve().then(runSyncOnce);
          }
        };

        const activeListObserver = new MutationObserver(() => scheduleActiveSync());
        activeListObserver.observe(originalActiveList, { childList: true, subtree: true, characterData: true });
        runSyncOnce();
      }

      newContainer.appendChild(addBar);
      newContainer.appendChild(activeGrid);
      newContainer.appendChild(archivedGrid);
      fragment.appendChild(newContainer);
      
      const modal = document.createElement('div');
      modal.className = 'ext-changelog-modal-wrapper';
      originalUpdatesSection.querySelector('.ctas')?.remove();
      originalUpdatesSection.querySelector('h2')?.remove();
      modal.innerHTML = `
        <div class="ext-changelog-backdrop"></div>
        <div class="ext-changelog-modal">
          <div class="ext-changelog-modal__header">
            <h2 class="ext-changelog-modal__title">Updates</h2>
            <button class="ext-changelog-modal__close" aria-label="Close">&times;</button>
          </div>
          <div class="ext-changelog-modal__content"></div>
        </div>
      `;
      modal.querySelector('.ext-changelog-modal__content').appendChild(originalUpdatesSection);
      fragment.appendChild(modal);

      const topRightLinks = document.createElement('div');
      topRightLinks.className = 'ext-fab-container ext-fab-container--top-right';

      const bottomRightLinks = document.createElement('div');
      bottomRightLinks.className = 'ext-fab-container ext-fab-container--bottom-right';

      const createFab = (linkElement, labelText, customClass, iconSvg) => {
        if (!linkElement) return null;
        const fab = linkElement.cloneNode(true);
        fab.innerHTML = '';
        fab.className = `ext-fab ${customClass}`;
        fab.insertAdjacentHTML('beforeend', `<span class="ext-cta__label-text">${labelText}</span>${iconSvg}`);
        return fab;
      };

      const fabDefs = {
        logout: { el: logoutLink, label: 'Log Out', className: 'ext-cta--logout', icon: `<svg class="ctas__icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>` },
        settings: { el: userSettingsLink, label: 'User Settings', className: 'ext-cta--settings', icon: `<svg class="ctas__icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>` },
        manual: { el: originalCtas?.querySelector("a[href*='manual']"), label: 'Read Manual', className: 'ext-cta--manual', icon: originalCtas?.querySelector("a[href*='manual'] svg")?.outerHTML },
        discord: { el: originalCtas?.querySelector("a[href*='discord']"), label: 'Join Discord', className: 'ext-cta--discord', icon: originalCtas?.querySelector("a[href*='discord'] svg")?.outerHTML }
      };

      [createFab(fabDefs.logout.el, fabDefs.logout.label, fabDefs.logout.className, fabDefs.logout.icon), createFab(fabDefs.settings.el, fabDefs.settings.label, fabDefs.settings.className, fabDefs.settings.icon)]
        .forEach(fab => fab && topRightLinks.appendChild(fab));
      
      [createFab(fabDefs.manual.el, fabDefs.manual.label, fabDefs.manual.className, fabDefs.manual.icon), createFab(fabDefs.discord.el, fabDefs.discord.label, fabDefs.discord.className, fabDefs.discord.icon)]
        .forEach(fab => fab && bottomRightLinks.appendChild(fab));

      fragment.appendChild(topRightLinks);
      fragment.appendChild(bottomRightLinks);

      document.body.appendChild(fragment);
      originalPageContainer.style.position = 'fixed';
      originalPageContainer.style.left = '-10000px';
      originalPageContainer.style.top = '-10000px';
      originalPageContainer.style.opacity = '0';
      originalPageContainer.style.pointerEvents = 'none';

      if (tabsNav) {
        tabsNav.addEventListener('click', (e) => {
          const button = e.target.closest('.ext-tab-btn');
          if (!button || button.classList.contains('active')) return;
          
          const targetTab = button.dataset.tab;
          tabsNav.querySelector('.active')?.classList.remove('active');
          button.classList.add('active');
          
          newContainer.querySelectorAll('.ext-map-grid').forEach(grid => {
            grid.classList.toggle('ext-hidden', grid.dataset.grid !== targetTab);
          });
        });
      }

      document.body.addEventListener('click', (e) => {
        const target = e.target;
        if (target.closest('.ext-map-card__open-btn') && searchInput?.value.trim()) {
          clearSearch();
        }
        if (!target.closest('.ext-new-map') && newMapPopup.classList.contains('visible')) {
          closeNewMapPopup();
        }
        const editBtn = target.closest('.ext-map-card__edit-btn');
        if (editBtn) {
          e.preventDefault();
          e.stopPropagation();
          const card = editBtn.closest('.ext-map-card');
          const id = card?.dataset.mapId;
          if (id && originalPageContainer) {
            openEditDialogForMap(id, originalPageContainer);
          }
          return;
        }
        const settingsBtn = target.closest('.ext-map-card__settings-btn');
        if (settingsBtn) {
          e.preventDefault();
          e.stopPropagation();
          const card = settingsBtn.closest('.ext-map-card');
          if (!card) return;
          const settingsPopup = card.querySelector('.ext-map-card__settings-popup');
          if (!settingsPopup) return;
          const isVisible = settingsPopup.classList.toggle('visible');
          if (isVisible) {
              if (activeSettingsPopup && activeSettingsPopup !== settingsPopup) {
                  closeSettingsPopup(activeSettingsPopup);
              }
              card.classList.add('ext-map-card--settings-open');
              activeSettingsPopup = settingsPopup;
          } else {
              closeSettingsPopup(settingsPopup);
          }
        }
      });
      
      const closeModal = () => modal.classList.remove('visible');
      document.getElementById('ext-changelog-btn')?.addEventListener('click', () => modal.classList.add('visible'));
      modal.querySelector('.ext-changelog-modal__close')?.addEventListener('click', closeModal);
      modal.querySelector('.ext-changelog-backdrop')?.addEventListener('click', closeModal);
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (newMapPopup.classList.contains('visible')) {
          closeNewMapPopup();
          return;
        }
        if (modal.classList.contains('visible')) {
          closeModal();
        }
      });

    } catch (error) {
      console.error("Extension Error during page rework:", error);
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initializeHomepageRework();
  } else {
    document.addEventListener('DOMContentLoaded', initializeHomepageRework, { once: true });
  }
})();
