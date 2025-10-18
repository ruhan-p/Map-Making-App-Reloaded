'use strict';

// Centralised collapse state management for the overview panel
const COLLAPSE_STATE_KEY = 'overview:collapsed:v1';
const COLLAPSE_IDS = Object.freeze({
  TAG_MANAGER: 'tag-manager',
  SHAPE_MANAGER: 'shape-manager',
  SELECTION_MANAGER: 'selection-manager',
  TOOLS_MANAGER: 'tools-manager',
  SEARCH: 'search',
});

const LEGACY_COLLAPSE_KEYS = Object.freeze({
  [COLLAPSE_IDS.TAG_MANAGER]: 'overview:tags:open',
  [COLLAPSE_IDS.SHAPE_MANAGER]: 'overview:shapes:open',
  [COLLAPSE_IDS.SELECTION_MANAGER]: 'overview:selections:open',
  [COLLAPSE_IDS.TOOLS_MANAGER]: 'overview:tools:open',
  [COLLAPSE_IDS.SEARCH]: 'overview:search:open',
});

const TAG_STATE_KEY_V2 = 'overview:taglists:v2';

const SEARCH_PORTAL = {
  node: null,
  placeholder: null,
  origParent: null,
  origNext: null,
  resultsEl: null,
  resultsRo: null,
  sourceRo: null,
  onDocDown: null,
};

let collapseStateCache = null;
let tagListStateCache = null;
let overviewStorageReadyPromise = null;

const VALID_TAG_SORT_MODES = new Set(['custom', 'name', 'amount']);

function normalizeCollapseState(stored, bucket) {
  const state = { version: 1, toolBlocks: {}, search: true };
  if (stored && typeof stored === 'object') {
    if (stored.toolBlocks && typeof stored.toolBlocks === 'object') {
      for (const [key, val] of Object.entries(stored.toolBlocks)) {
        if (typeof val === 'boolean') state.toolBlocks[key] = val;
      }
    }
    if (typeof stored.search === 'boolean') {
      state.search = stored.search;
    }
  }

  for (const [id, legacyKey] of Object.entries(LEGACY_COLLAPSE_KEYS)) {
    const legacyVal = bucket ? bucket[legacyKey] : undefined;
    if (id === COLLAPSE_IDS.SEARCH) {
      if (typeof legacyVal === 'boolean' && typeof state.search !== 'boolean') {
        state.search = legacyVal;
      }
      continue;
    }
    if (typeof legacyVal === 'boolean' && typeof state.toolBlocks[id] !== 'boolean') {
      state.toolBlocks[id] = legacyVal;
    }
  }

  return state;
}

function cloneCollapseStateForStorage(state) {
  return {
    version: 1,
    toolBlocks: { ...(state?.toolBlocks || {}) },
    search: !!state?.search,
  };
}

function normalizeTagListEntry(entry) {
  const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
  const tags = Array.isArray(entry?.tags) ? entry.tags.map(t => String(t ?? '').trim()) : [];
  const sortMode = VALID_TAG_SORT_MODES.has(entry?.sortMode) ? entry.sortMode : 'custom';
  return {
    name: name || 'Section',
    tags,
    collapsed: !!entry?.collapsed,
    sortMode,
  };
}

function sanitizeTagListArray(structure) {
  if (!Array.isArray(structure)) return [];
  return structure.map(normalizeTagListEntry);
}

function cloneTagListsForReturn(lists) {
  if (!Array.isArray(lists) || !lists.length) return null;
  return lists.map(entry => ({
    name: entry.name,
    tags: [...entry.tags],
    collapsed: !!entry.collapsed,
    sortMode: entry.sortMode,
  }));
}

function cloneTagListsForStorage(lists) {
  return Array.isArray(lists) ? lists.map(entry => ({
    name: entry.name,
    tags: [...entry.tags],
    collapsed: !!entry.collapsed,
    sortMode: entry.sortMode,
  })) : [];
}

async function ensureCollapseStateLoaded() {
  if (collapseStateCache) return collapseStateCache;
  const bucket = await getPageBucket();
  collapseStateCache = normalizeCollapseState(bucket[COLLAPSE_STATE_KEY], bucket);
  return collapseStateCache;
}

