function createModElement(mod, isEnabled) {
  const modEl = document.createElement('div');
  modEl.className = 'mod-card';
  modEl.innerHTML = `
    <div class="mod-info">
      <h3>${mod.name} <span class="mod-version">${mod.version}</span></h3>
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
    loadMods();
    // Update home page stats in the background
    const { enabled } = await window.mods.get();
    const activeModsCount = document.getElementById('active-mods-count');
    if (activeModsCount) activeModsCount.textContent = enabled.length;
  });
  return modEl;
}

async function loadMods() {
    const enabledModsList = document.getElementById('enabled-mods-list');
    const disabledModsList = document.getElementById('disabled-mods-list');
    enabledModsList.innerHTML = '<div class="loading-spinner"></div>';
    disabledModsList.innerHTML = '<div class="loading-spinner"></div>';

    const { enabled, disabled } = await window.mods.get();
    
    enabledModsList.innerHTML = '';
    disabledModsList.innerHTML = '';

    if (enabled.length > 0) {
      enabled.forEach(mod => enabledModsList.appendChild(createModElement(mod, true)));
    } else {
      enabledModsList.innerHTML = '<p class="no-mods">No enabled mods found.</p>';
    }

    if (disabled.length > 0) {
      disabled.forEach(mod => disabledModsList.appendChild(createModElement(mod, false)));
    } else {
      disabledModsList.innerHTML = '<p class="no-mods">No disabled mods found.</p>';
    }
}

export function init() {
    loadMods();
}
