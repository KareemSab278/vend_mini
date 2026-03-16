import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from '@tauri-apps/plugin-process';
import { ask } from '@tauri-apps/plugin-dialog';

export {updateHandler};

const updateHandler = async () => {
  try {
    const update = await check();
    if (update) {
      const yes = await ask(
        `A new version (${update.version}) is available. Details: ${update.notes} Install now?`,
        { title: "Update Available", type: "info" }
      );
      if (yes) {
        await update.downloadAndInstall();
        await relaunch();
      }
    }
  } catch (e) {
    console.error("Update check failed:", e);
  }
};