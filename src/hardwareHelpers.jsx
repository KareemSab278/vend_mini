export { unlockDoor, isDoorClosed, setLightsColor };

import { invoke } from "@tauri-apps/api/core";

const doorApi = import.meta.env.VITE_DOOR_API_URL;

const unlockDoor = async () => {
  try {
    const res = await fetch(`${doorApi}/open`, { method: "POST" });
    console.log("Door unlock response:", res);
    return res;
  } catch (error) {
    console.error("Failed to unlock door:", error);
  }
};

const setLightsColor = async (color) => {
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
