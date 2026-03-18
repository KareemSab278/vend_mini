import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { invoke } from "@tauri-apps/api/core";
import { tempDir } from "@tauri-apps/api/path";
import { writeFile } from "@tauri-apps/plugin-fs";

const PLATFORM_KEY = "linux-aarch64";

const log = (...args) => {
  console.debug("[updateHandler]", ...args);
}

const getFallbackUpdateUrl = (rawJson) => {
  const platform = PLATFORM_KEY;
  return (
    rawJson?.platforms?.[platform]?.url ||
    Object.values(rawJson?.platforms || {})?.[0]?.url
  );
}

const writeTempFile = async (fileName, bytes) => {
  const dir = await tempDir();
  const filePath = `${dir.replace(/\\$/u, "")}/${fileName}`;
  await writeFile({ path: filePath, contents: bytes });
  return filePath;
}

const downloadAndInstallFromUrl = async (url) => {
  log("fallback download from", url);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download update: ${res.status} ${res.statusText}`);
  }

  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const fileName = `ordering_system_update_${Date.now()}.deb`;
  const filePath = await writeTempFile(fileName, bytes);

  log("downloaded update to", filePath);
  await invoke("install_deb", filePath);

  await relaunch();
}

export const updateHandler = async () => {
  if (import.meta.env.DEV) {
    log("dev mode; skipping update check");
    return;
  }

  let update;
  try {
    update = await check();
  } catch (e) {
    log("check() failed", e);
    return;
  }

  if (!update) {
    log("no update available");
    return;
  }

  log("update available", update.version);

  try {
    await update.downloadAndInstall((event) => {
      log("updater event", event);
    });

    await relaunch();
    return;
  } catch (e) {
    log("downloadAndInstall failed", e);
  }

  try {
    const url = getFallbackUpdateUrl(update.rawJson);
    if (!url) throw new Error("No update URL found in manifest");
    await downloadAndInstallFromUrl(url);
  } catch (e) {
    log("fallback update failed", e);
  }
}
