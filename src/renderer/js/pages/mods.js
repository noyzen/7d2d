import { rendererEvents } from '../events.js';
import { settings, saveSettings } from '../state.js';
import { showPrompt, showConfirmationPrompt, showAlert, sanitizeText } from '../ui.js';

let allMods = [];
let searchQuery = '';
let isLoading = false;
let selectedModSetName = settings.activeModSet; // Initialize with saved setting
let contextMenuTargetMod = null; // To store which mod the context menu is for

// Filter and Sort State
let activeStatusFilter = 'all'; // 'all', 'enabled', 'disabled'
let activeLabelFilters = new Set();
let dateSortDirection = 'none'; // 'none', 'desc', 'asc'

function getEl(id) { return document.getElementById(id); }

function setupContextMenu() {
    const contextMenu = getEl('mod-context-menu');
    const labelDropdown = getEl('label-filter-dropdown');

    // Combined click-outside handler
    window.addEventListener('click', (e) => {
        // Hide context menu if clicked outside
        if (!contextMenu.classList.contains('hidden') && !contextMenu.contains(e.target) && !e.target.closest('.mod-options-btn')) {
            contextMenu.classList.add('hidden');
            contextMenuTargetMod = null;
        }
        // Hide label filter dropdown if clicked outside
        if (!labelDropdown.classList.contains('hidden') && !labelDropdown.contains(e.target) && !e.target.closest('#label-filter-btn')) {
            labelDropdown.classList.add('hidden');
            getEl('label-filter-btn').setAttribute('aria-expanded', 'false');
        }
    });

    contextMenu.addEventListener('click', (e) => {
        const action = e.target.closest('li')?.dataset.action;
        if (action && contextMenuTargetMod) {
            const currentLabel = settings.modLabels[contextMenuTargetMod] || null;

            if (action === 'clear') {
                delete settings.modLabels[contextMenuTargetMod];
            } else if (action === currentLabel) {
                // If clicking the same label again, clear it (toggle off).
                delete settings.modLabels[contextMenuTargetMod];
            } else {
                settings.modLabels[contextMenuTargetMod] = action;
            }

            saveSettings();
            
            // Targeted update to prevent scroll jump
            const modCard = document.querySelector(`.mod-card[data-folder-name="${contextMenuTargetMod}"]`);
            if (modCard) {
                const iconContainer = modCard.querySelector('.mod-label-icon-container');
                const newLabel = settings.modLabels[contextMenuTargetMod];
                let newIconHtml = '';
                if (newLabel) {
                    const icons = { safe: 'fa-shield-halved', testing: 'fa-flask-vial', broken: 'fa-triangle-exclamation' };
                    const titles = { safe: 'Marked as Safe', testing: 'Marked as Testing', broken: 'Marked as Broken' };
                    newIconHtml = `<i class="fa-solid ${icons[newLabel]} mod-label-icon ${newLabel}" title="${titles[newLabel]}"></i>`;
                }
                iconContainer.innerHTML = newIconHtml;
            } else {
                // Fallback in case the card isn't found (e.g., due to filtering)
                renderModLists();
            }
            
            contextMenu.classList.add('hidden');
            contextMenuTargetMod = null;
        }
    });
}

