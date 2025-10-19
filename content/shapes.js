'use strict';

// ========================= Shapes Manager (Overview Panel) =========================

const SHAPES_BUCKET_KEY = 'overview:shapes:v1';
const SHAPES_OPEN_KEY   = 'overview:shapes:open';

function __extHslByIndex(i) {
  const h = Math.round(((i * 47) % 360 + 360) % 360);
  return `hsl(${h} 64% 54%)`;
}
let __extProbe = document.getElementById('__ext_color_probe');
if (!__extProbe) {
  __extProbe = document.createElement('div');
  __extProbe.id = '__ext_color_probe';
  __extProbe.style.cssText =
    'position:fixed;left:-100000px;top:-100000px;pointer-events:none;' +
    'contain:paint style layout;';
  document.body.appendChild(__extProbe);
}

function __extTextColorForBg(cssColor) {
  try {
    __extProbe.style.color = cssColor;
    const rgb = getComputedStyle(__extProbe).color;
    document.body.removeChild(el);
    const m = rgb.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return '#000';
    const [r,g,b] = [parseInt(m[1],10), parseInt(m[2],10), parseInt(m[3],10)];
    const L = 0.2126*(r/255)**2.2 + 0.7152*(g/255)**2.2 + 0.0722*(b/255)**2.2;
    return L > 0.5 ? '#000' : '#fff';
  } catch { return '#000'; }
}

function __extRgbCssFromArray(arr) {
  if (!Array.isArray(arr) || arr.length < 3) return null;
  const [r,g,b] = arr.map(n => Math.max(0, Math.min(255, Math.round(n))));
  return `rgb(${r}, ${g}, ${b})`;
}
function __extContrastTextForRgbArray(arr) {
  if (!Array.isArray(arr) || arr.length < 3) return '#fff';
  const [r,g,b] = arr.map(n => Math.max(0, Math.min(255, Math.round(n))));
  const toLin = v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
  const L = 0.2126*toLin(r) + 0.7152*toLin(g) + 0.0722*toLin(b);
  return L > 0.5 ? '#000' : '#fff';
}

async function loadShapes() {
  const bucket = await getPageBucket();
  return Array.isArray(bucket[SHAPES_BUCKET_KEY]) ? bucket[SHAPES_BUCKET_KEY] : [];
}
async function saveShapes(shapes) {
  const bucket = await getPageBucket();
  bucket[SHAPES_BUCKET_KEY] = Array.isArray(shapes) ? shapes : [];
  await savePageBucket(bucket);
}

function shapeToFeature(shape) {
  return {
    type: 'Feature',
    properties: {
      name: shape.name || 'Polygon',
      style: shape.style || null,
      createdAt: shape.createdAt || null,
      id: shape.id || null,
    },
    geometry: shape.geometry
  };
}