async function persistCollapseState() {
  if (!collapseStateCache) return;
  const bucket = await getPageBucket();
  bucket[COLLAPSE_STATE_KEY] = cloneCollapseStateForStorage(collapseStateCache);
  for (const legacyKey of Object.values(LEGACY_COLLAPSE_KEYS)) {
    try { delete bucket[legacyKey]; } catch {}
  }
  await savePageBucket(bucket);
}

async function getToolBlockOpenState(id, fallback = true) {
  const state = await ensureCollapseStateLoaded();
  const stored = state.toolBlocks?.[id];
  return typeof stored === 'boolean' ? stored : fallback;
}

async function setToolBlockOpenState(id, open) {
  const state = await ensureCollapseStateLoaded();
  if (!state.toolBlocks) state.toolBlocks = {};
  const next = !!open;
  if (state.toolBlocks[id] === next) return;
  state.toolBlocks[id] = next;
  await persistCollapseState();
}

async function getSearchOpenState(fallback = true) {
  const state = await ensureCollapseStateLoaded();
  return typeof state.search === 'boolean' ? state.search : fallback;
}

async function setSearchOpenState(open) {
  const state = await ensureCollapseStateLoaded();
  const next = !!open;
  if (state.search === next) return;
  state.search = next;
  await persistCollapseState();
}

async function ensureTagListStateLoaded() {
  if (tagListStateCache) return tagListStateCache;
  try {
    const bucket = await getPageBucket();
    const stored = bucket[TAG_STATE_KEY_V2];
    if (stored && Array.isArray(stored.lists) && stored.lists.length) {
      tagListStateCache = sanitizeTagListArray(stored.lists);
    } else {
      tagListStateCache = [];
    }
  } catch {
    tagListStateCache = [];
  }
  return tagListStateCache;
}

async function loadTagListState() {
  const lists = cloneTagListsForReturn(await ensureTagListStateLoaded());
  return { version: 2, lists };
}

async function saveTagListState(structure) {
  try {
    tagListStateCache = sanitizeTagListArray(structure);
    const bucket = await getPageBucket();
    if (tagListStateCache.length) {
      bucket[TAG_STATE_KEY_V2] = { version: 2, lists: cloneTagListsForStorage(tagListStateCache) };
    } else {
      try { delete bucket[TAG_STATE_KEY_V2]; } catch {}
    }
    await savePageBucket(bucket);
  } catch (err) {
    try { console.error('Failed to persist tag list state', err); } catch {}
  }
}

async function removeTagListState(index, options = null) {
  await ensureTagListStateLoaded();
  if (!Array.isArray(tagListStateCache) || tagListStateCache.length === 0) return;
  if (typeof index !== 'number' || index < 0 || index >= tagListStateCache.length) return;
  const mergeIntoIndex = options?.mergeIntoIndex;
  const mergeTagKeys = Array.isArray(options?.mergeTagKeys) ? options.mergeTagKeys.filter(Boolean) : [];
  if (Number.isInteger(mergeIntoIndex) && mergeIntoIndex >= 0 && mergeIntoIndex < tagListStateCache.length && mergeTagKeys.length) {
    const targetState = tagListStateCache[mergeIntoIndex];
    if (targetState) {
      if (!Array.isArray(targetState.tags)) targetState.tags = [];
      const seen = new Set(targetState.tags);
      mergeTagKeys.forEach((key) => {
        if (seen.has(key)) return;
        seen.add(key);
        targetState.tags.push(key);
      });
    }
  }
  tagListStateCache.splice(index, 1);
  try {
    const bucket = await getPageBucket();
    if (tagListStateCache.length) {
      bucket[TAG_STATE_KEY_V2] = { version: 2, lists: cloneTagListsForStorage(tagListStateCache) };
    } else {
      try { delete bucket[TAG_STATE_KEY_V2]; } catch {}
    }
    await savePageBucket(bucket);
  } catch (err) {
    try { console.error('Failed to remove tag list state', err); } catch {}
  }
}

function ensureOverviewStorageReady() {
  if (!overviewStorageReadyPromise) {
    overviewStorageReadyPromise = (async () => {
      await Promise.allSettled([ensureCollapseStateLoaded(), ensureTagListStateLoaded()]);
    })();
  }
  return overviewStorageReadyPromise;
}

