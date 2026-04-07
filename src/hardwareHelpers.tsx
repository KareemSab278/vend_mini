export { unlockDoor, isDoorClosed, setLightsColor, listenToMotionSensor, listenToNfcAdminFound, listenToNfcUnknownTag };

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const doorApi: string = import.meta.env.VITE_DOOR_API_URL;

const unlockDoor = async () => {
  try {
    const res = await fetch(`${doorApi}/open`, { method: "POST" });
    console.log("Door unlock response:", res);
    return res;
  } catch (error) {
    console.error("Failed to unlock door:", error);
  }
};

const setLightsColor = async (color: "green" | "red" | "blue") => {
  const color_hmap = {
    green: { red: 0, green: 255, blue: 0 },
    red: { red: 255, green: 0, blue: 0 },
    blue: { red: 0, green: 0, blue: 255 },
  };
  const authKey = import.meta.env.VITE_LIGHT_AUTHENTICATION_KEY;
  const lightId = import.meta.env.VITE_LIGHT_ID;
  const url = `https://shelly-232-eu.shelly.cloud/v2/devices/api/set/light?auth_key=${encodeURIComponent(authKey)}`;
  const payload = {
    id: lightId,
    on: true,
    mode: "color",
    brightness: 100,
    white: 0,
    gain: 100,
    ...color_hmap[color],
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    console.log("Shelly light response:", res.status);
    return res;
  } catch (error) {
    console.error("Failed to set Shelly light:", error);
  }
};

const isDoorClosed = async () => {
  try {
    const raw = await invoke("get_door_status");
    const doorStatus = typeof raw === "string" ? JSON.parse(raw) : raw;
    return doorStatus?.lock_state === "closed";
  } catch (error) {
    console.error("Failed to get door status:", error);
    return false;
  }
};

const listenToMotionSensor = async (onMotion: () => void) => {
  const unlisten = await listen("motion-detected", () => {
    console.log("[Motion] Motion detected!");
    onMotion();
  });
  return unlisten; // call this to stop listening
};

const listenToNfcAdminFound = async (onAdminFound: () => void) => {
  const unlisten = await listen("nfc-admin-found", () => {
    console.log("[NFC] Admin tag detected!");
    onAdminFound();
  });
  return unlisten;
};

const listenToNfcUnknownTag = async (onUnknown: () => void) => {
  const unlisten = await listen("nfc-unknown-tag", () => {
    console.log("[NFC] Unknown tag detected!");
    onUnknown();
  });
  return unlisten;
};