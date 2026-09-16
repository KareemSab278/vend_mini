import { listen } from "@tauri-apps/api/event";

interface LightsFunctions {
    setColor: (color: "green" | "red" | "blue") => Promise<Response | undefined>, // POST to the Shelly cloud API to set the RGB light
}

interface MotionSensorFunctions {
    listen: (onMotion: () => void) => Promise<() => void>, // subscribe to motion-detected, returns the unlisten fn
}

export const Lights: LightsFunctions = {
    setColor: async (color: "green" | "red" | "blue"): Promise<Response | undefined> => {
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
    },
};

export const MotionSensor: MotionSensorFunctions = {
    listen: async (onMotion: () => void): Promise<() => void> => {
        const unlisten = await listen("motion-detected", () => {
            console.log("[Motion] Motion detected!");
            onMotion();
        });
        return unlisten;
    },
};