async function __extWireCollapsibleBlock(block, collapseId, { defaultOpen = true } = {}) {
  if (!block || block.__extCollapsibleWired) return;
  const id = collapseId || block.dataset?.extCollapseId;
  if (!id) {
    block.__extCollapsibleWired = true;
    return;
  }

  const header = block.querySelector('.tool-block__header');
  if (!header) { block.__extCollapsibleWired = true; return; }
  let button = header.querySelector('.tool-block__title');
  if (!button) { block.__extCollapsibleWired = true; return; }

  const makeChevronSVG = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('height', '24');
    svg.setAttribute('width', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z');
    svg.appendChild(path);
    return svg;
  };

  if (button.tagName !== 'BUTTON') {
    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'tool-block__title tool-block__title--collapsible';
    const svg = makeChevronSVG();
    newBtn.appendChild(svg);
    const txt = document.createTextNode(' ' + (button.textContent || '').trim());
    newBtn.appendChild(txt);
    button.replaceWith(newBtn);
    button = newBtn;
  } else if (!button.classList.contains('tool-block__title--collapsible')) {
    button.classList.add('tool-block__title--collapsible');
    if (!button.querySelector('svg')) button.prepend(makeChevronSVG());
  }

  const contentEls = [...block.children].filter(ch => !ch.classList.contains('tool-block__header'));
  const applyState = (open) => {
    const wantOpen = !!open;
    button.setAttribute('aria-expanded', String(wantOpen));
    button.dataset.state = wantOpen ? 'open' : 'closed';
    const svg = button.querySelector('svg');
    if (svg) svg.style.rotate = wantOpen ? '0deg' : '-90deg';
    contentEls.forEach(el => { el.style.display = wantOpen ? '' : 'none'; });
  };

  const open = await getToolBlockOpenState(id, defaultOpen);
  applyState(open);

  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isOpen = button.getAttribute('aria-expanded') !== 'false';
    const wantOpen = !isOpen;
    applyState(wantOpen);
    setToolBlockOpenState(id, wantOpen).catch(() => {});
    try {
      const ov = document.querySelector(SELECTORS.overview);
      if (ov) fitOverviewToContent(ov);
    } catch {}
  }, { capture: true });

  block.__extCollapsibleWired = true;
}

const OVERVIEW_STORAGE_API = {
  ids: COLLAPSE_IDS,
  ready: ensureOverviewStorageReady,
  getToolBlockOpenState,
  setToolBlockOpenState,
  getSearchOpenState,
  setSearchOpenState,
  loadTagListState,
  saveTagListState,
  removeTagListState,
};

try {
  window.__extOverviewStorage = OVERVIEW_STORAGE_API;
  window.__extWireCollapsibleBlock = __extWireCollapsibleBlock;
} catch {}



async function initCollapsibleTools(overviewEl) {
  if (!overviewEl || overviewEl.__extToolsCollapsible) return;
  const blocks = [...overviewEl.querySelectorAll('.tool-block')]
    .filter(b => !b.classList.contains('tag-manager')
              && !b.classList.contains('selection-manager')
              && !b.classList.contains('shape-manager'));
  if (!blocks.length) return;
  blocks.forEach((block, index) => {
    const titleEl = block.querySelector('.tool-block__title');
    const titleText = (titleEl?.textContent || '').trim().toLowerCase();
    const collapseId = block.dataset?.extCollapseId
      || (titleText.includes('tools') ? COLLAPSE_IDS.TOOLS_MANAGER : `tools-extra-${index}`);
    __extWireCollapsibleBlock(block, collapseId, { defaultOpen: true });
  });
  overviewEl.__extToolsCollapsible = true;
}

function __extGetSelectionContextMenu() {
  const wrapper = document.querySelector('[data-radix-popper-content-wrapper]');
  if (!wrapper) return null;
  return wrapper.querySelector('.context-menu');
}

