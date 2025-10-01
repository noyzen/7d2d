const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const { MODS_PATH } = require('../constants');

// Define path for migration purposes only. The new system does not use this folder.
const CWD = path.dirname(MODS_PATH);
const DISABLED_MODS_PATH = path.join(CWD, 'DisabledMods');

// --- HELPERS ---

let migrationHasRun = false;

async function copyDirectoryRecursive(source, destination) {
  await fs.promises.mkdir(destination, { recursive: true });
  const entries = await fs.promises.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryRecursive(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

/**
 * One-time migration to move mods from the old 'DisabledMods' folder
 * to the new single 'Mods' folder structure.
 */
async function migrateDisabledMods() {
    if (!fs.existsSync(DISABLED_MODS_PATH)) {
        return; // No migration needed
    }
    console.log('Found DisabledMods folder. Migrating to new mod management system...');
    if (!fs.existsSync(MODS_PATH)) {
        await fs.promises.mkdir(MODS_PATH, { recursive: true });
    }

    const disabledMods = fs.readdirSync(DISABLED_MODS_PATH, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory());
    
    for (const modDir of disabledMods) {
        const sourcePath = path.join(DISABLED_MODS_PATH, modDir.name);
        const destPath = path.join(MODS_PATH, modDir.name);
        
        try {
            await fs.promises.rename(sourcePath, destPath);
        } catch (e) {
            console.warn(`Failed to rename ${modDir.name} during migration, falling back to copy...`, e);
            try {
                await copyDirectoryRecursive(sourcePath, destPath);
                await fs.promises.rm(sourcePath, { recursive: true, force: true });
            } catch (copyErr) {
                console.error(`FATAL: Could not migrate mod ${modDir.name}. Please move it manually from DisabledMods to Mods.`, copyErr);
                continue; // Skip this mod
            }
        }
        
        const modInfoPath = path.join(destPath, 'ModInfo.xml');
        if (fs.existsSync(modInfoPath)) {
            try {
                await fs.promises.rename(modInfoPath, path.join(destPath, 'ModInfo.xml.disabled'));
            } catch (renameErr) {
                 console.error(`Could not disable migrated mod ${modDir.name} by renaming ModInfo.xml. Please check it manually.`, renameErr);
            }
        }
    }

    try {
        await fs.promises.rm(DISABLED_MODS_PATH, { recursive: true, force: true });
        console.log('Migration complete. Removed DisabledMods folder.');
    } catch (e) {
        console.warn('Could not remove DisabledMods folder after migration. You can remove it manually.', e);
    }
}

async function runMigrationOnce() {
    if (!migrationHasRun) {
        await migrateDisabledMods();
        migrationHasRun = true;
    }
}

/**
 * Reads all mod folders from the single 'Mods' directory and determines
 * their state (enabled/disabled) by checking for 'ModInfo.xml' vs 'ModInfo.xml.disabled'.
 */
const readAllMods = () => {
    if (!fs.existsSync(MODS_PATH)) return [];
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "",
        parseAttributeValue: true,
        trimValues: true,
    });

    return fs.readdirSync(MODS_PATH, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => {
            const modPath = path.join(MODS_PATH, dirent.name);
            const enabledXmlPath = path.join(modPath, 'ModInfo.xml');
            const disabledXmlPath = path.join(modPath, 'ModInfo.xml.disabled');
            
            const isEnabled = fs.existsSync(enabledXmlPath);
            const xmlPath = isEnabled ? enabledXmlPath : (fs.existsSync(disabledXmlPath) ? disabledXmlPath : null);

            let modDate = null;
            try {
                if (xmlPath) {
                    modDate = fs.statSync(xmlPath).mtime.toISOString();
                } else {
                    modDate = fs.statSync(modPath).mtime.toISOString();
                }
            } catch (e) {
                console.warn(`Could not get date for mod ${dirent.name}:`, e);
                modDate = new Date(0).toISOString(); // Fallback date
            }

            const baseModInfo = {
                folderName: dirent.name,
                name: dirent.name,
                description: 'No description.',
                author: 'Unknown author.',
                version: 'N/A',
                isValid: false,
                isEnabled: isEnabled,
                date: modDate
            };

            if (xmlPath) {
                try {
                    const xmlContent = fs.readFileSync(xmlPath, 'utf8');
                    const parsedData = parser.parse(xmlContent);
                    const modInfo = parsedData.xml || parsedData.ModInfo;

                    if (!modInfo) {
                        baseModInfo.description = 'ERROR: Could not find a valid root tag (<xml> or <ModInfo>).';
                        return baseModInfo;
                    }

                    return {
                        folderName: dirent.name,
                        name: modInfo.DisplayName?.value || modInfo.Name?.value || dirent.name,
                        description: modInfo.Description?.value || 'No description.',
                        author: modInfo.Author?.value || 'Unknown author.',
                        version: modInfo.Version?.value || 'N/A',
                        isValid: true,
                        isEnabled: isEnabled,
                        date: modDate,
                    };
                } catch (e) {
                    console.error(`Error parsing ${xmlPath}:`, e);
                    baseModInfo.description = `ERROR: Could not parse ${path.basename(xmlPath)}. Details: ${e.message}`;
                    return baseModInfo;
                }
            } else {
                baseModInfo.description = 'ERROR: ModInfo.xml or ModInfo.xml.disabled not found.';
                return baseModInfo;
            }
        })
        .filter(Boolean);
};

