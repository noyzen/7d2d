import { rendererEvents } from '../events.js';
import { settings, saveSettings } from '../state.js';
import { showPrompt } from '../ui.js';

let enabledMods = [];
let disabledMods = [];
let activeTab = 'enabled';
let searchQuery = '';
let isLoading = false;
let selectedModSetName = null; // null means "Manual Configuration"

function getEl(id) { return document.getElementById(id); }

function createModElement(mod, isEnabled) {
  const modEl = document.createElement('div');
  modEl.className = 'mod-card';
  if (!mod.isValid) modEl.classList.add('invalid');

  const selectedSet = settings.modSets.find(s => s.name === selectedModSetName);
  if (selectedSet && selectedSet.mods.includes(mod.folderName)) {
      modEl.classList.add('in-set');
  }

  const actionButtonHtml = isEnabled
    ? `<button class="mod-action-btn disable-btn" title="Disable Mod"><i class="fa-solid fa-circle-minus"></i><span>Disable</span></button>`
    : `<button class="mod-action-btn enable-btn" title="Enable Mod"><i class="fa-solid fa-circle-plus"></i><span>Enable</span></button>`;

  modEl.innerHTML = `
    <div class="mod-info" title="${mod.description}">
      <h3>
        ${!mod.isValid ? '<i class="fa-solid fa-triangle-exclamation" title="Invalid Mod"></i>' : ''}
        ${mod.name} 
        <span class="mod-version">${mod.version}</span>
      </h3>
      <p class="mod-author">by ${mod.author}</p>
      <p class="mod-desc">${mod.description}</p>
    </div>
    <div class="mod-actions">
      ${actionButtonHtml}
    </div>
  `;

  modEl.querySelector('.mod-action-btn').addEventListener('click', async () => {
    await window.mods.toggle({ folderName: mod.folderName, enable: !isEnabled });
    rendererEvents.emit('mods:changed');
    loadMods();
  });
  return modEl;
}

function renderModSets() {
    const listEl = getEl('mod-sets-list');
    if (!listEl) return;
    
    listEl.innerHTML = '';

    // "Manual Configuration" Card
    const manualCard = document.createElement('div');
    manualCard.className = 'mod-set-card';
    manualCard.dataset.setName = 'manual';
    if (selectedModSetName === null) manualCard.classList.add('active');
    manualCard.innerHTML = `
        <div class="mod-set-info">
            <span class="mod-set-name">Manual Configuration</span>
            <span class="mod-set-count">Directly enable/disable mods</span>
        </div>`;
    manualCard.addEventListener('click', () => {
        selectedModSetName = null;
        renderModSets();
        renderModSetActions();
        renderModLists();
    });
    listEl.appendChild(manualCard);

    // User-created Mod Sets
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
            selectedModSetName = set.name;
            renderModSets();
            renderModSetActions();
            renderModLists();
        });
        
        setCard.querySelector('.delete-set-btn').addEventListener('click', () => {
            if (!confirm(`Are you sure you want to delete the mod set "${set.name}"?`)) return;
            settings.modSets = settings.modSets.filter(s => s.name !== set.name);
            saveSettings();
            if (selectedModSetName === set.name) {
                selectedModSetName = null; // Revert to manual if active set is deleted
            }
            renderModSets();
            renderModSetActions();
        });

        listEl.appendChild(setCard);
    });
}

