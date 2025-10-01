import { rendererEvents } from '../events.js';
import { settings, saveSettings } from '../state.js';
import { showPrompt, showConfirmationPrompt, showAlert } from '../ui.js';

let allMods = [];
let searchQuery = '';
let isLoading = false;
let selectedModSetName = settings.activeModSet; // Initialize with saved setting
let contextMenuTargetMod = null; // To store which mod the context menu is for

function getEl(id) { return document.getElementById(id); }

function setupContextMenu() {
    const menu = getEl('mod-context-menu');
    if (!menu) return;

    // Hide on click outside
    window.addEventListener('click', () => {
        menu.classList.add('hidden');
        contextMenuTargetMod = null;
    });

    menu.addEventListener('click', (e) => {
        const action = e.target.closest('li')?.dataset.action;
        if (action && contextMenuTargetMod) {
            const currentLabel = settings.modLabels[contextMenuTargetMod] || null;

            if (action === 'clear') {
                delete settings.modLabels[contextMenuTargetMod];
            } else if (action === currentLabel) {
                // If clicking the same label again, clear it.
                delete settings.modLabels[contextMenuTargetMod];
            } else {
                settings.modLabels[contextMenuTargetMod] = action;
            }

            saveSettings();
            // Re-render the mod lists to update the UI
            renderModLists();
        }
    });
}

