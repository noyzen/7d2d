import { rendererEvents } from '../events.js';
import { settings, saveSettings } from '../state.js';
import { showPrompt } from '../ui.js';

let allMods = [];
let searchQuery = '';
let isLoading = false;
let selectedModSetName = null; // null means "Manual Configuration"

function getEl(id) { return document.getElementById(id); }

function renderModCounts(enabledCount, disabledCount) {
    const countsEl = getEl('mod-counts');
    if (!countsEl) return;
    countsEl.innerHTML = `
        <div class="mod-count-item enabled" title="Enabled Mods">
            <i class="fa-solid fa-circle-check"></i> <span class="count">${enabledCount}</span>
        </div>
        <div class="mod-count-item disabled" title="Disabled Mods">
            <i class="fa-solid fa-power-off"></i> <span class="count">${disabledCount}</span>
        </div>
    `;
}

function createModElement(mod) {
  const modEl = document.createElement('div');
  modEl.className = 'mod-card';
  if (!mod.isValid) modEl.classList.add('invalid');
  modEl.classList.toggle('enabled', mod.isEnabled);

  const selectedSet = settings.modSets.find(s => s.name === selectedModSetName);
  if (selectedSet && selectedSet.mods.includes(mod.folderName)) {
      modEl.classList.add('in-set');
  }

  modEl.innerHTML = `
    <div class="mod-info" title="${mod.description}">
      <h3 class="mod-title">
        ${!mod.isValid ? '<i class="fa-solid fa-triangle-exclamation" title="Invalid Mod"></i>' : ''}
        ${mod.name}
      </h3>
      <div class="mod-meta">
        <p class="mod-author">by ${mod.author}</p>
        <span class="mod-version">${mod.version}</span>
      </div>
      <p class="mod-desc">${mod.description}</p>
    </div>
    <div class="mod-status-icon">
        <i class="fa-solid fa-circle-check"></i>
    </div>
  `;

  modEl.addEventListener('click', async () => {
    if (modEl.classList.contains('processing')) return;
    modEl.classList.add('processing');

    const desiredState = !mod.isEnabled;
    const result = await window.mods.toggle({ folderName: mod.folderName, enable: desiredState });

    if (result.success) {
      // Update local state without full reload
      mod.isEnabled = desiredState;
      modEl.classList.toggle('enabled', desiredState);
      
      // Recalculate counts and update UI components that depend on mod state
      const enabledCount = allMods.filter(m => m.isEnabled).length;
      const disabledCount = allMods.length - enabledCount;
      renderModCounts(enabledCount, disabledCount);
      renderModSetActions(); // Update "Apply Set" button state
      
      rendererEvents.emit('mods:changed');
    } else {
      alert(`Error toggling mod: ${result.error}`);
    }
    
    modEl.classList.remove('processing');
  });

  return modEl;
}

function renderModSets() {
    const listEl = getEl('mod-sets-list');
    if (!listEl) return;
    
    listEl.innerHTML = '';

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
                selectedModSetName = null;
            }
            renderModSets();
            renderModSetActions();
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

    if (filteredList.length > 0) {
        filteredList.forEach(mod => listEl.appendChild(createModElement(mod)));
    } else {
        listEl.innerHTML = `<p class="no-mods">No mods found.</p>`;
    }
    listEl.scrollTop = scrollPosition;
}

async function applyModList(modFolderNames, confirmationMessage) {
    if (!confirm(confirmationMessage)) return;
    
    isLoading = true;
    renderModLists();
    const result = await window.mods.applyModSet({ modSetFolderNames: modFolderNames });
    if (!result.success) {
        alert(`Error applying mods: ${result.error}`);
    }
    if (result.warnings) {
        alert(`The mod set was applied, but with some issues:\n- ${result.warnings.join('\n- ')}`);
    }
    await loadMods();
    rendererEvents.emit('mods:changed');
}

async function loadMods() {
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
}

function setupEventListeners() {
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
            mods: allMods.filter(m => m.isEnabled).map(m => m.folderName)
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
    loadMods();
}