function featuresToShapes(fc) {
  const out = [];
  const emitFromFeature = (f, idx) => {
    if (!f || f.type !== 'Feature' || !f.geometry) return;
    const id = f.properties?.id || `shp_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const style = f.properties?.style || {};
    const name = f.properties?.name || 'Polygon';
    out.push({
      id,
      type: 'polygon',
      name,
      geometry: f.geometry,
      style: {
        strokeColor: style.strokeColor ?? null,
        fillColor: style.fillColor ?? null,
        strokeOpacity: style.strokeOpacity ?? null,
        fillOpacity: style.fillOpacity ?? null,
      },
      createdAt: f.properties?.createdAt || new Date().toISOString()
    });
  };

  if (!fc) return out;
  if (fc.type === 'FeatureCollection') {
    fc.features?.forEach(emitFromFeature);
  } else if (fc.type === 'Feature') {
    emitFromFeature(fc);
  } else if (fc.type === 'Polygon' || fc.type === 'MultiPolygon') {
    emitFromFeature({ type: 'Feature', properties: {}, geometry: fc });
  }
  return out;
}

async function setSelectionColorForShape(shape, rgbArray) {
  const key = shape.__selectionKey;
  if (!key || !Array.isArray(rgbArray) || rgbArray.length < 3) return { ok: false };

  return new Promise((resolve) => {
    const id = `m${Date.now()}${Math.random().toString(36).slice(2,7)}`;
    function onMsg(e) {
      const d = e?.data;
      if (!d || d.source !== 'EXT_SHAPES' || d.id !== id) return;
      window.removeEventListener('message', onMsg, false);
      if (d.type === 'EXT_SET_SELECTION_COLOR_OK') {
        resolve({ ok: true, color: Array.isArray(d.color) ? d.color : rgbArray });
      } else {
        resolve({ ok: false, error: d.error || 'unknown error' });
      }
    }
    window.addEventListener('message', onMsg, false);
    window.postMessage({ type: 'EXT_SET_SELECTION_COLOR', id, key, color: rgbArray }, '*');
  }).then(async res => {
    if (res.ok) {
      shape.color = res.color;
      // persist
      const shapes = await loadShapes();
      await saveShapes(shapes.map(s => s.id === shape.id ? { ...s, color: shape.color } : s));
    }
    return res;
  });
}

function makeHeader(labelText = 'Shapes') {
  const header = document.createElement('header');
  header.className = 'tool-block__header';

  const titleBtn = document.createElement('button');
  titleBtn.type = 'button';
  titleBtn.className = 'tool-block__title tool-block__title--collapsible';
  titleBtn.innerHTML = `<svg height="24" width="24" viewBox="0 0 24 24" style="rotate: 0deg;"><path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z"></path></svg> ${labelText}`;

  const spacer = document.createElement('span');
  spacer.style.flexGrow = '1';

  const importBtn = document.createElement('button');
  importBtn.className = 'button';
  importBtn.type = 'button';
  importBtn.textContent = 'Import';

  const exportBtn = document.createElement('button');
  exportBtn.className = 'button';
  exportBtn.type = 'button';
  exportBtn.textContent = 'Export';

  header.appendChild(titleBtn);
  header.appendChild(spacer);
  header.appendChild(importBtn);
  header.appendChild(exportBtn);

  return { header, importBtn, exportBtn };
}

function makeShapeButton(shape, index) {
  const li = document.createElement('li');
  li.className = 'shape';
  li.draggable = true;
  li.dataset.shapeId = shape.id;
  li.__shapeRef = shape;

  let bgCss = null;
  if (Array.isArray(shape.color)) {
    bgCss = __extRgbCssFromArray(shape.color);
  } else if (shape.style?.fillColor) {
    bgCss = shape.style.fillColor;
  } else {
    bgCss = `hsl(${(index*47)%360} 64% 54%)`;
  }

  const fgCss = Array.isArray(shape.color)
    ? __extContrastTextForRgbArray(shape.color)
    : __extTextColorForBg(bgCss);

  try { li.style.setProperty('--shape-bg', bgCss); } catch {}
  li.style.color = fgCss;

  const label = document.createElement('label');
  label.className = 'shape__text';
  label.textContent = shape.name || 'Polygon';
  li.appendChild(label);

  if (shape.__selected) li.classList.add('is-selected');

  let dragging = false;
  let lastDragEndAt = 0;

  li.addEventListener('dragstart', (e) => {
    dragging = true;
    li.classList.add('shape-dragging');
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-ext-shape', shape.id || 'shape');
    } catch {}
    e.stopPropagation();
  });

  li.addEventListener('dragend', (e) => {
    dragging = false;
    li.classList.remove('shape-dragging');
    lastDragEndAt = Date.now();
    e.stopPropagation();
  });

  shape.__busy = false;

  li.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (dragging) return;
    if (Date.now() - lastDragEndAt < 120) return;
    if (shape.__busy) return;

    shape.__busy = true;
    try {
      if (!shape.__selected) {
        const { ok, selectionKey, appliedColor, selectionColor } = await addShapeToSelections(shape, { markSelected: true });
        if (ok) {
          shape.__selectionKey = selectionKey || shape.__selectionKey || null;

          const rgb = appliedColor || selectionColor || shape.color || null;
          if (Array.isArray(rgb)) {
            shape.color = rgb;
            try { li.style.setProperty('--shape-bg', __extRgbCssFromArray(rgb)); } catch {}
            li.style.color = __extContrastTextForRgbArray(rgb);
            const shapes = await loadShapes();
            await saveShapes(shapes.map(s => s.id === shape.id ? { ...s, color: rgb } : s));
          }

          li.classList.add('is-selected');
          shape.__selected = true;

          const shapes2 = await loadShapes();
          await saveShapes(shapes2.map(s => s.id === shape.id
            ? { ...s, __selected: true, __selectionKey: shape.__selectionKey || null }
            : s));
        }
      } else {
        const ok = await removeShapeFromSelections(shape);
        if (ok) {
          shape.__selected = false;
          shape.__selectionKey = null;
          li.classList.remove('is-selected');
          const shapes = await loadShapes();
          await saveShapes(shapes.map(s => s.id === shape.id ? { ...s, __selected: false, __selectionKey: null } : s));
        }
      }
    } finally {
      shape.__busy = false;
    }
  });

