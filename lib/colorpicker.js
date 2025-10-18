(function (global) {
  if (!global.__extColorPicker) global.__extColorPicker = {};
  const NS = global.__extColorPicker;

  const pickerMarkup = (withAlpha = false) => `
    <div class="react-colorful" data-alpha="${withAlpha ? 'on' : 'off'}">
      <div class="react-colorful__saturation">
        <div class="react-colorful__interactive">
          <div class="react-colorful__pointer react-colorful__saturation-pointer"></div>
        </div>
      </div>
      <div class="react-colorful__hue">
        <div class="react-colorful__interactive">
          <div class="react-colorful__pointer react-colorful__hue-pointer"></div>
        </div>
      </div>
      ${withAlpha ? `
      <div class="react-colorful__alpha">
        <div class="react-colorful__interactive">
          <div class="react-colorful__pointer react-colorful__alpha-pointer"></div>
        </div>
      </div>
      ` : ''}
    </div>
  `;

  const editorPanelMarkup = (labels) => `
    <div class="form-row">
      <label for="ext-shape-name">${labels.name}</label>
      <input type="text" id="ext-shape-name" autocomplete="off" class="ext-shape-name-input" />
    </div>
    <div class="form-row form-row--color">
      <label>${labels.color}</label>
      <div class="color-editor-wrapper">
        ${pickerMarkup(false)}
        <div class="hex-color-wrapper">
          <span class="hex-color-swatch"></span>
          <input class="input hex-color" spellcheck="false" value="#008cff">
        </div>
      </div>
    </div>
    <div class="actions">
      <button type="button" class="button cancel-btn">${labels.cancel}</button>
      <button type="button" class="button save-btn button--primary">${labels.save}</button>
    </div>
  `;

  const clampChannel = (value) => {
    const num = Number(value);
    return Math.round(global.__extClampValue(Number.isFinite(num) ? num : 0, 0, 255));
  };

  const clamp01 = (value) => {
    const num = Number(value);
    return global.__extClampValue(Number.isFinite(num) ? num : 0, 0, 1);
  };

  function formatAlpha(a) {
    if (a === 1) return '1';
    const fixed = a.toFixed(2);
    return fixed.replace(/0+$/, '').replace(/\.$/, '') || '0';
  }

  function parseInputColor(input) {
    if (input == null) return null;
    if (typeof input === 'object') {
      if (typeof input.hex === 'string') {
        const parsed = parseInputColor(input.hex);
        if (parsed && input.alpha != null) parsed.a = clamp01(Number(input.alpha));
        else if (parsed && input.a != null) parsed.a = clamp01(Number(input.a));
        return parsed;
      }
      if (typeof input.r === 'number' && typeof input.g === 'number' && typeof input.b === 'number') {
        return {
          r: clampChannel(input.r),
          g: clampChannel(input.g),
          b: clampChannel(input.b),
          a: input.a != null ? clamp01(Number(input.a)) : 1
        };
      }
    }
    if (typeof input === 'string') {
      const trimmed = input.trim();
      const norm = global.__extNormalizeHex?.(trimmed);
      if (norm) {
        const rgb = global.__extHexToRgb(norm);
        if (rgb) return { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 };
      }
      const rgbaMatch = trimmed.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\)/i);
      if (rgbaMatch) {
        const [, r, g, b, a] = rgbaMatch;
        return {
          r: clampChannel(Number(r)),
          g: clampChannel(Number(g)),
          b: clampChannel(Number(b)),
          a: a != null ? clamp01(Number(a)) : 1
        };
      }
      const nums = trimmed.match(/\d+(?:\.\d+)?/g);
      if (nums && nums.length >= 3) {
        return {
          r: clampChannel(Number(nums[0])),
          g: clampChannel(Number(nums[1])),
          b: clampChannel(Number(nums[2])),
          a: nums.length >= 4 ? clamp01(Number(nums[3])) : 1
        };
      }
    }
    return null;
  }

  function buildPayload(rgb, alpha, hex) {
    return {
      hex,
      alpha,
      rgba: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${formatAlpha(alpha)})`,
      rgb
    };
  }

  function makePicker(rootEl, opts = {}) {
    let options = opts;
    if (typeof options === 'function') {
      options = { onChange: options };
    } else if (!options || typeof options !== 'object') {
      options = {};
    }

    const allowAlpha = !!options.allowAlpha;
    const onChange = typeof options.onChange === 'function' ? options.onChange : () => {};
    const onAlphaChange = typeof options.onAlphaChange === 'function' ? options.onAlphaChange : null;

    const saturation = rootEl.querySelector('.react-colorful__saturation');
    const hue = rootEl.querySelector('.react-colorful__hue');
    const alphaTrack = allowAlpha ? rootEl.querySelector('.react-colorful__alpha') : null;
    const saturationPointer = rootEl.querySelector('.react-colorful__saturation-pointer');
    const huePointer = rootEl.querySelector('.react-colorful__hue-pointer');
    const alphaPointer = allowAlpha ? rootEl.querySelector('.react-colorful__alpha-pointer') : null;
    const satInteractive = saturation?.querySelector('.react-colorful__interactive') || saturation;
    const hueInteractive = hue?.querySelector('.react-colorful__interactive') || hue;
    const alphaInteractive = alphaTrack?.querySelector('.react-colorful__interactive') || alphaTrack;

    const cleanup = [];

    if (!saturation || !hue || !saturationPointer || !huePointer) {
      return {
        setColor(hex, alphaVal) {
          const payload = parseInputColor(hex) || { r: 0, g: 140, b: 255, a: 1 };
          const norm = global.__extNormalizeHex?.(hex) || '#008cff';
          if (allowAlpha) {
            const a = clamp01(alphaVal != null ? alphaVal : payload.a);
            onChange(buildPayload({ r: payload.r, g: payload.g, b: payload.b }, a, norm));
          } else {
            onChange(norm);
          }
        },
        setAlpha(alphaVal) {
          if (!allowAlpha) return;
          const a = clamp01(alphaVal);
          onAlphaChange && onAlphaChange(a, buildPayload({ r: 0, g: 140, b: 255 }, a, '#008cff'));
        },
        getColor() { return '#008cff'; },
        getColorWithAlpha() {
          if (!allowAlpha) return null;
          return buildPayload({ r: 0, g: 140, b: 255 }, 1, '#008cff');
        },
        destroy() {}
      };
    }

    const state = {
      h: 0,
      s: 0,
      v: 1,
      alpha: allowAlpha ? clamp01(options.initialAlpha != null ? options.initialAlpha : 1) : 1
    };

    const notify = () => {
      const rgb = global.__extHsvToRgb(state.h, state.s, state.v);
      const hex = global.__extRgbToHex(rgb.r, rgb.g, rgb.b);
      if (allowAlpha) {
        const payload = buildPayload(rgb, state.alpha, hex);
        onChange(payload);
        if (onAlphaChange) onAlphaChange(payload.alpha, payload);
      } else {
        onChange(hex);
      }
    };

    const render = (shouldNotify) => {
      const pureHueRgb = global.__extHsvToRgb(state.h, 1, 1);
      const pureHueHex = global.__extRgbToHex(pureHueRgb.r, pureHueRgb.g, pureHueRgb.b);

      try { saturation.style.backgroundColor = pureHueHex; } catch {}
      saturationPointer.style.left = `${state.s * 100}%`;
      saturationPointer.style.top = `${(1 - state.v) * 100}%`;
      huePointer.style.left = `${state.h * 100}%`;

      const rgb = global.__extHsvToRgb(state.h, state.s, state.v);
      const hex = global.__extRgbToHex(rgb.r, rgb.g, rgb.b);
      try { saturationPointer.style.backgroundColor = hex; } catch {}
      try { huePointer.style.backgroundColor = pureHueHex; } catch {}

      if (allowAlpha && alphaTrack && alphaPointer) {
        const start = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`;
        const end = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`;
        try {
          alphaTrack.style.setProperty('--alpha-start', start);
          alphaTrack.style.setProperty('--alpha-end', end);
        } catch {}
        alphaPointer.style.left = `${state.alpha * 100}%`;
      }

      if (shouldNotify) notify();
    };

    const handlePointer = (target, fn) => {
      if (!target) return () => {};
      const onPointerDown = (event) => {
        event.preventDefault();
        const pointerId = event.pointerId;
        target.setPointerCapture?.(pointerId);

        const updateFromEvent = (ev) => {
          const rect = target.getBoundingClientRect();
          const x = clamp01((ev.clientX - rect.left) / rect.width);
          const y = clamp01((ev.clientY - rect.top) / rect.height);
          fn(x, y);
        };

        const release = (ev) => {
          if (ev.pointerId !== pointerId) return;
          target.releasePointerCapture?.(pointerId);
          target.removeEventListener('pointermove', updateFromEvent);
          target.removeEventListener('pointerup', release);
          target.removeEventListener('pointercancel', release);
        };

        target.addEventListener('pointermove', updateFromEvent);
        target.addEventListener('pointerup', release);
        target.addEventListener('pointercancel', release);

        updateFromEvent(event);
      };
      target.addEventListener('pointerdown', onPointerDown);
      return () => {
        target.removeEventListener('pointerdown', onPointerDown);
      };
    };

    const satCleanup = handlePointer(satInteractive, (x, y) => {
      state.s = x;
      state.v = 1 - y;
      render(true);
    });
    if (satCleanup) cleanup.push(satCleanup);

    const hueCleanup = handlePointer(hueInteractive, (x) => {
      state.h = x;
      render(true);
    });
    if (hueCleanup) cleanup.push(hueCleanup);

    if (allowAlpha && alphaInteractive) {
      const alphaCleanup = handlePointer(alphaInteractive, (x) => {
        state.alpha = clamp01(x);
        render(true);
      });
      if (alphaCleanup) cleanup.push(alphaCleanup);
    }

    const api = {
      setColor(color, nextAlpha) {
        const parsed = parseInputColor(color);
        if (!parsed) return;
        const hsv = global.__extRgbToHsv(parsed.r, parsed.g, parsed.b);
        state.h = hsv.h;
        state.s = hsv.s;
        state.v = hsv.v;
        if (allowAlpha && (nextAlpha != null || parsed.a != null)) {
          state.alpha = clamp01(nextAlpha != null ? nextAlpha : parsed.a);
        }
        render(false);
      },
      setAlpha(nextAlpha) {
        if (!allowAlpha) return;
        state.alpha = clamp01(nextAlpha);
        render(false);
      },
      getColor() {
        const rgb = global.__extHsvToRgb(state.h, state.s, state.v);
        return global.__extRgbToHex(rgb.r, rgb.g, rgb.b);
      },
      getColorWithAlpha() {
        if (!allowAlpha) return null;
        const rgb = global.__extHsvToRgb(state.h, state.s, state.v);
        const hex = global.__extRgbToHex(rgb.r, rgb.g, rgb.b);
        return buildPayload(rgb, state.alpha, hex);
      },
      destroy() {
        cleanup.forEach((fn) => { try { fn(); } catch {} });
      }
    };

    const initial = options.initialColor || options.initialRgba || options.initialHex;
    if (initial) {
      api.setColor(initial, allowAlpha ? options.initialAlpha : undefined);
    }
    render(false);

    return api;
  }

  function mountInlinePicker(container, opts = {}) {
    if (!container) throw new Error('mountInlinePicker: container required');
    const allowAlpha = !!opts.allowAlpha;
    container.innerHTML = pickerMarkup(allowAlpha);
    const api = makePicker(container, {
      allowAlpha,
      onChange: opts.onChange,
      onAlphaChange: opts.onAlphaChange,
      initialHex: opts.initialHex,
      initialColor: opts.initialColor,
      initialRgba: opts.initialRgba,
      initialAlpha: opts.initialAlpha
    });
    return { api, rootEl: container };
  }

  function openEditor(opts = {}) {
    const anchor   = opts.anchor;
    const initial  = opts.initial || {};
    const labels   = opts.labels  || { name: 'Name:', color: 'Color:', save: 'Save', cancel: 'Cancel' };
    const onValidate = opts.onValidate || ((o) => !!global.__extNormalizeHex(String(o.hex || '')));

    try { document.querySelectorAll('.ext-color-editor__panel, .edit-chip-panel').forEach(n => n.remove()); } catch {}

    const panel = document.createElement('div');
    panel.className = 'ext-color-editor__panel edit-chip-panel';
    panel.innerHTML = editorPanelMarkup(labels);
    panel.style.position = 'fixed';
    document.body.appendChild(panel);

    let finalAnchorH = 'left';
    (function positionPanel() {
      const margin = 8;
      const vw = window.innerWidth || document.documentElement.clientWidth || 1280;
      const vh = window.innerHeight || document.documentElement.clientHeight || 800;
      const rect = panel.getBoundingClientRect();
      let x = 32, y = 32, anchorH = 'left', anchorV = 'top';
      if (anchor && typeof anchor.getBoundingClientRect === 'function') {
        const r = anchor.getBoundingClientRect();
        x = Math.round(r.left); y = Math.round(r.top);
      } else if (anchor && typeof anchor.x === 'number' && typeof anchor.y === 'number') {
        x = anchor.x; y = anchor.y; anchorH = anchor.anchorH || 'left'; anchorV = anchor.anchorV || 'top';
      }
      finalAnchorH = anchorH;
      if (anchorH === 'right') x = Math.min(Math.max(margin, x - rect.width), vw - rect.width - margin);
      else x = Math.min(Math.max(margin, x), vw - rect.width - margin);
      if (anchorV === 'bottom') y = Math.min(Math.max(margin, y - rect.height), vh - rect.height - margin);
      else y = Math.min(Math.max(margin, y), vh - rect.height - margin);
      panel.style.left = `${x}px`;
      panel.style.top  = `${y}px`;
    })();

    const nameInput = panel.querySelector('#ext-shape-name, .ext-shape-name-input, input[type="text"]');
    const hexInput  = panel.querySelector('.hex-color');
    const swatch    = panel.querySelector('.hex-color-swatch');
    const cancelBtn = panel.querySelector('.cancel-btn, .button:not(.button--primary)');
    const saveBtn   = panel.querySelector('.save-btn, .button--primary');

    const initName = (initial.name || '').trim() || 'Polygon';
    const initHex  = global.__extNormalizeHex(initial.hex || '#008cff') || '#008cff';

    if (nameInput) nameInput.value = initName;
    if (hexInput)  hexInput.value  = initHex;
    try { swatch.style.background = initHex; } catch {}

    const finalAnchorHX = (finalAnchorH === 'right') ? 'left' : 'right';

    try { panel.style.background =
          `linear-gradient(to bottom ${finalAnchorH}, ${initHex}cd, transparent 40%),` +
          `linear-gradient(to bottom ${finalAnchorHX}, ${initHex}cd -10%, var(--ext-el-bg) 70%)`; 
        } catch {}

    const picker = makePicker(panel, {
      allowAlpha: false,
      initialHex: initHex,
      onChange: (hex) => {
        if (!hexInput) return;
        try {
          hexInput.value = hex;

          panel.style.background =
            `linear-gradient(to bottom ${finalAnchorH}, ${hex}cd, transparent 40%),` +
            `linear-gradient(to bottom ${finalAnchorHX}, ${initHex}cd -10%, var(--ext-el-bg) 70%)`;
          try { if (global.__extTextColorForBg) panel.style.color = global.__extTextColorForBg(hex); } catch {}
          swatch.style.background = hex;
        } catch {}
      }
    });

    if (hexInput) {
      const normalize = () => {
        const val = global.__extNormalizeHex(hexInput.value);
        if (val && hexInput.value !== val) {
          hexInput.value = val;
        }
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
      hexInput.addEventListener('input', () => picker.setColor(hexInput.value));
    }

    picker.setColor(initHex);

    let removeGuard = null;
    const close = () => {
      if (panel.__extClosed) return;
      panel.__extClosed = true;
      try { document.removeEventListener('keydown', onKey, true); } catch {}
      try { removeGuard && removeGuard(); removeGuard = null; } catch {}
      try { panel.remove(); } catch {}
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);

    if (global.__extMakeClickGuard) {
      removeGuard = global.__extMakeClickGuard([panel], close);
    } else {
      const onDocDown = (e) => { if (!panel.contains(e.target)) { e.preventDefault(); e.stopPropagation(); close(); } };
      document.addEventListener('pointerdown', onDocDown, true);
      removeGuard = () => document.removeEventListener('pointerdown', onDocDown, true);
    }

    if (nameInput) { nameInput.focus(); nameInput.select(); }

    return new Promise((resolve, reject) => {
      cancelBtn && cancelBtn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation(); close(); reject(new Error('cancelled'));
      }, { once: true });

      saveBtn && saveBtn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const name = (nameInput && nameInput.value || '').trim() || 'Polygon';
        const hex  = global.__extNormalizeHex((hexInput && hexInput.value) || '#008cff') || '#008cff';
        if (!onValidate({ name, hex })) {
          try { alert('Please enter a valid hex color like #1a2b3c'); } catch {}
          return;
        }
        close();
        resolve({ name, hex });
      }, { once: true });
    });
  }

  // Public API
  NS.createColorPicker   = makePicker;
  NS.mountInlinePicker   = mountInlinePicker;
  NS.openEditor          = openEditor;
})(window);
