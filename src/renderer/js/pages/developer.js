import { settings, saveSettings, LAUNCH_PARAMETERS_CONFIG } from '../state.js';

// --- HELPERS ---
function getPlayerNameWrapper() { return document.getElementById('player-name-wrapper'); }

function updatePlayerNameVisibility() {
    const wrapper = getPlayerNameWrapper();
    if (!wrapper) return;
    const hasConfigRules = settings.configEditorRules && settings.configEditorRules.length > 0;
    const hasRegistryRules = settings.registryEditorRules && settings.registryEditorRules.length > 0;
    wrapper.style.display = (hasConfigRules || hasRegistryRules) ? 'flex' : 'none';
}

// --- CONFIG EDITOR ---
function createConfigRuleElement(rule) {
    const ruleEl = document.createElement('div');
    ruleEl.className = 'config-rule-card';
    ruleEl.dataset.id = rule.id;
    ruleEl.innerHTML = `
        <div class="config-rule-header"><h3>Rule #${String(rule.id).slice(-4)}</h3><button class="remove-rule-btn" title="Remove Rule"><i class="fa-solid fa-trash-can"></i></button></div>
        <div class="config-rule-body">
            <div class="config-field"><label>File Path</label><div class="config-field-row"><input type="text" data-key="filePath" value="${rule.filePath || ''}" placeholder="Select a file..." readonly><button class="browse-btn">Browse</button></div></div>
            <div class="config-field"><label>Line Number</label><input type="number" data-key="lineNumber" value="${rule.lineNumber || ''}" min="1" placeholder="e.g., 5"></div>
            <div class="config-field"><label>Line Content Match (optional)</label><input type="text" data-key="lineMatch" value="${rule.lineMatch || ''}" placeholder="e.g., UserName="></div>
            <div class="config-field"><label>New Line Content (use !#7d2d#!)</label><input type="text" data-key="lineTemplate" value="${rule.lineTemplate || ''}" placeholder="e.g., UserName=!#7d2d#!"></div>
        </div>`;
    
    const updateRule = () => {
        const ruleIndex = settings.configEditorRules.findIndex(r => r.id === rule.id);
        if (ruleIndex > -1) {
            settings.configEditorRules[ruleIndex].filePath = ruleEl.querySelector('[data-key="filePath"]').value;
            settings.configEditorRules[ruleIndex].lineNumber = parseInt(ruleEl.querySelector('[data-key="lineNumber"]').value, 10) || null;
            settings.configEditorRules[ruleIndex].lineMatch = ruleEl.querySelector('[data-key="lineMatch"]').value;
            settings.configEditorRules[ruleIndex].lineTemplate = ruleEl.querySelector('[data-key="lineTemplate"]').value;
            saveSettings();
        }
    };
    
    ruleEl.querySelector('.browse-btn').addEventListener('click', async () => {
        const result = await window.launcher.selectFile();
        if (result.success) {
            ruleEl.querySelector('[data-key="filePath"]').value = result.filePath;
            updateRule();
        }
    });
    ruleEl.querySelector('.remove-rule-btn').addEventListener('click', () => {
        settings.configEditorRules = settings.configEditorRules.filter(r => r.id !== rule.id);
        saveSettings();
        renderConfigEditorRules();
        updatePlayerNameVisibility();
    });
    ruleEl.querySelectorAll('input').forEach(input => input.addEventListener('change', updateRule));
    return ruleEl;
}

function renderConfigEditorRules() {
    const list = document.getElementById('config-rules-list');
    list.innerHTML = '';
    if (settings.configEditorRules?.length > 0) {
        settings.configEditorRules.forEach(rule => list.appendChild(createConfigRuleElement(rule)));
    } else {
        list.innerHTML = '<p class="no-mods">No configuration rules added yet.</p>';
    }
}

