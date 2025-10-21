(() => {
  'use strict';

  const STORAGE_KEY = 'extThemeState';
  const CUSTOM_ID = 'custom';
  const PRESET_THEMES = globalThis.__EXT_PRESET_THEMES__;
  if (!PRESET_THEMES?.defaultDark) {
    console.error('Missing preset themes definition.');
    return;
  }
  const PRESET_ORDER = globalThis.__EXT_PRESET_THEME_ORDER__ || Object.keys(PRESET_THEMES);
  const TUTORIAL_MESSAGE_TYPE = 'EXT_OPEN_TUTORIAL_DIALOG';

  const DEFAULT_CUSTOM = Object.freeze({
    '--ext-card-fg-val': PRESET_THEMES.defaultDark.tokens['--ext-card-fg-val'],
    '--ext-card-bg-val': PRESET_THEMES.defaultDark.tokens['--ext-card-bg-val'],
    '--ext-card-bg-alpha': PRESET_THEMES.defaultDark.tokens['--ext-card-bg-alpha'],
    '--ext-card-bg': PRESET_THEMES.defaultDark.tokens['--ext-card-bg'],
    '--ext-el-bg': PRESET_THEMES.defaultDark.tokens['--ext-el-bg'],
    '--ext-highlight': PRESET_THEMES.defaultDark.tokens['--ext-highlight']
  });

  const COLOR_FIELDS = [
    { key: '--ext-card-bg', label: 'BG 1', supportAlpha: true },
    { key: '--ext-el-bg', label: 'BG 2', supportAlpha: true },
    { key: '--ext-card-fg-val', label: 'Color', supportAlpha: false },
    { key: '--ext-highlight', label: 'Highlight', supportAlpha: false }
  ];

  const DEFAULT_FEATURE_FLAGS = Object.freeze({
    homepageEnabled: false,
    homepageTerrainEnabled: false,
    panelLayoutEnabled: true
  });

  const colorPickerBindings = new Map();
  const tabElements = new Map();

  let persistedState = null;
  let draftState = null;
  let activeThemeId = null;
  let applyButton = null;
  let saveCustomThemeButton = null;
  let saveThemeContainer = null;
  let saveThemeForm = null;
  let newThemeNameInput = null;
  let presetGrid = null;
  let customThemesGrid = null;
  let noCustomThemesMessage = null;
  let customTabsNav = null;
  let customTabsContent = null;
  let homepageToggle = null;
  let homepageTerrainToggle = null;
  let homepageTerrainRow = null;
  let panelLayoutToggle = null;
  let panelLayoutRow = null;
  let tutorialButton = null;

  function selectTab(keyToSelect) {
    tabElements.forEach(({ button, panel }, key) => {
      const isActive = key === keyToSelect;
      button.classList.toggle('is-active', isActive);
      panel.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', isActive);
    });

    if (customTabsContent) {
      customTabsContent.classList.remove('is-first-tab-active', 'is-last-tab-active');
      const firstKey = COLOR_FIELDS[0]?.key;
      const lastKey = COLOR_FIELDS[COLOR_FIELDS.length - 1]?.key;

      if (keyToSelect === firstKey) {
        customTabsContent.classList.add('is-first-tab-active');
      } else if (keyToSelect === lastKey) {
        customTabsContent.classList.add('is-last-tab-active');
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    applyButton = document.getElementById('apply-button');
    saveCustomThemeButton = document.getElementById('save-custom-theme-button');
    saveThemeContainer = document.querySelector('.save-theme-container');
    saveThemeForm = document.getElementById('save-theme-form');
    newThemeNameInput = document.getElementById('new-theme-name');
    presetGrid = document.getElementById('preset-grid');
    customThemesGrid = document.getElementById('custom-themes-grid');
    noCustomThemesMessage = customThemesGrid?.querySelector('[data-role="no-custom-themes"]');
    const tabsContainer = document.getElementById('custom-tabs-container');
    customTabsNav = tabsContainer?.querySelector('.custom-tabs__nav');
    customTabsContent = tabsContainer?.querySelector('.custom-tabs__content');
    homepageToggle = document.getElementById('homepage-toggle');
    homepageTerrainToggle = document.getElementById('homepage-terrain-toggle');
    homepageTerrainRow = document.querySelector('[data-role="homepage-terrain-row"]');
    panelLayoutToggle = document.getElementById('panel-layout-toggle');
    panelLayoutRow = document.querySelector('[data-role="panel-layout-toggle-row"]');
    tutorialButton = document.getElementById('tutorial-button');
    
    buildCustomPanelShell();

    try {
      const loaded = await readStateFromStorage();
      persistedState = loaded;
      ensureFeatureFlags(persistedState);
      draftState = deepClone(loaded);
      ensureFeatureFlags(draftState);
    } catch (err) {
      console.error('Failed to read stored theme state:', err);
      const fallback = buildDefaultState();
      persistedState = fallback;
      draftState = deepClone(fallback);
    }
    
    applyTokensToDocument(draftState?.activeColors);

    hydrateCustomPanel();
    checkActiveTheme();
    renderThemeButtons();
    updateApplyButton();
    updateSaveCustomThemeButton();
    syncFeatureControls();

    if (COLOR_FIELDS.length > 0) {
      selectTab(COLOR_FIELDS[0].key);
    }

    applyButton?.addEventListener('click', onApplyClicked, { passive: true });
    saveCustomThemeButton?.addEventListener('click', onSaveCustomThemeClicked, { passive: true });
    saveThemeForm?.addEventListener('submit', onSaveThemeFormSubmit);
    homepageToggle?.addEventListener('change', onHomepageToggleChange, { passive: true });
    homepageTerrainToggle?.addEventListener('change', onHomepageTerrainToggleChange, { passive: true });
    panelLayoutToggle?.addEventListener('change', onPanelLayoutToggleChange, { passive: true });
    tutorialButton?.addEventListener('click', onTutorialButtonClick);
    document.addEventListener('pointerdown', onGlobalPointerDown, true);
  }

  function buildCustomPanelShell() {
    if (!customTabsNav || !customTabsContent) return;
    customTabsNav.innerHTML = '';
    customTabsContent.innerHTML = '';
    tabElements.clear();

    COLOR_FIELDS.forEach((field) => {
      const tabId = `tab-${field.key}`;
      const panelId = `panel-${field.key}`;

      const tabButton = document.createElement('button');
      tabButton.className = 'custom-tabs__tab';
      tabButton.type = 'button';
      tabButton.id = tabId;
      tabButton.setAttribute('role', 'tab');
      tabButton.setAttribute('aria-controls', panelId);
      tabButton.setAttribute('aria-selected', 'false');
      tabButton.textContent = field.label;
      tabButton.addEventListener('click', () => selectTab(field.key));
      customTabsNav.appendChild(tabButton);

      const tabPanel = document.createElement('div');
      tabPanel.className = 'custom-tabs__panel';
      tabPanel.id = panelId;
      tabPanel.setAttribute('role', 'tabpanel');
      tabPanel.setAttribute('aria-labelledby', tabId);
      customTabsContent.appendChild(tabPanel);

      const fieldEl = document.createElement('div');
      fieldEl.className = 'color-field';
      fieldEl.dataset.colorKey = field.key;
      fieldEl.innerHTML = `
        <div class="color-field__top">
          <span class="color-field__label">${field.label}</span>
          <div class="color-field__swatch" aria-label="Current color preview">
            <span class="color-field__swatch-checker"></span>
            <span class="color-field__swatch-color"></span>
          </div>
        </div>
        <div class="color-field__value" data-role="value"></div>
        <div class="color-field__picker" data-role="picker"></div>
      `;
      tabPanel.appendChild(fieldEl);

      tabElements.set(field.key, { button: tabButton, panel: tabPanel, fieldElement: fieldEl });
    });
  }

  function hydrateCustomPanel() {
    COLOR_FIELDS.forEach((field) => {
      const elements = tabElements.get(field.key);
      if (!elements) return;

      const fieldEl = elements.fieldElement;
      const swatch = fieldEl.querySelector('.color-field__swatch-color');
      const valueEl = fieldEl.querySelector('[data-role="value"]');
      const pickerSlot = fieldEl.querySelector('[data-role="picker"]');

      const current = getCustomColor(field.key);
      const display = formatColorDisplay(field.key, current);
      const swatchColor = colorToCss(current, field.supportAlpha, draftState.activeColors['--ext-card-bg-alpha']);

      const parsedColor = parseColor(current);
      if (parsedColor) {
        fieldEl.style.setProperty('--color-picker-current-hue', `rgb(${parsedColor.r}, ${parsedColor.g}, ${parsedColor.b})`);
      }

      if (swatch) swatch.style.backgroundColor = swatchColor;
      if (valueEl) valueEl.textContent = display;

      if (pickerSlot) {
        const existing = colorPickerBindings.get(field.key);
        if (existing?.destroy) {
          try { existing.destroy(); } catch {}
        }
        pickerSlot.innerHTML = '';

        const { hex, alpha } = toHexAndAlpha(current);
        const mountOpts = {
          initialHex: hex,
          allowAlpha: field.supportAlpha,
          initialAlpha: alpha,
          onChange: (payload) => handlePickerChange(field, payload)
        };

        let pickerRef = null;
        try {
          pickerRef = window.__extColorPicker?.mountInlinePicker(pickerSlot, mountOpts) || null;
        } catch {}

        colorPickerBindings.set(field.key, {
          field,
          element: fieldEl,
          picker: pickerRef?.api || null,
          destroy: pickerRef?.api?.destroy?.bind(pickerRef.api) || null
        });
      }
    });
  }

  function onTutorialButtonClick() {
    if (!chrome?.tabs?.query || !chrome?.tabs?.sendMessage) return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const targetTab = Array.isArray(tabs) ? tabs[0] : null;
      const tabId = targetTab?.id;
      if (typeof tabId !== 'number') {
        try { window.close(); } catch {}
        return;
      }
      chrome.tabs.sendMessage(tabId, { type: TUTORIAL_MESSAGE_TYPE }, () => {
        const err = chrome.runtime?.lastError;
        if (err && !/Receiving end does not exist/i.test(err.message || '')) {
          console.warn('Tutorial dialog request failed:', err);
        }
        try { window.close(); } catch {}
      });
    });
  }

  function renderThemeButtons() {
    if (!presetGrid || !customThemesGrid) return;
    
    presetGrid.innerHTML = '';
    customThemesGrid.innerHTML = '';

    PRESET_ORDER.forEach((id) => {
      const def = PRESET_THEMES[id];
      if (!def) return;
      const btn = createThemeButton(id, def.label, def.tokens, true);
      presetGrid.appendChild(btn);
    });

    const customThemeIds = Object.keys(draftState.customThemes || {});
    if (customThemeIds.length === 0) {
      if (noCustomThemesMessage) noCustomThemesMessage.style.display = 'block';
    } else {
      if (noCustomThemesMessage) noCustomThemesMessage.style.display = 'none';
      customThemeIds.forEach((id) => {
        const theme = draftState.customThemes[id];
        const btn = createThemeButton(id, theme.label, theme.tokens, false);
        customThemesGrid.appendChild(btn);
      });
    }
  }

  function sanitizeFeatureFlags(raw) {
    const merged = {
      homepageEnabled: DEFAULT_FEATURE_FLAGS.homepageEnabled,
      homepageTerrainEnabled: DEFAULT_FEATURE_FLAGS.homepageTerrainEnabled,
      panelLayoutEnabled: DEFAULT_FEATURE_FLAGS.panelLayoutEnabled
    };
    if (raw && typeof raw === 'object') {
      if (typeof raw.homepageEnabled === 'boolean') merged.homepageEnabled = raw.homepageEnabled;
      if (typeof raw.homepageTerrainEnabled === 'boolean') merged.homepageTerrainEnabled = raw.homepageTerrainEnabled;
      if (typeof raw.panelLayoutEnabled === 'boolean') merged.panelLayoutEnabled = raw.panelLayoutEnabled;
    }
    if (!merged.homepageEnabled) {
      merged.homepageTerrainEnabled = false;
    }
    return merged;
  }

  function featureFlagsEqual(prev, next) {
    const a = sanitizeFeatureFlags(prev);
    const b = sanitizeFeatureFlags(next);
    return a.homepageEnabled === b.homepageEnabled &&
      a.homepageTerrainEnabled === b.homepageTerrainEnabled &&
      a.panelLayoutEnabled === b.panelLayoutEnabled;
  }

  function ensureFeatureFlags(target) {
    if (!target || typeof target !== 'object') return;
    target.featureFlags = sanitizeFeatureFlags(target.featureFlags);
  }

  function syncFeatureControls() {
    if (!draftState) return;
    ensureFeatureFlags(draftState);
    const flags = draftState.featureFlags;
    if (homepageToggle) {
      homepageToggle.checked = !!flags.homepageEnabled;
    }
    if (homepageTerrainToggle) {
      homepageTerrainToggle.checked = !!flags.homepageTerrainEnabled && !!flags.homepageEnabled;
      homepageTerrainToggle.disabled = !flags.homepageEnabled;
      if (flags.homepageEnabled) {
        homepageTerrainToggle.removeAttribute('aria-disabled');
      } else {
        homepageTerrainToggle.setAttribute('aria-disabled', 'true');
      }
    }
    if (homepageTerrainRow) {
      homepageTerrainRow.classList.toggle('is-disabled', !flags.homepageEnabled);
      if (flags.homepageEnabled) {
        homepageTerrainRow.removeAttribute('aria-disabled');
      } else {
        homepageTerrainRow.setAttribute('aria-disabled', 'true');
      }
    }
    if (panelLayoutToggle) {
      panelLayoutToggle.checked = !!flags.panelLayoutEnabled;
    }
    if (panelLayoutRow) {
      panelLayoutRow.setAttribute('aria-disabled', 'false');
      panelLayoutRow.classList.remove('is-disabled');
    }
  }

  function onHomepageToggleChange(event) {
    if (!draftState) return;
    ensureFeatureFlags(draftState);
    const isEnabled = !!event?.target?.checked;
    draftState.featureFlags.homepageEnabled = isEnabled;
    if (!isEnabled) {
      draftState.featureFlags.homepageTerrainEnabled = false;
    }
    syncFeatureControls();
    updateApplyButton();
  }

  function onHomepageTerrainToggleChange(event) {
    if (!draftState) return;
    ensureFeatureFlags(draftState);
    const isEnabled = !!event?.target?.checked;
    draftState.featureFlags.homepageTerrainEnabled = !!draftState.featureFlags.homepageEnabled && isEnabled;
    syncFeatureControls();
    updateApplyButton();
  }

  function onPanelLayoutToggleChange(event) {
    if (!draftState) return;
    ensureFeatureFlags(draftState);
    const isEnabled = !!event?.target?.checked;
    draftState.featureFlags.panelLayoutEnabled = isEnabled;
    syncFeatureControls();
    updateApplyButton();
  }

  function createThemeButton(id, label, tokens, isPreset) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'theme-button';
      if (isPreset) btn.classList.add('is-preset');
      btn.dataset.themeId = id;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', id === activeThemeId ? 'true' : 'false');
      btn.textContent = label;
      
      const fg = numbersToColor(tokens['--ext-card-fg-val'], false) || 'rgb(17, 24, 39)';
      const bg = colorToCss(tokens['--ext-card-bg'] || tokens['--ext-card-bg-val'], true, tokens['--ext-card-bg-alpha']);
      const elbg = colorToCss(tokens['--ext-el-bg'], false);
      const border = numbersToBorder(tokens['--ext-card-fg-val']);
      
      btn.style.backgroundImage = `linear-gradient(to bottom right, ${bg}, ${elbg})`;
      btn.style.color = fg;
      if (border) btn.style.borderColor = border;

      btn.classList.toggle('is-selected', id === activeThemeId);

      btn.addEventListener('click', () => selectTheme(id, tokens));
      
      if (!isPreset) {
          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.className = 'theme-button__delete';
          deleteBtn.innerHTML = '&times;';
          deleteBtn.title = 'Delete Custom Theme';
          deleteBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              deleteCustomTheme(id);
          });
          btn.appendChild(deleteBtn);
      }
      
      return btn;
  }

  function selectTheme(id, tokens) {
    if (!draftState) return;
    
    draftState.activeColors = deepClone(tokens); 
    activeThemeId = id; 

    hydrateCustomPanel();
    checkActiveTheme();
    updateApplyButton();
    updateSaveCustomThemeButton();
  }
  
  function checkActiveTheme() {
      if (!draftState) return;
      
      let matchedId = null;
      const currentColors = draftState.activeColors;
      
      for (const id of PRESET_ORDER) {
          const tokens = PRESET_THEMES[id].tokens;
          if (areColorSetsEqual(currentColors, tokens)) {
              matchedId = id;
              break;
          }
      }
      
      if (!matchedId) {
          for (const id in draftState.customThemes) {
              const tokens = draftState.customThemes[id].tokens;
              if (areColorSetsEqual(currentColors, tokens)) {
                  matchedId = id;
                  break;
              }
          }
      }
      
      activeThemeId = matchedId;
      
      document.querySelectorAll('.theme-button').forEach(btn => {
          const id = btn.dataset.themeId;
          const isSelected = id === activeThemeId;
          btn.classList.toggle('is-selected', isSelected);
          btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      });
  }
  
  function areColorSetsEqual(setA, setB) {
      const keys = Object.keys(DEFAULT_CUSTOM);
      for (const key of keys) {
          const valA = setA[key];
          const valB = setB[key];
          if (!colorValuesEqual(valA, valB, key)) {
              return false;
          }
      }
      return true;
  }

  function handlePickerChange(field, payload) {
    if (!field || !draftState) return;
    const key = field.key;
    const elements = tabElements.get(key);
    if (!elements) return;

    const fieldEl = elements.fieldElement;
    const swatch = fieldEl.querySelector('.color-field__swatch-color');
    const valueEl = fieldEl.querySelector('[data-role="value"]');

    if (field.supportAlpha) {
      const normalized = normalizeAlphaPayload(payload);
      const rgba = normalized.rgba;
      const rgb = normalized.rgb;
      const alpha = normalized.alpha;
      const numbers = `${rgb.r}, ${rgb.g}, ${rgb.b}`;

      fieldEl.style.setProperty('--color-picker-current-hue', `rgb(${numbers})`);

      if (key === '--ext-card-bg') {
        draftState.activeColors['--ext-card-bg'] = rgba;
        draftState.activeColors['--ext-card-bg-val'] = numbers;
        draftState.activeColors['--ext-card-bg-alpha'] = String(alpha);
      } else {
        draftState.activeColors[key] = rgba;
      }

      if (swatch) swatch.style.backgroundColor = rgba;
      if (valueEl) valueEl.textContent = formatColorDisplay(key, rgba);
    } else {
      const hex = typeof payload === 'string' ? payload : payload?.hex;
      const rgb = hexToRgbSafe(hex);
      const numbers = `${rgb.r}, ${rgb.g}, ${rgb.b}`;

      fieldEl.style.setProperty('--color-picker-current-hue', `rgb(${numbers})`);
      
      draftState.activeColors[key] = numbers;
      if (swatch) swatch.style.backgroundColor = `rgb(${numbers})`;
      if (valueEl) valueEl.textContent = `rgb(${numbers})`;
    }

    checkActiveTheme();
    updateApplyButton();
    updateSaveCustomThemeButton();
  }

  function updateApplyButton() {
    if (!applyButton || !draftState || !persistedState) return;
    const dirty = hasPendingChanges();
    applyButton.disabled = !dirty;
  }
  
  function updateSaveCustomThemeButton() {
      if (!saveCustomThemeButton || !draftState) return;
      const isCustomThemeMatch = activeThemeId && draftState.customThemes[activeThemeId];
      const isPresetMatch = activeThemeId && PRESET_THEMES[activeThemeId];
    
      const isDisabled = isCustomThemeMatch || isPresetMatch;
      saveCustomThemeButton.disabled = isDisabled;

      if (isDisabled && saveThemeContainer?.classList.contains('is-saving')) {
        closeSaveThemeForm();
      }
  }

  function applyTokensToDocument(tokens) {
    if (!tokens) return;
    const root = document?.documentElement;
    if (!root) return;
    const style = root.style;
    const resolved = deepClone(tokens);
    ensureCardBgDerivatives(resolved);
    const entries = {
      '--ext-card-fg-val': resolved['--ext-card-fg-val'],
      '--ext-card-bg-val': resolved['--ext-card-bg-val'],
      '--ext-card-bg-alpha': resolved['--ext-card-bg-alpha'],
      '--ext-card-bg': resolved['--ext-card-bg'],
      '--ext-el-bg': resolved['--ext-el-bg'],
      '--ext-highlight': resolved['--ext-highlight']
    };
    Object.entries(entries).forEach(([key, value]) => {
      if (value != null) style.setProperty(key, String(value));
    });
  }

  async function onApplyClicked() {
    if (!draftState || !applyButton) return;
    applyButton.disabled = true;
    applyButton.classList.add('is-saving');

    const snapshot = {
      activeColors: deepClone(draftState.activeColors),
      customThemes: deepClone(draftState.customThemes),
      featureFlags: sanitizeFeatureFlags(draftState.featureFlags)
    };
    ensureCardBgDerivatives(snapshot.activeColors);

    try {
      await writeStateToStorage(snapshot);
      persistedState = deepClone(snapshot);
      ensureFeatureFlags(persistedState);
      applyTokensToDocument(persistedState.activeColors);
      updateApplyButton();
    } catch (err) {
      console.error('Failed to persist theme state:', err);
      applyButton.disabled = false;
    } finally {
      applyButton.classList.remove('is-saving');
    }
  }
  
  function onSaveCustomThemeClicked() {
      if (!saveCustomThemeButton || saveCustomThemeButton.disabled || !saveThemeContainer) return;
      saveThemeContainer.classList.add('is-saving');
      newThemeNameInput?.focus();
  }

  function onSaveThemeFormSubmit(event) {
    event.preventDefault();
    if (!draftState) return;

    const newThemeLabel = newThemeNameInput?.value.trim() || 'My Custom Theme';

    const newThemeId = `custom${Date.now()}`;
    const tokens = deepClone(draftState.activeColors);
    ensureCardBgDerivatives(tokens);
    
    draftState.customThemes[newThemeId] = {
        label: newThemeLabel,
        tokens: tokens
    };
    
    activeThemeId = newThemeId;
    
    renderThemeButtons();
    checkActiveTheme();
    updateSaveCustomThemeButton();
    updateApplyButton();

    closeSaveThemeForm();
    if(newThemeNameInput) newThemeNameInput.value = '';
  }

  function closeSaveThemeForm() {
    if (!saveThemeContainer?.classList.contains('is-saving')) return;
    saveThemeContainer.classList.remove('is-saving');
    newThemeNameInput?.blur();
  }

  function onGlobalPointerDown(event) {
    if (!saveThemeContainer?.classList.contains('is-saving')) return;
    const target = event.target;
    if (!target) return;
    if (saveThemeForm?.contains(target)) return;
    closeSaveThemeForm();
  }

  function deleteCustomTheme(id) {
    delete draftState.customThemes[id];
    if (activeThemeId === id) {
        activeThemeId = null;
    }
    renderThemeButtons();
    checkActiveTheme();
    updateApplyButton();
    updateSaveCustomThemeButton();
  }

  function hasPendingChanges() {
    if (!persistedState || !draftState) return false;
    ensureFeatureFlags(persistedState);
    ensureFeatureFlags(draftState);
    
    if (!areColorSetsEqual(persistedState.activeColors, draftState.activeColors)) return true;
    
    const pThemes = persistedState.customThemes || {};
    const dThemes = draftState.customThemes || {};
    const pKeys = Object.keys(pThemes);
    const dKeys = Object.keys(dThemes);

    if (pKeys.length !== dKeys.length) return true;
    
    for (const key of dKeys) {
        if (!pThemes[key]) return true;
        if (pThemes[key].label !== dThemes[key].label) return true;
        if (!areColorSetsEqual(pThemes[key].tokens, dThemes[key].tokens)) return true;
    }

    if (!featureFlagsEqual(persistedState.featureFlags, draftState.featureFlags)) return true;
    
    return false;
  }

  function buildDefaultState() {
    return {
      activeColors: deepClone(PRESET_THEMES.defaultDark.tokens),
      customThemes: {},
      featureFlags: sanitizeFeatureFlags(DEFAULT_FEATURE_FLAGS)
    };
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj || {}));
  }
  
  function readStateFromStorage() {
    return new Promise((resolve, reject) => {
      if (!chrome?.storage?.sync?.get) {
        resolve(buildDefaultState());
        return;
      }
      chrome.storage.sync.get(STORAGE_KEY, (result) => {
        const err = chrome.runtime?.lastError;
        if (err) {
          reject(err);
          return;
        }
        const raw = result?.[STORAGE_KEY];
        if (!raw || typeof raw !== 'object') {
          resolve(buildDefaultState());
          return;
        }
        const sanitized = sanitizeState(raw);
        resolve(sanitized);
      });
    });
  }

  function writeStateToStorage(state) {
    return new Promise((resolve, reject) => {
      if (!chrome?.storage?.sync?.set) {
        resolve();
        return;
      }
      chrome.storage.sync.set({ [STORAGE_KEY]: state }, () => {
        const err = chrome.runtime?.lastError;
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  function filterCustom(value) {
    const clean = {};
    if (!value || typeof value !== 'object') return clean;
    Object.keys(DEFAULT_CUSTOM).forEach((key) => {
      if (value[key] != null) clean[key] = String(value[key]);
    });
    return clean;
  }

  function sanitizeState(raw) {
    const defaults = buildDefaultState();
    if (!raw || typeof raw !== 'object') {
      const oldActiveId = raw?.activeId;
      const oldCustom = raw?.custom;
      if (oldActiveId && oldActiveId !== CUSTOM_ID && PRESET_THEMES[oldActiveId]) {
         return {
          activeColors: deepClone(PRESET_THEMES[oldActiveId].tokens),
          customThemes: {},
          featureFlags: sanitizeFeatureFlags(defaults.featureFlags)
        };
      } else if (oldActiveId === CUSTOM_ID && oldCustom) {
         const activeColors = Object.assign({}, DEFAULT_CUSTOM, filterCustom(oldCustom));
         ensureCardBgDerivatives(activeColors);
         return { activeColors, customThemes: {}, featureFlags: sanitizeFeatureFlags(defaults.featureFlags) };
      }
      return buildDefaultState();
    }
    
    const rawActiveColors = raw.activeColors || raw.custom;
    const activeColors = Object.assign({}, defaults.activeColors, filterCustom(rawActiveColors));
    ensureCardBgDerivatives(activeColors);
    
    const customThemes = {};
    if (raw.customThemes && typeof raw.customThemes === 'object') {
        Object.entries(raw.customThemes).forEach(([id, theme]) => {
            if (typeof theme?.label === 'string' && theme.tokens && typeof theme.tokens === 'object') {
                const sanitizedTokens = Object.assign({}, DEFAULT_CUSTOM, filterCustom(theme.tokens));
                ensureCardBgDerivatives(sanitizedTokens);
                customThemes[id] = { label: theme.label, tokens: sanitizedTokens };
            }
        });
    }

    const featureFlags = sanitizeFeatureFlags(raw.featureFlags);

    return { activeColors, customThemes, featureFlags };
  }
  
  function ensureCardBgDerivatives(custom) {
    const base = custom['--ext-card-bg'] || colorToCss(custom['--ext-card-bg-val'], true, custom['--ext-card-bg-alpha']);
    const parsed = parseColor(base);
    if (!parsed) return;
    custom['--ext-card-bg-val'] = `${parsed.r}, ${parsed.g}, ${parsed.b}`;
    custom['--ext-card-bg-alpha'] = String(parsed.a ?? 1);
    custom['--ext-card-bg'] = `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${formatAlpha(parsed.a ?? 1)})`;
  }

  function hexToRgbSafe(hex) {
    const normalized = window.__extNormalizeHex?.(hex) || '#008cff';
    const fallback = { r: 0, g: 140, b: 255 };
    try {
      const rgb = window.__extHexToRgb?.(normalized);
      if (rgb) return rgb;
    } catch {}
    return fallback;
  }

  function getCustomColor(key) {
    if (!draftState || !draftState.activeColors) return DEFAULT_CUSTOM[key];
    return draftState.activeColors[key] ?? DEFAULT_CUSTOM[key];
  }

  function colorToCss(value, allowAlpha, alphaOverride) {
    if (!value) return allowAlpha ? 'rgba(0, 140, 255, 1)' : 'rgb(0, 140, 255)';
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.startsWith('rgb')) return trimmed;
      if (trimmed.includes(',')) {
        const numbers = numbersToArray(trimmed);
        if (numbers) {
          const alpha = allowAlpha ? clampAlpha(Number(alphaOverride ?? extractAlpha(trimmed))) : 1;
          return allowAlpha ? `rgba(${numbers.join(', ')}, ${alpha.toFixed(alpha === 1 ? 0 : 2)})` : `rgb(${numbers.join(', ')})`;
        }
      }
      const normalized = window.__extNormalizeHex?.(trimmed);
      if (normalized) {
        const rgb = window.__extHexToRgb?.(normalized);
        if (rgb) {
          const alpha = allowAlpha ? clampAlpha(Number(alphaOverride ?? 1)) : 1;
          return allowAlpha ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})` : `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        }
      }
    }
    const parsed = parseColor(value);
    if (!parsed) return allowAlpha ? 'rgba(0, 140, 255, 1)' : 'rgb(0, 140, 255)';
    const alpha = allowAlpha ? clampAlpha(parsed.a ?? Number(alphaOverride ?? 1)) : 1;
    return allowAlpha ? `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${formatAlpha(alpha)})` : `rgb(${parsed.r}, ${parsed.g}, ${parsed.b})`;
  }

  function toHexAndAlpha(value) {
    const parsed = parseColor(value);
    if (!parsed) {
      return { hex: '#008cff', alpha: 1 };
    }
    const hex = window.__extRgbToHex?.(parsed.r, parsed.g, parsed.b) || '#008cff';
    return { hex, alpha: parsed.a ?? 1 };
  }

  function normalizeAlphaPayload(payload) {
    if (typeof payload === 'string') {
      const rgb = hexToRgbSafe(payload);
      return {
        rgba: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`,
        rgb,
        alpha: 1
      };
    }
    const rgb = payload?.rgb || hexToRgbSafe(payload?.hex);
    const alpha = clampAlpha(typeof payload?.alpha === 'number' ? payload.alpha : parseFloat(payload?.rgba?.match(/rgba?\([^)]*,[^)]*,[^)]*,\s*([0-9.]+)/)?.[1] ?? '1'));
    const rgba = payload?.rgba || `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${formatAlpha(alpha)})`;
    return { rgba, rgb, alpha };
  }

  function formatColorDisplay(key, value) {
    const parsed = parseColor(value);
    if (!parsed) return String(value || '');
    if (key === '--ext-card-bg' || key === '--ext-el-bg') {
      return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${formatAlpha(parsed.a ?? 1)})`;
    }
    return `rgb(${parsed.r}, ${parsed.g}, ${parsed.b})`;
  }

  function parseColor(value) {
    if (value == null) return null;
    if (typeof value === 'object' && typeof value.r === 'number' && typeof value.g === 'number' && typeof value.b === 'number') {
      return { r: clampChannel(value.r), g: clampChannel(value.g), b: clampChannel(value.b), a: value.a != null ? clampAlpha(value.a) : 1 };
    }
    const str = String(value).trim();
    const hex = window.__extNormalizeHex?.(str);
    if (hex) {
      const rgb = window.__extHexToRgb?.(hex);
      if (rgb) return { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 };
    }
    const rgbaMatch = str.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\)/i);
    if (rgbaMatch) {
      const [, r, g, b, a] = rgbaMatch;
      return {
        r: clampChannel(Number(r)),
        g: clampChannel(Number(g)),
        b: clampChannel(Number(b)),
        a: clampAlpha(a != null ? Number(a) : 1)
      };
    }
    const nums = numbersToArray(str);
    if (nums) {
      const alpha = extractAlpha(str);
      return { r: nums[0], g: nums[1], b: nums[2], a: clampAlpha(alpha ?? 1) };
    }
    return null;
  }

  function numbersToArray(value) {
    if (typeof value !== 'string') return null;
    const matches = value.match(/\d+(?:\.\d+)?/g);
    if (!matches || matches.length < 3) return null;
    return matches.slice(0, 3).map((n) => clampChannel(Number(n)));
  }

  function numbersToColor(value, includeAlpha) {
    const arr = numbersToArray(String(value || ''));
    if (!arr) return null;
    if (includeAlpha) {
      return `rgba(${arr[0]}, ${arr[1]}, ${arr[2]}, 1)`;
    }
    return `rgb(${arr[0]}, ${arr[1]}, ${arr[2]})`;
  }

  function numbersToBorder(value) {
    const arr = numbersToArray(String(value || ''));
    if (!arr) return null;
    return `rgba(${arr[0]}, ${arr[1]}, ${arr[2]}, 0.4)`;
  }

  function extractAlpha(value) {
    const match = String(value || '').match(/rgba?\([^)]*,[^)]*,[^)]*,\s*([0-9.]+)/i);
    if (match) return clampAlpha(Number(match[1]));
    return null;
  }

  function clampChannel(v) {
    if (!Number.isFinite(v)) return 0;
    return Math.min(255, Math.max(0, Math.round(v)));
  }

  function clampAlpha(v) {
    if (!Number.isFinite(v)) return 1;
    if (v > 1 && v <= 100) {
      return Math.min(1, Math.max(0, v / 100));
    }
    return Math.min(1, Math.max(0, v));
  }

  function formatAlpha(a) {
    if (a === 1) return '1';
    return a.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  function colorValuesEqual(a, b, key) {
    if (a == null && b == null) return true;
    const aStr = String(a ?? '');
    const bStr = String(b ?? '');
    if (aStr === bStr) return true;
    if (key === '--ext-card-bg-alpha') {
      const aNum = clampAlpha(parseFloat(aStr));
      const bNum = clampAlpha(parseFloat(bStr));
      if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) return false;
      return Math.abs(aNum - bNum) < 0.005;
    }

    const parsedA = parseColor(aStr);
    const parsedB = parseColor(bStr);
    if (!parsedA || !parsedB) return false;
    const sameRGB = parsedA.r === parsedB.r && parsedA.g === parsedB.g && parsedA.b === parsedB.b;
    if (!sameRGB) return false;
    if (key === '--ext-card-bg' || key === '--ext-el-bg' || key === '--ext-card-bg-alpha') {
      return Math.abs((parsedA.a ?? 1) - (parsedB.a ?? 1)) < 0.005;
    }
    return true;
  }
})();