function showContextMenu(e, modFolderName) {
    e.preventDefault();
    e.stopPropagation();
    const menu = getEl('mod-context-menu');
    if (!menu) return;

    // Toggle behavior: if menu is open for the same mod, close it.
    if (!menu.classList.contains('hidden') && contextMenuTargetMod === modFolderName) {
        menu.classList.add('hidden');
        contextMenuTargetMod = null;
        return;
    }

    contextMenuTargetMod = modFolderName;
    const currentLabel = settings.modLabels[modFolderName] || null;
    
    // Update active state on menu items
    menu.querySelectorAll('li[data-action]').forEach(li => {
        li.classList.toggle('active', li.dataset.action === currentLabel);
    });

    // Make menu visible to calculate its dimensions
    menu.classList.remove('hidden');
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    
    const btnRect = e.currentTarget.getBoundingClientRect();
    const margin = 8; // A bit more space from edges

    // --- Robust Positioning Logic ---

    // Vertical positioning: Prefer below, flip above if there's no space
    let topPos = btnRect.bottom + margin;
    if (topPos + menuHeight > window.innerHeight && (btnRect.top - menuHeight - margin) > 0) {
        topPos = btnRect.top - menuHeight - margin;
    }

    // Horizontal positioning: Prefer aligning right edges, but ensure it fits
    let leftPos = btnRect.right - menuWidth;
    if (leftPos < margin) {
        // If aligning right pushes it off-screen left, align to the button's left edge instead
        leftPos = btnRect.left;
    }
    
    // Clamp final positions to be within the viewport
    topPos = Math.max(margin, Math.min(topPos, window.innerHeight - menuHeight - margin));
    leftPos = Math.max(margin, Math.min(leftPos, window.innerWidth - menuWidth - margin));

    menu.style.top = `${topPos}px`;
    menu.style.left = `${leftPos}px`;
}


function renderModCounts(enabledCount, disabledCount) {
    const countsEl = getEl('mod-counts');
    if (!countsEl) return;
    countsEl.innerHTML = `
        <div class="mod-count-item enabled" title="Enabled Mods">
            <span class="count">${enabledCount}</span>
            <span>Enabled</span>
        </div>
        <div class="mod-count-item disabled" title="Disabled Mods">
            <span class="count">${disabledCount}</span>
            <span>Disabled</span>
        </div>
    `;
}

function createModElement(mod, isDisplayedAsEnabled) {
  const modEl = document.createElement('div');
  modEl.className = 'mod-card';
  modEl.dataset.folderName = mod.folderName;
  if (!mod.isValid) modEl.classList.add('invalid');
  modEl.classList.toggle('enabled', isDisplayedAsEnabled);

  const safeName = sanitizeText(mod.name);
  const safeAuthor = sanitizeText(mod.author);
  const safeVersion = sanitizeText(mod.version);
  const safeDescription = sanitizeText(mod.description);

  const label = settings.modLabels[mod.folderName];
  let labelIconHtml = '';
  if (label) {
      const icons = {
          safe: 'fa-shield-halved',
          testing: 'fa-flask-vial',
          broken: 'fa-triangle-exclamation'
      };
      const titles = {
          safe: 'Marked as Safe',
          testing: 'Marked as Testing',
          broken: 'Marked as Broken'
      };
      labelIconHtml = `<i class="fa-solid ${icons[label]} mod-label-icon ${label}" title="${titles[label]}"></i>`;
  }

  modEl.innerHTML = `
    <div class="mod-status-icon">
        <i class="fa-solid fa-circle-check"></i>
    </div>
    <div class="mod-info">
        <div class="mod-top-right-controls">
            <div class="mod-label-icon-container">${labelIconHtml}</div>
            <button class="mod-options-btn" title="Mod Options"><i class="fa-solid fa-ellipsis-vertical"></i></button>
        </div>
        <h3 class="mod-title">
            ${!mod.isValid ? '<i class="fa-solid fa-triangle-exclamation" title="Invalid Mod"></i>' : ''}
            <span>${safeName}</span>
        </h3>
        <div class="mod-meta">
            <p class="mod-author">by ${safeAuthor}</p>
            <span class="mod-version">${safeVersion}</span>
        </div>
        <p class="mod-desc">${safeDescription}</p>
    </div>
  `;

  const modInfo = modEl.querySelector('.mod-info');
  const modDesc = modEl.querySelector('.mod-desc');

  setTimeout(() => {
    if (modDesc.scrollHeight > modDesc.clientHeight) {
      const readMoreBtn = document.createElement('button');
      readMoreBtn.className = 'mod-read-more';
      readMoreBtn.innerHTML = 'Read More <i class="fa-solid fa-angle-right"></i>';
      readMoreBtn.title = 'View full description';
      modInfo.appendChild(readMoreBtn);
      
      readMoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showAlert(
          mod.name, 
          `<p style="text-align: left; white-space: pre-wrap; line-height: 1.6;">${safeDescription}</p>`
        );
      });
    }
  }, 0);

  modEl.querySelector('.mod-options-btn').addEventListener('click', (e) => {
    showContextMenu(e, mod.folderName);
  });

  modEl.addEventListener('click', async (e) => {
    if (modEl.classList.contains('processing') || e.target.closest('.mod-options-btn') || e.target.closest('.mod-read-more')) return;

    if (selectedModSetName === null) { // Manual Mode: Directly toggle the mod's file state
        modEl.classList.add('processing');
        const desiredState = !mod.isEnabled;
        const result = await window.mods.toggle({ folderName: mod.folderName, enable: desiredState });
        if (result.success) {
            mod.isEnabled = desiredState;
            await loadMods();
            rendererEvents.emit('mods:changed');
        } else {
            await showAlert('Error', `Could not toggle mod: ${result.error}`);
        }
        modEl.classList.remove('processing');
    } else { // Mod Set Edit & Apply Mode
        const selectedSet = settings.modSets.find(s => s.name === selectedModSetName);
        if (!selectedSet) return;
        
        const modInSet = selectedSet.mods.includes(mod.folderName);
        const originalMods = [...selectedSet.mods];

        if (modInSet) {
            selectedSet.mods = selectedSet.mods.filter(m => m !== mod.folderName);
        } else {
            selectedSet.mods.push(mod.folderName);
        }
        
        saveSettings();
        
        modEl.classList.add('processing');
        const result = await window.mods.applyModSet({ modSetFolderNames: selectedSet.mods });
        
        if (result.success) {
            await loadMods();
        } else {
            await showAlert('Error', `Could not apply change: ${result.error}`);
            selectedSet.mods = originalMods;
            saveSettings();
            await loadMods();
        }
    }
  });

  return modEl;
}