// --- REGISTRY EDITOR ---
function createRegistryRuleElement(rule) {
    const ruleEl = document.createElement('div');
    ruleEl.className = 'registry-rule-card';
    ruleEl.dataset.id = rule.id;
    ruleEl.innerHTML = `
        <div class="registry-rule-header"><h3>Registry Rule #${String(rule.id).slice(-4)}</h3><button class="remove-rule-btn" title="Remove Rule"><i class="fa-solid fa-trash-can"></i></button></div>
        <div class="registry-rule-body">
            <div class="config-field"><label>Registry Path</label><input type="text" data-key="regPath" value="${rule.regPath || ''}" placeholder="e.g., HKEY_CURRENT_USER\\Software\\MyGame"></div>
            <div class="config-field"><label>Key Name</label><input type="text" data-key="keyName" value="${rule.keyName || ''}" placeholder="e.g., PlayerName_h12345"></div>
            <div class="config-field"><label>Key Value Template (use !#7d2d#!)</label><input type="text" data-key="keyValueTemplate" value="${rule.keyValueTemplate || ''}" placeholder="e.g., !#7d2d#!"></div>
        </div>`;
    
    const updateRule = () => {
        const ruleIndex = settings.registryEditorRules.findIndex(r => r.id === rule.id);
        if (ruleIndex > -1) {
            settings.registryEditorRules[ruleIndex].regPath = ruleEl.querySelector('[data-key="regPath"]').value;
            settings.registryEditorRules[ruleIndex].keyName = ruleEl.querySelector('[data-key="keyName"]').value;
            settings.registryEditorRules[ruleIndex].keyValueTemplate = ruleEl.querySelector('[data-key="keyValueTemplate"]').value;
            saveSettings();
        }
    };
    ruleEl.querySelector('.remove-rule-btn').addEventListener('click', () => {
        settings.registryEditorRules = settings.registryEditorRules.filter(r => r.id !== rule.id);
        saveSettings();
        renderRegistryRules();
        updatePlayerNameVisibility();
    });
    ruleEl.querySelectorAll('input').forEach(input => input.addEventListener('change', updateRule));
    return ruleEl;
}

function renderRegistryRules() {
    if (window.appInfo.platform !== 'win32') return;
    const list = document.getElementById('registry-rules-list');
    list.innerHTML = '';
    if (settings.registryEditorRules?.length > 0) {
        settings.registryEditorRules.forEach(rule => list.appendChild(createRegistryRuleElement(rule)));
    } else {
        list.innerHTML = '<p class="no-mods">No registry rules added yet.</p>';
    }
}

// --- ABOUT PAGE EDITOR ---
function renderAboutPageEditor() {
    const aboutData = settings.aboutPage;
    document.getElementById('about-editor-title').value = aboutData.title;
    document.getElementById('about-editor-creator').value = aboutData.creator;
    document.getElementById('about-editor-website').value = aboutData.website;
    document.getElementById('about-editor-description').value = aboutData.description;
}

// --- LAUNCH PARAMETERS ---
function renderLaunchParameters() {
    const container = document.getElementById('launch-params-container');
    container.innerHTML = '';
    const sortedKeys = Object.keys(LAUNCH_PARAMETERS_CONFIG).sort((a, b) => a.localeCompare(b));

    for (const key of sortedKeys) {
        const config = LAUNCH_PARAMETERS_CONFIG[key];
        const value = settings.launchParameters[key];
        const paramEl = document.createElement('div');
        paramEl.className = 'param-item';

        let controlHtml = '';
        if (['bool', 'object', 'flag'].includes(config.type)) {
            controlHtml = `<label class="switch"><input type="checkbox" data-key="${key}" ${value === true ? 'checked' : ''}><span class="slider"></span></label>`;
        } else {
            controlHtml = `<input type="text" data-key="${key}" value="${value || ''}">`;
        }
        paramEl.innerHTML = `<div class="param-label"><h3>${key}</h3><p>${config.description}</p></div><div class="param-control">${controlHtml}</div>`;
        
        paramEl.querySelector('[data-key]').addEventListener('change', (e) => {
            settings.launchParameters[e.target.dataset.key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
            saveSettings();
        });
        container.appendChild(paramEl);
    }
}

function setupEventListeners() {
    document.getElementById('add-config-rule-btn').addEventListener('click', () => {
        settings.configEditorRules.push({ id: Date.now(), filePath: '', lineNumber: null, lineTemplate: '', lineMatch: '' });
        saveSettings();
        renderConfigEditorRules();
        updatePlayerNameVisibility();
    });
    document.getElementById('add-registry-rule-btn')?.addEventListener('click', () => {
        settings.registryEditorRules.push({ id: Date.now(), regPath: '', keyName: '', keyValueTemplate: '' });
        saveSettings();
        renderRegistryRules();
        updatePlayerNameVisibility();
    });
    document.getElementById('about-page-editor').addEventListener('input', (e) => {
        settings.aboutPage[e.target.id.replace('about-editor-', '')] = e.target.value;
        saveSettings();
    });
}

export function init() {
    renderConfigEditorRules();
    renderRegistryRules();
    renderAboutPageEditor();
    renderLaunchParameters();
    setupEventListeners();
}
