const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const { MODS_PATH, DISABLED_MODS_PATH } = require('../constants');

// --- HELPERS ---

const readModsFromDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) return [];
  // Options to ensure attributes are parsed correctly.
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
          
          // The root tag is usually <xml> or <ModInfo>. We get the content inside it.
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

/**
 * Recursively copies a directory.
 * @param {string} source - The source directory path.
 * @param {string} destination - The destination directory path.
 */
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

      if (!fs.existsSync(sourcePath)) {
        return { success: false, error: `Source mod folder not found at ${sourcePath}` };
      }
      if (fs.existsSync(destPath)) {
        return { success: false, error: `Destination conflict: a mod named '${folderName}' already exists.` };
      }
      
      // Perform the safe copy-then-delete operation
      try {
        await copyDirectoryRecursive(sourcePath, destPath);
        await fs.promises.rm(sourcePath, { recursive: true, force: true });
        return { success: true };
      } catch (operationError) {
        console.error(`Safe mod toggle operation failed for '${folderName}':`, operationError);
        // Attempt to clean up the failed copy
        if (fs.existsSync(destPath)) {
          await fs.promises.rm(destPath, { recursive: true, force: true }).catch(cleanupError => {
            console.error(`Failed to cleanup destination directory '${destPath}':`, cleanupError);
          });
        }
        // Re-throw the original error to be caught by the outer block
        throw operationError;
      }

    } catch (e) {
      console.error('Failed to toggle mod:', e);
      return { success: false, error: e.message };
    }
  });
}

/**
 * Safely moves a directory by copying it, then deleting the source.
 * This is more robust against interruptions than a simple rename.
 * @param {string} source - The full path to the source directory.
 * @param {string} dest - The full path to the destination directory.
 * @param {string} modName - The name of the mod folder for error messages.
 */
async function safeMove(source, dest, modName) {
    if (!fs.existsSync(source)) {
        throw new Error(`Mod to move '${modName}' was not found in the source directory.`);
    }
    if (fs.existsSync(dest)) {
        throw new Error(`Cannot move mod '${modName}', a folder with the same name already exists in the destination.`);
    }
    
    try {
        await copyDirectoryRecursive(source, dest);
        await fs.promises.rm(source, { recursive: true, force: true });
    } catch (operationError) {
        console.error(`Safe move operation failed for '${modName}':`, operationError);
        // Attempt to clean up the failed copy
        if (fs.existsSync(dest)) {
            await fs.promises.rm(dest, { recursive: true, force: true }).catch(cleanupError => {
                console.error(`Failed to cleanup destination directory '${dest}':`, cleanupError);
            });
        }
        // Re-throw the original error with a more user-friendly context
        throw new Error(`Failed to move mod '${modName}': ${operationError.message}`);
    }
}

function handleApplyModSet() {
    ipcMain.handle('mods:apply-mod-set', async (_, { modSetFolderNames }) => {
        try {
            if (!fs.existsSync(DISABLED_MODS_PATH)) await fs.promises.mkdir(DISABLED_MODS_PATH, { recursive: true });
            if (!fs.existsSync(MODS_PATH)) await fs.promises.mkdir(MODS_PATH, { recursive: true });
            
            const set = new Set(modSetFolderNames);
            const enabledDirs = fs.readdirSync(MODS_PATH, { withFileTypes: true }).filter(d => d.isDirectory());
            const disabledDirs = fs.readdirSync(DISABLED_MODS_PATH, { withFileTypes: true }).filter(d => d.isDirectory());
            
            // Using sequential operations for safety. If one fails, the loop stops immediately.
            
            // Disable mods that are currently enabled but shouldn't be
            for (const mod of enabledDirs) {
                if (!set.has(mod.name)) {
                    const sourcePath = path.join(MODS_PATH, mod.name);
                    const destPath = path.join(DISABLED_MODS_PATH, mod.name);
                    await safeMove(sourcePath, destPath, mod.name);
                }
            }

            // Enable mods that are currently disabled but should be
            for (const mod of disabledDirs) {
                if (set.has(mod.name)) {
                    const sourcePath = path.join(DISABLED_MODS_PATH, mod.name);
                    const destPath = path.join(MODS_PATH, mod.name);
                    await safeMove(sourcePath, destPath, mod.name);
                }
            }
            
            return { success: true };
        } catch (e) {
            console.error('Failed to apply mod set:', e);
            // The error message from safeMove is designed to be user-friendly.
            return { success: false, error: e.message };
        }
    });
}


exports.init = () => {
  handleGetMods();
  handleToggleMod();
  handleApplyModSet();
};