li.addEventListener('contextmenu', (e) => {
    try { e.preventDefault(); e.stopPropagation(); } catch {}
    try { window.__extOpenShapesContextMenu?.(e, shape, li); } catch {}
  });

  return li;
}

function wireDnD(shapeListEl, onReorder) {
  if (!shapeListEl || shapeListEl.__extWired) return;
  shapeListEl.__extWired = true;

  let dragEl = null;
  let ghostEl = null;
  let dragImage = null;
  let origin = { parent: null, nextSibling: null, index: -1 };
  let dropCommitted = false;

  const getElementIndex = (el) => (el?.parentNode ? [...el.parentNode.children].indexOf(el) : -1);

  const cleanupDragImage = () => {
    dragImage?.remove();
    dragImage = null;
  };

  const createGhostElement = (source) => {
    const ghost = source.cloneNode(true);
    ghost.classList.remove('shape-dragging');
    ghost.classList.add('shape-placeholder');
    delete ghost.dataset.shapeId;
    ghost.draggable = false;
    ghost.setAttribute('aria-hidden', 'true');
    return ghost;
  };

  const createDragImage = (source) => {
    try {
      const rect = source.getBoundingClientRect();
      const clone = source.cloneNode(true);
      clone.classList.add('shape-drag-image');
      Object.assign(clone.style, {
        position: 'fixed',
        top: '-9999px',
        left: '-9999px',
        width: `${Math.round(rect.width)}px`,
        height: `${Math.round(rect.height)}px`,
        pointerEvents: 'none',
      });
      document.body.appendChild(clone);
      return { clone, rect };
    } catch (error) {
      console.error('Failed to create drag image:', error);
      return null;
    }
  };

  const getDropReference = (container, x, y) => {
    const items = [...container.querySelectorAll(
      '.shape:not(.shape-placeholder):not(.shape-dragging):not([aria-hidden="true"])'
    )];
    if (!items.length) return null;

    const rects = items.map(el => ({ el, r: el.getBoundingClientRect() }))
                      .filter(o => o.r.width > 0 && o.r.height > 0);
    if (!rects.length) return null;

    const rowThresh = Math.max(6, Math.min(...rects.map(o => o.r.height)) * 0.6);

    rects.sort((a, b) => {
      const dy = a.r.top - b.r.top;
      if (Math.abs(dy) > rowThresh) return dy;
      return a.r.left - b.r.left;
    });

    const rows = [];
    for (const o of rects) {
      const last = rows[rows.length - 1];
      if (!last || Math.abs(o.r.top - last.top) > rowThresh) {
        rows.push({ top: o.r.top, bottom: o.r.bottom, items: [o] });
      } else {
        last.top = Math.min(last.top, o.r.top);
        last.bottom = Math.max(last.bottom, o.r.bottom);
        last.items.push(o);
      }
    }

    if (!rows.length) return null;

    if (y < rows[0].top) return rows[0].items[0].el;
    if (y > rows[rows.length - 1].bottom) return null;

    let row = rows.find(r => y >= r.top && y <= r.bottom);
    if (!row) {
      row = rows.reduce((best, r) => {
        const cy = (r.top + r.bottom) / 2;
        const by = (best.top + best.bottom) / 2;
        return Math.abs(y - cy) < Math.abs(y - by) ? r : best;
      });
    }

    for (const item of row.items) {
      const midX = item.r.left + item.r.width / 2;
      if (x < midX) return item.el;
    }
    return null;
  };

  const commitDrag = () => {
    if (!dragEl || !ghostEl?.parentNode) {
      revertDrag();
      return false;
    }
    ghostEl.parentNode.insertBefore(dragEl, ghostEl);
    dragEl.removeAttribute('aria-hidden');
    dragEl.style.removeProperty('display');
    dragEl.style.removeProperty('pointer-events');
    dragEl.classList.remove('shape-dragging');

    if (ghostEl && ghostEl.parentNode) {
      ghostEl.remove();
    }
    ghostEl = null;

    return getElementIndex(dragEl) !== origin.index;
  };

  const revertDrag = () => {
    if (!dragEl || !origin.parent) return;
    origin.parent.insertBefore(dragEl, origin.nextSibling);
  };

  const finalizeDrag = async (moved) => {
    cleanupDragImage();

    if (dragEl) {
      dragEl.removeAttribute('aria-hidden');
      dragEl.classList.remove('shape-dragging');
      dragEl.style.removeProperty('pointer-events');
      dragEl.style.removeProperty('display');
    }

    dragEl = null;
    origin = { parent: null, nextSibling: null, index: -1 };
    dropCommitted = false;

    if (moved && typeof onReorder === 'function') {
      try {
        await onReorder();
      } catch (err) {
        console.error('[EXT] Failed to persist shape reorder:', err);
      }
    }
  };

  const onDragStart = (e) => {
    const target = e.target?.closest?.('.shape:not(.shape-placeholder)');
    if (!target) return;

    dragEl = target;
    origin = { parent: target.parentNode, nextSibling: target.nextSibling, index: getElementIndex(target) };
    dropCommitted = false;

    ghostEl = createGhostElement(target);
    origin.parent?.insertBefore(ghostEl, origin.nextSibling);

    const dragMeta = createDragImage(target);
    if (dragMeta && e.dataTransfer) {
      dragImage = dragMeta.clone;
      try {
        e.dataTransfer.setDragImage(dragImage, dragMeta.rect.width / 2, dragMeta.rect.height / 2);
      } catch (error) {
        console.error('Failed to set drag image:', error);
        cleanupDragImage();
      }
    }

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-ext-shape', target.dataset.shapeId || 'shape');

    requestAnimationFrame(() => {
      if (!dragEl) return;
      dragEl.classList.add('shape-dragging');
      dragEl.setAttribute('aria-hidden', 'true');
      dragEl.style.pointerEvents = 'none';
      dragEl.style.setProperty('display', 'none', 'important');
    });
  };

  const onDragOver = (e) => {
    if (!dragEl || !ghostEl) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    const beforeEl = getDropReference(shapeListEl, e.clientX, e.clientY);
    if (beforeEl) {
      if (beforeEl !== ghostEl) {
        shapeListEl.insertBefore(ghostEl, beforeEl);
      }
    } else {
      if (ghostEl.nextSibling) {
        shapeListEl.appendChild(ghostEl);
      }
    }
  };

  const onDrop = (e) => {
    if (!dragEl || !ghostEl) return;
    e.preventDefault();
    e.stopPropagation();
    dropCommitted = true;
    commitDrag();
  };

  const onDragEnd = async () => {
    if (!dragEl) return;
    if (!dropCommitted) {
      commitDrag();
    }
    
    const moved = dropCommitted && (origin.parent !== dragEl?.parentNode || getElementIndex(dragEl) !== origin.index);
    await finalizeDrag(moved);
  };

  shapeListEl.addEventListener('dragstart', onDragStart, true);
  shapeListEl.addEventListener('dragover', onDragOver);
  shapeListEl.addEventListener('drop', onDrop);
  document.addEventListener('dragend', onDragEnd, true);
}

