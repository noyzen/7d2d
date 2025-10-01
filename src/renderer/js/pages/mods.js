import { rendererEvents } from '../events.js';
import { settings, saveSettings } from '../state.js';
import { showPrompt, showConfirmationPrompt, showAlert, sanitizeText } from '../ui.js';

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
    window.addEventListener('click', (e) => {
        if (!menu.contains(e.target)) {
            menu.classList.add('hidden');
            contextMenuTargetMod = null;
        }
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
    const btnRect = e.currentTarget.getBoundingClientRect();
    menu.style.top = `${btnRect.bottom + 5}px`;
    menu.style.left = `${btnRect.right - menu.offsetWidth}px`;
    menu.classList.remove('hidden');

    // Prevent menu from going off-screen
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.bottom > window.innerHeight) {
        menu.style.top = `${btnRect.top - menuRect.height - 5}px`;
    }
    if (menuRect.left < 0) {
        menu.style.left = `${btnRect.left}px`;
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
  modEl.dataset.folderName = mod.folderName;
  if (!mod.isValid) modEl.classList.add('invalid');
  modEl.classList.toggle('enabled', isDisplayedAsEnabled);

  // Sanitize all data from ModInfo.xml
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
        <button class="mod-options-btn" title="Mod Options"><i class="fa-solid fa-ellipsis-vertical"></i></button>
        <h3 class="mod-title">
            ${!mod.isValid ? '<i class="fa-solid fa-triangle-exclamation" title="Invalid Mod"></i>' : ''}
            <span>${safeName}</span>
            <span class="mod-label-icon-container">${labelIconHtml}</span>
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

  // Use a timeout to allow the DOM to render before checking element dimensions
  setTimeout(() => {
    if (modDesc.scrollHeight > modDesc.clientHeight) {
      const readMoreBtn = document.createElement('button');
      readMoreBtn.className = 'mod-read-more';
      readMoreBtn.innerHTML = 'Read More <i class="fa-solid fa-angle-right"></i>';
      readMoreBtn.title = 'View full description';
      modInfo.appendChild(readMoreBtn);
      
      readMoreBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent toggling the mod
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
    } else { // Mod Set Edit & Apply Mode
        const selectedSet = settings.modSets.find(s => s.name === selectedModSetName);
        if (!selectedSet) return;
        
        const modInSet = selectedSet.mods.includes(mod.folderName);
        const originalMods = [...selectedSet.mods]; // Backup for revert on failure

        if (modInSet) {
            selectedSet.mods = selectedSet.mods.filter(m => m !== mod.folderName);
        } else {
            selectedSet.mods.push(mod.folderName);
        }
        
        saveSettings();
        
        modEl.classList.add('processing');
        const result = await window.mods.applyModSet({ modSetFolderNames: selectedSet.mods });
        
        const scrollPos = getEl('mod-list')?.scrollTop;

        if (result.success) {
            await loadMods(scrollPos);
        } else {
            await showAlert('Error', `Could not apply change: ${result.error}`);
            // Revert the change in memory
            selectedSet.mods = originalMods;
            saveSettings();
            // Reload UI to show reverted state
            await loadMods(scrollPos);
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
            <p style="font-size: 0.9rem; color: var(--fg-med); text-align: center; margin: 0 0 10px;">Editing "<strong style="color: var(--primary);">${sanitizeText(selectedModSetName)}</strong>". Changes are applied automatically.</p>
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
    loadMods();
}

export function unmount() {
    // Clear search query when navigating away from the page
    // to prevent the filter from being applied on next visit.
    searchQuery = '';
}
