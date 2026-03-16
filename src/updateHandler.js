import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from '@tauri-apps/plugin-process';
import { ask } from '@tauri-apps/plugin-dialog';
import { invoke } from "@tauri-apps/api/core";

export { updateHandler };

const updateHandler = async () => {
  try {
    const update = await check();
    if (update) {
      const yes = await ask(
        `A new version (${update.version}) is available.\n${update.notes}\n\nInstall now?`,
        { title: "Update Available", type: "info" }
      );
      if (yes) {
        let downloadedPath = null;
        await update.download((event) => {
          if (event.event === "Finished") {
            downloadedPath = event.data?.path;
          }
        });

        if (downloadedPath) {
          await invoke("install_deb", { path: downloadedPath });
        } else {
          await update.downloadAndInstall();
        }
        await relaunch();
      }
    }
  } catch (e) {
    console.error("Update check failed:", e);
  }
};