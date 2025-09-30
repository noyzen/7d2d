const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const { MODS_PATH, DISABLED_MODS_PATH } = require('../constants');

// --- HELPERS ---

const readModsFromDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) return [];
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: true,
    trimValues: true,
  });

  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => {
      const xmlPath = path.join(dirPath, dirent.name, 'ModInfo.xml');
      const baseModInfo = {
        folderName: dirent.name,
        name: dirent.name,
        description: 'No description.',
        author: 'Unknown author.',
        version: 'N/A',
        isValid: false
      };

      if (fs.existsSync(xmlPath)) {
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
          };
        } catch (e) {
          console.error(`Error parsing ${xmlPath}:`, e);
          baseModInfo.description = `ERROR: Could not parse ModInfo.xml. Details: ${e.message}`;
          return baseModInfo;
        }
      } else {
        baseModInfo.description = 'ERROR: ModInfo.xml not found in this folder.';
        return baseModInfo;
      }
    })
    .filter(Boolean);
};

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
 * Safely moves a directory by copying it, then deleting the source.
 * This is more robust against interruptions than a simple rename.
 * It will not throw an error if only the source deletion fails, returning a warning instead.
 * @param {string} source - The full path to the source directory.
 * @param {string} dest - The full path to the destination directory.
 * @param {string} modName - The name of the mod folder for error messages.
 * @returns {Promise<{success: boolean, error?: string, warning?: string}>}
 */
async function safeMove(source, dest, modName) {
    if (!fs.existsSync(source)) {
        return { success: false, error: `Mod to move '${modName}' was not found in the source directory.` };
    }
    if (fs.existsSync(dest)) {
        return { success: false, error: `Cannot move mod '${modName}', a folder with the same name already exists in the destination.` };
    }

    try {
        await copyDirectoryRecursive(source, dest);
    } catch (copyError) {
        console.error(`Copy operation failed for '${modName}':`, copyError);
        if (fs.existsSync(dest)) {
            await fs.promises.rm(dest, { recursive: true, force: true }).catch(cleanupError => {
                console.error(`Failed to cleanup destination directory '${dest}' after copy error:`, cleanupError);
            });
        }
        return { success: false, error: `Failed to copy mod '${modName}': ${copyError.message}` };
    }

    try {
        await fs.promises.rm(source, { recursive: true, force: true });
    } catch (deleteError) {
        console.error(`Failed to delete source directory '${source}' for mod '${modName}' after successful copy:`, deleteError);
        return { 
            success: true, 
            warning: `Mod '${modName}' was moved successfully, but the original folder could not be deleted. You may need to remove it manually. Reason: ${deleteError.message}` 
        };
    }

    return { success: true };
}

// --- IPC HANDLERS ---

function handleGetMods() {
  ipcMain.handle('mods:get', () => {
    return {
      enabled: readModsFromDir(MODS_PATH),
      disabled: readModsFromDir(DISABLED_MODS_PATH),
    };
  });
}

function handleToggleMod() {
  ipcMain.handle('mods:toggle', async (_, { folderName, enable }) => {
    try {
      if (!fs.existsSync(MODS_PATH)) await fs.promises.mkdir(MODS_PATH, { recursive: true });
      if (!fs.existsSync(DISABLED_MODS_PATH)) await fs.promises.mkdir(DISABLED_MODS_PATH, { recursive: true });
      
      const sourcePath = path.join(enable ? DISABLED_MODS_PATH : MODS_PATH, folderName);
      const destPath = path.join(enable ? MODS_PATH : DISABLED_MODS_PATH, folderName);

      const result = await safeMove(sourcePath, destPath, folderName);

      if (!result.success) {
          return { success: false, error: result.error };
      }
      if (result.warning) {
          console.warn(result.warning);
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
        const warnings = [];
        try {
            if (!fs.existsSync(DISABLED_MODS_PATH)) await fs.promises.mkdir(DISABLED_MODS_PATH, { recursive: true });
            if (!fs.existsSync(MODS_PATH)) await fs.promises.mkdir(MODS_PATH, { recursive: true });
            
            const set = new Set(modSetFolderNames);
            const enabledDirs = fs.readdirSync(MODS_PATH, { withFileTypes: true }).filter(d => d.isDirectory());
            const disabledDirs = fs.readdirSync(DISABLED_MODS_PATH, { withFileTypes: true }).filter(d => d.isDirectory());
            
            for (const mod of enabledDirs) {
                if (!set.has(mod.name)) {
                    const sourcePath = path.join(MODS_PATH, mod.name);
                    const destPath = path.join(DISABLED_MODS_PATH, mod.name);
                    const result = await safeMove(sourcePath, destPath, mod.name);
                    if (!result.success) throw new Error(result.error);
                    if (result.warning) warnings.push(result.warning);
                }
            }

            for (const mod of disabledDirs) {
                if (set.has(mod.name)) {
                    const sourcePath = path.join(DISABLED_MODS_PATH, mod.name);
                    const destPath = path.join(MODS_PATH, mod.name);
                    const result = await safeMove(sourcePath, destPath, mod.name);
                    if (!result.success) throw new Error(result.error);
                    if (result.warning) warnings.push(result.warning);
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