async function addShapeToUI(shape, { select = false } = {}) {
  const list = document.querySelector('.map-overview .shape-manager .shape-list');
  if (!list) return;

  shape.id = shape.id || `shp_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const existing = await loadShapes();
  if (existing.some(s => s.id === shape.id)) {
    return;
  }

  if (!shape.name) shape.name = 'Polygon';
  if (!shape.style) shape.style = {};
  if (!shape.style.fillColor) {
    const index = list.querySelectorAll('.shape').length;
    shape.style.fillColor = __extHslByIndex(index);
  }

  if (select) { shape.__selected = true; }

  const shapebtn = makeShapeButton(shape, list.children.length);
  if (select) shapebtn.classList.add('is-selected');
  list.appendChild(shapebtn);

  existing.push(shape);
  await saveShapes(existing);
}

function importFromFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error || new Error('File read error'));
    fr.onload = async () => {
      try {
        const json = JSON.parse(String(fr.result || '{}'));
        const shapes = featuresToShapes(json);
        for (const sh of shapes) {
          await addShapeToUI(sh, { select: false });
        }
        resolve(shapes.length);
      } catch (e) { reject(e); }
    };
    fr.readAsText(file);
  });
}

async function exportShapesAsGeoJSON(shapesSubset = null) {
  const shapes = shapesSubset && shapesSubset.length ? shapesSubset : await loadShapes();
  const fc = { type: 'FeatureCollection', features: shapes.map(shapeToFeature) };
  const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);

  if (Array.isArray(shapes) && shapes.length === 1) {
    const raw = (shapes[0]?.name || 'shape').toString();
    const base = raw.trim().replace(/\s+/g, '-');
    a.download = `${base || 'shape'}.geojson`;
  } else {
    a.download = 'exported-shapes.geojson';
  }

  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function addShapeToSelections(shape, { markSelected = true } = {}) {
  return new Promise((resolve) => {
    const id = `m${Date.now()}${Math.random().toString(36).slice(2,7)}`;
    function onMsg(e) {
      const d = e?.data;
      if (!d || d.source !== 'EXT_SHAPES' || d.id !== id) return;
      window.removeEventListener('message', onMsg, false);
      if (d.type === 'EXT_ADD_SELECTION_OK') {
        resolve({
          ok: true,
          selectionKey: d.selectionKey || null,
          selectionColor: Array.isArray(d.selectionColor) ? d.selectionColor : null
        });
      } else {
        resolve({ ok: false, error: d.error || 'unknown error' });
      }
    }
    window.addEventListener('message', onMsg, false);
    window.postMessage({ type: 'EXT_ADD_SELECTION_FROM_SHAPE', id, shape, shapeId: shape.id }, '*');
  }).then(async res => {
    if (!res.ok) return res;

    if (markSelected) {
      shape.__selected = true;
      shape.__selectionKey = res.selectionKey || null;
    }

    let appliedColor = null;

    if (Array.isArray(shape.color) && shape.color.length >= 3) {
      appliedColor = await (async () => {
        return new Promise((resolve2) => {
          const id2 = `c${Date.now()}${Math.random().toString(36).slice(2,7)}`;
          function onMsg2(e2) {
            const d2 = e2?.data;
            if (!d2 || d2.source !== 'EXT_SHAPES' || d2.id !== id2) return;
            window.removeEventListener('message', onMsg2, false);
            if (d2.type === 'EXT_SET_SELECTION_COLOR_OK') {
              resolve2(Array.isArray(d2.color) ? d2.color : shape.color);
            } else {
              resolve2(res.selectionColor || null);
            }
          }
          window.addEventListener('message', onMsg2, false);
          window.postMessage({ type: 'EXT_SET_SELECTION_COLOR', id: id2, key: res.selectionKey, color: shape.color }, '*');
        });
      })();
    } else {
      if (Array.isArray(res.selectionColor)) {
        shape.color = res.selectionColor;
        appliedColor = shape.color;
        const shapes = await loadShapes();
        await saveShapes(shapes.map(s => s.id === shape.id
          ? { ...s, color: shape.color }
          : s));
      }
    }

    if (markSelected) {
      const shapes = await loadShapes();
      await saveShapes(shapes.map(s => s.id === shape.id
        ? { ...s, __selected: true, __selectionKey: shape.__selectionKey ?? null }
        : s));
    }

    return { ...res, appliedColor };
  });
}

function removeShapeFromSelections(shape) {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2, 9);
    function handler(e) {
      const d = e.data;
      if (!d || d.source !== 'EXT_SHAPES') return;
      if (d.type === 'EXT_REMOVE_SELECTION_OK' && d.id === id) {
        window.removeEventListener('message', handler, false);
        resolve(true);
      }
      if (d.type === 'EXT_REMOVE_SELECTION_ERR' && d.id === id) {
        window.removeEventListener('message', handler, false);
        console.warn('Remove selection failed:', d.error);
        resolve(false);
      }
    }
    window.addEventListener('message', handler, false);
    window.postMessage({ type: 'EXT_REMOVE_SELECTION_FOR_SHAPE', id, selectionKey: shape.__selectionKey || null, extId: shape.id || null }, '*');
  });
}

async function deleteShapeFromManager(shape, el) {
  try {
    if (shape.__selected) {
      try { await removeShapeFromSelections(shape); } catch {}
    }
    const shapes = await loadShapes();
    await saveShapes(shapes.filter(s => s.id !== shape.id));
    if (el && el.parentNode) el.remove();
    try { window.__extNotify && window.__extNotify(`${shape.name || 'Polygon'} deleted`, '', 'error', 2000); } catch {}
  } catch (err) {
    console.warn('[EXT] deleteShapeFromManager failed:', err);
    try { window.__extNotify && window.__extNotify('Delete failed', 'Could not delete this shape', 'error', 3500); } catch {}
  }
}

async function __extDeselectAllShapesOnLoad() {
  const shapes = await loadShapes();
  if (!Array.isArray(shapes) || shapes.length === 0) return [];

  let changed = false;
  const updated = shapes.map(s => {
    if (s.__selected || s.__selectionKey) {
      changed = true;
      return { ...s, __selected: false, __selectionKey: null };
    }
    return s;
  });

  if (changed) await saveShapes(updated);
  return updated;
}

async function initShapesManager(overviewEl) {
  if (!overviewEl || overviewEl.querySelector('.shape-manager')) return;

  let SHAPES_MANAGER_DISPLAY = true;
  let __extShapeCountBadge = null;

  function ensureShapeCountBadge(titleEl) {
    if (__extShapeCountBadge && document.body.contains(__extShapeCountBadge)) return __extShapeCountBadge;
    if (!titleEl) return null;
    const badge = document.createElement('span');
    badge.className = 'ext-tag-count-badge';
    badge.style.display = 'none';
    titleEl.appendChild(badge);
    __extShapeCountBadge = badge;
    return badge;
  }

  function computeTotalShapes(listEl) {
    try {
      return listEl.querySelectorAll('.shape').length;
    } catch { return 0; }
  }

  function updateShapeCountBadge(listEl, titleEl) {
    const badge = ensureShapeCountBadge(titleEl);
    if (!badge) return;
    const cnt = computeTotalShapes(listEl);
    badge.textContent = `(${cnt} shape${cnt === 1 ? '' : 's'})`;
    const shouldShow = !SHAPES_MANAGER_DISPLAY;
    badge.style.display = shouldShow ? 'inline' : 'none';
  }

  const block = document.createElement('div');
  block.className = 'tool-block shape-manager';
  block.style.width = '100%';
  block.style.maxWidth = '100%';
  block.style.boxSizing = 'border-box';

  const { header, importBtn, exportBtn } = makeHeader('Shapes');
  const content = document.createElement('div');
  content.className = 'tool-block__content';

  const list = document.createElement('ul');
  list.className = 'shape-list';
  content.appendChild(list);

  block.appendChild(header);
  block.appendChild(content);

  const container = overviewEl.querySelector('.ext-overview-scroller') || overviewEl;
  const tagMgr = container.querySelector('.tool-block.tag-manager');
  const selMgr = container.querySelector('.tool-block.selection-manager');
  if (tagMgr && selMgr && selMgr.parentNode === container) {
    container.insertBefore(block, selMgr);
  } else {
    container.appendChild(block);
  }

  const titleBtn = header.querySelector('.tool-block__title--collapsible');
  if (titleBtn) {
    const applyShapesOpen = (open) => {
      SHAPES_MANAGER_DISPLAY = !!open;
      const svg = titleBtn.querySelector('svg');
      if (svg) svg.style.rotate = SHAPES_MANAGER_DISPLAY ? '0deg' : '-90deg';
      content.style.display = SHAPES_MANAGER_DISPLAY ? '' : 'none';
      titleBtn.setAttribute('aria-expanded', String(SHAPES_MANAGER_DISPLAY));
      updateShapeCountBadge(list, titleBtn);
    };

    (async () => {
      try { applyShapesOpen(await getOpenFlag(SHAPES_OPEN_KEY, true)); } catch { applyShapesOpen(true); }
    })();

    titleBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const next = !SHAPES_MANAGER_DISPLAY;
      applyShapesOpen(next);
      try { await setOpenFlag(SHAPES_OPEN_KEY, next); } catch {}
    }, { capture: true });
  }

  let shapes = null;
  if (!window.__extClearedSelectionsThisPage) {
    shapes = await __extDeselectAllShapesOnLoad();
    window.__extClearedSelectionsThisPage = true;
  }
  if (!Array.isArray(shapes) || shapes.length === 0) {
    shapes = await loadShapes();
  }
  (Array.isArray(shapes) ? shapes : []).forEach((s, i) => {
    list.appendChild(makeShapeButton(s, i));
  });

  wireDnD(list, async () => {
    const ids = [...list.querySelectorAll('.shape')].map(li => li.dataset.shapeId);
    const cur = await loadShapes();
    const mapped = ids.map(id => cur.find(s => s.id === id)).filter(Boolean);
    await saveShapes(mapped);
  });

  const FILE_INPUT_ID = 'ext-shapes-file-input';
  let ifile = document.getElementById(FILE_INPUT_ID) || document.querySelector('input[type="file"][accept*="application/geo+json"]');
  if (!ifile) {
    ifile = document.createElement('input');
    ifile.type = 'file';
    ifile.accept = '.geojson,application/geo+json,application/json,.json';
    ifile.style.display = 'none';
    ifile.addEventListener('change', async () => {
      const f = ifile.files?.[0]; if (!f) return;
      try { await importFromFile(f); } finally { ifile.value = ''; }
    });
    document.body.appendChild(ifile);
  }
  if (!ifile.id) {
    ifile.id = FILE_INPUT_ID;
  }

  importBtn.addEventListener('click', () => ifile.click());
  list.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); list.classList.add('drag-accept'); }
  });
  list.addEventListener('dragleave', () => list.classList.remove('drag-accept'));
  list.addEventListener('drop', async (e) => {
    e.preventDefault(); list.classList.remove('drag-accept');
    const files = e.dataTransfer?.files || [];
    for (const f of files) {
      if (f && /(\.geojson|\.json)$|application\/(geo\+)?json/.test(f.type) || /\.geojson$|\.json$/i.test(f.name)) {
        await importFromFile(f);
      }
    }
  });

  exportBtn.addEventListener('click', () => exportShapesAsGeoJSON());

  if (!window.__extShapesMsgListenerAdded) {
    window.__extShapesMsgListenerAdded = true;

    const recentShapeSigs = new Map();
    const sigOf = (geom) => {
      try { return JSON.stringify(geom); } catch { return ''; }
    };
    const seenRecently = (shape) => {
      const sig = sigOf(shape?.geometry);
      if (!sig) return false;
      if (recentShapeSigs.has(sig)) return true;
      const t = setTimeout(() => recentShapeSigs.delete(sig), 1500);
      recentShapeSigs.set(sig, t);
      return false;
    };

    window.addEventListener('message', async (e) => {
      const d = e?.data;
      if (d.source === 'EXT_SHAPES' && d.type === 'EXT_SHAPE_COMPLETED') {
        const { shape, selectionKey, selectionColor } = e.data;
        if (!shape || !shape.geometry) return;
        if (seenRecently(shape)) return;

        shape.id = shape.id || `shp_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

        shape.__selected = true;
        shape.__selectionKey = selectionKey || null;

        if (Array.isArray(selectionColor) && !Array.isArray(shape.color)) {
          shape.color = selectionColor;
        }

        await addShapeToUI(shape, { select: true });
        
        try {
          document.querySelectorAll(`button[aria-label="Draw a polygon selection"], button[aria-label="Draw a rectangle selection"]`).forEach((b) => {
            try { b.setAttribute('aria-pressed', 'false'); } catch {}
          });
        } catch {}
      }
      if (d.type === 'EXT_SELECTION_DESELECTED') {
        const key = d.selectionKey;
        if (!key) return;

        const shapes = await loadShapes();
        let changed = false;
        for (const s of shapes) {
          if (s.__selectionKey === key) {
            s.__selected = false;
            s.__selectionKey = null;
            changed = true;
          }
        }
        if (changed) await saveShapes(shapes);

        document.querySelectorAll(`.shape[data-shape-id]`).forEach((el) => {
          const ref = el.__shapeRef;
          if (ref && ref.__selectionKey === key) {
            ref.__selected = false;
            ref.__selectionKey = null;
            ref.__busy = false;
            el.classList.remove('is-selected');
          }
        });
      }
    }, false);

    window.postMessage({ type: 'EXT_PING_SHAPES_BRIDGE' }, '*');
  }
  
  const observer = new MutationObserver(() => updateShapeCountBadge(list, titleBtn));
  observer.observe(list, { childList: true });
  updateShapeCountBadge(list, titleBtn);
}

