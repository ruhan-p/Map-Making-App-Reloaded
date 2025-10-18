'use strict';

let IS_DRAGGING_TAG = (window.extState?.getState('isDraggingTag') ?? false);
window.addEventListener('ext-state-change', (e) => {
  if (e?.detail?.key === 'isDraggingTag') IS_DRAGGING_TAG = !!e.detail.value;
});
let TAG_MANAGER_DISPLAY = true;

// ---------- Delegated HTML5 DnD for tags across lists ----------
function enableDelegatedDnD(overviewEl) {
  if (!overviewEl || overviewEl.__extDelegatedDnD) return;
  overviewEl.__extDelegatedDnD = true;

  let currentAcceptList = null;
  let currentRejectList = null;

  const cleanupDragAcceptState = () => {
    if (currentAcceptList) {
      currentAcceptList.classList.remove('drag-accept');
      currentAcceptList = null;
    }
    if (currentRejectList) {
      currentRejectList.classList.remove('drag-reject');
      currentRejectList = null;
    }
  };
  const TAG_DND_SELECTOR = '.tag.has-button, .tag[role="button"]:not(.has-button)';

  function getInsertionBefore(list, x, y) {
    const items = [...list.querySelectorAll(`${TAG_DND_SELECTOR}:not(.dragging)`)];
    if (!items.length) return null;

    const rects = items.map(el => ({ el, r: el.getBoundingClientRect() }));
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

    if (y < rows[0].top) return rows[0].items[0].el;
    if (y > rows[rows.length - 1].bottom) return null;

    let row = rows.find(r => y >= r.top && y <= r.bottom);
    if (!row) {
      row = rows.reduce((best, r) => {
        const cy = (r.top + r.bottom) / 2;
        const by = (best.top + best.bottom) / 2;
        return Math.abs(y - cy) < Math.abs(y - by) ? r : best;
      }, rows[0]);
    }

    for (const o of row.items) {
      const cx = o.r.left + o.r.width / 2;
      if (x < cx) return o.el;
    }
    return null;
  }

  overviewEl.addEventListener('pointerdown', (e) => {
    const tag = e.target?.closest?.(TAG_DND_SELECTOR);
    if (!tag) return;

    const block = tag.closest('.ext-list-block');
    const sortMode = block ? block.dataset.sortMode : 'custom';
    tag.draggable = (sortMode === 'custom');

  }, true);

  const quarantine = (e) => { e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); };

  overviewEl.addEventListener('dragstart', (e) => {
    const tag = e.target?.closest?.(TAG_DND_SELECTOR);
    if (!tag || !tag.draggable) return;

    quarantine(e);
    IS_DRAGGING_TAG = true; try { window.extState?.setState('isDraggingTag', true); } catch {}

    tag.classList.add('dragging');
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain',
        tag.id || tag.querySelector('.tag__text')?.textContent?.trim() || 'tag'
      );
    } catch {}
  }, true);

  overviewEl.addEventListener('dragover', (e) => {
    const list = e.target?.closest?.('.tag-list');
    const block = list?.closest('.ext-list-block');
    if (!list || !block) { cleanupDragAcceptState(); return; }

    if (block.dataset.sortMode !== 'custom') {
      if (currentAcceptList && currentAcceptList !== list) {
        currentAcceptList.classList.remove('drag-accept');
        currentAcceptList = null;
      }
      if (currentRejectList !== list) {
        if (currentRejectList) currentRejectList.classList.remove('drag-reject');
        list.classList.add('drag-reject');
        currentRejectList = list;
      }
      try { if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'; } catch {}
      return;
    }

    if (currentRejectList && currentRejectList !== list) {
      currentRejectList.classList.remove('drag-reject');
      currentRejectList = null;
    }
    if (currentAcceptList !== list) {
      if (currentAcceptList) currentAcceptList.classList.remove('drag-accept');
      list.classList.add('drag-accept');
      currentAcceptList = list;
    }

    e.preventDefault();
    const dragging = overviewEl.querySelector('.tag.dragging');
    if (!dragging) return;

    const before = getInsertionBefore(list, e.clientX, e.clientY);
    if (before === null) {
      if (dragging.nextSibling !== null || dragging.parentNode !== list) {
        list.appendChild(dragging);
      }
    } else {
      if (before !== dragging) {
        list.insertBefore(dragging, before);
      }
    }
  }, true);

  overviewEl.addEventListener('drop', (e) => {
    const list = e.target?.closest?.('.tag-list');
    if (!list) return;
    quarantine(e);
    cleanupDragAcceptState();
    e.preventDefault();
    const save = overviewEl.__extSave;
    if (typeof save === 'function') {
      try { save(); } catch {}
    }
  }, true);

  overviewEl.addEventListener('dragend', (e) => {
    quarantine(e);
    IS_DRAGGING_TAG = false; try { window.extState?.setState('isDraggingTag', false); } catch {}
    const dragging = e.target?.closest?.(TAG_DND_SELECTOR);
    if (dragging) dragging.classList.remove('dragging');
    try {
      if (currentRejectList && window.__extNotify) {
        window.__extNotify('Cannot move tag', 'Please set the sort mode for both sections to "Custom"', 'error', 4000);
      }
    } catch {}
    cleanupDragAcceptState();
    const save = overviewEl.__extSave;
    if (typeof save === 'function') {
      try { save(); } catch {}
    }
  }, true);
}