async function __extPerformSelectionContextAction(trigger, matchers = []) {
  if (!trigger) return;

  const normalize = (t) => (t || '').trim().toLowerCase();
  const wanted = Array.isArray(matchers) ? matchers.map(normalize) : [];

  document.body.classList.add('ext-proxy-menu-active');

  try {
    if (trigger.getAttribute('aria-expanded') !== 'true') {
      try { trigger.click(); } catch {}
    }

    const start = performance.now();
    let menu = __extGetSelectionContextMenu();
    while (!menu && performance.now() - start < 500) {
      await new Promise(r => setTimeout(r, 16));
      menu = __extGetSelectionContextMenu();
    }
    if (!menu) return;

    const items = Array.from(menu.querySelectorAll('.context-menu__item'));
    const target = items.find(it => wanted.includes(normalize(it.textContent)));
    const hiddenBtn = target?.querySelector('button');

    try {
      if (hiddenBtn) hiddenBtn.click();
      else target?.click();
    } catch {}
  } finally {
    document.body.classList.remove('ext-proxy-menu-active');
  }
}

window.__extPerformSelectionContextAction = __extPerformSelectionContextAction;

function getSearchSource() {
  const specific = document.querySelector('[data-position="top-left"] .map-control.search-control');
  if (specific) return specific.closest('[data-position="top-left"]') || specific;
  return document.querySelector('[data-position="top-left"]');
}

function moveSearchBar(overviewEl) {
    if (!overviewEl) return;
    const destEl = overviewEl.querySelector('.ext-overview-scroller');
    if (!destEl) return;

    let sourceEl = SEARCH_PORTAL.node && SEARCH_PORTAL.node.isConnected ?
        SEARCH_PORTAL.node :
        getSearchSource();

    if (sourceEl && !SEARCH_PORTAL.placeholder) {
        SEARCH_PORTAL.origParent = sourceEl.parentNode || null;
        SEARCH_PORTAL.origNext = sourceEl.nextSibling || null;
        SEARCH_PORTAL.placeholder = document.createComment('ext-search-placeholder');
        try {
        SEARCH_PORTAL.origParent?.insertBefore(SEARCH_PORTAL.placeholder, SEARCH_PORTAL.origNext);
        } catch {}
        SEARCH_PORTAL.node = sourceEl;
    }

    if (!SEARCH_PORTAL.node) return;

    if (destEl) {
        if (SEARCH_PORTAL.node.parentElement !== destEl) {
        destEl.appendChild(SEARCH_PORTAL.node);
        SEARCH_PORTAL.node.classList.add('ext-repositioned-search');
        }

        let sh = destEl.querySelector('.ext-search-header');
        if (!sh) {
        sh = document.createElement('h3');
        sh.className = 'ext-search-header';
        sh.textContent = 'Search';
        }

        if (sh.nextSibling !== SEARCH_PORTAL.node) {
        destEl.insertBefore(sh, SEARCH_PORTAL.node);
        }

    (async function ensureSearchCollapsible() {
      if (sh.__extCollapsible) return;
      sh.__extCollapsible = true;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ext-search-toggle';
      const svg = (function makeChevronSVG(){ const s=document.createElementNS('http://www.w3.org/2000/svg','svg'); s.setAttribute('height','24'); s.setAttribute('width','24'); s.setAttribute('viewBox','0 0 24 24'); const p=document.createElementNS('http://www.w3.org/2000/svg','path'); p.setAttribute('d','M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z'); s.appendChild(p); return s; })();
      btn.appendChild(svg);
      btn.appendChild(document.createTextNode(' Search'));
      sh.textContent = '';
      sh.appendChild(btn);

      const applyState = (open) => {
        btn.setAttribute('aria-expanded', String(!!open));
        const svg = btn.querySelector('svg');
        if (svg) svg.style.rotate = open ? '0deg' : '-90deg';
        if (SEARCH_PORTAL.node) SEARCH_PORTAL.node.style.display = open ? '' : 'none';
      };

      const open = await getSearchOpenState(true);
      applyState(open);

      btn.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        const isOpen = btn.getAttribute('aria-expanded') !== 'false';
        applyState(!isOpen);
        setSearchOpenState(!isOpen).catch(() => {});
        try { if (destEl) fitOverviewToContent(destEl.closest(SELECTORS.overview)); } catch {}
      }, { capture: true });
    })();
    ensureFloatingSearchResults();
  }
}