function renderModSets() {
    const listEl = getEl('mod-sets-list');
    if (!listEl) return;
    
    listEl.innerHTML = '';

    if (!settings.modSets || settings.modSets.length === 0) {
        listEl.innerHTML = '<p class="no-mods" style="text-align: center; padding: 20px 0;">No mod sets created yet. Click "Save New Set" to create one from your currently enabled mods.</p>';
    }

    (settings.modSets || []).forEach(set => {
        const setCard = document.createElement('div');
        setCard.className = 'mod-set-card';
        if (set.name === selectedModSetName) setCard.classList.add('active');
        setCard.dataset.setName = set.name;
        setCard.innerHTML = `
            <div class="mod-set-info">
                <span class="mod-set-name">${sanitizeText(set.name)}</span>
                <span class="mod-set-count">${set.mods.length} mods</span>
            </div>
            <div class="mod-set-actions">
                <button class="delete-set-btn" title="Delete Set"><i class="fa-solid fa-trash-can"></i></button>
            </div>`;
        
        setCard.addEventListener('click', (e) => {
            if (e.target.closest('.delete-set-btn')) return;

            if (selectedModSetName === set.name) {
                selectedModSetName = null;
                settings.activeModSet = null;
            } else {
                selectedModSetName = set.name;
                settings.activeModSet = set.name;
            }
            
            saveSettings();
            renderModSets();
            renderModSetActions();
            renderModLists();
        });
        
        setCard.querySelector('.delete-set-btn').addEventListener('click', async () => {
            const safeSetName = sanitizeText(set.name);
            const confirmed = await showConfirmationPrompt(
                'Delete Mod Set',
                `<p>Are you sure you want to delete the mod set <strong>"${safeSetName}"</strong>?</p>`,
                'Delete',
                'Cancel'
            );
            if (!confirmed) return;
            settings.modSets = settings.modSets.filter(s => s.name !== set.name);
            if (selectedModSetName === set.name) {
                selectedModSetName = null;
                settings.activeModSet = null;
            }
            saveSettings();
            renderModSets();
            renderModSetActions();
            renderModLists();
        });

        listEl.appendChild(setCard);
    });
}

