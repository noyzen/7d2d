const { ipcMain, shell, app } = require('electron');
const path = require('path');
const fs = require('fs');
const { CWD, SETTINGS_PATH } = require('../constants');

function getShortcutPath() {
    if (process.platform !== 'win32') return null;
    const productName = app.name;
    return path.join(app.getPath('desktop'), `${productName}.lnk`);
}

function getShortcutOptions() {
    const packageJson = require(path.join(app.getAppPath(), 'package.json'));
    const appId = 'com.noyzen.7d2dlauncher';
    const exeName = path.basename(app.getPath('exe'));
    const targetPath = path.join(CWD, exeName);

    return {
        target: targetPath,
        cwd: CWD,
        description: packageJson.description,
        icon: targetPath,
        iconIndex: 0,
        appUserModelId: appId
    };
}

function handleExists() {
    ipcMain.handle('shortcut:exists', () => {
        if (process.platform !== 'win32') return false;
        const shortcutPath = getShortcutPath();
        return fs.existsSync(shortcutPath);
    });
}

function handleCreate() {
    ipcMain.handle('shortcut:create', () => {
        if (process.platform !== 'win32') {
            return { success: false, error: 'Shortcuts are only supported on Windows.' };
        }
        try {
            const shortcutPath = getShortcutPath();
            const shortcutOptions = getShortcutOptions();
            const operation = fs.existsSync(shortcutPath) ? 'update' : 'create';
            const success = shell.writeShortcutLink(shortcutPath, operation, shortcutOptions);

            if (success) {
                return { success: true, message: `Shortcut successfully ${operation}d.` };
            } else {
                return { success: false, error: `shell.writeShortcutLink returned false for operation '${operation}'. This may be due to security software.` };
            }
        } catch (e) {
            console.error('Failed to create/update shortcut:', e);
            return { success: false, error: e.message };
        }
    });
}

function handleDelete() {
    ipcMain.handle('shortcut:delete', () => {
        if (process.platform !== 'win32') {
            return { success: false, error: 'Shortcuts are only supported on Windows.' };
        }
        try {
            const shortcutPath = getShortcutPath();
            if (fs.existsSync(shortcutPath)) {
                fs.unlinkSync(shortcutPath);
                return { success: true, message: 'Shortcut successfully deleted.' };
            }
            return { success: true, message: 'Shortcut did not exist.' };
        } catch (e) {
            console.error('Failed to delete shortcut:', e);
            return { success: false, error: e.message };
        }
    });
}

exports.init = () => {
    handleExists();
    handleCreate();
    handleDelete();
};

exports.createOrUpdateShortcutOnStartup = () => {
    if (process.platform !== 'win32' || !app.isPackaged) return;

    let settings = {};
    if (fs.existsSync(SETTINGS_PATH)) {
        try {
            settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
        } catch (e) {
            console.warn("Could not load settings for shortcut creation on startup.", e);
        }
    }

    if (settings.createDesktopShortcut === false) {
        console.log('Automatic desktop shortcut creation is disabled in settings.');
        return;
    }

    try {
        const shortcutPath = getShortcutPath();
        const shortcutOptions = getShortcutOptions();
        let operation = 'create';
        let needsAction = false;

        if (fs.existsSync(shortcutPath)) {
            operation = 'update';
            try {
                const existingShortcut = shell.readShortcutLink(shortcutPath);
                if (existingShortcut.target !== shortcutOptions.target ||
                    existingShortcut.appUserModelId !== shortcutOptions.appUserModelId ||
                    existingShortcut.cwd?.toLowerCase() !== shortcutOptions.cwd.toLowerCase() ||
                    existingShortcut.description !== shortcutOptions.description ||
                    existingShortcut.icon !== shortcutOptions.icon) {
                    needsAction = true;
                }
            } catch (e) {
                console.warn('Could not read existing shortcut, will attempt to replace.', e);
                operation = 'replace';
                needsAction = true;
            }
        } else {
            needsAction = true;
        }

        if (needsAction) {
            const success = shell.writeShortcutLink(shortcutPath, operation, shortcutOptions);
            if (success) {
                console.log(`Desktop shortcut automatically ${operation}d on startup.`);
            }
        }
    } catch (e) {
        console.error('A critical error occurred during the automatic shortcut creation process:', e);
    }
};