function ensureFloatingSearchResults() {
  const host = SEARCH_PORTAL.node;
  if (!host || host.__extResultsObserver) return;

  const mo = new MutationObserver(() => {
    const src = host.querySelector('.search-results');
    if (src) portalizeResults(src);
  });
  mo.observe(host, { childList: true, subtree: true });
  host.__extResultsObserver = mo;

  const existing = host.querySelector('.search-results');
  if (existing) portalizeResults(existing);
}

function getSearchAnchorRect() {
  const host = SEARCH_PORTAL.node;
  if (!host) return null;
  const input = host.querySelector('.search-control__input, input');
  const anchor = input || host;
  const rect = anchor.getBoundingClientRect();
  return { anchor, rect };
}

function positionResultsFixed() {
  const dd = SEARCH_PORTAL.resultsEl;
  if (!dd || !dd.isConnected) return;

  const isHidden = dd.hasAttribute('hidden');
  const hasItems = !!dd.querySelector('li');
  if (isHidden || !hasItems) {
    dd.style.display = 'none';
    return;
  }

  const res = getSearchAnchorRect();
  if (!res) { dd.style.display = 'none'; return; }
  const { anchor } = res;
  dd.classList.add('ext-floating-search-results');
  try {
    window.__extFloatingPopup?.positionBox(anchor, dd, { minWidth: 180, maxHeight: 400, extraClass: 'ext-floating-search-results' });
  } catch {}
}

function portalizeResults(srcList) {
  if (!srcList || !srcList.isConnected) return;

  let dd = SEARCH_PORTAL.resultsEl;
  if (!dd) {
    dd = document.createElement('ol');
    dd.className = 'search-results ext-floating-search-results';
    dd.setAttribute('role', 'listbox');
    dd.setAttribute('hidden', '');
    dd.style.display = 'none';
    document.body.appendChild(dd);

    SEARCH_PORTAL.resultsEl = dd;

    try {
      SEARCH_PORTAL.resultsRo = new ResizeObserver(rafThrottle(positionResultsFixed));
      SEARCH_PORTAL.resultsRo.observe(dd);
    } catch {}
  }

  const syncOnce = () => {
    for (const name of ['id', 'aria-labelledby', 'aria-activedescendant']) {
      const v = srcList.getAttribute(name);
      if (v == null) dd.removeAttribute(name);
      else dd.setAttribute(name, v);
    }

    dd.innerHTML = '';
    const srcItems = Array.from(srcList.querySelectorAll('li'));
    srcItems.forEach((srcLi) => {
      const clone = srcLi.cloneNode(true);
      clone.style.width = '';
      clone.style.maxWidth = '';
      clone.addEventListener('mousedown', (ev) => { ev.preventDefault(); }, true);
      clone.addEventListener('click', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        try {
          const click = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
          srcLi.dispatchEvent(click);
        } catch {}
        closeFloatingResults();
      });
      dd.appendChild(clone);
    });

    const isOpen = !srcList.hasAttribute('hidden');
    const hasItems = srcItems.length > 0;
    if (isOpen && hasItems) {
      dd.removeAttribute('hidden');
      dd.style.display = '';
      requestAnimationFrame(() => { void dd.offsetHeight; positionResultsFixed(); });
    } else {
      dd.setAttribute('hidden', '');
      dd.style.display = 'none';
    }
  };

  syncOnce();

  if (!srcList.__extMirrorMO) {
    const srcMo = new MutationObserver(syncOnce);
    srcMo.observe(srcList, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-activedescendant'] });
    srcList.__extMirrorMO = srcMo;
  }

  if (!SEARCH_PORTAL.sourceRo) {
    try {
      SEARCH_PORTAL.sourceRo = new ResizeObserver(rafThrottle(() => { syncOnce(); positionResultsFixed(); }));
      SEARCH_PORTAL.sourceRo.observe(srcList);
    } catch {}
  }

  positionResultsFixed();
}

function closeFloatingResults() {
  const dd = SEARCH_PORTAL.resultsEl;
  if (!dd) return;
  dd.setAttribute('hidden', '');
  dd.style.display = 'none';
}

window.__extCloseFloatingSearchResults = closeFloatingResults;
window.__extCloseAllOverlays = function __extCloseAllOverlays() {
  try { closeFloatingResults(); } catch {}
  try { window.__extCloseFloatingTagDropdown?.(); } catch {}
};