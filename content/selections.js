'use strict';

function __extNormalizeSelectionLabel(rowEl) {
  try {
    const sizeEl = rowEl?.querySelector?.('.selection-row__size');
    const sizeText = (sizeEl?.textContent || '').trim().toLowerCase();
    const looksLikeArea = sizeEl && /\d/.test(sizeText) && (/[²]/.test(sizeText) || /\bsq\b/.test(sizeText) || /\b(?:km|mi|m|ft)\b/.test(sizeText));

    const wrap = rowEl?.querySelector?.('.selection-row__label .ext-label-text-wrapper');
    if (!wrap) return;
    
    let textNode = [...wrap.childNodes].find(n => n.nodeType === 3 && n.nodeValue?.trim());
    const current = textNode?.nodeValue?.trim() || '';
    if (!looksLikeArea && current !== 'Polygon') {
        return;
    }

    if (!textNode) {
      textNode = document.createTextNode('');
      wrap.appendChild(textNode);
    }
    
    const base = current.replace(/^Polygon:\s*/i, '').trim();
    textNode.nodeValue = ` Polygon: ${base}`;
  } catch {}
}

function __extMigrateSelectionActions(row) {
    if (!row) return;
    __extNormalizeSelectionLabel(row);
    const actionsEl = row.querySelector('.selection-row__actions');
    if (!actionsEl || actionsEl.dataset.extActionsUpgraded === '1') return;

    const trigger = actionsEl.querySelector('.icon-button[aria-haspopup="dialog"]');
    if (!trigger) return;

    trigger.style.display = 'none';
    trigger.style.opacity = '0';
    trigger.style.pointerEvents = 'none';

    const runContextAction = async (matchers) => {
        const fn = window.__extPerformSelectionContextAction;
        if (typeof fn === 'function') {
            await fn(trigger, matchers);
        }
    };

    function makeActionBtn({ title, svg, onClick }) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ext-action-btn icon-button';
        btn.setAttribute('aria-label', title);
        btn.title = title;
        btn.innerHTML = svg;
        btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
        });
        return btn;
    }

    // --- Invert selection ---
    const invertClick = async () => {
        await runContextAction(['Invert selection']);

        await new Promise(r => setTimeout(r, 150));

        try {
            const siteSelections = await __extRequestShapeSelectionSync();
            const selectedExtIds = new Map(siteSelections.map(s => [s.extId, { key: s.key, color: s.color }]));

            const allShapes = await loadShapes();
            let stateHasChanged = false;

            const updatedShapes = allShapes.map(shape => {
                const selectionInfo = selectedExtIds.get(shape.id);
                const isNowSelected = !!selectionInfo;
                
                const shapebtn = document.querySelector(`.shape[data-shape-id="${shape.id}"]`);
                if (shapebtn) {
                    shapebtn.classList.toggle('is-selected', isNowSelected);
                    if (shapebtn.__shapeRef) {
                        shapebtn.__shapeRef.__selected = isNowSelected;
                        shapebtn.__shapeRef.__selectionKey = isNowSelected ? selectionInfo.key : null;
                    }
                }

                if (shape.__selected !== isNowSelected) {
                    stateHasChanged = true;
                    return {
                        ...shape,
                        __selected: isNowSelected,
                        __selectionKey: isNowSelected ? selectionInfo.key : null,
                        color: (isNowSelected && selectionInfo.color) ? selectionInfo.color : shape.color,
                    };
                }
                return shape;
            });

            if (stateHasChanged) {
                await saveShapes(updatedShapes);
            }
        } catch (err) {
            console.error('Failed to sync shape selections after invert:', err);
            try { window.__extNotify && window.__extNotify('Sync Failed', 'Could not sync shapes after inverting.', 'error', 3500); } catch {}
        }
    };
    const invertBtn = makeActionBtn({
        title: 'Invert selection',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 3a7 7 0 0 0 0 14V5z"/></svg>`,
        onClick: invertClick
    });

    // --- Review selection ---
    const reviewClick = async () => {
      const sizeEl = row.querySelector('.selection-row__size');
      const count = parseInt((sizeEl?.textContent || '').trim(), 10) || 0;
      if (count <= 0) return;
      await runContextAction(['Review selection']);
    };

    const reviewBtn = makeActionBtn({
      title: 'Review selection',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path fill="currentColor" d="M16.33 14.92c1.05-1.29 1.67-2.91 1.67-4.72C18 6.22 14.78 3 10.8 3S3.6 6.22 3.6 10.2s3.22 7.2 7.2 7.2c1.81 0 3.43-.62 4.72-1.67l3.93 5.47 1.65-1.65-4.77-4.55zM10.8 15c-2.65 0-4.8-2.15-4.8-4.8s2.15-4.8 4.8-4.8 4.8 2.15 4.8 4.8-2.15 4.8-4.8 4.8z"></path></svg>`,
      onClick: reviewClick
    });

    const applyReviewDisabled = () => {
      const sizeEl = row.querySelector('.selection-row__size');
      const count = parseInt((sizeEl?.textContent || '').trim(), 10) || 0;
      const disabled = count <= 0;

      reviewBtn.disabled = disabled;
      reviewBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      reviewBtn.classList.toggle('is-disabled', disabled);

      reviewBtn.style.pointerEvents = disabled ? 'none' : '';
      reviewBtn.style.opacity = disabled ? '0.5' : '';
    };

    applyReviewDisabled();

    if (!row.__extReviewObserver) {
      const sizeEl = row.querySelector('.selection-row__size');
      if (sizeEl) {
        const obs = new MutationObserver(applyReviewDisabled);
        obs.observe(sizeEl, { childList: true, characterData: true, subtree: true });
        row.__extReviewObserver = obs;
      }
    }
    actionsEl.insertBefore(invertBtn, actionsEl.firstChild);
    actionsEl.insertBefore(reviewBtn, actionsEl.firstChild);

    actionsEl.dataset.extActionsUpgraded = '1';
}

const SELECTIONS_COLLAPSE_ID = window.__extOverviewStorage?.ids?.SELECTION_MANAGER || 'selection-manager';

function initAdvancedSelectionManager(overviewEl) {
    if (!overviewEl) return;

    const sizeRows = overviewEl.querySelectorAll('.selection-row__size');
    sizeRows.forEach(sizeEl => {
        const row = sizeEl.closest('.selection-row');
        if (!row) return;
        const labelEl = row.querySelector('.selection-row__label');
        if (!labelEl) return;

        if (!labelEl.querySelector('.ext-label-text-wrapper')) {
        const wrapperSpan = document.createElement('span');
        wrapperSpan.className = 'ext-label-text-wrapper';
        const nodesToWrap = Array.from(labelEl.childNodes);
        nodesToWrap.forEach(node => wrapperSpan.appendChild(node));
        labelEl.appendChild(wrapperSpan);
        }
        if (sizeEl.parentNode !== labelEl) {
        labelEl.appendChild(sizeEl);
        }

        __extMigrateSelectionActions(row);
    });

    overviewEl.querySelectorAll('.selection-row').forEach(__extNormalizeSelectionLabel);

    (async function ensureSelectionsHeaderPersistence() {
        const block = overviewEl.querySelector('.tool-block.selection-manager');
        if (!block) return;
        const wire = window.__extWireCollapsibleBlock;
        if (typeof wire === 'function') {
            await wire(block, SELECTIONS_COLLAPSE_ID, { defaultOpen: true });
        }
    })();

    if (!overviewEl.__extSelMgrObserver) {
        const mo = new MutationObserver(muts => {
        for (const m of muts) {
            m.addedNodes && m.addedNodes.forEach(n => {
            if (!(n instanceof HTMLElement)) return;

            const rows = [];
            if (n.matches?.('.selection-row')) rows.push(n);
            n.querySelectorAll?.('.selection-row')?.forEach?.(r => rows.push(r));

            rows.forEach(row => {
                const sizeEl = row.querySelector('.selection-row__size');
                const labelEl = row.querySelector('.selection-row__label');
                if (labelEl && !labelEl.querySelector('.ext-label-text-wrapper')) {
                const wrapperSpan = document.createElement('span');
                wrapperSpan.className = 'ext-label-text-wrapper';
                const nodesToWrap = Array.from(labelEl.childNodes);
                nodesToWrap.forEach(node => wrapperSpan.appendChild(node));
                labelEl.appendChild(wrapperSpan);
                }
                if (sizeEl && labelEl && sizeEl.parentNode !== labelEl) {
                labelEl.appendChild(sizeEl);
                }

                __extMigrateSelectionActions(row);
                __extNormalizeSelectionLabel(row);
            });
            });
        }
        });
        mo.observe(overviewEl, { childList: true, subtree: true });
        overviewEl.__extSelMgrObserver = mo;
    }
}

window.initAdvancedSelectionManager = initAdvancedSelectionManager;