function showContextMenu(e, modFolderName) {
    e.preventDefault();
    e.stopPropagation(); // Prevent the window click listener from firing immediately
    const menu = getEl('mod-context-menu');
    if (!menu) return;

    contextMenuTargetMod = modFolderName;
    const currentLabel = settings.modLabels[modFolderName] || null;
    
    // Update active state
    menu.querySelectorAll('li').forEach(li => {
        li.classList.remove('active');
        if (li.dataset.action === currentLabel) {
            li.classList.add('active');
        }
    });

    // Position and show menu
    const { clientX: mouseX, clientY: mouseY } = e;
    menu.style.top = `${mouseY}px`;
    menu.style.left = `${mouseX}px`;
    menu.classList.remove('hidden');

    // Prevent menu from going off-screen
    const rect = menu.getBoundingClientRect();
    if (rect.bottom > window.innerHeight) {
        menu.style.top = `${mouseY - rect.height}px`;
    }
    if (rect.right > window.innerWidth) {
        menu.style.left = `${mouseX - rect.width}px`;
    }
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
  if (!mod.isValid) modEl.classList.add('invalid');
  modEl.classList.toggle('enabled', isDisplayedAsEnabled);

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
    <div class="mod-info" title="${mod.description}">
      <h3 class="mod-title">
        ${!mod.isValid ? '<i class="fa-solid fa-triangle-exclamation" title="Invalid Mod"></i>' : ''}
        <span>${mod.name}</span>
        ${labelIconHtml}
      </h3>
      <div class="mod-meta">
        <p class="mod-author">by ${mod.author}</p>
        <span class="mod-version">${mod.version}</span>
      </div>
      <p class="mod-desc">${mod.description}</p>
    </div>
  `;

  modEl.addEventListener('contextmenu', (e) => {
    showContextMenu(e, mod.folderName);
  });

  modEl.addEventListener('click', async () => {
    if (modEl.classList.contains('processing')) return;

    if (selectedModSetName === null) { // Manual Mode: Directly toggle the mod's file state
        modEl.classList.add('processing');
        const desiredState = !mod.isEnabled;
        const result = await window.mods.toggle({ folderName: mod.folderName, enable: desiredState });
        if (result.success) {
            mod.isEnabled = desiredState;
            modEl.classList.toggle('enabled', mod.isEnabled);
            const enabledCount = allMods.filter(m => m.isEnabled).length;
            renderModCounts(enabledCount, allMods.length - enabledCount);
            renderModSetActions();
            rendererEvents.emit('mods:changed');
        } else {
            await showAlert('Error', `Could not toggle mod: ${result.error}`);
        }
        modEl.classList.remove('processing');
    } else { // Mod Set Edit Mode: Modify the set definition in memory
        const selectedSet = settings.modSets.find(s => s.name === selectedModSetName);
        if (!selectedSet) return;

        const modInSet = selectedSet.mods.includes(mod.folderName);
        if (modInSet) {
            selectedSet.mods = selectedSet.mods.filter(m => m !== mod.folderName);
        } else {
            selectedSet.mods.push(mod.folderName);
        }
        saveSettings();
        
        // Rerender UI components to reflect the change in the set definition
        renderModLists();
        renderModSets();
        renderModSetActions();
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
                <span class="mod-set-name">${set.name}</span>
                <span class="mod-set-count">${set.mods.length} mods</span>
            </div>
            <div class="mod-set-actions">
                <button class="delete-set-btn" title="Delete Set"><i class="fa-solid fa-trash-can"></i></button>
            </div>`;
        
        setCard.addEventListener('click', (e) => {
            if (e.target.closest('.delete-set-btn')) return;

            // Toggle selection logic
            if (selectedModSetName === set.name) {
                // If clicking the active set, deselect it
                selectedModSetName = null;
                settings.activeModSet = null;
            } else {
                // Otherwise, select the new set
                selectedModSetName = set.name;
                settings.activeModSet = set.name;
            }
            
            saveSettings();
            renderModSets();
            renderModSetActions();
            renderModLists();
        });
        
        setCard.querySelector('.delete-set-btn').addEventListener('click', async () => {
            const confirmed = await showConfirmationPrompt(
                'Delete Mod Set',
                `<p>Are you sure you want to delete the mod set <strong>"${set.name}"</strong>?</p>`,
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

function isSetApplied() {
    if (selectedModSetName === null) return true;
    const selectedSet = settings.modSets.find(s => s.name === selectedModSetName);
    if (!selectedSet) return false;

    const enabledFolders = new Set(allMods.filter(m => m.isEnabled).map(m => m.folderName));
    const setFolders = new Set(selectedSet.mods);
    
    if (enabledFolders.size !== setFolders.size) return false;
    for (const mod of setFolders) {
        if (!enabledFolders.has(mod)) return false;
    }
    return true;
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
            <button id="apply-mod-set-btn" class="mod-set-action-btn apply"><i class="fa-solid fa-check"></i> Apply Set</button>
            <div class="sub-section-divider"></div>
            <button id="set-enable-all-btn" class="mod-set-action-btn enable-all" title="Add all available mods to this set"><i class="fa-solid fa-folder-plus"></i> Add All to Set</button>
            <button id="set-disable-all-btn" class="mod-set-action-btn disable-all" title="Remove all mods from this set"><i class="fa-solid fa-folder-minus"></i> Remove All from Set</button>
        `;
        const applyBtn = getEl('apply-mod-set-btn');
        if (isSetApplied()) {
            applyBtn.disabled = true;
            applyBtn.innerHTML = `<i class="fa-solid fa-check-double"></i> Set is Active`;
        }
        applyBtn.addEventListener('click', () => {
            const modSet = settings.modSets.find(s => s.name === selectedModSetName);
            if (!modSet) return;
            applyModList(modSet.mods, `Apply the mod set "${selectedModSetName}"?`);
        });

        getEl('set-enable-all-btn').addEventListener('click', () => {
            const selectedSet = settings.modSets.find(s => s.name === selectedModSetName);
            if (selectedSet) {
                selectedSet.mods = allMods.map(m => m.folderName);
                saveSettings();
                renderModLists();
                renderModSets();
                renderModSetActions();
            }
        });
        getEl('set-disable-all-btn').addEventListener('click', () => {
           const selectedSet = settings.modSets.find(s => s.name === selectedModSetName);
           if (selectedSet) {
               selectedSet.mods = [];
               saveSettings();
               renderModLists();
               renderModSets();
               renderModSetActions();
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

    const filteredList = allMods.filter(mod => {
        const query = searchQuery.toLowerCase();
        return mod.name.toLowerCase().includes(query) ||
               mod.author.toLowerCase().includes(query) ||
               mod.description.toLowerCase().includes(query) ||
               mod.folderName.toLowerCase().includes(query);
    });

    // Determine which set of mods to use for display
    const selectedSetData = settings.modSets.find(s => s.name === selectedModSetName);
    const setModsForDisplay = selectedSetData ? new Set(selectedSetData.mods) : null;

    if (filteredList.length > 0) {
        filteredList.forEach(mod => {
            // In manual mode, use the actual mod.isEnabled state.
            // In set mode, check if the mod is in the selected set's list.
            const isDisplayedAsEnabled = (selectedModSetName === null)
                ? mod.isEnabled
                : setModsForDisplay.has(mod.folderName);
            listEl.appendChild(createModElement(mod, isDisplayedAsEnabled));
        });
    } else {
        listEl.innerHTML = `<p class="no-mods">No mods found.</p>`;
    }
    listEl.scrollTop = scrollPosition;
}

async function applyModList(modFolderNames, confirmationMessage) {
    const confirmed = await showConfirmationPrompt(
        'Apply Mod Configuration',
        `<p>${confirmationMessage}</p>`,
        'Apply',
        'Cancel'
    );
    if (!confirmed) return;

    const listEl = getEl('mod-list');
    const scrollPosition = listEl ? listEl.scrollTop : 0;
    
    isLoading = true;
    renderModLists();
    const result = await window.mods.applyModSet({ modSetFolderNames: modFolderNames });
    if (!result.success) {
        await showAlert('Error', `Error applying mods: ${result.error}`);
    }
    if (result.warnings && result.warnings.length > 0) {
        await showAlert('Warning', `<p>The mod set was applied, but with some issues:</p><ul style="text-align: left; margin-left: 20px;"><li>${result.warnings.join('</li><li>')}</li></ul>`);
    }
    await loadMods(scrollPosition);
    rendererEvents.emit('mods:changed');
}

async function loadMods(restoreScrollPos = null) {
    isLoading = true;
    renderModLists();
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

    if (restoreScrollPos !== null) {
        const listEl = getEl('mod-list');
        if (listEl) {
            listEl.scrollTop = restoreScrollPos;
        }
    }
}

function setupEventListeners() {
    const searchInput = getEl('mod-search-input');
    // On page load/re-init, ensure the input's value matches our state.
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
            const confirmed = await showConfirmationPrompt(
                'Overwrite Mod Set',
                `<p>A mod set named <strong>"${setName}"</strong> already exists. Overwrite it?</p>`,
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
    loadMods();
}

export function unmount() {
    // Clear search query when navigating away from the page
    // to prevent the filter from being applied on next visit.
    searchQuery = '';
}