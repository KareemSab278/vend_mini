import { invoke } from "@tauri-apps/api/core";

export type LEDColor = "white" | "green" | "red" | "blue" | "yellow" | "none";
const DEV = import.meta.env.DEV;
interface LEDsFunctions {
    set: (color: LEDColor) => Promise<unknown>;
    setWithTimeout: (color: LEDColor, timeoutSeconds: number) => Promise<unknown>;
}

export const LEDs: LEDsFunctions = {
    set: async (color: LEDColor) => {
        DEV && console.log("Setting lights color to:", color);
        return await invoke("set_color", { color });
    },
    setWithTimeout: async (color: LEDColor, timeoutSeconds: number) => {
        DEV && console.log("Setting lights color to:", color, "with timeout:", timeoutSeconds);
        return await invoke("set_color_w_timeout", { color, timeoutSeconds });
    }
};