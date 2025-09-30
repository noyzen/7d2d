import { rendererEvents } from '../events.js';
import { settings, saveSettings } from '../state.js';
import { showPrompt } from '../ui.js';

let enabledMods = [];
let disabledMods = [];
let activeTab = 'enabled';
let searchQuery = '';
let isLoading = false;

function getEl(id) { return document.getElementById(id); }

function createModElement(mod, isEnabled) {
  const modEl = document.createElement('div');
  modEl.className = 'mod-card';
  if (!mod.isValid) modEl.classList.add('invalid');
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
    <div class="mod-control">
      <label class="switch">
        <input type="checkbox" ${isEnabled ? 'checked' : ''} data-foldername="${mod.folderName}">
        <span class="slider"></span>
      </label>
    </div>
  `;
  modEl.querySelector('input[type="checkbox"]').addEventListener('change', async (e) => {
    await window.mods.toggle({ folderName: mod.folderName, enable: e.target.checked });
    rendererEvents.emit('mods:changed');
    loadMods();
  });
  return modEl;
}

function renderModSets() {
    const select = getEl('mod-set-select');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Select a Mod Set --</option>';
    (settings.modSets || []).forEach(set => {
        const option = document.createElement('option');
        option.value = set.name;
        option.textContent = set.name;
        select.appendChild(option);
    });
    select.value = currentVal;
    updateModSetButtons();
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

function updateModSetButtons() {
    const select = getEl('mod-set-select');
    const applyBtn = getEl('apply-mod-set-btn');
    const deleteBtn = getEl('delete-mod-set-btn');
    if (!select || !applyBtn || !deleteBtn) return;
    
    const hasSelection = !!select.value;
    applyBtn.disabled = !hasSelection || isLoading;
    deleteBtn.disabled = !hasSelection || isLoading;
}

async function loadMods() {
    isLoading = true;
    renderModLists();
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
    getEl('mod-set-select').addEventListener('change', updateModSetButtons);
    
    // Mod Set Buttons
    getEl('apply-mod-set-btn').addEventListener('click', async () => {
        const select = getEl('mod-set-select');
        const setName = select.value;
        if (!setName || !confirm(`Apply the mod set "${setName}"?\nThis will change your currently enabled mods.`)) return;

        const modSet = settings.modSets.find(s => s.name === setName);
        if (!modSet) return;
        
        isLoading = true;
        renderModLists();
        const result = await window.mods.applyModSet({ modSetFolderNames: modSet.mods });
        if (!result.success) {
            alert(`Error applying mod set: ${result.error}`);
        }
        await loadMods();
        rendererEvents.emit('mods:changed');
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
        renderModSets();
        getEl('mod-set-select').value = newSet.name;
        updateModSetButtons();
    });

    getEl('delete-mod-set-btn').addEventListener('click', () => {
        const select = getEl('mod-set-select');
        const setName = select.value;
        if (!setName || !confirm(`Are you sure you want to delete the mod set "${setName}"?`)) return;

        settings.modSets = settings.modSets.filter(s => s.name !== setName);
        saveSettings();
        renderModSets();
    });
}

export function init() {
    setupEventListeners();
    renderModSets();
    loadMods();
}