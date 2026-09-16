import { invoke } from "@tauri-apps/api/core";

const doorApi: string = import.meta.env.VITE_DOOR_API_URL;

interface DoorFunctions {
    unlock: () => Promise<Response | undefined>, // POST to the door API to release the lock
    isClosed: () => Promise<boolean>, // invoke rust backend to check the current lock state
}

export const Door: DoorFunctions = {
    unlock: async (): Promise<Response | undefined> => {
        try {
            const res = await fetch(`${doorApi}/open`, { method: "POST" });
            console.log("Door unlock response:", res);
            return res;
        } catch (error) {
            console.error("Failed to unlock door:", error);
        }
    },

    isClosed: async (): Promise<boolean> => {
        try {
            const raw = await invoke("get_door_status");
            const doorStatus = typeof raw === "string" ? JSON.parse(raw) : raw;
            return doorStatus?.lock_state === "closed";
        } catch (error) {
            console.error("Failed to get door status:", error);
            return false;
        }
    },
};
