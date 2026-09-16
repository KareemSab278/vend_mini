import { invoke } from "@tauri-apps/api/core";

export interface DoorStatus {
    door: number;
    door_number: number;
    lock: string;
    door_closed: boolean;
    locked: boolean;
    raw: string;
}

interface DoorFunctions {
    unlock: (door?: number) => Promise<void>, // unlock door with number, or all doors if no number provided
    lock: (door?: number) => Promise<void>, // lock door with number, or all doors if no number provided
    paidUnlock: (door: number, millis: number | null) => Promise<void>, // unlock door for millis milliseconds (defaults to 30s if null)
    paidUnlockAll: (millis: number | null) => Promise<void>, // unlock all connected doors for millis milliseconds (defaults to 30s if null)
    status: () => Promise<DoorStatus[]>, // status of all CADLOCK door controllers connected over serial
    isClosed: () => Promise<boolean>, // convenience check: are all connected doors currently closed?
}

export const Door: DoorFunctions = {
    unlock: async (door?: number): Promise<void> => {
        await invoke("unlock_door", { door: door ?? 0 });
    },

    lock: async (door?: number): Promise<void> => {
        await invoke("lock_door", { door: door ?? 0 });
    },

    paidUnlock: async (door: number, millis: number | null = 30000): Promise<void> => {
        await invoke("paid_unlock_door", { door, millis });
    },

    paidUnlockAll: async (millis: number | null = 30000): Promise<void> => {
        await invoke("paid_unlock_all_doors", { millis });
    },

    status: async (): Promise<DoorStatus[]> => {
        try {
            const result = await invoke<DoorStatus[]>("get_all_doors_status");
            return Array.isArray(result) ? result : [];
        } catch (error) {
            console.error("Failed to get door status:", error);
            return [];
        }
    },

    isClosed: async (): Promise<boolean> => {
        const statuses = await Door.status();
        return statuses.length > 0 && statuses.every((s) => s.door_closed);
    },
};