function renderModSetActions() {
    const actionsEl = getEl('mod-set-actions');
    if (!actionsEl) return;

    if (selectedModSetName === null) {
        actionsEl.innerHTML = `
            <button id="enable-all-btn" class="mod-set-action-btn enable-all"><i class="fa-solid fa-check-double"></i> Enable All</button>
            <button id="disable-all-btn" class="mod-set-action-btn disable-all"><i class="fa-solid fa-power-off"></i> Disable All</button>
        `;
        getEl('enable-all-btn').addEventListener('click', () => applyModList(
            allMods.map(m => m.folderName),
            'Enable all mods? This will overwrite your current configuration.'
        ));
        getEl('disable-all-btn').addEventListener('click', () => applyModList(
            [],
            'Disable all mods?'
        ));
    } else {
        actionsEl.innerHTML = `
            <p style="font-size: 0.9rem; color: var(--fg-med); text-align: center; margin: 0 0 10px;">Editing "<strong style="color: var(--primary);">${sanitizeText(selectedModSetName)}</strong>".</p>
            <div class="sub-section-divider"></div>
            <button id="set-enable-all-btn" class="mod-set-action-btn enable-all" title="Add all available mods to this set"><i class="fa-solid fa-folder-plus"></i> Add All to Set</button>
            <button id="set-disable-all-btn" class="mod-set-action-btn disable-all" title="Remove all mods from this set"><i class="fa-solid fa-folder-minus"></i> Remove All from Set</button>
        `;

        getEl('set-enable-all-btn').addEventListener('click', () => {
            const selectedSet = settings.modSets.find(s => s.name === selectedModSetName);
            if (selectedSet) {
                selectedSet.mods = allMods.map(m => m.folderName);
                saveSettings();
                applyModList(selectedSet.mods, { isApplyingSet: true, setName: selectedModSetName, noPrompt: true });
            }
        });
        getEl('set-disable-all-btn').addEventListener('click', () => {
           const selectedSet = settings.modSets.find(s => s.name === selectedModSetName);
           if (selectedSet) {
               selectedSet.mods = [];
               saveSettings();
               applyModList(selectedSet.mods, { isApplyingSet: true, setName: selectedModSetName, noPrompt: true });
           }
        });
    }
}

function renderModLists() {
    const listEl = getEl('mod-list');
    if (!listEl) return;
    
    const scrollPosition = listEl.scrollTop;
    listEl.innerHTML = '';
    
    if (isLoading) {
        listEl.innerHTML = '<div class="loading-spinner"></div>';
        return;
    }

    let processedMods = [...allMods];

    // Search filter
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        processedMods = processedMods.filter(mod => 
            mod.name.toLowerCase().includes(query) ||
            mod.author.toLowerCase().includes(query) ||
            mod.description.toLowerCase().includes(query) ||
            mod.folderName.toLowerCase().includes(query)
        );
    }
    
    // Status filter
    if (activeStatusFilter === 'enabled') {
        processedMods = processedMods.filter(mod => mod.isEnabled);
    } else if (activeStatusFilter === 'disabled') {
        processedMods = processedMods.filter(mod => !mod.isEnabled);
    }

    // Label filter
    if (activeLabelFilters.size > 0) {
        processedMods = processedMods.filter(mod => {
            const label = settings.modLabels[mod.folderName];
            return label && activeLabelFilters.has(label);
        });
    }

    // Date sort
    if (dateSortDirection !== 'none') {
        processedMods.sort((a, b) => {
            const dateA = a.date ? new Date(a.date) : new Date(0);
            const dateB = b.date ? new Date(b.date) : new Date(0);
            return dateSortDirection === 'desc' ? dateB - dateA : dateA - dateB;
        });
    }

    const selectedSetData = settings.modSets.find(s => s.name === selectedModSetName);
    const setModsForDisplay = selectedSetData ? new Set(selectedSetData.mods) : null;

    if (processedMods.length > 0) {
        processedMods.forEach(mod => {
            const isDisplayedAsEnabled = (selectedModSetName === null)
                ? mod.isEnabled
                : setModsForDisplay.has(mod.folderName);
            listEl.appendChild(createModElement(mod, isDisplayedAsEnabled));
        });
    } else {
        listEl.innerHTML = `<p class="no-mods">No mods match your filters.</p>`;
    }
    listEl.scrollTop = scrollPosition;
}

