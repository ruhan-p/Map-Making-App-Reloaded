(function(){
  "use strict";

  // ---- Utilities ----
  const PI = Math.PI;
  const TAU = PI * 2;
  const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
  const lerp = (a,b,t) => a + (b-a) * t;
  const smoothstep = (e0,e1,x) => { const t = clamp01((x - e0) / Math.max(1e-6, e1 - e0)); return t*t*(3 - 2*t); };
  const clamp = (x, lo, hi) => x < lo ? lo : (x > hi ? hi : x);
  const wrapHue = (h) => {
    let out = h % 360;
    if (out < 0) out += 360;
    return out;
  };

  const hslaString = (h, s, l, a = 1) => `hsla(${wrapHue(h).toFixed(1)}, ${clamp(s,0,100).toFixed(1)}%, ${clamp(l,0,100).toFixed(1)}%, ${clamp(a,0,1)})`;

  const hslToRgb01 = (h, s, l) => {
    const hh = wrapHue(h) / 360;
    const ss = clamp01(s / 100);
    const ll = clamp01(l / 100);
    if (ss === 0) {
      return { r: ll, g: ll, b: ll };
    }
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    const tc = (t) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1/6) return p + (q - p) * 6 * tt;
      if (tt < 1/2) return q;
      if (tt < 2/3) return p + (q - p) * (2/3 - tt) * 6;
      return p;
    };
    return {
      r: tc(hh + 1/3),
      g: tc(hh),
      b: tc(hh - 1/3)
    };
  };
  const lerpAngle = (a, b, t) => { const d = ((b - a + PI) % TAU) - PI; return a + d * t; };

  function mulberry32(seed){
    return function(){
      let t = (seed += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function setCanvasSize(canvas, w, h){
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w);
    canvas.height = Math.floor(h);
    canvas.style.width = (w / dpr) + "px";
    canvas.style.height = (h / dpr) + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1,0,0,1,0,0);
    return ctx;
  }

  const DEFAULTS = {
    azimuth: 320,
    elevation: 42,
    softness: 0.6,
    contrast: 0.9,
    triDensity: 28,
    zoom: 1.0,
    animateWater: true,
    biome: 'mountainous',
    glintColor: null
  };

  const BIOMES = {
    mountainous: {
      key: 'mountainous',
      heightScale: 0.36,
      heightNoise: { scale: 0.007, octaves: 4, persistence: 0.3, lacunarity: 1.95 },
      rough: { amp: 0.04, scale: 0.035 },
      mountains: { enabled: true, count: [1, 3], radius: [0.08, 0.18], amplitude: [0.18, 0.32] },
      river: { enabled: true, chance: 1.0, widthMultiplier: 1.0, meanderAmpMul: 1.0, cutoffOffset: 0.0, searchRadiusFrac: 0.28, valleyDepth: 0.12, lakeChance: 0.15 }
    },
    desert: {
      key: 'desert',
      heightScale: 0.24,
      heightNoise: { scale: 0.0052, octaves: 3, persistence: 0.45, lacunarity: 1.7 },
      dunes: { scaleX: 0.01, scaleY: 0.007, mix: 0.85, sharpness: 1.0, warp: 37.2 },
      rough: { amp: 0.008, scale: 0.02 },
      mountains: { enabled: false },
      river: { enabled: false }
    },
    meadow: {
      key: 'meadow',
      heightScale: 0.8,
      heightNoise: { scale: 0.003, octaves: 3, persistence: 0.45, lacunarity: 1.85 },
      rough: { amp: 0.01, scale: 0.028 },
      mountains: { enabled: false },
      river: { enabled: true, chance: 0.6, widthMultiplier: 3.0, meanderAmpMul: 0.5, cutoffOffset: 0.05, searchRadiusFrac: 0.32, valleyDepth: 0.085, lakeChance: 0.06 },
      farmland: { intensity: 0.12 }
    },
    alpine: {
      key: 'alpine',
      heightScale: 0.38,
      heightNoise: { scale: 0.006, octaves: 5, persistence: 0.58, lacunarity: 1.92 },
      rough: { amp: 0.05, scale: 0.04 },
      mountains: { enabled: true, count: [1, 2], radius: [0.07, 0.15], amplitude: [0.14, 0.26] },
      river: { enabled: true, chance: 0.7, widthMultiplier: 1.0, meanderAmpMul: 0.74, cutoffOffset: 0.08, searchRadiusFrac: 0.24, valleyDepth: 0.1, lakeChance: 0.09 }
    }
  };

  const PALETTES = {
    mountainous: {
      layers: [
        { range: [0.00, 0.40], h: [120, 108], s: [58, 52], lBase: [30, 36], lRange: [24, 24] },
        { range: [0.40, 0.70], h: [95, 35],  s: [52, 46], lBase: [36, 44], lRange: [24, 24] },
        { range: [0.70, 0.92], h: [0, 0],    s: [0, 0],   lBase: [58, 72], lRange: [18, 18] },
        { range: [0.92, 1.01], h: [0, 0],    s: [0, 0],   lBase: [92, 98], lRange: [6, 6] }
      ],
      warmShift: { pivot: 25, range: 20, hTarget: 25, hAmount: 0.6, sDelta: 12, sAmount: 0.5 },
      glint: {
        base: { h: 50, s: 80, l: 70 },
        warm: { pivot: 25, range: 20, targetHue: 35, hueAmount: 0.65 }
      },
      water: { hue: 205, saturation: 82, lightMin: 36, lightMax: 40, tint: 0.05 }
    },
    desert: {
      layers: [
        { range: [0.00, 0.38], h: [33, 36], s: [68, 64], lBase: [30, 38], lRange: [20, 20] },
        { range: [0.38, 0.68], h: [36, 42], s: [64, 55], lBase: [38, 52], lRange: [20, 20] },
        { range: [0.68, 0.88], h: [42, 46], s: [55, 48], lBase: [52, 64], lRange: [18, 18] },
        { range: [0.88, 1.01], h: [46, 50], s: [48, 36], lBase: [64, 78], lRange: [14, 14] }
      ],
      toneNoise: { scale: 0.02, offsetX: 12.3, offsetY: -4.1, hAmp: 1.5, lBaseAmp: 4.5, lRangeAmp: 2 },
      glint: {
        base: { h: 54, s: 80, l: 65 },
        warm: { pivot: 30, range: 25, targetHue: 26, hueAmount: 0.55, saturationDelta: 6, satAmount: 0.6 }
      }
    },
    meadow: {
      layers: [
        { range: [0.00, 0.30], h: [130, 120], s: [40, 45], lBase: [40, 42], lRange: [26, 26] },
        { range: [0.30, 0.70], h: [120, 70], s: [45, 50], lBase: [42, 48], lRange: [24, 24] },
        { range: [0.70, 1.01], h: [70, 65],  s: [50, 30], lBase: [48, 68], lRange: [18, 18] }
      ],
      toneNoise: { scale: 0.014, offsetX: 80.6, offsetY: -130.4, hAmp: 2.5, lBaseAmp: 3.5 },
      warmShift: { pivot: 25, range: 20, hTarget: 40, hAmount: 0.4, sDelta: 12, sAmount: 0.5 },
      stripes: {
        threshold: 0.82,
        minElevation: 0.32,
        baseScaleX: 0.10,
        baseScaleY: 0.012,
        noiseScaleX: 0.004,
        noiseScaleY: 0.004,
        lighten: 40,
        saturationDrop: 10
      },
      glint: {
        base: { h: 60, s: 66, l: 68 },
        warm: { pivot: 26, range: 24, targetHue: 50, hueAmount: 0.5, saturationDelta: -6, satAmount: 0.4 }
      },
      water: { hue: 193, saturation: 72, lightMin: 36, lightMax: 40, tint: 0.02 }
    },
    alpine: {
      layers: [
        { range: [0.00, 0.32], h: [158, 152], s: [46, 54], lBase: [26, 34], lRange: [22, 22] },
        { range: [0.32, 0.72], h: [152, 140], s: [54, 48], lBase: [34, 50], lRange: [22, 22] },
        { range: [0.72, 0.88], h: [140, 165], s: [48, 26], lBase: [50, 70], lRange: [16, 16] },
        { range: [0.88, 1.01], h: [165, 185], s: [26, 12], lBase: [70, 92], lRange: [10, 10] }
      ],
      toneNoise: { scale: 0.02, offsetX: 300.7, offsetY: -410.5, hAmp: 1.2, lBaseAmp: 3.2 },
      warmShift: { pivot: 25, range: 20, hTarget: 125, hAmount: 0.6, sDelta: 12, sAmount: 0.5 },
      glint: {
        base: { h: 68, s: 66, l: 68 },
        warm: { pivot: 26, range: 24, targetHue: 100, hueAmount: 0.5, saturationDelta: -6, satAmount: 0.4 }
      },
      water: { hue: 193, saturation: 72, lightMin: 36, lightMax: 40, tint: 0.02 }
    }
  };

  class TerrainBackground {
    constructor(canvas, settings = {}, options = {}){
      const DelaunayCtor = (typeof window !== "undefined" && window.Delaunator) ? window.Delaunator : (typeof Delaunator !== "undefined" ? Delaunator : null);
      if (!DelaunayCtor) throw new Error("Delaunator not found. Make sure delaunator.js loads before terrain.js.");
      if (typeof window.createNoise2D !== "function" && typeof createNoise2D !== "function") throw new Error("simplex-noise createNoise2D() not found. Load simplex-noise.js before terrain.js.");
      this.DelaunayCtor = DelaunayCtor;

      this.canvas = canvas;
      this.ctxMain = canvas.getContext("2d");

      this.offBase = document.createElement("canvas");
      this.offOver = document.createElement("canvas");
      this.baseCtx = this.offBase.getContext("2d");
      this.overCtx = this.offOver.getContext("2d");

      this.settings = Object.assign({}, DEFAULTS, settings || {});
      this._setBiome(this.settings.biome);
      this.settings.glintColor = this._normalizeGlintInput(this.settings.glintColor);
      this.interacting = false;

      this.seed = options.seed != null ? (options.seed >>> 0) : (Math.random() * 0xFFFFFFFF) >>> 0;
      this._rng = mulberry32(this.seed);
      this.noise2D = (typeof window !== "undefined" && typeof window.createNoise2D === "function") ? window.createNoise2D(this._rng) : createNoise2D(this._rng);

      this.size = { w: 300, h: 180 };
      this.points = [];
      this.tris = [];
      this.triData = [];
      this.shorePts = [];
      this.sunDir = [0,0,1];
      this._waterTris = [];

      this._waterColorCache = new Array(256);

      this.onReady = typeof options.onReady === 'function' ? options.onReady : null;
      this._readyFired = false;

      this.lastT = 0;
      this.windA = 0;
      this.flocks = [];
      this.lastSpawn = -12000;

      this._updateSunDir();
      this._precomputeWaterColors();
      this._setupResize();
      this.rebuildAll();

      this._loop = this._loop.bind(this);
      this._animRef = requestAnimationFrame(this._loop);
    }

    destroy(){
      if (this._animRef) cancelAnimationFrame(this._animRef);
      if (this._ro) this._ro.disconnect();
      this.canvas = null;
    }

    _setBiome(key){
      const target = key && BIOMES[key] ? BIOMES[key] : BIOMES.mountainous;
      this.biomeKey = target.key;
      this.biomeDef = target;
      if (this.settings) this.settings.biome = this.biomeKey;
    }

    _normalizeGlintInput(input){
      if (!input || typeof input !== 'object') return null;
      const h = Number(input.h ?? input.hue);
      const s = Number(input.s ?? input.saturation);
      const l = Number(input.l ?? input.lightness);
      if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) return null;
      return { h: wrapHue(h), s: clamp(s, 0, 100), l: clamp(l, 0, 100) };
    }

    _currentGlintColor(){
      const override = this._normalizeGlintInput(this.settings?.glintColor);
      if (override) return { ...override, warmFactor: 0 };

      const palette = PALETTES[this.biomeKey];
      const cfg = palette?.glint;
      let base = cfg?.base || cfg;
      if (!base) {
        const warmDefault = clamp01((25 - this.settings.elevation) / 20);
        const hue = 40 * (1 - warmDefault * 0.65) + 35 * (warmDefault * 0.65);
        return { h: hue, s: 90, l: 72, warmFactor: warmDefault };
      }
      let h = Number(base.h ?? base.hue ?? 40);
      let s = Number(base.s ?? base.saturation ?? 85);
      let l = Number(base.l ?? base.lightness ?? 70);
      let warmFactor = 0;
      const warm = cfg?.warm;
      if (warm) {
        const pivot = Number.isFinite(warm.pivot) ? warm.pivot : 25;
        const range = Math.max(1e-6, Number.isFinite(warm.range) ? warm.range : 20);
        warmFactor = clamp01((pivot - this.settings.elevation) / range);
        if (Number.isFinite(warm.targetHue)) {
          const amt = clamp01(Number.isFinite(warm.hueAmount) ? warm.hueAmount : 1);
          h = lerp(h, warm.targetHue, warmFactor * amt);
        }
        if (Number.isFinite(warm.saturationDelta)) {
          const amt = clamp01(Number.isFinite(warm.satAmount) ? warm.satAmount : 1);
          s = lerp(s, s + warm.saturationDelta, warmFactor * amt);
        }
        if (Number.isFinite(warm.lightnessDelta)) {
          const amt = clamp01(Number.isFinite(warm.lightAmount) ? warm.lightAmount : 1);
          l = lerp(l, l + warm.lightnessDelta, warmFactor * amt);
        }
      }
      return { h: wrapHue(h), s: clamp(s, 0, 100), l: clamp(l, 0, 100), warmFactor };
    }

    updateSettings(partial = {}, isInteracting = false){
      const triDensityChanged = partial.triDensity !== undefined && this.settings.triDensity !== partial.triDensity;
      const zoomChanged = partial.zoom !== undefined && this.settings.zoom !== partial.zoom;
      const elevationChanged = partial.elevation !== undefined && this.settings.elevation !== partial.elevation;
      const biomeChanged = partial.biome !== undefined && this.settings.biome !== partial.biome;
      const glintChanged = partial.glintColor !== undefined;
      const seedChanged = partial.seed !== undefined;

      const clone = { ...partial };
      delete clone.glintColor;
      Object.assign(this.settings, clone);
      if (biomeChanged) {
        this._setBiome(this.settings.biome);
      }
      if (glintChanged) {
        const next = partial.glintColor === null ? null : this._normalizeGlintInput(partial.glintColor);
        if (partial.glintColor === null || next) {
          this.settings.glintColor = next;
        }
      }
      this.interacting = !!isInteracting;
      this._updateSunDir();
      
      if (elevationChanged || biomeChanged || glintChanged) {
        this._precomputeWaterColors();
      }

      if (seedChanged) {
        this.seed = partial.seed >>> 0;
        this._rng = mulberry32(this.seed);
        this.noise2D = (typeof window !== "undefined" && typeof window.createNoise2D === "function") ? window.createNoise2D(this._rng) : createNoise2D(this._rng);
      }

      if (biomeChanged || triDensityChanged || zoomChanged || seedChanged) {
        this.rebuildAll();
      } else {
        this._buildShadow();
        this._redrawBase();
      }
    }

    _setupResize(){
      const ro = new ResizeObserver((entries)=>{
        const r = entries[0].contentRect;
        const dpr = window.devicePixelRatio || 1;
        
        const w = Math.max(140, Math.floor(r.width * dpr));
        const h = Math.max(100, Math.floor(r.height * dpr));

        this.size = { w, h };
        setCanvasSize(this.canvas, w, h);
        setCanvasSize(this.offBase, w, h);
        setCanvasSize(this.offOver, w, h);
        this.rebuildAll();
      });
      const target = this.canvas.parentElement || this.canvas;
      ro.observe(target);
      this._ro = ro;
    }

    _updateSunDir(){
      const az = (this.settings.azimuth % 360) * PI/180;
      const el = clamp01(this.settings.elevation / 90) * PI/2;
      const sx = Math.cos(az) * Math.cos(el);
      const sy = Math.sin(az) * Math.cos(el);
      const sz = Math.sin(el);
      this.sunDir = [sx, sy, sz];
    }

    rebuildAll(){
      this._precomputeHeights();
      this._buildMeshAndShore();
      this._precomputeTriData();
      this._buildShadow();
      this._redrawBase();
    }

    baseHeight(x, y) {
      const cfg = this.biomeDef?.heightNoise || {};
      const scale = (cfg.scale ?? 0.007) * this.settings.zoom;
      const octaves = Math.max(1, Math.floor(cfg.octaves ?? 4));
      const persistence = clamp(cfg.persistence ?? 0.5, 0.25, 0.9);
      const lacunarity = clamp(cfg.lacunarity ?? 1.95, 1.2, 3.4);
      const offsetX = cfg.offsetX ?? 0;
      const offsetY = cfg.offsetY ?? 0;

      let n = 0;
      let amp = 1;
      let freq = 1;
      let ampSum = 0;
      for (let o = 0; o < octaves; o++) {
        const nx = (x + offsetX) * scale * freq;
        const ny = (y + offsetY) * scale * freq;
        n += amp * this.noise2D(nx, ny);
        ampSum += amp;
        amp *= persistence;
        freq *= lacunarity;
      }
      if (ampSum > 0) n /= ampSum;

      let base = 0.5 * (n + 1);

      if (cfg.bias) base += cfg.bias;

      if (this.biomeDef?.hills?.swell) {
        const swell = this.biomeDef.hills.swell;
        const broad = 0.5 * (this.noise2D(x * scale * 0.25 + 41.7, y * scale * 0.25 - 12.3) + 1);
        base = clamp01(lerp(base, broad, swell));
      }

      if (this.biomeDef?.dunes) {
        const dunes = this.biomeDef.dunes;
        const duneNoise = 0.5 * (this.noise2D(x * dunes.scaleX, y * dunes.scaleY + dunes.warp) + 1);
        const shaped = Math.pow(duneNoise, dunes.sharpness ?? 1.4);
        base = clamp01(lerp(base, shaped, clamp01(dunes.mix ?? 0.5)));
      }

      return clamp01(base);
    }

    mountainSeeds() {
      const cfg = this.biomeDef?.mountains;
      if (!cfg?.enabled) return [];
      const {w,h} = this.size;
      const rand = mulberry32((this.seed*97531)^0xc2b2ae35);
      const minCount = Math.max(1, Math.floor(cfg.count?.[0] ?? 1));
      const maxCount = Math.max(minCount, Math.floor(cfg.count?.[1] ?? minCount));
      const count = minCount + Math.floor(rand() * (maxCount - minCount + 1));
      const rRange = cfg.radius ?? [0.08, 0.18];
      const ampRange = cfg.amplitude ?? [0.18, 0.32];
      const arr=[];
      for(let i=0; i<count; i++){
        const x = lerp(0.15, 0.85, rand()) * w;
        const y = lerp(0.15, 0.85, rand()) * h;
        const r = lerp(rRange[0], rRange[1], rand()) * Math.min(w,h);
        const amp = lerp(ampRange[0], ampRange[1], rand()) * Math.min(w,h);
        arr.push({x,y,r,amp});
      }
      return arr;
    }

    _dryRiver(){
      const center = () => -10000;
      const width = () => 0;
      return { enabled: false, centerX: center, widthAt: width, valleyDepth: 0 };
    }

    river() {
      const { w, h } = this.size;
      const cfg = this.biomeDef?.river || {};
      if (!cfg.enabled) return this._dryRiver();

      const baseSeed = (this.seed * 3597) ^ 0x85ebca6b;
      const chance = clamp01(cfg.chance ?? 1);
      if (chance < 1) {
        const chanceRand = mulberry32(baseSeed ^ 0xdeadc0de);
        if (chanceRand() > chance) return this._dryRiver();
      }

      const rand = mulberry32(baseSeed);
      const freq = (cfg.freq ?? 3.15) * this.settings.zoom;
      const meanderAmp = 0.33 * w * (cfg.meanderAmpMul ?? 1);
      const xOffset = lerp(0.22, 0.78, rand()) * w;
      const baseX = (y) => {
        const yn = y / h;
        const fx = this.noise2D(yn * freq, 0.0);
        const gx = this.noise2D(yn * freq * 2.1 + 50, 10.3);
        const disp = (0.6 * fx + 0.4 * gx) * meanderAmp;
        return xOffset + disp;
      };

      const lakes = [];
      if (rand() < (cfg.lakeChance ?? 0.15)) {
        const samples = 90, eps = 2; const cands = [];
        for (let i = 0; i < samples; i++) {
          const yn = (i + 0.5) / samples;
          const y = yn * h;
          const x = baseX(y);
          const gx = this.baseHeight(x + eps, y) - this.baseHeight(x - eps, y);
          const gy = this.baseHeight(x, y + eps) - this.baseHeight(x, y - eps);
          cands.push({ y, yn, grad: Math.hypot(gx, gy) });
        }
        cands.sort((a, b) => a.grad - b.grad);
        const minSep = 0.18;
        for (const c of cands) {
          if (lakes.length >= 2) break;
          if (c.yn < 0.08 || c.yn > 0.92) continue;
          if (lakes.every(L => Math.abs(L.t0 - c.yn) > minSep)) {
            const sigma = 0.03 + rand() * 0.05;
            const maxW = lerp(0.10, 0.16, rand()) * Math.min(w, h) * (cfg.widthMultiplier ?? 1);
            lakes.push({ t0: c.yn, sigma, maxW });
          }
        }
      }

      const side = Math.min(w, h);
      const elevNoRiver01 = (x, y) => clamp01(
        this.baseHeight(x, y) + this._mountBoost(x, y, side) + this._rough(x, y)
      );

      const N = Math.max(220, Math.floor(h / Math.max(1, this.gs * 0.35)));
      const xs = new Float32Array(N);
      const ys = new Float32Array(N);
      const eps = Math.max(1, Math.round(this.gs * 0.5));
      const maxStep = Math.max(2, 0.05 * w * (cfg.stepMul ?? 1));
      const cutoff = clamp(0.55, 0.9, 0.74 + (cfg.cutoffOffset ?? 0));
      const downhillGain = 10 * (cfg.downhillGain ?? 1);
      const meanderFollow = 0.18 * (cfg.followMul ?? 1);
      const searchRadiusFrac = cfg.searchRadiusFrac ?? 0.28;

      let x = clamp(baseX(0), 0, w);
      for (let i = 0; i < N; i++) {
        const t = (N === 1) ? 0 : (i / (N - 1));
        const y = t * h;
        ys[i] = y;
        const xTarget = baseX(y);
        const xL = Math.max(0, x - eps), xR = Math.min(w, x + eps);
        const hL = elevNoRiver01(xL, y), hR = elevNoRiver01(xR, y);
        let dGrad = clamp((hL - hR) * downhillGain, -maxStep, maxStep);
        let repel = 0;
        for (const s of this._mSeeds) {
          const dx = x - s.x, dy = y - s.y;
          const r = s.r * 1.1;
          const g = Math.exp(-(dx*dx + dy*dy) / (2 * r * r));
          repel += Math.sign(dx || 1) * g * (s.r * 0.18);
        }
        repel = clamp(repel, -maxStep, maxStep);
        const follow = clamp((xTarget - x) * meanderFollow, -maxStep, maxStep);
        let dx = clamp(dGrad + repel + follow, -maxStep, maxStep);
        x = clamp(x + dx, 0, w);
        let eHere = elevNoRiver01(x, y);
        if (eHere > cutoff) {
          let bestX = x, bestE = eHere;
          const maxD = Math.max(eps, w * searchRadiusFrac);
          for (let d = eps; d <= maxD; d += eps) {
            const xl = clamp(x - d, 0, w);
            const xr = clamp(x + d, 0, w);
            const el = elevNoRiver01(xl, y);
            const er = elevNoRiver01(xr, y);
            if (el < bestE) { bestE = el; bestX = xl; }
            if (er < bestE) { bestE = er; bestX = xr; }
            if (bestE <= cutoff - 0.03) break;
          }
          x = bestX;
        }
        xs[i] = x;
      }

      const smoothInPlace = (arr, radius = 3, passes = 3) => {
        const n = arr.length, tmp = new Float32Array(n);
        for (let p = 0; p < passes; p++) {
          for (let i = 0; i < n; i++) {
            let sum = 0, count = 0;
            for (let k = -radius; k <= radius; k++) {
              const j = Math.max(0, Math.min(n - 1, i + k));
              sum += arr[j]; count++;
            }
            tmp[i] = sum / count;
          }
          arr.set(tmp);
        }
      };
      smoothInPlace(xs, 3, 3);

      const slopes = new Float32Array(N);
      const dt = 1 / Math.max(1, N - 1);
      const d = new Float32Array(N - 1);
      for (let i = 0; i < N - 1; i++) d[i] = (xs[i+1] - xs[i]) / dt;
      slopes[0] = d[0];
      slopes[N-1] = d[N-2];
      for (let i = 1; i < N - 1; i++) {
        if (d[i-1] * d[i] <= 0) {
          slopes[i] = 0;
        } else {
          const w1 = 2*dt + dt, w2 = dt + 2*dt;
          slopes[i] = (w1 + w2) > 0 ? (w1 + w2) / (w1/d[i-1] + w2/d[i]) : 0;
        }
      }

      const centerX = (y) => {
        const t = clamp(y / h, 0, 1) * (N - 1);
        const i0 = Math.floor(t);
        const i1 = Math.min(N - 1, i0 + 1);
        const u = t - i0;
        const x0 = xs[i0], x1 = xs[i1];
        const m0 = slopes[i0], m1 = slopes[i1];
        const u2 = u*u, u3 = u2*u;
        const h00 =  2*u3 - 3*u2 + 1;
        const h10 =      u3 - 2*u2 + u;
        const h01 = -2*u3 + 3*u2;
        const h11 =      u3 -   u2;
        return clamp(h00*x0 + h10*m0*dt + h01*x1 + h11*m1*dt, 0, w);
      };

      const baseW = 0.018 * Math.min(w, h) * (cfg.widthMultiplier ?? 1);
      const minW  = Math.max(this.gs * 1.35, 2.5) * (cfg.minWidthMultiplier ?? 1);
      const widths = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const yn = ys[i] / h;
        const n = 0.5 + 0.5 * this.noise2D(yn * 2.2 + 30, 7.7);
        let wv = baseW * (0.95 + (cfg.widthNoiseAmp ?? 0.25) * n);
        for (const L of lakes) {
          const g = Math.exp(-Math.pow((yn - L.t0) / L.sigma, 2) * 0.5);
          wv += g * L.maxW;
        }
        widths[i] = wv;
      }
      for (let i = 1; i < N-1; i++) {
        const curv = Math.abs(xs[i+1] - 2*xs[i] + xs[i-1]);
        widths[i] += curv * 0.35;
      }
      smoothInPlace(widths, 2, 2);
      for (let i = 0; i < N; i++) widths[i] = Math.max(widths[i], minW);

      const widthAt = (y) => {
        const t = clamp(y / h, 0, 1) * (N - 1);
        const i0 = Math.floor(t);
        const i1 = Math.min(N - 1, i0 + 1);
        const u = t - i0;
        const w0 = widths[i0], w1 = widths[i1];
        const m0 = (i0 > 0 ? (widths[i0] - widths[i0-1]) : (widths[i1] - widths[i0])) / dt;
        const m1 = (i1 < N-1 ? (widths[i1+1] - widths[i1]) : (widths[i1] - widths[i0])) / dt;
        const u2 = u*u, u3 = u2*u;
        const h00 =  2*u3 - 3*u2 + 1;
        const h10 =      u3 - 2*u2 + u;
        const h01 = -2*u3 + 3*u2;
        const h11 =      u3 -   u2;
        const res = h00*w0 + h10*m0*dt + h01*w1 + h11*m1*dt;
        return Math.max(res, minW);
      };

      return { enabled: true, centerX, widthAt, valleyDepth: cfg.valleyDepth ?? 0.12 };
    }

    heightN01(x,y){
      const side = Math.min(this.size.w, this.size.h);
      let h = this.baseHeight(x, y);
      if (this._mSeeds?.length) h += this._mountBoost(x, y, side);
      h -= this._valley(x, y, side);
      h += this._rough(x, y);
      return clamp01(h);
    }
    _mountBoost(x,y,side){
      let boost=0;
      for(const s of this._mSeeds){
        const dx=x-s.x, dy=y-s.y;
        const g=Math.exp(-(dx*dx+dy*dy)/(2*s.r*s.r));
        boost+=g*(s.amp/side);
      }
      return boost;
    }
    _valley(x,y,side){
      const river = this._river;
      if (!river?.enabled) return 0;
      const w = river.widthAt(y);
      if (!Number.isFinite(w) || w <= 1e-3) return 0;
      const cx = river.centerX(y);
      const d = Math.abs(x - cx);
      const sigma = w * 2.5;
      if (sigma <= 0) return 0;
      const depth = clamp(river.valleyDepth ?? 0.12, 0, 0.35);
      return Math.exp(-Math.pow(d / sigma, 2)) * depth;
    }
    _rough(x, y) {
      const cfg = this.biomeDef?.rough || {};
      const scale = (cfg.scale ?? 0.035) * this.settings.zoom;
      const amp = cfg.amp ?? 0.04;
      return amp * this.noise2D(x * scale + 123.4, y * scale - 55.6);
    }

    _precomputeHeights(){
      const { w, h } = this.size;
      const side = Math.min(w, h);
      const scaleFactor = this.biomeDef?.heightScale ?? 0.36;
      this.heightScale = side * scaleFactor;
      const gridStep = Math.max(2, Math.round(side/220));
      this.gs = gridStep;
      this.cols = Math.floor(w / gridStep) + 1;
      this.rows = Math.floor(h / gridStep) + 1;
      this.Ngrid = new Float32Array(this.rows * this.cols);
      this.Hgrid = new Float32Array(this.rows * this.cols);

      this._mSeeds = this.mountainSeeds();
      this._river = this.river();

      const idx = (ix,iy)=> iy * this.cols + ix;
      for (let iy=0; iy<this.rows; iy++){
        const y = iy * gridStep;
        for (let ix=0; ix<this.cols; ix++){
          const x = ix * gridStep;
          const n = this.heightN01(x, y);
          const id = idx(ix,iy);
          this.Ngrid[id] = n;
          this.Hgrid[id] = n * this.heightScale;
        }
      }
    }

    _buildMeshAndShore(){
      const { w, h } = this.size;
      const pts = [];
      const rand = mulberry32((this.seed * 1000003) ^ 0x9e3779b1);
      const cell = Math.max(4, Math.min(w,h) / this.settings.triDensity);
      const cols = Math.ceil(w/cell), rows = Math.ceil(h/cell);
      for(let j=0; j<=rows; j++){
        for(let i=0; i<=cols; i++){
          const x = (i + (rand() - 0.5) * 0.7) * cell;
          const y = (j + (rand() - 0.5) * 0.7) * cell;
          pts.push([x<0?0:x>w?w:x, y<0?0:y>h?h:y]);
        }
      }
      const borderN = 32;
      for(let i=0; i<borderN; i++){
        const t = i/borderN;
        pts.push([t*w, 0], [t*w, h], [0, t*h], [w, t*h]);
      }
      this.points = pts;

      const coords = new Float64Array(this.points.length * 2);
      for (let i=0; i<this.points.length; i++){
        coords[2*i]   = this.points[i][0];
        coords[2*i+1] = this.points[i][1];
      }
      const del = new this.DelaunayCtor(coords);
      this.tris = Array.from(del.triangles);

      const out = new Array(this.points.length);
      const tol = Math.max(2, (Math.min(w,h) / this.settings.triDensity) * 0.6);
      const riverActive = this._river?.enabled;
      for(let i=0; i<this.points.length; i++){
        const p = this.points[i];
        let x = p[0], y = p[1];
        if (riverActive) {
          const cx = this._river.centerX(y);
          const half = this._river.widthAt(y);
          if (half > 1e-3) {
            const dx = x - cx;
            const sign = dx === 0 ? 1 : Math.sign(dx);
            const dist = Math.abs(Math.abs(dx) - half);
            if (dist < tol){
              const target = cx + sign*half;
              const shift = target - x;
              x += Math.abs(shift) > tol ? tol * Math.sign(shift) : shift;
            }
          }
        }
        out[i] = [x,y];
      }
      this.shorePts = out;
    }

    _precomputeTriData() {
      const triCount = this.tris.length / 3;
      this.triData = new Array(triCount);
  
      for (let i = 0; i < triCount; i++) {
        const t = i * 3;
        const i0 = this.tris[t], i1 = this.tris[t + 1], i2 = this.tris[t + 2];
        const p0 = this.shorePts[i0], p1 = this.shorePts[i1], p2 = this.shorePts[i2];
  
        const ha01 = this._sampleGrid(this.Ngrid, p0[0], p0[1]);
        const hb01 = this._sampleGrid(this.Ngrid, p1[0], p1[1]);
        const hc01 = this._sampleGrid(this.Ngrid, p2[0], p2[1]);
        const za = ha01 * this.heightScale;
        const zb = hb01 * this.heightScale;
        const zc = hc01 * this.heightScale;
  
        const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = zb - za;
        const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = zc - za;
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz) || 1;
        const normal = [nx / len, ny / len, nz / len];
  
        const mx = (p0[0] + p1[0] + p2[0]) / 3;
        const my = (p0[1] + p1[1] + p2[1]) / 3;
  
        const elev01 = (ha01 + hb01 + hc01) / 3;
  
        const path = new Path2D();
        path.moveTo(p0[0], p0[1]);
        path.lineTo(p1[0], p1[1]);
        path.lineTo(p2[0], p2[1]);
        path.closePath();
  
        const cxRiver = this._river.centerX(my);
        const riverW = this._river.widthAt(my);
        const isWater = this._river.enabled && riverW > 1e-3 && Math.abs(mx - cxRiver) <= riverW * 0.98;

        this.triData[i] = { normal, mx, my, elev01, path, isWater };
      }
    }

    _sampleGrid(arr, x, y){
      const gx = clamp(x / this.gs, 0, this.cols - 1);
      const gy = clamp(y / this.gs, 0, this.rows - 1);
      const ix0 = Math.floor(gx), iy0 = Math.floor(gy);
      const ix1 = Math.min(ix0 + 1, this.cols - 1);
      const iy1 = Math.min(iy0 + 1, this.rows - 1);
      const fx = gx - ix0, fy = gy - iy0;
      const i00 = iy0 * this.cols + ix0, i10 = iy0 * this.cols + ix1;
      const i01 = iy1 * this.cols + ix0, i11 = iy1 * this.cols + ix1;
      const hx0 = arr[i00] * (1 - fx) + arr[i10] * fx;
      const hx1 = arr[i01] * (1 - fx) + arr[i11] * fx;
      return hx0 * (1 - fy) + hx1 * fy;
    }

    _buildShadow(){
      const { w, h } = this.size;
      const az = (this.settings.azimuth % 360) * Math.PI / 180;
      const el = clamp(this.settings.elevation, 5, 85) * Math.PI / 180;

      const L = [Math.cos(el)*Math.cos(az), Math.cos(el)*Math.sin(az), Math.sin(el)];
      this._L = L;

      const Lxy = Math.hypot(L[0], L[1]) || 1e-4;
      const tanAlt = L[2] / Lxy;
      const dirXY = [L[0]/Lxy, L[1]/Lxy];

      const q = this.interacting ? 2.5 : 1.0;
      const gsLocal = Math.max(2, Math.round(this.gs * q));
      const colsLocal = Math.floor(w/gsLocal) + 1;
      const rowsLocal = Math.floor(h/gsLocal) + 1;

      const S = new Float32Array(rowsLocal * colsLocal);
      const step = Math.max(1, gsLocal);
      const bias = 1.0;

      const sidx = (ix,iy)=> iy * colsLocal + ix;

      for (let iy=0; iy<rowsLocal; iy++){
        const y0 = iy * gsLocal;
        for (let ix=0; ix<colsLocal; ix++){
          const x0 = ix * gsLocal;
          const z0 = this._sampleGrid(this.Hgrid, x0, y0);
          let inShadow = 0;

          const dxE = dirXY[0] > 0 ? (w - x0)/dirXY[0] : dirXY[0] < 0 ? (0 - x0)/dirXY[0] : Infinity;
          const dyE = dirXY[1] > 0 ? (h - y0)/dirXY[1] : dirXY[1] < 0 ? (0 - y0)/dirXY[1] : Infinity;
          const maxD = Math.min(dxE, dyE);

          for (let d = step; d < maxD; d += step){
            const x = x0 + dirXY[0]*d, y = y0 + dirXY[1]*d;
            const zRay = z0 + d * tanAlt;
            const zT = this._sampleGrid(this.Hgrid, x, y);
            if (zT > zRay + bias){ inShadow = 1; break; }
          }
          S[sidx(ix,iy)] = inShadow;
        }
      }

      const radius = Math.max(1, Math.round(lerp(1, 5, this.settings.softness) / q));
      const K = 2*radius + 1;
      const kernel = new Float32Array(K);
      let c = 1;
      for (let i=0;i<K;i++){
        c = i==0 ? 1 : (c * (K - i)) / i;
        kernel[i] = c;
      }
      let ksum = 0; for (let i=0;i<K;i++) ksum += kernel[i];

      const TMP = new Float32Array(rowsLocal * colsLocal);
      for (let iy=0; iy<rowsLocal; iy++){
        for (let ix=0; ix<colsLocal; ix++){
          let sum = 0;
          for (let k=-radius; k<=radius; k++){
            const jx = Math.max(0, Math.min(colsLocal - 1, ix + k));
            sum += kernel[k+radius] * S[sidx(jx,iy)];
          }
          TMP[sidx(ix,iy)] = sum / ksum;
        }
      }
      const OUT = new Float32Array(rowsLocal * colsLocal);
      for (let iy=0; iy<rowsLocal; iy++){
        for (let ix=0; ix<colsLocal; ix++){
          let sum = 0;
          for (let k=-radius; k<=radius; k++){
            const jy = Math.max(0, Math.min(rowsLocal - 1, iy + k));
            sum += kernel[k+radius] * TMP[sidx(ix,jy)];
          }
          OUT[sidx(ix,iy)] = sum / ksum;
        }
      }
      this.SB = { map: OUT, gsLocal, colsLocal, rowsLocal };
    }

    _landFill(elev01, lightI, mx, my){
      const e = clamp01(elev01);
      const lit = clamp01(lightI);
      const palette = PALETTES[this.biomeKey] || PALETTES.mountainous;

      let activeLayer = palette.layers[palette.layers.length - 1];
      let layerT = 0;
      for (const layer of palette.layers){
        const [start, end] = layer.range;
        if (e >= start && e <= end){
          activeLayer = layer;
          const span = Math.max(1e-6, end - start);
          layerT = clamp01((e - start) / span);
          break;
        }
        if (e > end){
          activeLayer = layer;
          layerT = 1;
        }
      }

      const pick = (span) => {
        if (Array.isArray(span)) {
          const [a, b] = span;
          return lerp(a, b, layerT);
        }
        return span;
      };

      let hVal = pick(activeLayer.h);
      let sVal = pick(activeLayer.s);
      let lBase = pick(activeLayer.lBase);
      let lRange = pick(activeLayer.lRange);

      if (palette.warmShift) {
        const { pivot = 25, range = 20, hTarget = hVal, hAmount = 0, sDelta = 0, sAmount = 0 } = palette.warmShift;
        const warm = clamp01((pivot - this.settings.elevation) / Math.max(1e-6, range));
        if (hAmount !== 0) {
          hVal = lerp(hVal, hTarget, warm * hAmount);
        }
        if (sAmount !== 0 && sDelta !== 0) {
          sVal = lerp(sVal, sVal + sDelta, warm * sAmount);
        }
      }

      if (palette.toneNoise) {
        const tn = palette.toneNoise;
        const scaleX = tn.scaleX ?? tn.scale ?? 0;
        const scaleY = tn.scaleY ?? tn.scale ?? 0;
        const offsetX = tn.offsetX ?? 0;
        const offsetY = tn.offsetY ?? 0;
        const n = this.noise2D(mx * scaleX + offsetX, my * scaleY + offsetY);
        hVal += n * (tn.hAmp ?? 0);
        lBase += n * (tn.lBaseAmp ?? 0);
        lRange += n * (tn.lRangeAmp ?? 0);
      }

      if (palette.stripes && this.biomeDef?.farmland) {
        const stripes = palette.stripes;
        const intensity = this.biomeDef.farmland.intensity ?? 0;
        if (intensity > 0) {
          const stripeNoise = Math.sin(
            mx * (stripes.baseScaleX ?? 0) +
            my * (stripes.baseScaleY ?? 0) +
            this.seed * 0.001 +
            this.noise2D(mx * (stripes.noiseScaleX ?? 0), my * (stripes.noiseScaleY ?? 0) + 200) * 2.4
          );
          if (stripeNoise > (stripes.threshold ?? 0.92) && e > (stripes.minElevation ?? 0)) {
            lBase += intensity * (stripes.lighten ?? 0);
            sVal = lerp(sVal, sVal - (stripes.saturationDrop ?? 0), 0.4);
          }
        }
      }

      const baseLit = lBase + lRange * (lit - 0.5) * 2;
      const finalL = clamp(baseLit, 6, 98);
      return `hsla(${hVal.toFixed(1)}, ${sVal.toFixed(1)}%, ${finalL.toFixed(1)}%, 1)`;
    }

    _computeWaterColor(I){
      const waterCfg = PALETTES[this.biomeKey]?.water || {};
      const hue = waterCfg.hue ?? 205;
      const sat = waterCfg.saturation ?? 82;
      const light = lerp(waterCfg.lightMin ?? 32, waterCfg.lightMax ?? 58, clamp01(I));

      const base = hslToRgb01(hue, sat, light);
      const glint = this._currentGlintColor();
      const glRgb = hslToRgb01(glint.h, glint.s, glint.l);

      const rawWarm = clamp01(glint.warmFactor ?? 0);
      const warmBlend = rawWarm > 0 ? smoothstep(0, 1, rawWarm) : 0;
      const tintScale = clamp(waterCfg.tint ?? 0.05, 0, 0.4);
      const highlight = clamp01(I);

      const baseTint = clamp(tintScale * (0.64 + highlight * 1.45), 0, 0.34);
      const warmTintTarget = clamp(0.65 + tintScale * 1.65 + highlight * 0.38, 0, 0.75);
      const tint = clamp(warmBlend > 0 ? lerp(baseTint, warmTintTarget, warmBlend) : baseTint, 0, 0.75);

      let r = clamp(base.r * (1 - tint) + glRgb.r * tint, 0, 1);
      let g = clamp(base.g * (1 - tint) + glRgb.g * tint, 0, 1);
      let b = clamp(base.b * (1 - tint) + glRgb.b * tint, 0, 1);

      const shadowDamping = clamp(0.52 + highlight * 0.88, 0.6, 1.08);
      r = clamp(r * shadowDamping, 0, 1);
      g = clamp(g * shadowDamping, 0, 1);
      b = clamp(b * shadowDamping, 0, 1);

      return `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`;
    }

    _precomputeWaterColors() {
      for (let i = 0; i < 256; i++) {
        this._waterColorCache[i] = this._computeWaterColor(i / 255);
      }
    }

    _waterColor(I) {
      const index = Math.round(clamp01(I) * 255);
      return this._waterColorCache[index];
    }

    _redrawBase(){
      const { w, h } = this.size;
      const ctx = this.baseCtx;
      if (!ctx) return;

      const fireReady = () => {
        if (!this._readyFired) {
          this._readyFired = true;
          if (this.onReady) {
            try { this.onReady(); } catch (e) { /* ignore */ }
          }
        }
      };

      ctx.clearRect(0,0,w,h);
      if (!this.SB) return;
      ctx.fillStyle = '#000';
      ctx.fillRect(0,0,w,h);

      this._waterTris = [];

      const L = this._L || this.sunDir;
      const Vv = [0,0,1];
      const facingStart = lerp(0.7, 0.4, this.settings.softness);
      const ambientLit = 0.33, ambientShadow = 0.05;

      ctx.lineWidth = 0.6;
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 2.5;

      const sb = this.SB;
      const sIdx = (ix,iy)=> iy * sb.colsLocal + ix;

      for (let i = 0; i < this.triData.length; i++) {
        const { normal: Ntri, mx, my, elev01, path, isWater } = this.triData[i];

        const diffuse = Math.max(0, Ntri[0]*L[0] + Ntri[1]*L[1] + Ntri[2]*L[2]);
        const Hx = L[0] + Vv[0], Hy = L[1] + Vv[1], Hz = L[2] + Vv[2];
        const Hlen = Math.hypot(Hx,Hy,Hz) || 1;
        const H = [Hx/Hlen, Hy/Hlen, Hz/Hlen];
        const spec = Math.pow(Math.max(0, Ntri[0]*H[0] + Ntri[1]*H[1] + Ntri[2]*H[2]), 24) * 0.35;
        
        const gx = clamp(mx / sb.gsLocal, 0, sb.colsLocal - 1);
        const gy = clamp(my / sb.gsLocal, 0, sb.rowsLocal - 1);
        const ix0 = Math.floor(gx), iy0 = Math.floor(gy);
        const ix1 = Math.min(ix0 + 1, sb.colsLocal - 1);
        const iy1 = Math.min(iy0 + 1, sb.rowsLocal - 1);
        const fx = gx - ix0, fy = gy - iy0;
        const s00 = sb.map[sIdx(ix0,iy0)], s10 = sb.map[sIdx(ix1,iy0)];
        const s01 = sb.map[sIdx(ix0,iy1)], s11 = sb.map[sIdx(ix1,iy1)];
        const sSoft = (s00*(1-fx)+s10*fx)*(1-fy) + (s01*(1-fx)+s11*fx)*fy;
        const gamma = lerp(1.7, 0.8, this.settings.softness);
        const s = Math.pow(sSoft, gamma);
        
        const litI = clamp01(ambientLit   + 1.20*diffuse + 0.35*spec);
        const shI  = clamp01(ambientShadow + 0.04*diffuse);
        let I = lerp(shI, litI, 1 - s);
        I = clamp01(I + 0.26 * smoothstep(facingStart, 1.0, diffuse));
        I = clamp01((I - 0.5) * this.settings.contrast + 0.5);

        if (isWater){
          this._waterTris.push({ path, mx, my, I });
        } else {
          const fill = this._landFill(elev01, I, mx, my);
          ctx.fillStyle = fill;
          ctx.strokeStyle = fill;
          ctx.fill(path);
          ctx.stroke(path);
        }
      }
      this._compose();
      fireReady();
    }

    _drawOverlay(timeSec){
      const { w, h } = this.size;
      const ctx = this.overCtx;
      if (!ctx) return;
      ctx.clearRect(0,0,w,h);

      {
        const L = this._L || this.sunDir;
        const LxyLen = Math.hypot(L[0], L[1]) || 1e-6;
        const dx = L[0] / LxyLen, dy = L[1] / LxyLen;
        const horiz = Math.min(1, Math.max(0, LxyLen));

        const glint = this._currentGlintColor();
        const baseAlpha = 0.9 * horiz * (0.75 + (glint.warmFactor ?? 0) * 0.5);
        const bloomW = Math.max(10, Math.round(Math.min(w, h) * 0.25));

        const edgeWeights = {
          right: Math.max(0,  dx),
          left:  Math.max(0, -dx),
          bottom:Math.max(0,  dy),
          top:   Math.max(0, -dy)
        };

        const colorWithA = (a)=> hslaString(glint.h, glint.s, glint.l, a);

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.filter = 'blur(1px)';

        if (edgeWeights.right > 0) {
          const alpha = baseAlpha * Math.pow(edgeWeights.right, 0.85);
          const g = ctx.createLinearGradient(w, 0, w - bloomW, 0);
          g.addColorStop(0, colorWithA(alpha));
          g.addColorStop(1, colorWithA(0));
          ctx.fillStyle = g;
          ctx.fillRect(w - bloomW, 0, bloomW, h);
        }
        if (edgeWeights.left > 0) {
          const alpha = baseAlpha * Math.pow(edgeWeights.left, 0.85);
          const g = ctx.createLinearGradient(0, 0, bloomW, 0);
          g.addColorStop(0, colorWithA(alpha));
          g.addColorStop(1, colorWithA(0));
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, bloomW, h);
        }
        if (edgeWeights.bottom > 0) {
          const alpha = baseAlpha * Math.pow(edgeWeights.bottom, 0.85);
          const g = ctx.createLinearGradient(0, h, 0, h - bloomW);
          g.addColorStop(0, colorWithA(alpha));
          g.addColorStop(1, colorWithA(0));
          ctx.fillStyle = g;
          ctx.fillRect(0, h - bloomW, w, bloomW);
        }
        if (edgeWeights.top > 0) {
          const alpha = baseAlpha * Math.pow(edgeWeights.top, 0.85);
          const g = ctx.createLinearGradient(0, 0, 0, bloomW);
          g.addColorStop(0, colorWithA(alpha));
          g.addColorStop(1, colorWithA(0));
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, bloomW);
        }

        ctx.restore();
      }

      if (this._waterTris.length > 0 && this.settings.animateWater){
        const k = 0.028;
        const dirx = Math.cos(this.windA), diry = Math.sin(this.windA);
        const kx1 = dirx*k, ky1 = diry*k;
        const kx2 = -diry*(k*0.6), ky2 =  dirx*(k*0.6);
        const omega1 = 2.8, omega2 = 1.7;
        const amp1 = 0.22, amp2 = 0.14;

        for (const wt of this._waterTris){
          const phase1 = kx1*wt.mx + ky1*wt.my - omega1*timeSec*0.1;
          const phase2 = kx2*wt.mx + ky2*wt.my - omega2*timeSec*0.1 + 0.9;
          const Ii = clamp01(wt.I + amp1*Math.sin(phase1) + amp2*Math.sin(phase2));
          const c = this._waterColor(Ii);
          ctx.fillStyle = c;
          ctx.strokeStyle = c;
          ctx.fill(wt.path);
          ctx.stroke(wt.path);
        }
      }

      for(const flock of this.flocks){
        for(const b of flock.birds){
          this._drawBird(b,ctx);
        }
      }
      this._compose();
    }

    _drawBird(b, ctx) {
      const s = 1.1 * b.scale;
      const size = 8 * s;
      const baseAngle = 1.7;
      const amp = 0.5 * Math.sin(b.phase);
      const V_angle = baseAngle + amp;
      const halfAngle = V_angle / 2;

      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.heading + Math.PI/2);
      ctx.fillStyle = '#000';

      const tipPoint = [0, -size * 0.7];
      const leftWing = [-size * Math.sin(halfAngle), size * Math.cos(halfAngle)];
      const rightWing = [size * Math.sin(halfAngle), size * Math.cos(halfAngle)];
      const notchPoint = [0, size * 0.4];

      ctx.beginPath();
      ctx.moveTo(tipPoint[0], tipPoint[1]);
      ctx.lineTo(leftWing[0], leftWing[1]);
      ctx.lineTo(notchPoint[0], notchPoint[1]);
      ctx.lineTo(rightWing[0], rightWing[1]);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    _maybeSpawn(now){
      const maxFlocks=3; const cooldown=9000+Math.random()*7000;
      if(this.flocks.length>=maxFlocks) return;
      if(now - this.lastSpawn < cooldown) return;
      this.lastSpawn=now;
      const sizes=[3,5,7];
      const count=sizes[(Math.random()*sizes.length)|0];
      const {w,h}=this.size;
      const dirx=Math.cos(this.windA), diry=Math.sin(this.windA);
      const perpX = -diry, perpY = dirx;
      const targetX = Math.random() * w;
      const targetY = Math.random() * h;
      const spawnDistance = Math.max(w, h) * 0.65 + 80;
      const baseX = targetX - dirx * spawnDistance;
      const baseY = targetY - diry * spawnDistance;
      const alongJitterRange = 18;
      const lateralJitterRange = 10;
      const birds = new Array(count);
      const centerIndex = (count - 1) / 2;
      for(let i=0; i<count; i++){
        const spread=18+Math.random()*12;
        const off=(i-centerIndex)*spread;
        const forwardJitter = (Math.random()-0.5) * alongJitterRange;
        birds[i]={
          x: baseX + perpX * off + dirx * forwardJitter + (Math.random()-0.5) * lateralJitterRange,
          y: baseY + perpY * off + diry * forwardJitter + (Math.random()-0.5) * lateralJitterRange,
          heading: this.windA,
          speed: 12 + Math.random() * 10,
          scale: 0.8 + Math.random() * 0.6,
          phase: Math.random() * TAU,
          flapSpeed: 4 + Math.random() * 2
        };
      }
      const pushBack = Math.max(w, h) * 0.4;
      if (birds.some(b => b.x >= 0 && b.x <= w && b.y >= 0 && b.y <= h)){
        for (const b of birds){
          b.x -= dirx * pushBack;
          b.y -= diry * pushBack;
        }
      }
      this.flocks.push({ birds, life: 1 });
    }

    _updateFlocks(dt, now){
      this.windA += 0.05 * dt * (Math.sin(now * 0.0001) * 0.3 + 1);
      const WA = this.windA;
      for(const flock of this.flocks){
        const B = flock.birds;
        for(let i=0; i<B.length; i++){
          const b = B[i];
          b.heading = lerpAngle(b.heading, WA, 0.05 * dt * 60);
          b.x += Math.cos(b.heading) * b.speed * dt;
          b.y += Math.sin(b.heading) * b.speed * dt;
          const up = Math.sin(b.phase) < 0;
          const asym = up ? 1.6 : 1.0;
          const c = Math.abs(Math.cos(b.phase));
          const dwellMul = 0.35 + 0.65 * (c*c);
          b.phase += b.flapSpeed * asym * dwellMul * dt;
        }
      }
      const {w,h} = this.size;
      const margin = 60;
      this.flocks = this.flocks.filter(f => f.birds.some(b => b.x > -margin && b.x < w + margin && b.y > -margin && b.y < h + margin));
    }

    _compose(){
      const { w, h } = this.size;
      const m = this.ctxMain;
      m.clearRect(0,0,w,h);
      m.drawImage(this.offBase, 0, 0);
      m.drawImage(this.offOver, 0, 0);
    }

    _loop(ts){
      const now = ts;
      const last = this.lastT || now;
      const dt = Math.min(0.05, (now - last) / 1000);
      this.lastT = now;

      this._maybeSpawn(now);
      this._updateFlocks(dt, now);
      this._drawOverlay(now / 1000);

      this._animRef = requestAnimationFrame(this._loop);
    }
  }

  window.TerrainBackground = TerrainBackground;
})();