function initAdvancedTagManager(overviewEl) {
  if (!overviewEl) return Promise.resolve();
  if (overviewEl.__extTagManagerReady) return overviewEl.__extTagManagerReady;
  if (overviewEl.__extTagManagerInitialized) {
    return overviewEl.__extTagManagerReady || Promise.resolve();
  }
  overviewEl.__extTagManagerInitialized = true;

  const overviewStore = window.__extOverviewStorage || null;
  const storeReady = overviewStore?.ready?.() ?? Promise.resolve();
  const collapseId = overviewStore?.ids?.TAG_MANAGER || 'tag-manager';

  const originalSorter = overviewEl.querySelector('.tag-manager__sort');
  if (originalSorter) originalSorter.style.display = 'none';

  let __extTagCountBadge = null;
  function ensureTagCountBadge() {
    if (__extTagCountBadge && document.body.contains(__extTagCountBadge)) return __extTagCountBadge;
    const tagManagerBlock = overviewEl.querySelector('.tool-block.tag-manager');
    if (!tagManagerBlock) return null;
    const titleEl = tagManagerBlock.querySelector('.tool-block__title');
    if (!titleEl) return null;
    const badge = document.createElement('span');
    badge.className = 'ext-tag-count-badge';
    badge.style.display = 'none';
    titleEl.appendChild(badge);
    __extTagCountBadge = badge;
    return badge;
  }

  function computeTotalTags() {
    try {
      return overviewEl.querySelectorAll('.tag-list .tag.has-button').length;
    } catch { return 0; }
  }

  function updateTagCountBadge(forceHide = false) {
    const badge = ensureTagCountBadge();
    if (!badge) return;
    const cnt = computeTotalTags();
    badge.textContent = `(${cnt} tag${cnt === 1 ? '' : 's'})`;
    const shouldShow = !TAG_MANAGER_DISPLAY && !forceHide;
    badge.style.display = shouldShow ? 'inline' : 'none';
  }

  const tagManagerBlock = overviewEl.querySelector('.tool-block.tag-manager');
  const interceptTagManagerHeader = tagManagerBlock?.querySelector('.tool-block__title--collapsible');
  if (interceptTagManagerHeader && !interceptTagManagerHeader.__extClickIntercepted) {
    const applyTMOpen = (open) => {
      TAG_MANAGER_DISPLAY = !!open;
      const block = tagManagerBlock;
      const tagmanagerels = ['.tag-manager__spacer', '.tag-manager__sort'];
      const tagmanager = block ? block.querySelector('.tool-block__content') : null;
      const tagmanagersvg = interceptTagManagerHeader.querySelector('svg');
      tagmanagerels.forEach(sel => { const n = block ? block.querySelector(sel) : null; if (n) n.style.display = (TAG_MANAGER_DISPLAY ? 'flex' : 'none'); });
      const headerInput = block ? block.querySelector('.tool-block__header input') : null;
      if (headerInput) headerInput.style.display = 'flex';
      if (tagmanager) tagmanager.style.display = (TAG_MANAGER_DISPLAY ? 'grid' : 'none');
      if (tagmanagersvg) tagmanagersvg.style.rotate = (TAG_MANAGER_DISPLAY ? '0deg' : '-90deg');
      updateTagCountBadge();
    };

    (async () => {
      await storeReady;
      if (overviewStore && typeof overviewStore.getToolBlockOpenState === 'function') {
        try {
          applyTMOpen(await overviewStore.getToolBlockOpenState(collapseId, true));
          return;
        } catch {}
      }
      applyTMOpen(true);
    })();

    interceptTagManagerHeader.__extClickIntercepted = true;
    interceptTagManagerHeader.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const next = !TAG_MANAGER_DISPLAY;
      applyTMOpen(next);
      if (overviewStore && typeof overviewStore.setToolBlockOpenState === 'function') {
        storeReady.then(() => overviewStore.setToolBlockOpenState(collapseId, next)).catch(() => {});
      }
    }, { capture: true });
  }

  // ---------- Persistence ----------
  let desiredListByKey = null;
  let isRestoringLists = false;
  let pendingSaveAfterRestore = false;

  function rebuildDesiredListMap(structure = null) {
    desiredListByKey = new Map();
    if (Array.isArray(structure)) {
      structure.forEach((entry, idx) => {
        if (!entry || !Array.isArray(entry.tags)) return;
        entry.tags.forEach(tag => {
          if (typeof tag === 'string' && tag) desiredListByKey.set(tag, idx);
        });
      });
      return;
    }

    const TAG_DND_SELECTOR = '.tag.has-button, .tag[role="button"]:not(.has-button)';
    const blocks = [...overviewEl.querySelectorAll('.ext-list-block')];
    blocks.forEach((blk, idx) => {
      blk.querySelectorAll(`.tag-list > ${TAG_DND_SELECTOR}`).forEach(tag => {
        desiredListByKey.set(getTagKey(tag), idx);
      });
    });
  }

  function save() {
    if (isRestoringLists) {
      pendingSaveAfterRestore = true;
      return;
    }
    pendingSaveAfterRestore = false;
    const structure = captureStructure();
    if (overviewStore && typeof overviewStore.saveTagListState === 'function') {
      storeReady.then(() => overviewStore.saveTagListState(structure)).catch(() => {});
    }
    rebuildDesiredListMap(structure);
    updateTagCountBadge();
  }
  overviewEl.__extSave = save;

  // ---------- Utilities ----------
  function getTagKey(tagEl) {
    const label = tagEl.querySelector?.('.tag__text');
    if (label) {
      for (const node of label.childNodes) {
        if (node.nodeType === 3) {
          const text = (node.nodeValue || '').trim();
          if (text) return text;
        }
      }
    }
    return '';
  }

  function getTagAmount(tagEl) {
    const small = tagEl.querySelector('small');
    if (!small?.textContent) return -1;
    return parseInt(small.textContent.replace(/[()]/g, ''), 10) || 0;
  }

  function applySort(listEl, mode) {
    const tags = [...listEl.querySelectorAll('.tag.has-button, .tag[role="button"]:not(.has-button)')];
    if (tags.length < 2) return;

    if (mode === 'name') {
      tags.sort((a, b) => getTagKey(a).localeCompare(getTagKey(b)));
    } else if (mode === 'amount') {
      tags.sort((a, b) => getTagAmount(b) - getTagAmount(a) || getTagKey(a).localeCompare(getTagKey(b)));
    } else {
      return;
    }
    tags.forEach(tag => listEl.appendChild(tag));
  }

  function syncSorterTriggerIcon(blockEl, mode) {
    const trigger = blockEl.querySelector('.ext-sorter-trigger');
    if (trigger) trigger.innerHTML = __extGetSorterIcon(mode);
  }

  function updateListDraggability(blockEl) {
    const listEl = blockEl.querySelector('.tag-list');
    if (!listEl) return;
    const sortMode = blockEl.dataset.sortMode || 'custom';
    const canDrag = sortMode === 'custom';
    listEl.querySelectorAll('.tag.has-button, .tag.ext-untagged').forEach(tag => {
      tag.draggable = canDrag;
    });
  }

  function prepTag(tag) {
    if (!(tag instanceof HTMLElement)) return;
    if (tag.__extWired) return;
    tag.__extWired = true;

    const editBtn = tag.querySelector('.tag__button--edit');
    if (editBtn) {
      tag.classList.add('ext-tag-edit-migrated');
      editBtn.style.setProperty('display', 'none', 'important');
      const observer = new MutationObserver(() => {
        if (editBtn.style.display !== 'none') {
          editBtn.style.setProperty('display', 'none', 'important');
        }
      });
      observer.observe(tag, { attributes: true, attributeFilter: ['class'] });
    }
  }

  function wireList(list) {
    if (!list || list.__extWired) return;
    list.__extWired = true;

    list.querySelectorAll('.tag.has-button').forEach(prepTag);

    const untagged = list.querySelector('li.tag[role="button"]:not(.has-button)');
    if (untagged && !untagged.__extWired) {
      untagged.__extWired = true;
      untagged.classList.add('ext-untagged');
    }
  }

  function __extGetSorterIcon(mode) {
    const ICONS = {
      custom: `<svg viewBox="0 0 32 32" fill="none" stroke="var(--ext-card-fg)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.227 12.863C11.304 6.041 10.3 1.762 6.734 2.639c-4.686 1.153 3.201 13.567 2.164 14.583 0 0-4.468-6.961-7.575-3.566-2.497 2.729 2.321 6.097 3.647 8.678 1.002 1.951 3.39 4.628 4.764 5.56 1.538 1.043 1.427 2.465 1.288 3.396 3.478.152 4.058.196 7.094-.04 1.701-3.979 2.5-3.044 4.328 0 1.083-.089 2.205.031 3.076-.221-1.108-2.962.681-5.361 1.853-6.872 2.642-3.407 2.374-5.317 3.206-10.184.535-3.13 1.884-6.499-.922-6.895-2.805-.396-4.489 5.746-4.489 5.746 0 0 1.443-10.22-2.605-10.224-4.132-.003-2.94 7.6-3.487 10.184-.672-8.262 1.403-11.492-3.166-12.126-3.957-.55-2.189 4.391-2.374 11.227z"/><path d="M14.99 18.054v7.371"/><path d="M19.134 18.023v7.371"/><path d="M23.182 18.094v7.371"/></svg>`,
      name: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="var(--ext-card-fg)" stroke-width="2.267" stroke-linecap="round" stroke-linejoin="round"><path d="M 0.99132378,22.131696 5.5503341,10.812584 10.330655,22.215542 v 0.125769"/><path d="M 2.8503377,18.149046 H 8.2060683"/><path d="m 12.378257,11.019749 0.131622,11.232192 c 0,0 7.941196,0.971204 7.634076,-3.251425 -0.350988,-3.842591 -7.42146,-2.453757 -7.458581,-2.871386 0,0 6.537228,0.717846 6.537228,-2.744711 0.0998,-3.4175027 -6.844345,-2.36467 -6.844345,-2.36467 z"/><path d="m 30.927667,12.376556 c -1.661684,-1.508391 -8.915532,-4.0974259 -8.749174,5.068768 0.145697,8.027742 8.193775,4.057626 8.873568,3.052873"/></svg>`,
      amount: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="var(--ext-card-fg)" stroke-width="2.267" stroke-linecap="round" stroke-linejoin="round"><path d="M 14.584078,3.5797281 8.8388348,28.416853"/><path d="M 7.3133865,9.9436891 H 27.865176"/><path d="M 23.599689,3.5797281 17.854447,28.416853"/><path d="M 4.7059302,21.301591 H 25.257719"/></svg>`
    };
    return ICONS[mode] || ICONS.custom;
  }

  function ensureHeader(blockEl, index) {
    if (blockEl.__extHeaderOk) return;
    blockEl.__extHeaderOk = true;

    const ICONS = {
      custom: __extGetSorterIcon('custom'),
      name: __extGetSorterIcon('name'),
      amount: __extGetSorterIcon('amount')
    };

    const header = document.createElement('div');
    header.className = 'ext-list-header';

    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'ext-collapse-list-btn';
    collapseBtn.type = 'button';
    collapseBtn.title = 'Collapse section';
    collapseBtn.setAttribute('aria-expanded', 'true');
    collapseBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"></path></svg>`;
    collapseBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const isCollapsing = !blockEl.classList.contains('ext-list-collapsed');
      blockEl.classList.toggle('ext-list-collapsed', isCollapsing);
      collapseBtn.classList.toggle('is-collapsed', isCollapsing);
      collapseBtn.setAttribute('aria-expanded', String(!isCollapsing));
      save();
    });

    const editBtn = document.createElement('button');
    editBtn.className = 'ext-edit-list-name-btn';
    editBtn.type = 'button';
    const PENCIL_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M 20.71 7.04 C 21.1 6.65 21.1 6 20.71 5.63 L 18.37 3.29 C 18 2.9 17.35 2.9 16.96 3.29 L 15.12 5.12 L 18.87 8.87 M 3 17.25 V 21 H 6.75 L 17.81 9.93 L 14.06 6.18 L 3 17.25 Z"></path></svg>`;
    const CHECK_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 16.2 4.8 12 3.4 13.4 9 19 21 7 19.6 5.6 9 16.2z" stroke="currentColor" stroke-width="2.5" fill="none"/></svg>`;

    function setEditBtnVisual(isEditing) {
      editBtn.innerHTML = isEditing ? CHECK_SVG : PENCIL_SVG;
      editBtn.title = isEditing ? 'Confirm name' : 'Edit name';
      editBtn.classList.toggle('is-confirm', isEditing);
    }
    setEditBtnVisual(false);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'ext-list-name';
    nameInput.value = "Section";
    nameInput.maxLength = 56;
    nameInput.readOnly = true;

    let sorterDropdown = null;

    const sorterTrigger = document.createElement('button');
    sorterTrigger.type = 'button';
    sorterTrigger.className = 'ext-sorter-trigger';
    sorterTrigger.title = 'Change sort mode';

    const updateSorterTriggerIcon = (mode) => {
      sorterTrigger.innerHTML = ICONS[mode] || ICONS.custom;
    };

    updateSorterTriggerIcon(blockEl.dataset.sortMode || 'custom');

    const closeSorterDropdown = () => {
      if (sorterDropdown && sorterDropdown.parentNode) {
        sorterDropdown.remove();
      }
      sorterDropdown = null;
      document.removeEventListener('mousedown', onDocumentClick, true);
    };

    const onDocumentClick = (e) => {
      if (sorterDropdown && !sorterDropdown.contains(e.target) && !sorterTrigger.contains(e.target)) {
        closeSorterDropdown();
      }
    };

    sorterTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sorterDropdown) {
        closeSorterDropdown();
        return;
      }

      sorterDropdown = document.createElement('div');
      sorterDropdown.className = 'ext-sorter-dropdown';

      const headerEl = document.createElement('div');
      headerEl.className = 'ext-sorter-dropdown__header';
      headerEl.textContent = 'Sort Mode';
      sorterDropdown.appendChild(headerEl);

      const currentMode = blockEl.dataset.sortMode || 'custom';
      const options = [
        { mode: 'custom', label: 'Custom' },
        { mode: 'name',   label: 'Name' },
        { mode: 'amount', label: 'Amount' }
      ];

      options.forEach(({ mode, label }) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'ext-sorter-dropdown__item';

        item.innerHTML = ICONS[mode];
        const labelSpan = document.createElement('span');
        labelSpan.textContent = label;
        item.appendChild(labelSpan);

        if (mode === currentMode) {
          item.classList.add('is-active');
        }
        item.addEventListener('click', () => {
          blockEl.dataset.sortMode = mode;
          updateSorterTriggerIcon(mode);
          applySort(blockEl.querySelector('.tag-list'), mode);
          updateListDraggability(blockEl);
          save();
          closeSorterDropdown();
        });
        sorterDropdown.appendChild(item);
      });

      document.body.appendChild(sorterDropdown);
      window.__extFloatingPopup.positionBox(sorterTrigger, sorterDropdown, { minWidth: 148, maxHeight: 400 });

      setTimeout(() => document.addEventListener('mousedown', onDocumentClick, true), 0);
    });

    let originalName = null;
    let cancelNextBlur = false;
    let isInteractingWithSorter = false;

    nameInput.addEventListener('pointerdown', () => {
      isInteractingWithSorter = false;
    });

    function clearSelection() {
      try { nameInput.setSelectionRange(0, 0); window.getSelection()?.removeAllRanges(); } catch {}
    }

    function commitName() {
      if (nameInput.readOnly) return;
      nameInput.value = nameInput.value.trim() || 'Section';
      nameInput.readOnly = true;
      nameInput.classList.remove('is-editing');
      setEditBtnVisual(false);
      originalName = null;
      clearSelection();
      save();
    }

    function cancelEdit() {
      if (originalName != null) nameInput.value = originalName;
      commitName();
    }

    function startEdit() {
      originalName = nameInput.value;
      nameInput.readOnly = false;
      nameInput.classList.add('is-editing');
      setEditBtnVisual(true);
      nameInput.focus();
      nameInput.select();
    }

    editBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (nameInput.readOnly) startEdit();
      else commitName();
    });

    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commitName(); }
      if (e.key === 'Escape') { e.preventDefault(); cancelNextBlur = true; cancelEdit(); nameInput.blur(); }
    });

    nameInput.addEventListener('blur', () => {
      if (cancelNextBlur) {
        cancelNextBlur = false;
        return;
      }

      if (isInteractingWithSorter) {
        isInteractingWithSorter = false;
        nameInput.focus();
        return;
      }

      commitName();
    });

    header.append(collapseBtn, sorterTrigger, editBtn, nameInput);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'ext-remove-list-btn';
    removeBtn.title = 'Delete this section';
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    if (index === 0) removeBtn.style.display = 'none';
    removeBtn.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const blocksBeforeRemoval = [...overviewEl.querySelectorAll('.ext-list-block')];
      const sectionIndex = blocksBeforeRemoval.indexOf(blockEl);
      const previousBlock = sectionIndex > 0 ? blocksBeforeRemoval[sectionIndex - 1] : null;
      const thisList = blockEl.querySelector('.tag-list');
      const targetList = previousBlock?.querySelector('.tag-list') || null;
      const thisName = blockEl.querySelector('.ext-list-name')?.value.trim() || '';
      const destinationNameInput = previousBlock?.querySelector('.ext-list-name');
      const destinationName = destinationNameInput?.value.trim() || 'the section above';
      const anyTagSelector = '.tag.has-button, .tag[role="button"]:not(.has-button)';
      const tagsToMove = thisList ? [...thisList.querySelectorAll(anyTagSelector)] : [];
      const movedTagKeys = tagsToMove.map(getTagKey).filter(Boolean);
      const tagCount = tagsToMove.length;

      if (tagCount > 0 && (!targetList || targetList === thisList)) {
        try {
          window.__extNotify && window.__extNotify('Cannot delete section', 'Tags can only be moved into the section above.', 'error', 4000);
        } catch {}
        return;
      }

      let shouldRemove = true;
      if (tagCount > 0) {
        try {
          shouldRemove = await window.__extNotify(
            `Delete ${thisName || 'this section'}?`,
            `This section contains ${tagCount} tag${tagCount === 1 ? '' : 's'}. Removing it will move ${tagCount === 1 ? 'it' : 'them'} to "${destinationName}".`,
            'confirm',
            { confirmText: 'Delete', cancelText: 'Cancel' }
          );
        } catch {}
      }

      if (shouldRemove) {
        if (targetList && thisList && targetList !== thisList) {
          if (desiredListByKey && typeof sectionIndex === 'number' && sectionIndex > 0) {
            movedTagKeys.forEach(key => desiredListByKey.set(key, sectionIndex - 1));
          }
          tagsToMove.forEach(el => targetList.appendChild(el));
          const targetSortMode = previousBlock?.dataset.sortMode || 'custom';
          if (targetSortMode !== 'custom') applySort(targetList, targetSortMode);
        }
        if (sectionIndex >= 0 && overviewStore?.removeTagListState) {
          try {
            await storeReady;
            await overviewStore.removeTagListState(sectionIndex, {
              mergeIntoIndex: sectionIndex - 1,
              mergeTagKeys: movedTagKeys,
            });
          } catch {}
        }
        blockEl.remove();
        normalizeHeaderDefaults();
        save();
        try { window.__extNotify && window.__extNotify(`${thisName || 'Section'} deleted`, '', 'error', 2000); } catch {}
      }
    });

    blockEl.insertBefore(header, blockEl.firstChild);
    blockEl.appendChild(removeBtn);
  }

  function normalizeHeaderDefaults() {
    [...overviewEl.querySelectorAll('.ext-list-block')].forEach((blk, i) => {
      const nameInput = blk.querySelector('.ext-list-name');
      const removeBtn = blk.querySelector('.ext-remove-list-btn');
      if (nameInput && !nameInput.value.trim()) nameInput.value = 'Section';
      if (removeBtn) removeBtn.style.display = i === 0 ? 'none' : '';
    });
    ensureAddButton();
  }

  function wrapAllListsOnce() {
    [...overviewEl.querySelectorAll('.tag-list')].forEach(list => {
      if (list.closest('.ext-list-block')) return;
      const block = document.createElement('div');
      block.className = 'ext-list-block';
      list.parentNode.insertBefore(block, list);
      block.appendChild(list);
      ensureHeader(block, overviewEl.querySelectorAll('.ext-list-block').length - 1);
      wireList(list);
    });
  }

  function ensureAddButton() {
    overviewEl.querySelectorAll('.ext-add-divider-wrap').forEach(w => w.remove());

    const firstBlock = overviewEl.querySelector('.ext-list-block');
    if (!firstBlock) return;

    let btn = firstBlock.querySelector('.ext-add-first-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ext-add-first-btn';
      btn.textContent = '+';
      btn.title = 'Add a new section';
      firstBlock.appendChild(btn);
    }

    if (!btn.__extWired) {
      btn.__extWired = true;
      btn.addEventListener('click', () => {
        const block = document.createElement('div');
        block.className = 'ext-list-block';
        const list = document.createElement('ul');
        list.className = 'tag-list';
        block.appendChild(list);
        block.dataset.sortMode = 'custom';

        const container = firstBlock.parentNode;
        container.appendChild(block);

        const newIndex = [...container.querySelectorAll(':scope > .ext-list-block')].length - 1;
        ensureHeader(block, newIndex);
        wireList(list);
        updateListDraggability(block);

        normalizeHeaderDefaults();
        save();
      });
    }
  }

  function captureStructure() {
    const TAG_DND_SELECTOR = '.tag.has-button, .tag[role="button"]:not(.has-button)';
    return [...overviewEl.querySelectorAll('.ext-list-block')].map(blk => ({
      name: blk.querySelector('.ext-list-name')?.value.trim() || 'Section',
      tags: [...blk.querySelectorAll(`.tag-list > ${TAG_DND_SELECTOR}`)].map(getTagKey),
      collapsed: blk.classList.contains('ext-list-collapsed'),
      sortMode: blk.dataset.sortMode || 'custom',
    }));
  }

  async function restoreFromStorage() {
    isRestoringLists = true;
    let state = { version: 2, lists: null };
    try {
      await storeReady;
      if (overviewStore && typeof overviewStore.loadTagListState === 'function') {
        try {
          state = await overviewStore.loadTagListState();
        } catch {}
      }
    } catch {}
    const TAG_DND_SELECTOR = '.tag.has-button, .tag[role="button"]:not(.has-button)';

    wrapAllListsOnce();
    ensureAddButton();
    normalizeHeaderDefaults();
    enableDelegatedDnD(overviewEl);

    if (!state?.lists?.length) {
      pendingSaveAfterRestore = true;
      return;
    }

    const needed = state.lists.length - overviewEl.querySelectorAll('.ext-list-block').length;
    for (let i = 0; i < needed; i++) {
      overviewEl.querySelector('.ext-add-first-btn')?.click();
    }

    let blocks = [...overviewEl.querySelectorAll('.ext-list-block')];

    if (state.lists.length < blocks.length) {
      const firstBlock = blocks[0];
      const primaryList = firstBlock?.querySelector('.tag-list') || null;
      for (let i = state.lists.length; i < blocks.length; i++) {
        const extraBlock = blocks[i];
        if (!extraBlock) continue;
        const extraList = extraBlock.querySelector('.tag-list');
        if (primaryList && extraList && extraList !== primaryList) {
          extraList.querySelectorAll(TAG_DND_SELECTOR).forEach(tag => primaryList.appendChild(tag));
        }
        extraBlock.remove();
      }
      blocks = [...overviewEl.querySelectorAll('.ext-list-block')];
    }

    state.lists.forEach((entry, idx) => {
      const blk = blocks[idx];
      if (!blk) return;

      const input = blk.querySelector('.ext-list-name');
      if (input) input.value = entry.name || 'Section';

      blk.classList.toggle('ext-list-collapsed', !!entry.collapsed);
      const collapseBtn = blk.querySelector('.ext-collapse-list-btn');
      if (collapseBtn) {
        collapseBtn.classList.toggle('is-collapsed', !!entry.collapsed);
        collapseBtn.setAttribute('aria-expanded', String(!entry.collapsed));
      }

      const sortMode = entry.sortMode || 'custom';
      blk.dataset.sortMode = sortMode;
      syncSorterTriggerIcon(blk, sortMode);

      const sorterSelect = blk.querySelector('.ext-sorter-select');
      if (sorterSelect) {
        sorterSelect.value = sortMode;
      }
    });
    normalizeHeaderDefaults();

    rebuildDesiredListMap(state.lists);

    overviewEl.querySelectorAll(TAG_DND_SELECTOR).forEach(tag => {
      const key = getTagKey(tag);
      const idx = desiredListByKey.get(key);
      if (typeof idx === 'number') {
        const targetList = blocks[idx]?.querySelector('.tag-list');
        if (targetList && tag.parentNode !== targetList) {
          targetList.appendChild(tag);
        }
      }
    });

    blocks.forEach((blk, idx) => {
      const list = blk.querySelector('.tag-list');
      if (!list) return;

      const savedList = state.lists[idx];
      const sortMode = blk.dataset.sortMode || 'custom';

      if (sortMode === 'custom') {
        const presentTags = new Map();
        list.querySelectorAll(TAG_DND_SELECTOR).forEach(el => presentTags.set(getTagKey(el), el));
        savedList.tags?.forEach(k => {
          const el = presentTags.get(k);
          if (el) list.appendChild(el);
        });
      } else {
        applySort(list, sortMode);
      }

      updateListDraggability(blk);
    });
  }

  wrapAllListsOnce();
  ensureAddButton();
  normalizeHeaderDefaults();
  enableDelegatedDnD(overviewEl);

  overviewEl.querySelectorAll('.ext-list-block').forEach(blk => {
    wireList(blk.querySelector('.tag-list'));
    updateListDraggability(blk);
  });

  const mo = new MutationObserver(muts => {
    if (IS_DRAGGING_TAG) return;
    let shouldSave = false, sawStructureChange = false;

    for (const m of muts) {
      m.addedNodes?.forEach(n => {
        if (!(n instanceof HTMLElement)) return;

        if (n.matches('.tag-list') && !n.closest('.ext-list-block')) {
          const block = document.createElement('div');
          block.className = 'ext-list-block';
          n.parentNode.insertBefore(block, n);
          block.appendChild(n);
          ensureHeader(block, overviewEl.querySelectorAll('.ext-list-block').length - 1);
          wireList(n);
          updateListDraggability(block);
          sawStructureChange = true;
          shouldSave = true;
        }

        if (n.matches('.tag.has-button') || n.querySelector?.('.tag.has-button')) {
          const tags = n.matches('.tag.has-button') ? [n] : [...n.querySelectorAll('.tag.has-button')];
          tags.forEach(prepTag);
          if (desiredListByKey) {
            tags.forEach(tag => {
              const key = getTagKey(tag);
              const idx = desiredListByKey.get(key);
              if (typeof idx === 'number') {
                const target = overviewEl.querySelectorAll('.ext-list-block > .tag-list')[idx];
                if (target && tag.parentNode !== target) {
                  target.appendChild(tag);
                  shouldSave = true;
                }
              }
            });
          }
        }
      });
    }

    if (sawStructureChange) ensureAddButton();
    if (shouldSave) save();
  });
  mo.observe(overviewEl, { childList: true, subtree: true });

  const readyPromise = (async () => {
    try {
      await restoreFromStorage();
    } finally {
      isRestoringLists = false;
      if (pendingSaveAfterRestore) {
        pendingSaveAfterRestore = false;
        save();
      }
      updateTagCountBadge();
    }
  })();

  overviewEl.__extTagManagerReady = readyPromise.catch(err => {
    try { console.error('Failed to initialize tag manager state', err); } catch {}
    throw err;
  });

  return overviewEl.__extTagManagerReady;
}

window.initAdvancedTagManager = initAdvancedTagManager;