async function applyModList(modFolderNames, promptInfo) {
    let confirmed = true;
    if (!(typeof promptInfo === 'object' && promptInfo.noPrompt)) {
        let confirmationMessage;
        if (typeof promptInfo === 'object' && promptInfo.isApplyingSet) {
            confirmationMessage = `<p>Apply the mod set <strong>"${sanitizeText(promptInfo.setName)}"</strong>?</p>`;
        } else {
            confirmationMessage = `<p>${sanitizeText(promptInfo)}</p>`;
        }
        confirmed = await showConfirmationPrompt(
            'Apply Mod Configuration',
            confirmationMessage,
            'Apply',
            'Cancel'
        );
    }
    if (!confirmed) return;

    isLoading = true;
    const result = await window.mods.applyModSet({ modSetFolderNames: modFolderNames });
    if (!result.success) {
        await showAlert('Error', `Error applying mods: ${result.error}`);
    }
    if (result.warnings && result.warnings.length > 0) {
        await showAlert('Warning', `<p>The mod set was applied, but with some issues:</p><ul style="text-align: left; margin-left: 20px;"><li>${result.warnings.join('</li><li>')}</li></ul>`);
    }
    await loadMods();
    rendererEvents.emit('mods:changed');
}

async function loadMods() {
    isLoading = true;
    renderModCounts(0, 0);
    try {
        const { enabled, disabled } = await window.mods.get();
        const enabledWithState = enabled.map(m => ({ ...m, isEnabled: true }));
        const disabledWithState = disabled.map(m => ({ ...m, isEnabled: false }));
        allMods = [...enabledWithState, ...disabledWithState].sort((a, b) => a.name.localeCompare(b.name));
        renderModCounts(enabled.length, disabled.length);
    } catch (error) {
        console.error("Failed to load mods:", error);
        allMods = [];
        renderModCounts(0, 0);
        getEl('mod-list').innerHTML = '<p class="error-message">Could not load mods.</p>';
    }
    isLoading = false;
    renderModLists();
    renderModSets();
    renderModSetActions();
}

function renderLabelFilterDropdown() {
    const dropdown = getEl('label-filter-dropdown');
    const labels = [
        { id: 'safe', icon: 'fa-shield-halved' },
        { id: 'testing', icon: 'fa-flask-vial' },
        { id: 'broken', icon: 'fa-triangle-exclamation' }
    ];
    dropdown.innerHTML = `
        <ul>
            ${labels.map(label => `
                <li>
                    <label for="label-filter-${label.id}">
                        <input type="checkbox" id="label-filter-${label.id}" data-label-filter="${label.id}" ${activeLabelFilters.has(label.id) ? 'checked' : ''}>
                        <i class="fa-solid ${label.icon} mod-label-icon ${label.id}"></i>
                        <span>${label.id.charAt(0).toUpperCase() + label.id.slice(1)}</span>
                    </label>
                </li>
            `).join('')}
            <li class="separator"></li>
            <li><button id="clear-label-filters-btn">Clear All</button></li>
        </ul>
    `;

    dropdown.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const label = checkbox.dataset.labelFilter;
            if (checkbox.checked) {
                activeLabelFilters.add(label);
            } else {
                activeLabelFilters.delete(label);
            }
            renderModLists();
            updateLabelFilterButton();
        });
    });

    getEl('clear-label-filters-btn').addEventListener('click', () => {
        activeLabelFilters.clear();
        dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        renderModLists();
        updateLabelFilterButton();
    });
}

