(() => {
  const OMIT_KEYS = new Set(['id','location','panoId','panoDate','heading','pitch','zoom']);
  const MODE_KEY = 'extClickMode';
  const SEL_KEY = 'extHasSelection';
  const WRAP_MARK = '__extMoveWrapped';
  const BYPASS = '__extBypass';

  // --- Helpers --------------------------------------------------------------

  function currentClickMode() {
    try {
      const v = localStorage.getItem(MODE_KEY);
      return v === 'move' ? 'move' : 'add';
    } catch { return 'add'; }
  }

  function findStore() {
    if (window._editorStore && typeof window._editorStore.dispatch === 'function') return window._editorStore;
    try {
      for (const k of Object.getOwnPropertyNames(window)) {
        const v = window[k];
        if (v && typeof v.dispatch === 'function' && (typeof v.getState === 'function' || 'currentLocation' in v)) {
          return v;
        }
      }
    } catch {}
    return null;
  }

  function currentState(store) {
    if (!store) return null;
    try { return typeof store.getState === 'function' ? store.getState() : store; }
    catch { return store || null; }
  }

  function hasSelection(state) {
    try {
      const cl = state?.currentLocation;
      return !!(cl && (cl.location || cl.updatedProps));
    } catch { return false; }
  }

  const cloneJSON = (v) => {
    try { return v == null ? v : JSON.parse(JSON.stringify(v)); }
    catch { return undefined; }
  };

  function buildPreserved(state) {
    const cl = state?.currentLocation;
    const baseA = cl?.location && typeof cl.location === 'object' ? cl.location : {};
    const baseB = cl?.updatedProps && typeof cl.updatedProps === 'object' ? cl.updatedProps : {};
    const merged = Object.assign({}, baseA, baseB);

    const out = {};
    for (const [k, v] of Object.entries(merged)) {
      if (!OMIT_KEYS.has(k)) out[k] = cloneJSON(v);
    }

    if (state?.currentMapId != null && out.mapId == null) out.mapId = state.currentMapId;

    return out;
  }

  function shouldTransform(action, state) {
    if (!action || typeof action !== 'object') return false;
    if (action[BYPASS]) return false;
    if (action.type !== 'newLocation') return false;
    if (currentClickMode() !== 'move') return false;
    return hasSelection(state);
  }

  function installWrapper() {
    const store = findStore();
    if (!store || store[WRAP_MARK]) return false;

    const rawDispatch = store.dispatch.bind(store);
    store[WRAP_MARK] = true;

    store.dispatch = function wrappedDispatch(action) {
      try {
        const state = currentState(store);

        if (shouldTransform(action, state)) {
          const preserved = buildPreserved(state);
          const incoming = (action && action.location && typeof action.location === 'object') ? action.location : {};
          const merged = Object.assign({}, preserved, incoming);
          if (preserved.flags != null) merged.flags = preserved.flags;
          if (Array.isArray(preserved.tags)) merged.tags = preserved.tags;

          try {
            rawDispatch({ type: 'closeAndDeleteLocation', [BYPASS]: true });
          } catch {}

          const movedAdd = { type: 'newLocation', location: merged, [BYPASS]: true };
          return rawDispatch(movedAdd);
        }
      } catch {}
      return rawDispatch(action);
    };

    return true;
  }

  function ensureWrappedLoop() {
    try {
      const s = findStore();
      if (!s) return;
      if (!s[WRAP_MARK] || typeof s.dispatch !== 'function') {
        installWrapper();
      }
    } catch {}
  }

  installWrapper();
  const iv = setInterval(ensureWrappedLoop, 1500);

  let __extSelUnsub = null;
  let __extLastStore = null;
  function ensureSelectionSubscription() {
    try {
      const s = findStore();
      if (!s) return;
      if (s !== __extLastStore) {
        __extLastStore = s;
        try { __extSelUnsub && __extSelUnsub(); } catch {}
        if (typeof s.subscribe === 'function') {
          __extSelUnsub = s.subscribe(() => { try { broadcastSelection(); } catch {} });
        }
      }
    } catch {}
  }
  ensureSelectionSubscription();

  function broadcastSelection() {
    try {
      const s = findStore();
      const st = currentState(s);
      const on = hasSelection(st);
      const v = on ? '1' : '0';
      const prev = localStorage.getItem(SEL_KEY);
      if (prev !== v) {
        localStorage.setItem(SEL_KEY, v);
        try { window.dispatchEvent(new StorageEvent('storage', { key: SEL_KEY, oldValue: prev, newValue: v, storageArea: localStorage })); } catch {}
        try { window.dispatchEvent(new CustomEvent('ext:selection', { detail: { hasSelection: on } })); } catch {}
      }
      try { window.__extScheduleSelectionDedupe?.(); } catch {}
    } catch {}
  }
  try { broadcastSelection(); } catch {}
  const selIv = setInterval(() => { try { ensureSelectionSubscription(); broadcastSelection(); } catch {} }, 400);
  window.addEventListener('pagehide', () => { try { clearInterval(iv); } catch {} });
  window.addEventListener('pagehide', () => { try { clearInterval(selIv); } catch {} });
  window.addEventListener('pagehide', () => { try { __extSelUnsub && __extSelUnsub(); } catch {} });

})();