function isSetApplied() {
    if (selectedModSetName === null) return true; // Manual is always "applied"
    const selectedSet = settings.modSets.find(s => s.name === selectedModSetName);
    if (!selectedSet) return false;

    const enabledFolders = new Set(enabledMods.map(m => m.folderName));
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
            [...enabledMods, ...disabledMods].map(m => m.folderName),
            'Enable all mods? This will overwrite your current configuration.'
        ));
        getEl('disable-all-btn').addEventListener('click', () => applyModList(
            [],
            'Disable all mods?'
        ));
    } else {
        actionsEl.innerHTML = `<button id="apply-mod-set-btn" class="mod-set-action-btn apply"><i class="fa-solid fa-check"></i> Apply Set</button>`;
        const applyBtn = getEl('apply-mod-set-btn');
        if (isSetApplied()) {
            applyBtn.disabled = true;
            applyBtn.innerHTML = `<i class="fa-solid fa-check"></i> Set is Active`;
        }
        applyBtn.addEventListener('click', () => {
            const modSet = settings.modSets.find(s => s.name === selectedModSetName);
            if (!modSet) return;
            applyModList(modSet.mods, `Apply the mod set "${selectedModSetName}"?`);
        });
    }
}

function updateTabCounts() {
    const enabledCountEl = getEl('enabled-mods-count');
    const disabledCountEl = getEl('disabled-mods-count');
    if (enabledCountEl) enabledCountEl.textContent = enabledMods.length;
    if (disabledCountEl) disabledCountEl.textContent = disabledMods.length;
}

function renderModLists() {
    const listEl = getEl('mod-list');
    if (!listEl) return;
    
    listEl.innerHTML = '';
    
    const sourceList = activeTab === 'enabled' ? enabledMods : disabledMods;
    const filteredList = sourceList.filter(mod => {
        const query = searchQuery.toLowerCase();
        return mod.name.toLowerCase().includes(query) ||
               mod.author.toLowerCase().includes(query) ||
               mod.description.toLowerCase().includes(query);
    });

    if (isLoading) {
        listEl.innerHTML = '<div class="loading-spinner"></div>';
        return;
    }

    if (filteredList.length > 0) {
        filteredList.forEach(mod => listEl.appendChild(createModElement(mod, activeTab === 'enabled')));
    } else {
        listEl.innerHTML = `<p class="no-mods">No ${activeTab} mods found.</p>`;
    }
}

async function applyModList(modFolderNames, confirmationMessage) {
    if (!confirm(confirmationMessage)) return;
    
    isLoading = true;
    renderModLists();
    const result = await window.mods.applyModSet({ modSetFolderNames: modFolderNames });
    if (!result.success) {
        alert(`Error applying mods: ${result.error}`);
    }
    await loadMods();
    rendererEvents.emit('mods:changed');
}

async function loadMods() {
    isLoading = true;
    renderModLists(); // Show spinner
    try {
        const { enabled, disabled } = await window.mods.get();
        enabledMods = enabled;
        disabledMods = disabled;
    } catch (error) {
        console.error("Failed to load mods:", error);
        enabledMods = [];
        disabledMods = [];
        getEl('mod-list').innerHTML = '<p class="error-message">Could not load mods.</p>';
    }
    isLoading = false;
    updateTabCounts();
    renderModLists();
    renderModSetActions(); // Update apply button state
}

function setupEventListeners() {
    getEl('enabled-tab').addEventListener('click', () => {
        activeTab = 'enabled';
        getEl('enabled-tab').classList.add('active');
        getEl('disabled-tab').classList.remove('active');
        renderModLists();
    });
    getEl('disabled-tab').addEventListener('click', () => {
        activeTab = 'disabled';
        getEl('disabled-tab').classList.add('active');
        getEl('enabled-tab').classList.remove('active');
        renderModLists();
    });
    getEl('mod-search-input').addEventListener('input', (e) => {
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
            if (!confirm(`A mod set named "${setName}" already exists. Overwrite it?`)) {
                return;
            }
            settings.modSets.splice(existingSetIndex, 1);
        }
        
        const newSet = {
            name: setName,
            mods: enabledMods.map(m => m.folderName)
        };
        settings.modSets.push(newSet);
        settings.modSets.sort((a, b) => a.name.localeCompare(b.name));
        saveSettings();
        
        selectedModSetName = newSet.name;
        renderModSets();
        renderModSetActions();
    });
}

export function init() {
    setupEventListeners();
    renderModSets();
    renderModSetActions();
    loadMods();
}