function updateLabelFilterButton() {
    const countEl = getEl('label-filter-count');
    if (activeLabelFilters.size > 0) {
        countEl.textContent = activeLabelFilters.size;
        countEl.classList.remove('hidden');
    } else {
        countEl.classList.add('hidden');
    }
}

function setupFilterListeners() {
    // Status Filter
    getEl('page-mods').querySelectorAll('.status-filter .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.classList.contains('active')) return;
            const activeBtn = getEl('page-mods').querySelector('.status-filter .filter-btn.active');
            if (activeBtn) {
                activeBtn.classList.remove('active');
                activeBtn.setAttribute('aria-pressed', 'false');
            }
            
            btn.classList.add('active');
            btn.setAttribute('aria-pressed', 'true');
            activeStatusFilter = btn.dataset.statusFilter;
            renderModLists();
        });
    });

    // Label Filter
    const labelFilterBtn = getEl('label-filter-btn');
    const labelDropdown = getEl('label-filter-dropdown');
    labelFilterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = labelDropdown.classList.toggle('hidden');
        labelFilterBtn.setAttribute('aria-expanded', String(!isHidden));
        if (!isHidden) {
            renderLabelFilterDropdown();
        }
    });
    
    // Date Sort
    const sortBtn = getEl('sort-date-btn');
    const sortIndicator = getEl('sort-indicator');
    sortBtn.addEventListener('click', () => {
        sortBtn.classList.remove('asc', 'desc');
        if (dateSortDirection === 'none') {
            dateSortDirection = 'desc';
            sortIndicator.classList.remove('hidden');
            sortBtn.classList.add('desc');
        } else if (dateSortDirection === 'desc') {
            dateSortDirection = 'asc';
            sortBtn.classList.remove('desc');
            sortBtn.classList.add('asc');
        } else {
            dateSortDirection = 'none';
            sortIndicator.classList.add('hidden');
        }
        renderModLists();
    });
}

function setupEventListeners() {
    const searchInput = getEl('mod-search-input');
    searchInput.value = searchQuery;
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderModLists();
    });
    
    getEl('save-mod-set-btn').addEventListener('click', async () => {
        const setName = await showPrompt(
            'Save Mod Set',
            'Enter a name for this new mod set.',
            ''
        );
        if (!setName) return;

        const existingSetIndex = settings.modSets.findIndex(s => s.name === setName);
        if (existingSetIndex > -1) {
            const safeSetName = sanitizeText(setName);
            const confirmed = await showConfirmationPrompt(
                'Overwrite Mod Set',
                `<p>A mod set named <strong>"${safeSetName}"</strong> already exists. Overwrite it?</p>`,
                'Overwrite',
                'Cancel'
            );
            if (!confirmed) {
                return;
            }
            settings.modSets.splice(existingSetIndex, 1);
        }
        
        const newSet = {
            name: setName,
            mods: allMods.filter(m => m.isEnabled).map(m => m.folderName)
        };
        settings.modSets.push(newSet);
        settings.modSets.sort((a, b) => a.name.localeCompare(b.name));
        
        selectedModSetName = newSet.name;
        settings.activeModSet = newSet.name;
        saveSettings();
        
        renderModSets();
        renderModSetActions();
        renderModLists();
    });
}

export function init() {
    setupEventListeners();
    setupContextMenu();
    setupFilterListeners();
    loadMods();
}

export function unmount() {
    searchQuery = '';
    activeStatusFilter = 'all';
    activeLabelFilters.clear();
    dateSortDirection = 'none';
}