async function __extRequestShapeSelectionSync() {
  return new Promise((resolve, reject) => {
    const id = `sync_${Date.now()}`;
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error("Shape selection sync timed out."));
    }, 2000);

    function handler(e) {
      const d = e.data;
      if (d.source !== 'EXT_SHAPES' || d.id !== id) return;

      window.removeEventListener('message', handler);
      clearTimeout(timeout);

      if (d.type === 'EXT_CURRENT_SHAPE_SELECTIONS_RESPONSE') {
        resolve(d.selections || []);
      } else {
        reject(new Error(d.error || "Failed to get current shape selections."));
      }
    }

    window.addEventListener('message', handler, false);
    window.postMessage({ type: 'EXT_GET_CURRENT_SHAPE_SELECTIONS', id }, '*');
  });
}

(function initExtShapesDelegation() {
  try {
    const root = document.querySelector('.map-overview .shape-manager .shape-list');
    if (!root || root.__extDelegatedClick) return;
    root.__extDelegatedClick = true;
    root.addEventListener('click', (e) => {
      const li = e.target?.closest?.('li.shape');
      if (!li) return;
      const nativeToggle = li.querySelector('.shape__toggle, .shape__select, [data-action="toggle"]');
      if (nativeToggle) {
        e.preventDefault(); e.stopPropagation();
        try { nativeToggle.click(); } catch {}
      }
    }, true);
  } catch {}
})();

window.initShapesManager = initShapesManager;