/**
 * Renames a file with a retry mechanism to handle transient file locks.
 */
async function robustRename(oldPath, newPath, retries = 5, delay = 100) {
    for (let i = 0; i < retries; i++) {
        try {
            await fs.promises.rename(oldPath, newPath);
            return; // Success
        } catch (e) {
            if (e.code !== 'EPERM' && e.code !== 'EBUSY') {
                throw e; // Not a retryable error
            }
            if (i === retries - 1) {
                throw e; // Last attempt failed, throw error
            }
            await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        }
    }
}

// --- IPC HANDLERS ---

function handleGetMods() {
  ipcMain.handle('mods:get', async () => {
    await runMigrationOnce();
    const allMods = readAllMods();
    return {
      enabled: allMods.filter(m => m.isEnabled),
      disabled: allMods.filter(m => !m.isEnabled),
    };
  });
}

function handleToggleMod() {
  ipcMain.handle('mods:toggle', async (_, { folderName, enable }) => {
    await runMigrationOnce();
    try {
      const modPath = path.join(MODS_PATH, folderName);
      if (!fs.existsSync(modPath)) throw new Error(`Mod folder '${folderName}' not found.`);
      
      const enabledPath = path.join(modPath, 'ModInfo.xml');
      const disabledPath = path.join(modPath, 'ModInfo.xml.disabled');

      if (enable) {
        if (!fs.existsSync(disabledPath)) {
            if (fs.existsSync(enabledPath)) return { success: true }; // Already enabled
            throw new Error(`Cannot enable mod '${folderName}': ModInfo.xml.disabled not found.`);
        }
        await robustRename(disabledPath, enabledPath);
      } else {
        if (!fs.existsSync(enabledPath)) {
            if (fs.existsSync(disabledPath)) return { success: true }; // Already disabled
            throw new Error(`Cannot disable mod '${folderName}': ModInfo.xml not found.`);
        }
        await robustRename(enabledPath, disabledPath);
      }

      return { success: true };

    } catch (e) {
      console.error('Failed to toggle mod:', e);
      return { success: false, error: e.message };
    }
  });
}

function handleApplyModSet() {
    ipcMain.handle('mods:apply-mod-set', async (_, { modSetFolderNames }) => {
        await runMigrationOnce();
        const warnings = [];
        try {
            if (!fs.existsSync(MODS_PATH)) await fs.promises.mkdir(MODS_PATH, { recursive: true });
            
            const set = new Set(modSetFolderNames);
            const allModDirs = fs.readdirSync(MODS_PATH, { withFileTypes: true }).filter(d => d.isDirectory());
            
            for (const mod of allModDirs) {
                const shouldBeEnabled = set.has(mod.name);
                const modPath = path.join(MODS_PATH, mod.name);
                const enabledPath = path.join(modPath, 'ModInfo.xml');
                const disabledPath = path.join(modPath, 'ModInfo.xml.disabled');

                try {
                    if (shouldBeEnabled) {
                        if (fs.existsSync(disabledPath)) {
                            await robustRename(disabledPath, enabledPath);
                        }
                    } else {
                        if (fs.existsSync(enabledPath)) {
                            await robustRename(enabledPath, disabledPath);
                        }
                    }
                } catch (e) {
                    warnings.push(`Failed to change state for mod '${mod.name}': ${e.message}`);
                }
            }
            
            return { success: true, warnings: warnings.length > 0 ? warnings : undefined };
        } catch (e) {
            console.error('Failed to apply mod set:', e);
            return { success: false, error: e.message, warnings: warnings.length > 0 ? warnings : undefined };
        }
    });
}

exports.init = () => {
  handleGetMods();
  handleToggleMod();
  handleApplyModSet();
};
