const dev = import.meta.env.DEV;
import { invoke } from "@tauri-apps/api/core";

interface LEDsFunctions {
    set: (color: Color) => Promise<unknown>;
}

export const LEDs: LEDsFunctions = {
    set: async (color: Color) => await setLightsColor(color),
};

const COLORS = {
    white: { red: 255, green: 255, blue: 255 },
    green: { red: 0, green: 255, blue: 0 },
    red: { red: 255, green: 0, blue: 0 },
    blue: { red: 0, green: 0, blue: 255 },
    yellow: { red: 255, green: 255, blue: 0 },
};

type Color = keyof typeof COLORS;

const setLightsColor = async (color: Color) => {
    console.log("Setting lights color to:", color);
    return await invoke("set_color", { color });
};

const setShellyLightsColor = async (color: Color): Promise<Response | undefined> => {
    const authKey = import.meta.env.VITE_LIGHT_AUTHENTICATION_KEY;
    const lightId = import.meta.env.VITE_LIGHT_ID;
    const url = buildShellyCloudUrl(authKey);
    const payload = buildShellyPayload(lightId, color);

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                Accept: "application/json",
            },
            body: JSON.stringify(payload),
        });
        dev && console.log("Shelly light response:", res.status);
        return res;
    } catch (error) {
        dev && console.error("Failed to set Shelly light:", error);
    }
};

const buildShellyCloudUrl = (authKey: string): string =>
    `https://shelly-232-eu.shelly.cloud/v2/devices/api/set/light?auth_key=${encodeURIComponent(authKey)}`;

const buildShellyPayload = (lightId: string, color: Color): Record<string, unknown> => ({
    id: lightId,
    on: true,
    mode: "color",
    brightness: 100,
    white: 0,
    gain: 100,
    ...COLORS[color],
});
