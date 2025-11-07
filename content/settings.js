// === EXT SETTINGS PANEL (extracted) ===
(() => {

  function ensureSettingsPanel() {
    const btn = document.querySelector('.ext-settings-button');
    const menu = document.querySelector('.ext-settings-menu');
    const context = menu ? menu.querySelector('.ext-settings-menu__content') : null;

    return { button: btn || null, menu: menu || null, mount: context || null };
  }
    
  function renderProxies(container) {
    container.innerHTML = '';

    let toggleIdCounter = 0;
    const toNodeArray = (content) => {
      if (content == null) return [];
      if (Array.isArray(content)) {
        return content.flatMap(toNodeArray);
      }
      if (content instanceof Node) {
        return [content];
      }
      return [document.createTextNode(String(content))];
    };
    const mkToggleRow = (labelContent, inputEl, options = {}) => {
      const row = document.createElement('div');
      row.className = 'settings-popup__item settings-popup__item--toggle';

      const id = inputEl.id || `ext-setting-toggle-${++toggleIdCounter}`;
      inputEl.id = id;

      const labelEl = document.createElement('label');
      labelEl.className = 'settings-popup__label';
      labelEl.setAttribute('for', id);
      const labelId = `${id}-label`;
      labelEl.id = labelId;
      toNodeArray(labelContent).forEach(node => labelEl.appendChild(node));

      inputEl.setAttribute('aria-labelledby', labelId);
      const describedBy = options.describedBy || options.descriptionId;
      if (describedBy) {
        inputEl.setAttribute('aria-describedby', describedBy);
      }

      const toggle = document.createElement('label');
      toggle.className = 'toggle-switch';
      toggle.setAttribute('for', id);
      const slider = document.createElement('span');
      slider.className = 'toggle-switch__slider';
      slider.setAttribute('aria-hidden', 'true');
      toggle.appendChild(inputEl);
      toggle.appendChild(slider);

      row.appendChild(toggle);
      row.appendChild(labelEl);

      if (options.rowClassName) {
        row.classList.add(options.rowClassName);
      }

      return row;
    };
    const mkRow = (labelContent, inputEl, options) => mkToggleRow(labelContent, inputEl, options);

    function isLPFullscreen() {
      const fs = document.fullscreenElement;
      return !!(fs && (fs.matches?.('.location-preview__panorama') || fs.closest?.('.location-preview__panorama')));
    }

    if (isLPFullscreen()) {
      const section = document.createElement('fieldset');
      section.className = 'settings-popup__section';
      section.innerHTML = '<legend class="fieldset__header">Street View<span class="fieldset__divider"></span></legend>';
      section.style.border = 'none';

      const mkLPRow = (key, label) => {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        const on = (() => { try { return localStorage.getItem(key) === 'true'; } catch { return false; } })();
        cb.checked = on;

        cb.addEventListener('click', e => e.stopPropagation(), true);

        cb.addEventListener('change', () => {
          try { localStorage.setItem(key, cb.checked ? 'true' : 'false'); } catch {}
          try {
            window.dispatchEvent(new StorageEvent('storage', {
              key,
              oldValue: (!cb.checked).toString(),
              newValue: cb.checked.toString(),
              storageArea: localStorage
            }));
          } catch {}
        }, true);

        return mkRow(label, cb);
      };

      section.appendChild(mkLPRow('hideCar', 'Hide car'));
      section.appendChild(mkLPRow('showCrosshair', 'Show crosshair'));

      container.appendChild(section);
      return;
    }

    const stop = (e) => { e.stopPropagation(); };

    const readJSON = (key, def) => {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? def : JSON.parse(raw);
      } catch { return def; }
    };
    const writeJSON = (key, val) => {
      const before = localStorage.getItem(key);
      const after = JSON.stringify(val);
      if (before === after) return;
      try { localStorage.setItem(key, after); } catch {}
      try {
        window.dispatchEvent(new StorageEvent('storage', { key, oldValue: before, newValue: after, storageArea: localStorage }));
      } catch {}
      try { window.dispatchEvent(new CustomEvent('ext:setting', { detail: { key, value: val }})); } catch {}
    };
    const normalizeAutoSaveValue = (value) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return -1;
      if (num === -1) return -1;
      if (num <= 0) return -1;
      return Math.max(1, Math.round(num));
    };

    function getMapStyleCookie() {
      const name = 'mapstyle=';
      const decodedCookie = decodeURIComponent(document.cookie);
      const ca = decodedCookie.split(';');
      for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') {
          c = c.substring(1);
        }
        if (c.indexOf(name) === 0) {
          return c.substring(name.length, c.length);
        }
      }
      return 'default';
    }
    
    async function setMapStyleCookie(styleName) {
      const expiry = 60 * 60 * 24 * 365;
      document.cookie = `mapstyle=${styleName}; path=/; max-age=${expiry}`;
      let ok = false;
      try { ok = await window.__extNotify('Map style updated', 'Reload now to see the changes?', 'confirm', { confirmText: 'Reload', cancelText: 'Later' }); } catch {}
      if (ok) { try { location.reload(); } catch {} }
    }

    (() => {
      const baseMap = document.createElement('fieldset');
      baseMap.className = 'fieldset';
      baseMap.innerHTML = '<legend class="fieldset__header">Base map<span class="fieldset__divider"></span></legend>';
      const wrap = document.createElement('div');
      wrap.className = 'settings-popup__item settings-popup__select';
      const GROUP = 'ext-mapstyle';
      const OPTIONS = [
        { value: 'roadmap',  text: 'Map' },
        { value: 'satellite',text: 'Satellite' },
        { value: 'osm',      text: 'OSM' },
      ];
      const findSource = () => document.querySelector('.embed-controls__control .map-type-control__basemap');
      const readFromSource = () => {
        const src = findSource(); if (!src) return null;
        const btns = src.querySelectorAll('button[role="radio"]');
        for (let i = 0; i < btns.length; i++) {
          if (btns[i].getAttribute('aria-checked') === 'true' || btns[i].dataset.state === 'on') {
            return OPTIONS[i]?.value ?? null;
          }
        }
        return null;
      };
      const forwardToSource = (value) => {
        const src = findSource(); if (!src) return;
        const idx = OPTIONS.findIndex(o => o.value === value);
        const btn = src.querySelectorAll('button[role="radio"]')[idx];
        if (btn) btn.click();
      };
      const radios = OPTIONS.map(opt => {
        const r = document.createElement('input');
        r.type = 'radio'; r.name = GROUP; r.value = opt.value; r.id = `ext-mapstyle-${opt.value}`;
        r.addEventListener('click', stop, true);
        r.addEventListener('change', () => { if (r.checked) forwardToSource(opt.value); }, true);
        const l = document.createElement('label');
        l.setAttribute('for', r.id); l.textContent = opt.text; l.style.marginRight = '12px';
        wrap.appendChild(r); wrap.appendChild(l);
        return r;
      });
      const syncFromSource = () => {
        const val = readFromSource(); if (!val) return;
        radios.forEach(r => { r.checked = (r.value === val); });
      };
      let srcObserver = null;
      const bindSourceObserver = () => {
        const src = findSource(); if (!src || srcObserver) return;
        const btns = src.querySelectorAll('button[role="radio"]');
        srcObserver = new MutationObserver(syncFromSource);
        btns.forEach(b => srcObserver.observe(b, { attributes: true, attributeFilter: ['aria-checked', 'data-state'] }));
        const srcHost = src.closest('.embed-controls__control');
        if (srcHost) {
          srcHost.setAttribute('data-ext-hidden-source', 'true');
          srcHost.style.display = 'none';
        }
        syncFromSource();
      };
      if (!findSource()) {
        let mo;
        const handleMount = () => {
          if (findSource()) {
            bindSourceObserver();
            try { mo?.disconnect(); } catch {}
          }
        };
        const panoAwareMount = window.__extCreatePanoAwareRunner ? window.__extCreatePanoAwareRunner(handleMount) : handleMount;
        mo = new MutationObserver(panoAwareMount);
        mo.observe(document.documentElement, { childList: true, subtree: true });
      } else {
        bindSourceObserver();
      }
      syncFromSource();
      baseMap.appendChild(wrap);
      container.appendChild(baseMap);
    })();

    const fsMapStyles = document.createElement('fieldset');
    fsMapStyles.className = 'fieldset';
    fsMapStyles.innerHTML = '<legend class="fieldset__header">Map styles<span class="fieldset__divider"></span></legend>';
    container.appendChild(fsMapStyles);

    (async () => {
      const currentStyle = getMapStyleCookie();

      let allStyles = [
        { name: 'Default', value: 'default', style: null },
        { name: 'Dark mode', value: 'darkMode', style: null }
      ];

      try {
        const response = await fetch('https://map-making.app/api/map-styles');
        if (response.ok) {
          const customStyles = await response.json();
          if (Array.isArray(customStyles)) {
            const formattedCustomStyles = customStyles.map(s => ({
              name: s.name,
              value: s.name,
              style: s.style || null,
            }));
            allStyles = allStyles.concat(formattedCustomStyles);
          }
        } else {
          console.warn('Failed to fetch custom map styles:', response.statusText);
        }
      } catch (error) {
        console.error('Error fetching custom map styles:', error);
      }

      const hex = s => (typeof s === 'string' ? s.trim() : '');
      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
      const hexToRgb = (h) => {
        const m = hex(h).match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
        if (!m) return null;
        return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
      };
      const relativeLuminance = (rgb) => {
        const f = (c) => {
          c /= 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b);
      };
      const bestFgForBg = (bgHex) => {
        const rgb = hexToRgb(bgHex);
        if (!rgb) return '#000000';
        const L = relativeLuminance(rgb);
        return L > 0.5 ? '#000000' : '#ffffff';
      };
      const parseColorsFromStyle = (styleStr) => {
        if (!styleStr || typeof styleStr !== 'string') return { bg: null, fg: null };
        const rules = styleStr.split(',').map(s => s.trim()).filter(Boolean);
        let bg = null, fg = null;
        for (const rule of rules) {
          const parts = rule.split('|').map(s => s.trim());
          const kv = Object.create(null);
          parts.forEach(p => {
            const idx = p.indexOf(':');
            if (idx > 0) kv[p.slice(0, idx)] = p.slice(idx + 1);
          });
          const hasSubtype = ('s.t' in kv);
          const sel = kv['s.e'];
          const color = kv['p.c'];
          if (!hasSubtype && color) {
            if (!bg && (sel === 'g' || sel === 'g.f' || sel === 'g.s')) bg = color;
            if (!fg && (sel === 'l.t.f' || sel === 'l.t')) fg = color;
          }
          if (bg && fg) break;
        }
        if (bg && !fg) fg = bestFgForBg(bg);
        return { bg: bg || null, fg: fg || null };
      };

      const wrap = document.createElement('div');
      wrap.className = 'settings-popup__item settings-popup__select';

      const label = document.createElement('span');
      label.textContent = 'Map style: ';

      const trigger = document.createElement('button');
      trigger.className = 'settings-style__trigger';
      const triggerText = document.createElement('span');

      const reloadLabel = document.createElement('label');
      reloadLabel.className = 'settings-style__label';
      reloadLabel.textContent = 'Requires reload! (for now, sorry)';

      const resolveColorsFor = (entry) => {
        if (!entry) return { bg: '#ffffff', fg: '#000000' };
        if (entry.value === 'default') return {bg: '#6dd2e7', fg:'#000000'};
        if (entry.value === 'darkMode') return {bg: '#17263c', fg:'#d59563'};
        const c = parseColorsFromStyle(entry.style);
        const bg = c.bg || '#ffffff';
        const fg = c.fg || bestFgForBg(bg);
        return { bg, fg };
      };

      const updateTriggerAppearance = () => {
        const cur = allStyles.find(s => s.value === getMapStyleCookie()) || allStyles[0];
        const { bg, fg } = resolveColorsFor(cur);
        triggerText.textContent = cur?.name || 'Default';
        trigger.style.setProperty('background', bg || '#fff', 'important');
        trigger.style.setProperty('color', fg || '#000', 'important');
      };

      const stopMouseDown = (e) => { e.stopPropagation(); };

      trigger.appendChild(triggerText);
      updateTriggerAppearance();

      wrap.appendChild(label);
      wrap.appendChild(trigger);
      fsMapStyles.appendChild(reloadLabel);
      fsMapStyles.appendChild(wrap);

      let dropdown = null;

      const closeDropdown = () => {
        if (dropdown && dropdown.parentNode) dropdown.remove();
        dropdown = null;
        document.removeEventListener('mousedown', onDocDown, true);
      };
      const onDocDown = (e) => {
        if (dropdown && !dropdown.contains(e.target) && !trigger.contains(e.target)) closeDropdown();
      };

      const mkItem = (entry) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ext-style-dropdown__item';
        const { bg, fg } = resolveColorsFor(entry);
        btn.style.setProperty('background', bg, 'important');
        btn.style.setProperty('color', fg, 'important');

        const name = document.createElement('span');
        name.textContent = entry.name;
        btn.appendChild(name);

        btn.addEventListener('click', () => {
          setMapStyleCookie(entry.value);
          updateTriggerAppearance();
          closeDropdown();
        });
        return btn;
      };

      trigger.addEventListener('mousedown', stopMouseDown, true);
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dropdown) { closeDropdown(); return; }
        dropdown = document.createElement('div');
        dropdown.className = 'ext-sorter-dropdown';
        dropdown.addEventListener('mousedown', stopMouseDown, true);
        const header = document.createElement('div');
        header.textContent = 'Map Style';
        header.className = 'ext-style-dropdown__header';
        dropdown.appendChild(header);

        allStyles.forEach(entry => dropdown.appendChild(mkItem(entry)));
        document.body.appendChild(dropdown);
        try { window.__extFloatingPopup.positionBox(trigger, dropdown, { minWidth: 220, maxHeight: 420 }); } catch {}
        setTimeout(() => document.addEventListener('mousedown', onDocDown, true), 0);
      }, true);

    })().catch(err => console.error('Failed to build map style settings:', err));

    // --- Map behaviour ---
    const fsBehaviour = document.createElement('fieldset');
    fsBehaviour.className = 'fieldset';
    fsBehaviour.innerHTML = '<legend class="fieldset__header">Map behaviour <span class="fieldset__divider"></span></legend>';

    (() => {
      const key = 'previewWindow';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!readJSON(key, false);
      input.addEventListener('click', stop, true);
      input.addEventListener('change', () => writeJSON(key, !!input.checked), true);
      fsBehaviour.appendChild(mkRow('Show location previews when hovering the map', input));
    })();

      // --- Map behaviour ---
    const fsFunctionality = document.createElement('fieldset');
    fsFunctionality.className = 'fieldset';
    fsFunctionality.innerHTML = '<legend class="fieldset__header">Site functionaity <span class="fieldset__divider"></span></legend>';

    (() => {
      const key = 'autoSave';
      const sel = document.createElement('select');
      sel.innerHTML = [
        '<option value=-1>Off</option>',
        '<option value=30>30 seconds</option>',
        '<option value=60>1 minute</option>',
        '<option value=300>5 minutes</option>',
        '<option value=900>15 minutes</option>'
      ].join('');
      const storedRaw = readJSON(key, -1);
      const normalized = normalizeAutoSaveValue(storedRaw);
      if (normalized !== storedRaw) {
        writeJSON(key, normalized);
      }
      sel.value = String(normalized);
      sel.addEventListener('click', stop, true);
      sel.addEventListener('change', () => {
        const nextVal = normalizeAutoSaveValue(sel.value);
        writeJSON(key, nextVal);
      }, true);
      const wrap = document.createElement('div');
      wrap.className = 'settings-popup__item settings-popup__select';
      wrap.appendChild(document.createTextNode('Autosave: '));
      wrap.appendChild(sel);
      fsFunctionality.appendChild(wrap);
    })();

    // --- Selecting new locations ---
    const fsSelecting = document.createElement('fieldset');
    fsSelecting.className = 'fieldset';
    fsSelecting.innerHTML = '<legend class="fieldset__header">Selecting new locations <span class="fieldset__divider"></span></legend>';

    (() => {
      const key = 'pointAlongRoad';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!readJSON(key, false);
      input.addEventListener('click', stop, true);
      input.addEventListener('change', () => {
        writeJSON(key, !!input.checked);
        try { window.dispatchEvent(new CustomEvent('ext:map:updateSettings', { detail: { [key]: !!input.checked } })); } catch {}
      }, true);
      fsSelecting.appendChild(mkRow('Point view along the road by default', input));
    })();

    (() => {
      const depKey = 'pointAlongRoad';
      const selKey = 'preferDirection';
      const wrap = document.createElement('div');
      wrap.className = 'settings-popup__item settings-popup__select';
      const label = document.createElement('span');
      label.textContent = 'Direction: ';
      const sel = document.createElement('select');
      sel.innerHTML = [
        '<option value="">None</option>',
        '<option value="forwards">Forwards</option>',
        '<option value="backwards">Backwards</option>',
        '<option value="north">Most Northern</option>',
        '<option value="east">Most Eastern</option>',
        '<option value="south">Most Southern</option>',
        '<option value="west">Most Western</option>',
        '<option value="random">Random</option>'
      ].join('');
      const cur = readJSON(selKey, null);
      sel.value = cur == null ? '' : String(cur);
      const syncVis = () => {
        const on = !!readJSON(depKey, false);
        wrap.style.display = on ? '' : 'none';
      };
      syncVis();
      sel.addEventListener('click', stop, true);
      sel.addEventListener('change', () => {
        const val = sel.value || null;
        writeJSON(selKey, val);
        try { window.dispatchEvent(new CustomEvent('ext:map:updateSettings', { detail: { [selKey]: val } })); } catch {}
      }, true);
      wrap.appendChild(label); wrap.appendChild(sel);
      fsSelecting.appendChild(wrap);
      window.addEventListener('storage', (ev) => {
        if (ev && ev.key === depKey) syncVis();
      });
    })();

    (() => {
      const key = 'preferOfficial';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!readJSON(key, false);
      input.addEventListener('click', stop, true);
      input.addEventListener('change', () => {
        writeJSON(key, !!input.checked);
        try { window.dispatchEvent(new CustomEvent('ext:map:updateSettings', { detail: { [key]: !!input.checked } })); } catch {}
      }, true);
      fsSelecting.appendChild(mkRow('Prefer official coverage over unofficial', input));
    })();

    (() => {
      const key = 'cameraTypes';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = readJSON(key, null) != null;
      input.addEventListener('click', stop, true);
      input.addEventListener('change', () => {
        const on = !!input.checked;
        writeJSON(key, on ? '__EXT_ED__' : null);
        try {
          window.dispatchEvent(new CustomEvent('ext:map:updateSettings', { detail: { preferHigherQuality: on } }));
        } catch {}
      }, true);
      fsSelecting.appendChild(mkRow('Prefer higher quality over newer images', input));
    })();

    (() => {
      const key = 'onlyOfficial';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!readJSON(key, false);
      input.addEventListener('click', stop, true);
      input.addEventListener('change', () => {
        writeJSON(key, !!input.checked);
        try { window.dispatchEvent(new CustomEvent('ext:map:updateSettings', { detail: { [key]: !!input.checked } })); } catch {}
      }, true);
      fsSelecting.appendChild(mkRow('Disallow unofficial coverage', input));
    })();

    (() => {
      const key = 'defaultPanoId';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!readJSON(key, false);
      input.addEventListener('click', stop, true);
      input.addEventListener('change', () => {
        writeJSON(key, !!input.checked);
        try { window.dispatchEvent(new CustomEvent('ext:map:updateSettings', { detail: { [key]: !!input.checked } })); } catch {}
      }, true);
      const a = document.createElement('a');
      a.href = '/manual/location.html#image-date';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Pano ID';
      const row = mkRow(['Use ', a, ' locations by default'], input);
      fsSelecting.appendChild(row);
    })();

    // --- Display ---
    const fsDisplay = document.createElement('fieldset');
    fsDisplay.className = 'fieldset';
    fsDisplay.innerHTML = '<legend class="fieldset__header">Display <span class="fieldset__divider"></span></legend>';

    (() => {
      const key = 'markerStyle';
      const sel = document.createElement('select');
      sel.innerHTML = [
        '<option value="pin">Pin</option>',
        '<option value="arrow">Arrow</option>',
        '<option value="circle">Circle</option>'
      ].join('');
      sel.value = String(readJSON(key, 'pin'));
      sel.addEventListener('click', stop, true);
      sel.addEventListener('change', () => writeJSON(key, sel.value), true);
      const wrap = document.createElement('div');
      wrap.className = 'settings-popup__item settings-popup__select';
      wrap.appendChild(document.createTextNode('Marker style: '));
      wrap.appendChild(sel);
      fsDisplay.appendChild(wrap);
    })();

    (() => {
      const key = 'perfectScoreCircle';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!readJSON(key, false);
      input.addEventListener('click', stop, true);
      input.addEventListener('change', () => writeJSON(key, !!input.checked), true);
      fsDisplay.appendChild(mkRow('Display 5K radius', input));
    })();

    (() => {
      const key = 'mapBoldCountryBorders';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!readJSON(key, false);
      input.addEventListener('click', stop, true);
      input.addEventListener('change', () => writeJSON(key, !!input.checked), true);
      fsDisplay.appendChild(mkRow('Emphasise country borders', input));
    })();

    (() => {
      const key = 'mapBoldSubdivisionBorders';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!readJSON(key, false);
      input.addEventListener('click', stop, true);
      input.addEventListener('change', () => writeJSON(key, !!input.checked), true);
      fsDisplay.appendChild(mkRow('Emphasise subdivision borders', input));
    })();

    // --- Street View layer ---
    const fsSV = document.createElement('fieldset');
    fsSV.className = 'fieldset';
    fsSV.innerHTML = '<legend class="fieldset__header">Street View layer <span class="fieldset__divider"></span></legend>';

    (() => {
      const key = 'svPanoramas';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!readJSON(key, false);
      input.addEventListener('click', stop, true);
      input.addEventListener('change', () => writeJSON(key, !!input.checked), true);
      fsSV.appendChild(mkRow('Show panorama dots on the map', input));
    })();

    (() => {
      const key = 'svBlobby';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!readJSON(key, false);
      input.addEventListener('click', stop, true);
      input.addEventListener('change', () => writeJSON(key, !!input.checked), true);
      fsSV.appendChild(mkRow('Use blobby layer while zoomed out', input));
    })();

    (() => {
      const key = 'svType';
      const sel = document.createElement('select');
      sel.innerHTML = [
        '<option value="official">Official</option>',
        '<option value="unofficial">Unofficial</option>',
        '<option value="default">All</option>'
      ].join('');
      const normalize = (v) => (typeof v === 'string' ? v.toLowerCase() : 'official');
      let cur = normalize(readJSON(key, 'official'));
      if (!['official','unofficial','default'].includes(cur)) cur = 'official';
      sel.value = cur;
      sel.addEventListener('click', stop, true);
      sel.addEventListener('change', () => writeJSON(key, sel.value), true);
      const wrap = document.createElement('div');
      wrap.className = 'settings-popup__item settings-popup__select';
      wrap.appendChild(document.createTextNode('Coverage shown: '));
      wrap.appendChild(sel);
      fsSV.appendChild(wrap);
    })();

    (() => {
      const key = 'svResolution';
      const sel = document.createElement('select');
      sel.innerHTML = [
        '<option value="default">Default</option>',
        '<option value="high">Thin</option>'
      ].join('');
      sel.value = String(readJSON(key, 'default'));
      sel.addEventListener('click', stop, true);
      sel.addEventListener('change', () => writeJSON(key, sel.value), true);
      const wrap = document.createElement('div');
      wrap.className = 'settings-popup__item settings-popup__select';
      wrap.appendChild(document.createTextNode('Line thickness: '));
      wrap.appendChild(sel);
      fsSV.appendChild(wrap);
    })();

    (() => {
      const KEY = 'svColor';
      const DEFAULT_HEX = '#129eaf';
      const EXT_PREFIX = 'ext-';
      const BUILTIN_NAMES = ['red', 'pink', 'purple', 'violet', 'indigo', 'blue', 'cyan', 'teal', 'green', 'lime', 'yellow', 'orange', 'choco'];

      const TOKEN_RE = /^ext-[0-9a-f]{6}$/i;
      const NAME_RE = /^[a-z]+$/i;

      const tokenFromHex = (hex) => `${EXT_PREFIX}${hex.replace('#','').toLowerCase()}`;
      const hexFromToken = (tok) => TOKEN_RE.test(tok) ? `#${tok.slice(EXT_PREFIX.length)}` : null;

      const CSS_ROOT = document.body || document.documentElement;
      const CSS = getComputedStyle(CSS_ROOT);
      const BUILTIN_HEX = new Map();
      for (const name of BUILTIN_NAMES) {
        const cssVal = CSS.getPropertyValue(`--${name}-7`);
        const hex = __extRgbStringToHex(cssVal);
        if (hex) BUILTIN_HEX.set(name, hex.toLowerCase());
      }

      const normalizeToHex = (val) => {
        if (typeof val !== 'string') return DEFAULT_HEX;
        const s = val.trim();
        const normalizedHex = __extNormalizeHex(s);
        if (normalizedHex) return normalizedHex;
        if (TOKEN_RE.test(s)) return hexFromToken(s);
        if (NAME_RE.test(s)) {
          const h = BUILTIN_HEX.get(s.toLowerCase());
          if (h) return h;
        }
        return DEFAULT_HEX;
      };

      const deriveStrokeHexFromCoreHex = (coreHex) => {
        const rgb = __extHexToRgb(coreHex);
        if (!rgb) return coreHex;
        const fill = __extRgbToHsl(rgb.r, rgb.g, rgb.b);
        const strokeH = fill.h;
        const strokeS = Math.max(0, Math.min(1, fill.s * 0.75));
        const strokeL = 0.75;
        const out = __extHslToRgb(strokeH, strokeS, strokeL);
        return __extRgbToHex(out.r, out.g, out.b);
      };

      const setVarIfDiff = (name, value) => {
        if (CSS_ROOT.style.getPropertyValue(name) !== value) {
          CSS_ROOT.style.setProperty(name, value);
        }
      };
      const clearTokenVars = (tok) => {
        if (!tok) return;
        try {
          CSS_ROOT.style.removeProperty(`--${tok}-7`);
          CSS_ROOT.style.removeProperty(`--${tok}-2`);
        } catch {}
      };
      const applyVarsForHex = (coreHex, maybeToken) => {
        const token = (maybeToken && TOKEN_RE.test(maybeToken)) ? maybeToken : tokenFromHex(coreHex);
        setVarIfDiff(`--${token}-7`, coreHex);
        setVarIfDiff(`--${token}-2`, deriveStrokeHexFromCoreHex(coreHex));
        return token;
      };

      const resolveBuiltinNameForHex = (hex) => {
        const lc = hex.toLowerCase();
        for (const [name, h] of BUILTIN_HEX) {
          if (h === lc) return name;
        }
        return null;
      };

      // --- DOM build: row shows "Street View color: <swatch> <reset>" ---------
      const frag = document.createDocumentFragment();
      const wrap = document.createElement('div');
      wrap.className = 'settings-popup__item settings-popup__select';

      const label = document.createElement('span');
      label.textContent = 'Street View color: ';

      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '8px';
      row.style.alignItems = 'center';

      const swatchBtn = document.createElement('button');
      swatchBtn.type = 'button';
      swatchBtn.className = 'ext-sv-swatch';
      swatchBtn.setAttribute('aria-label', 'Change Street View color');

      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.title = 'Reset Street View color to the default';
      resetBtn.className = 'reset-btn icon-button';
      resetBtn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 6V2L7 7l5 5V8c2.76 0 5 2.24 5 5 0 2.76-2.24 5-5 5-1.38 0-2.63-.56-3.54-1.46 l-1.42 1.42C8.27 19.37 10.02 20 12 20 c3.87 0 7-3.13 7-7s-3.13-7-7-7z"/></svg>';

      row.append(swatchBtn, resetBtn);
      wrap.append(label, row);
      frag.appendChild(wrap);

      // --- state init ---------------------------------------------------------
      const readJSON = (key, def) => {
        try {
          const raw = localStorage.getItem(key);
          return raw === null ? def : JSON.parse(raw);
        } catch { return def; }
      };
      const writeJSON = (key, val) => {
        const before = localStorage.getItem(key);
        const after = JSON.stringify(val);
        if (before === after) return;
        try { localStorage.setItem(key, after); } catch {}
        try {
          window.dispatchEvent(new StorageEvent('storage', { key, oldValue: before, newValue: after, storageArea: localStorage }));
        } catch {}
        try {
          window.dispatchEvent(new CustomEvent('ext:setting', { detail: { key, value: val }}));
        } catch {}
      };

      const curRaw = String(readJSON(KEY, 'cyan'));
      const storedHex = TOKEN_RE.test(curRaw) ? (localStorage.getItem('svColorHex') || hexFromToken(curRaw)) : null;
      let currentHex = normalizeToHex(storedHex || curRaw) || DEFAULT_HEX;
      let lastCustomToken = (TOKEN_RE.test(curRaw) ? curRaw : null);

      if (TOKEN_RE.test(curRaw)) {
        applyVarsForHex(currentHex, curRaw);
      }
      swatchBtn.setAttribute('style', `background-color: ${currentHex} !important`);

      // --- save pipeline (shared) --------------------------------------------
      let lastSaved = null;
      const saveHex = (nextHex) => {
        const v = normalizeToHex(nextHex);
        if (!v || v === lastSaved) return;

        swatchBtn.setAttribute('style', `background-color: ${v} !important`);

        const builtin = resolveBuiltinNameForHex(v);
        if (builtin) {
          if (lastCustomToken) {
            clearTokenVars(lastCustomToken);
            lastCustomToken = null;
          }
          writeJSON(KEY, builtin);
          try {
            window.dispatchEvent(new CustomEvent('ext:map:updateSettings', { detail: { [KEY]: builtin } }));
          } catch {}
          lastSaved = v;
          return;
        }

        const newTok = tokenFromHex(v);
        if (lastCustomToken && lastCustomToken !== newTok) clearTokenVars(lastCustomToken);
        const tok = applyVarsForHex(v);
        lastCustomToken = tok;
        writeJSON(KEY, tok);
        try { localStorage.setItem('svColorHex', v); } catch {}
        try {
          window.dispatchEvent(new CustomEvent('ext:map:updateSettings', { detail: { [KEY]: tok } }));
        } catch {}
        lastSaved = v;
      };

      // --- Popup using default hex input + swatch from colorpicker.js ---------
      let popupWrapper = null;
      let removeGuard = null;
      let pickerRef = null;

      const closePopup = () => {
        try { document.removeEventListener('keydown', onKey, true); } catch {}
        try { removeGuard && removeGuard(); removeGuard = null; } catch {}
        try { pickerRef?.api?.destroy?.(); } catch {}
        try { popupWrapper && popupWrapper.remove(); popupWrapper = null; } catch {}
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); closePopup(); }
      };

      const openPopup = () => {
        try { document.querySelectorAll('.sv-color-editor-wrapper').forEach(n => n.remove()); } catch {}

        const menuRoot = document.body || document.documentElement;

        popupWrapper = document.createElement('div');
        popupWrapper.className = 'sv-color-editor-wrapper';
        Object.assign(popupWrapper.style, { left: '0px', top: '0px', width: '190px' });
        const gradientFor = (hex) => `linear-gradient(to bottom right, ${hex}cd -25%, var(--ext-card-bg) 70%)`;

        const panel = document.createElement('div');
        panel.className = 'ext-sv-color-popup__panel';
        panel.innerHTML = `
          <div class="color-editor-wrapper">
            <div class="ext-picker-slot"></div>
            <div class="hex-color-wrapper">
              <span class="hex-color-swatch"></span>
              <input class="input hex-color" spellcheck="false">
            </div>
          </div>
        `;

        popupWrapper.appendChild(panel);
        menuRoot.appendChild(popupWrapper);
        try { popupWrapper.style.background = gradientFor(currentHex); } catch {}

        try {
          const r = swatchBtn.getBoundingClientRect();
          const x = Math.round(r.left + r.width / 2);
          const y = Math.round(r.bottom + 6);
          popupWrapper.style.left = `${x}px`;
          popupWrapper.style.top = `${y}px`;
        } catch {}

        try {
          if (!window.__extColorPicker || !window.__extColorPicker.mountInlinePicker) throw new Error('colorpicker.js not loaded');
          pickerRef = window.__extColorPicker.mountInlinePicker(panel.querySelector('.ext-picker-slot'), {
            initialHex: currentHex,
            onChange: (hex) => {
              currentHex = hex;
              try {
                const input = panel.querySelector('.hex-color');
                const swatch = panel.querySelector('.hex-color-swatch');
                if (input) input.value = hex;
                if (swatch) swatch.style.background = hex;
              } catch {}
              saveHex(hex);
              try { popupWrapper.style.background = gradientFor(hex); } catch {}
            }
          });
        } catch {}

        const hexInput  = panel.querySelector('.hex-color');
        const swatchEl  = panel.querySelector('.hex-color-swatch');
        if (hexInput) {
          hexInput.value = currentHex;
          try { if (swatchEl) swatchEl.style.background = currentHex; } catch {}

          const normalize = () => {
            const val = __extNormalizeHex(hexInput.value);
            if (val && hexInput.value !== val) hexInput.value = val;
          };
          const onKeyDown = (e) => {
            if ((e.key === 'Backspace' && hexInput.selectionStart <= 1 && hexInput.selectionEnd <= 1) ||
                (e.key === 'Delete' && hexInput.selectionStart === 0)) {
              e.preventDefault();
            }
          };
          const onPaste = (e) => {
            e.preventDefault();
            const pasted = (e.clipboardData || window.clipboardData).getData('text').toLowerCase().replace(/[^0-9a-f]/g, '');
            const current = hexInput.value;
            const start = Math.max(1, hexInput.selectionStart || 0);
            const end   = Math.max(1, hexInput.selectionEnd   || 0);
            const next  = `#${`${current.slice(1, start)}${pasted}${current.slice(end)}`.replace(/#/g, '').slice(0, 6)}`;
            hexInput.value = next;
            const caret = start + pasted.length;
            hexInput.setSelectionRange(caret, caret);
            hexInput.dispatchEvent(new Event('input', { bubbles: true }));
            hexInput.dispatchEvent(new Event('change', { bubbles: true }));
          };
          hexInput.setAttribute('maxlength', '7');
          hexInput.addEventListener('input', normalize);
          hexInput.addEventListener('keydown', onKeyDown);
          hexInput.addEventListener('paste', onPaste);
          normalize();
          hexInput.addEventListener('input', () => {
            const v = __extNormalizeHex(hexInput.value);
            if (!v) return;
            try { if (swatchEl) swatchEl.style.background = v; } catch {}
            saveHex(v);
            try { pickerRef?.api?.setColor?.(v); } catch {}
            try { popupWrapper.style.background = gradientFor(v); } catch {}
          }, true);
        }

        document.addEventListener('keydown', onKey, true);
        if (window.__extMakeClickGuard) {
          try { removeGuard = window.__extMakeClickGuard([popupWrapper], closePopup); } catch { removeGuard = null; }
        } else {
          const onDocDown = (e) => {
            if (!popupWrapper.contains(e.target)) { e.stopPropagation(); closePopup(); }
          };
          document.addEventListener('pointerdown', onDocDown, true);
          removeGuard = () => document.removeEventListener('pointerdown', onDocDown, true);
        }
      };

      // --- Interactions -------------------------------------------------------
      const stop = (e) => { e.stopPropagation(); };

      const triggerResetSpin = (btn) => {
        const svg = btn.querySelector('svg');
        if (!svg) return;
        svg.classList.remove('spin');
        void svg.offsetWidth;
        svg.classList.add('spin');
        svg.addEventListener('animationend', () => svg.classList.remove('spin'), { once: true });
      };

      swatchBtn.addEventListener('click', (e) => { stop(e); openPopup(); }, true);
      resetBtn.addEventListener('click', (e) => {
        stop(e);
        triggerResetSpin(resetBtn);
        currentHex = DEFAULT_HEX;
        saveHex(currentHex);
        try { pickerRef?.api?.setColor?.(currentHex); } catch {}
        try {
          const panel = popupWrapper?.querySelector('.ext-sv-color-popup__panel');
          if (panel) {
            const input = panel.querySelector('.hex-color');
            const sw   = panel.querySelector('.hex-color-swatch');
            if (input) input.value = currentHex;
            if (sw)    sw.style.background = currentHex;
          }
        } catch {}
        try { if (popupWrapper) popupWrapper.style.background = gradientFor(currentHex); } catch {}
      }, true);

      fsSV.appendChild(frag);
    })();

    (() => {
      const key = 'svOpacity';
      const input = document.createElement('input');
      input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '0.05';
      input.value = String(readJSON(key, 1));
      input.addEventListener('click', stop, true);
      input.addEventListener('input', () => writeJSON(key, Math.max(0, Math.min(1, parseFloat(input.value) || 0))), true);
      const wrap = document.createElement('div');
      wrap.className = 'settings-popup__item settings-popup__select';
      const label = document.createElement('span');
      label.textContent = 'Street View opacity: ';
      const val = document.createElement('span'); val.textContent = input.value;
      input.addEventListener('input', () => { val.textContent = input.value; }, true);
      wrap.appendChild(label); wrap.appendChild(input); wrap.appendChild(val);
      fsSV.appendChild(wrap);
    })();

    container.appendChild(fsSelecting);
    container.appendChild(fsFunctionality);
    container.appendChild(fsBehaviour);
    container.appendChild(fsDisplay);
    container.appendChild(fsSV);
  }

  function boot() {
    const tryRender = () => {
      const ui = ensureSettingsPanel();
      if (ui && ui.mount) {
        renderProxies(ui.mount);
        return true;
      }
      return false;
    };

    if (!tryRender()) {
      if (!window.__extSettingsWaitMO) {
        const mo = new MutationObserver(() => {
          if (tryRender()) {
            try { mo.disconnect(); } catch {}
            window.__extSettingsWaitMO = null;
          }
        });
        mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
        window.__extSettingsWaitMO = mo;
      }
    }

    if (!window.__extSettingsFSListener) {
      window.__extSettingsFSListener = true;
      document.addEventListener('fullscreenchange', () => {
        const ui2 = ensureSettingsPanel();
        if (ui2 && ui2.mount) renderProxies(ui2.mount);
      }, true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