(() => {
  if (window.__extShapesBridge) return;

  // ---------- utils ----------
  const isPoly = (g) => g && (g.type === 'Polygon' || g.type === 'MultiPolygon');

  function normalizeLng(lng) { let L = lng; while (L > 180) L -= 360; while (L < -180) L += 360; return L; }
  function normalizePathAntiMeridian(coords) {
    if (!coords || coords.length < 2) return coords || [];
    const out = [coords[0].slice()];
    for (let i = 1; i < coords.length; i++) {
      let [lng, lat] = coords[i], [plng] = out[i - 1];
      while (lng - plng > 180) lng -= 360;
      while (plng - lng > 180) lng += 360;
      out.push([lng, lat]);
    }
    return out.map(([lng, lat]) => [normalizeLng(lng), lat]);
  }
  function boundsFromCoords(coords) {
    const b = new google.maps.LatLngBounds();
    const push = (lng, lat) => b.extend(new google.maps.LatLng(lat, lng));
    const dig = (node) => { if (typeof node?.[0] === 'number') push(node[0], node[1]); else node?.forEach?.(dig); };
    dig(coords);
    return b;
  }
  function padBounds(map, bounds, px = 100) {
    try { map.fitBounds(bounds, { top: px, right: px, bottom: px, left: px }); } catch { map.fitBounds(bounds); }
  }
  function getMap() {
    if (window.__extMainMap instanceof google.maps.Map) return window.__extMainMap;
    try { for (const k in window) { const v = window[k]; if (v instanceof google.maps.Map) return (window.__extMainMap = v); } } catch {}
    return null;
  }

  // ---------- editor / selections ----------
  function findEditorWindow(root = window, depth = 0, maxDepth = 5) {
    try {
      const ed = root?.editor;
      if (ed && (typeof ed.selectGeoJSON === "function" || typeof ed.selectPolygon === "function" ||
                 typeof ed?.actions?.selectGeoJSON === "function" || typeof ed?.actions?.selectPolygon === "function")) {
        return root;
      }
    } catch {}
    if (depth >= maxDepth) return null;
    for (let i = 0; i < (root.frames?.length || 0); i++) {
      try { const found = findEditorWindow(root.frames[i], depth + 1, maxDepth); if (found) return found; } catch {}
    }
    return null;
  }
  function getEditor() { return findEditorWindow(window)?.editor || null; }
  function getSelections() { return getEditor()?.selections || []; }
  function getSelectionKeysSet() { return new Set(getSelections().map(s => s.key)); }
  function getSelectionGeometry(sel) { return sel?.props?.polygon?.geometry || sel?.polygon?.geometry || sel?.geometry || null; }
  function getSelectionExtId(sel) {
    try { return sel?.props?.polygon?.properties?.extId ?? sel?.polygon?.properties?.extId ?? sel?.properties?.extId ?? null; }
    catch { return null; }
  }
  function getSelectionByKey(key) {
    return (getEditor()?.selections || []).find(s => s.key === key) || null;
  }

  // canonical sig helpers
  function canonicalizeRing(ring) {
    if (!Array.isArray(ring) || !ring.length) return [];
    const closed = (ring[0][0] === ring[ring.length-1][0] && ring[0][1] === ring[ring.length-1][1]) ? ring.slice() : [...ring, ring[0]];
    let minIdx = 0;
    for (let i = 1; i < closed.length-1; i++) {
      const [aLng,aLat] = closed[i], [bLng,bLat] = closed[minIdx];
      if (aLng < bLng || (aLng === bLng && aLat < bLat)) minIdx = i;
    }
    const core = closed.slice(0, -1);
    const rotated = core.slice(minIdx).concat(core.slice(0, minIdx));
    rotated.push(rotated[0]);
    return rotated.map(([lng,lat]) => [Number(lng.toFixed(6)), Number(lat.toFixed(6))]);
  }
  function polygonSignature(geom) {
    if (!geom || !geom.type || !geom.coordinates) return '';
    if (geom.type === 'Polygon') {
      const outer = canonicalizeRing(geom.coordinates[0] || []);
      return 'P|' + JSON.stringify(outer);
    }
    if (geom.type === 'MultiPolygon') {
      const parts = (geom.coordinates || []).map(poly => canonicalizeRing((poly || [])[0] || []));
      return 'M|' + JSON.stringify(parts);
    }
    return '';
  }
  function findSelectionKeyByExtIdOrGeometry({ extId, geom }) {
    const sels = getSelections();
    if (extId) {
      const hit = sels.find(s => getSelectionExtId(s) === extId);
      if (hit) return hit.key || null;
    }
    const sigTarget = polygonSignature(geom);
    if (sigTarget) {
      const hit = sels.find(s => polygonSignature(getSelectionGeometry(s)) === sigTarget);
      if (hit) return hit.key || null;
    }
    return null;
  }

  const SELECTION_DEDUPE_STATE = { running: false, timer: null };

  const selectionTypeHint = (sel) => sel?.type || sel?.selectionType || sel?.selectionKind || sel?.category || '';
  function selectionNameHint(sel) {
    const val = sel?.tagName
      ?? sel?.tag?.name
      ?? sel?.tag?.displayName
      ?? sel?.filter?.name
      ?? sel?.filter?.displayName
      ?? sel?.name
      ?? sel?.displayName
      ?? sel?.label
      ?? sel?.title
      ?? sel?.chip?.label
      ?? sel?.props?.name
      ?? sel?.props?.label
      ?? sel?.props?.tag?.name
      ?? '';
    if (!val) return '';
    return String(val).trim().replace(/\s+/g, ' ').toLowerCase();
  }
  const selectionLayerHint = (sel) => sel?.layerId ?? sel?.layer?.id ?? sel?.filter?.layerId ?? sel?.props?.layerId ?? sel?.props?.tag?.layerId ?? null;
  const selectionTagIdHint = (sel) => sel?.tagId ?? sel?.tag?.id ?? sel?.filter?.id ?? sel?.props?.tagId ?? sel?.props?.tag?.id ?? sel?.id ?? null;

  function selectionSignature(sel) {
    if (!sel || typeof sel !== 'object') return null;
    const extId = getSelectionExtId(sel);
    const geomSig = polygonSignature(getSelectionGeometry(sel));
    const kind = selectionTypeHint(sel);
    const layerId = selectionLayerHint(sel);
    const tagId = selectionTagIdHint(sel);
    const name = selectionNameHint(sel);

    const parts = [];
    if (extId) parts.push(`ext:${extId}`);
    if (geomSig) parts.push(`geom:${geomSig}`);
    if (kind) parts.push(`kind:${kind}`);
    if (layerId) parts.push(`layer:${layerId}`);
    if (tagId) parts.push(`tag:${tagId}`);
    if (name) parts.push(`name:${name}`);
    if (!parts.length && sel?.key) parts.push(`key:${sel.key}`);

    return parts.length ? parts.join('|') : null;
  }

  async function runSelectionDedupe() {
    if (SELECTION_DEDUPE_STATE.running) return;
    const editor = getEditor();
    if (!editor) return;

    const selections = getSelections();
    if (!Array.isArray(selections) || selections.length < 2) return;

    SELECTION_DEDUPE_STATE.running = true;
    try {
      const seen = new Map();
      const duplicates = [];

      for (const sel of selections) {
        const sig = selectionSignature(sel);
        if (!sig) continue;
        if (!seen.has(sig)) {
          seen.set(sig, sel);
        } else {
          duplicates.push(sel);
        }
      }

      for (const dup of duplicates) {
        if (!dup) continue;
        const extId = getSelectionExtId(dup) || null;
        const geom = getSelectionGeometry(dup) || null;
        const key = dup?.key || findSelectionKeyByExtIdOrGeometry({ extId, geom });
        if (!key && !extId && !geom) continue;
        try {
          await removeSelectionByKeyOrExtId({ key: key || null, extId: key ? null : extId });
        } catch (err) {
          console.warn('[EXT] Failed to remove duplicate selection:', err);
          continue;
        }
        const notifyKey = key || findSelectionKeyByExtIdOrGeometry({ extId, geom });
        if (notifyKey) {
          try { window.postMessage({ source: 'EXT_SHAPES', type: 'EXT_SELECTION_DESELECTED', selectionKey: notifyKey }, '*'); } catch {}
        }
      }
    } finally {
      SELECTION_DEDUPE_STATE.running = false;
    }
  }

  function scheduleSelectionDedupe(delay = 120) {
    const ms = Math.max(0, Number.isFinite(delay) ? delay : 0);
    if (SELECTION_DEDUPE_STATE.timer) return;
    SELECTION_DEDUPE_STATE.timer = setTimeout(() => {
      SELECTION_DEDUPE_STATE.timer = null;
      runSelectionDedupe().catch(err => { try { console.warn('[EXT] Selection dedupe error:', err); } catch {} });
    }, ms);
  }

  window.__extScheduleSelectionDedupe = (delay) => {
    try { scheduleSelectionDedupe(delay == null ? 80 : delay); } catch {}
  };

  const dedupePoll = setInterval(() => { try { scheduleSelectionDedupe(0); } catch {} }, 1600);
  window.addEventListener('pagehide', () => {
    try { clearInterval(dedupePoll); } catch {}
    if (SELECTION_DEDUPE_STATE.timer) {
      try { clearTimeout(SELECTION_DEDUPE_STATE.timer); } catch {}
      SELECTION_DEDUPE_STATE.timer = null;
    }
  }, { once: true });

  function samePt(a, b, eps = 1e-10) { return a && b && Math.abs(a[0]-b[0])<eps && Math.abs(a[1]-b[1])<eps; }
  function ensureClosedRing(ring) { if (!ring.length) return ring; return samePt(ring[0], ring[ring.length-1]) ? ring : [...ring, [...ring[0]]]; }
  function toFeatureFromPolygon(polyCoords, props = {}) {
    const coords = polyCoords.map(ensureClosedRing);
    return { type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: coords } };
  }
  function toFeatureCollection(inputShape, props = {}) {
    if (!inputShape?.geometry?.type || !inputShape?.geometry?.coordinates) throw new Error("Invalid shape: missing geometry");
    const g = inputShape.geometry;
    if (g.type === "Polygon")      return { type: "FeatureCollection", features: [toFeatureFromPolygon(g.coordinates, props)] };
    if (g.type === "MultiPolygon") return { type: "FeatureCollection", features: g.coordinates.map(coords => toFeatureFromPolygon(coords, props)) };
    throw new Error(`Unsupported geometry type: ${g.type} (expected Polygon or MultiPolygon)`);
  }

  // ---------- add / remove / setColor / reveal ----------
  async function addSelectionFromShape(shape, opts = {}) {
    const editor = getEditor();
    if (!editor) throw new Error("Could not locate the editor object (window.editor).");

    const selectGeoJSON = editor.selectGeoJSON || editor?.actions?.selectGeoJSON || null;
    const selectPolygon = editor.selectPolygon || editor?.actions?.selectPolygon || null;
    if (!selectGeoJSON && !selectPolygon) throw new Error("Editor does not expose selectGeoJSON/selectPolygon.");

    const setSelectionColor = editor.setSelectionColor || editor?.actions?.setSelectionColor || null;
    const setPolygonName    = editor.setPolygonName    || editor?.actions?.setPolygonName    || null;

    const props = {
      ...(shape.properties || {}),
      ...(shape.style || {}),
      ...(opts?.name ? { name: opts.name } : {}),
      ...(shape.id ? { extId: shape.id } : {})
    };

    const beforeKeys = getSelectionKeysSet();

    if (selectGeoJSON) {
      const fc = toFeatureCollection(shape, props);
      await selectGeoJSON(fc);
    } else {
      const fc = toFeatureCollection(shape, props);
      for (const feat of fc.features) await selectPolygon(feat);
    }

    await Promise.resolve();
    await new Promise(r => setTimeout(r, 0));

    let key = findSelectionKeyByExtIdOrGeometry({ extId: shape.id || null, geom: shape.geometry });

    if (!key) {
      const after = getSelections();
      for (const s of after) if (!beforeKeys.has(s.key)) { key = s.key; break; }
    }

    if (key) {
      if (opts?.color && setSelectionColor) { try { setSelectionColor(key, opts.color); } catch {} }
      if (opts?.name  && setPolygonName)    { try { setPolygonName(key, opts.name); } catch {} }
    }

    let color = null;
    try { color = getSelectionByKey(key)?.color ?? null; } catch {}
    return { key: key || null, color };
  }

  async function setSelectionColorByKey({ key, color }) {
    const editor = getEditor();
    if (!editor) throw new Error("Editor not found");
    const setSelectionColor = editor.setSelectionColor || editor?.actions?.setSelectionColor || null;
    if (typeof setSelectionColor !== 'function') throw new Error("setSelectionColor API not available");
    await setSelectionColor(key, color);
    await Promise.resolve(); await new Promise(r => setTimeout(r, 0));
    return { ok: true, color: getSelectionByKey(key)?.color ?? color ?? null };
  }

  async function setSelectionNameByKey({ key, name }) {
    const editor = getEditor();
    if (!editor) throw new Error("Editor not found");
    const setPolygonName = editor.setPolygonName || editor?.actions?.setPolygonName || null;
    if (typeof setPolygonName !== 'function') throw new Error("setPolygonName API not available");
    await setPolygonName(key, name);
    await Promise.resolve(); await new Promise(r => setTimeout(r, 0));
    return { ok: true };
  }

  async function removeSelectionByKeyOrExtId({ key, extId }) {
    const editor = getEditor();
    if (!editor) throw new Error("Editor not found");

    let targetKey = key || null;
    if (!targetKey && extId) {
      const hit = (editor.selections || []).find(s => getSelectionExtId(s) === extId);
      targetKey = hit?.key || null;
    }
    if (!targetKey) throw new Error("No matching selection found");

    const tryFns = [editor.removeSelection, editor?.actions?.removeSelection, editor.deleteSelection, editor?.actions?.deleteSelection].filter(fn => typeof fn === 'function');
    for (const fn of tryFns) { try { await fn(targetKey); return true; } catch {} }

    if (typeof editor.dispatch === 'function')            { try { editor.dispatch({ type: 'Remove Selection', selection: targetKey }); return true; } catch {} }
    if (typeof editor?.actions?.dispatch === 'function')  { try { editor.actions.dispatch({ type: 'Remove Selection', selection: targetKey }); return true; } catch {} }
    throw new Error("No removal entrypoint succeeded");
  }

  function reveal(shape) {
    const map = getMap();
    if (!map) return false;
    const g = shape?.geometry;
    if (!isPoly(g)) return false;
    const b = boundsFromCoords(g.type === 'Polygon' ? g.coordinates : g.coordinates);
    padBounds(map, b, 100);
    return true;
  }

  const recentSig = new Map();
  function dedupSignature(sig) {
    if (!sig) return false;
    if (recentSig.has(sig)) return true;
    const t = setTimeout(() => recentSig.delete(sig), 1200);
    recentSig.set(sig, t);
    return false;
  }

  function overlayToShape(evt) {
    const { type, overlay } = evt;
    if (!overlay) return null;
    if (type === 'rectangle') {
      const b = overlay.getBounds(); const ne = b.getNorthEast(), sw = b.getSouthWest();
      const ring = [
        [normalizeLng(sw.lng()), sw.lat()],
        [normalizeLng(ne.lng()), sw.lat()],
        [normalizeLng(ne.lng()), ne.lat()],
        [normalizeLng(sw.lng()), ne.lat()],
        [normalizeLng(sw.lng()), sw.lat()],
      ];
      return { type: 'polygon', geometry: { type: 'Polygon', coordinates: [normalizePathAntiMeridian(ring)] },
               style: { strokeColor: overlay.get('strokeColor') ?? null, fillColor: overlay.get('fillColor') ?? null,
                        strokeOpacity: overlay.get('strokeOpacity') ?? null, fillOpacity: overlay.get('fillOpacity') ?? null },
               name: 'Polygon', createdAt: new Date().toISOString() };
    }
    if (type === 'polygon') {
      const arr = overlay.getPath().getArray().map(ll => [normalizeLng(ll.lng()), ll.lat()]);
      if (arr.length && (arr[0][0] !== arr[arr.length-1][0] || arr[0][1] !== arr[arr.length-1][1])) arr.push(arr[0].slice());
      return { type: 'polygon', geometry: { type: 'Polygon', coordinates: [normalizePathAntiMeridian(arr)] },
               style: { strokeColor: overlay.get('strokeColor') ?? null, fillColor: overlay.get('fillColor') ?? null,
                        strokeOpacity: overlay.get('strokeOpacity') ?? null, fillOpacity: overlay.get('fillOpacity') ?? null },
               name: 'Polygon', createdAt: new Date().toISOString() };
    }
    return null;
  }

  function hookDrawingManagers() {
    if (!window.google?.maps?.drawing?.DrawingManager) return;
    const DM = google.maps.drawing.DrawingManager;
    if (DM.__extPatched) return;

    const _setMap = DM.prototype.setMap;
    DM.prototype.setMap = function patchedSetMap(map) {
      const out = _setMap ? _setMap.apply(this, arguments) : undefined;
      try {
        if (!this.__extOC) {
          this.__extOC = google.maps.event.addListener(this, 'overlaycomplete', (evt) => {
            const shape = overlayToShape(evt);
            if (!shape || !shape.geometry) return;

            const before = getSelectionKeysSet();
            setTimeout(() => {
              const afterKeys = getSelectionKeysSet();
              let selectionKey = null;
              if (afterKeys.size > before.size) {
                for (const k of afterKeys) if (!before.has(k)) { selectionKey = k; break; }
              }
              if (!selectionKey) {
                selectionKey = findSelectionKeyByExtIdOrGeometry({ extId: null, geom: shape.geometry });
              }
              const selectionColor = selectionKey ? (getSelectionByKey(selectionKey)?.color ?? null) : null;

              const sig = polygonSignature(shape.geometry);
              if (!dedupSignature(sig)) {
                window.postMessage({ source: 'EXT_SHAPES', type: 'EXT_SHAPE_COMPLETED', shape, selectionKey, selectionColor }, '*');
              }
              scheduleSelectionDedupe(180);
            }, 0);
          });
        }
      } catch {}
      return out;
    };
    DM.__extPatched = true;
  }

  function hookSiteDeselectClicks() {
    const onClick = (e) => {
      const btn = e.target?.closest?.('button[aria-label="Deselect"], button[title="Deselect"]');
      if (!btn) return;

      const before = getSelectionKeysSet();
      setTimeout(() => {
        const after = getSelectionKeysSet();
        for (const k of before) {
          if (!after.has(k)) {
            window.postMessage({ source: 'EXT_SHAPES', type: 'EXT_SELECTION_DESELECTED', selectionKey: k }, '*');
          }
        }
        scheduleSelectionDedupe(200);
      }, 0);
    };
    document.addEventListener('click', onClick, true);
  }

  // ---------- msg pump ----------
  function onMsg(e) {
    const m = e?.data; if (!m || m?.source === 'EXT_SHAPES') return;

    if (m.type === 'EXT_ADD_SELECTION_FROM_SHAPE') {
      (async () => {
        try {
          const shape = { ...m.shape };
          if (!shape.id) shape.id = m.shapeId || `shp_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
          const res = await addSelectionFromShape(shape, { name: shape.name });
          window.postMessage({ source: 'EXT_SHAPES', type: 'EXT_ADD_SELECTION_OK', id: m.id, selectionKey: res.key || null, selectionColor: res.color || null }, '*');
          scheduleSelectionDedupe(120);
        } catch (err) {
          window.postMessage({ source: 'EXT_SHAPES', type: 'EXT_ADD_SELECTION_ERR', id: m.id, error: err?.message || String(err) }, '*');
        }
      })();
    }

    if (m.type === 'EXT_SET_SELECTION_COLOR') {
      (async () => {
        try {
          const { key, color } = m;
          const res = await setSelectionColorByKey({ key, color });
          window.postMessage({ source: 'EXT_SHAPES', type: 'EXT_SET_SELECTION_COLOR_OK', id: m.id, color: res.color || color || null }, '*');
        } catch (err) {
          window.postMessage({ source: 'EXT_SHAPES', type: 'EXT_SET_SELECTION_COLOR_ERR', id: m.id, error: err?.message || String(err) }, '*');
        }
      })();
    }

    if (m.type === 'EXT_SET_SELECTION_NAME') {
      (async () => {
        try {
          const { key, name } = m;
          await setSelectionNameByKey({ key, name });
          window.postMessage({ source: 'EXT_SHAPES', type: 'EXT_SET_SELECTION_NAME_OK', id: m.id }, '*');
        } catch (err) {
          window.postMessage({ source: 'EXT_SHAPES', type: 'EXT_SET_SELECTION_NAME_ERR', id: m.id, error: err?.message || String(err) }, '*');
        }
      })();
    }

    if (m.type === 'EXT_GET_CURRENT_SHAPE_SELECTIONS') {
      (async () => {
        try {
          const selections = getSelections();
          const shapeSelections = selections
            .map(sel => ({
              key: sel.key,
              extId: getSelectionExtId(sel),
              color: sel.color || null,
            }))
            .filter(s => s.extId && s.extId.startsWith('shp_'));

          window.postMessage({
            source: 'EXT_SHAPES',
            type: 'EXT_CURRENT_SHAPE_SELECTIONS_RESPONSE',
            id: m.id,
            selections: shapeSelections,
          }, '*');
        } catch (err) {
          window.postMessage({
            source: 'EXT_SHAPES',
            type: 'EXT_GET_CURRENT_SHAPE_SELECTIONS_ERR',
            id: m.id,
            error: err?.message || String(err),
          }, '*');
        }
      })();
    }

    if (m.type === 'EXT_REMOVE_SELECTION_FOR_SHAPE') {
      (async () => {
        try {
          await removeSelectionByKeyOrExtId({ key: m.selectionKey || null, extId: m.extId || null });
          window.postMessage({ source: 'EXT_SHAPES', type: 'EXT_REMOVE_SELECTION_OK', id: m.id }, '*');
          scheduleSelectionDedupe(160);
        } catch (err) {
          window.postMessage({ source: 'EXT_SHAPES', type: 'EXT_REMOVE_SELECTION_ERR', id: m.id, error: err?.message || String(err) }, '*');
        }
      })();
    }

    if (m.type === 'EXT_REVEAL_SHAPE')   { try { reveal(m.shape); } catch {} }
    if (m.type === 'EXT_PING_SHAPES_BRIDGE') { window.postMessage({ source: 'EXT_SHAPES', type: 'EXT_PONG_SHAPES_BRIDGE' }, '*'); }


  }

  window.addEventListener('message', onMsg, false);
  hookDrawingManagers();
  hookSiteDeselectClicks();

  window.__extShapesBridge = true;
})();

(() => {
  const NodeProto = window.Node?.prototype;
  if (window.__extDomPatchInstalled || !NodeProto) {
    return;
  }
  window.__extDomPatchInstalled = true;

  const { removeChild, insertBefore, appendChild } = NodeProto;

  if (typeof removeChild !== 'function' || typeof insertBefore !== 'function' || typeof appendChild !== 'function') {
    return;
  }

  const isInTagManager = (node) => {
    const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return !!el?.closest('.map-overview .tool-block.tag-manager');
  };

  NodeProto.removeChild = function patchedRemoveChild(child) {
    if (window.__EXT_DOM_PATCH_DISABLED__) {
      return removeChild.call(this, child);
    }

    try {
      const isStandardCall = !child || child.parentNode === this || (!isInTagManager(child) && !isInTagManager(this));
      if (isStandardCall) {
        return removeChild.call(this, child);
      }

      const realParent = child.parentNode;
      if (realParent) {
        return removeChild.call(realParent, child);
      }
      return child;
    } catch { return child; }
  };

  NodeProto.insertBefore = function patchedInsertBefore(newNode, referenceNode) {
    if (window.__EXT_DOM_PATCH_DISABLED__) {
      return insertBefore.call(this, newNode, referenceNode);
    }

    try {
      const isStandardCall = !referenceNode || referenceNode.parentNode === this || (!isInTagManager(newNode) && !isInTagManager(this));
      if (isStandardCall) {
        return insertBefore.call(this, newNode, referenceNode);
      }
      return appendChild.call(this, newNode);
    } catch { return appendChild.call(this, newNode); }
  };
})();