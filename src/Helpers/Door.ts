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
    unlock: () => Promise<void>, 
    lock: () => Promise<void>, 
    paidUnlock: () => Promise<void>, 
    paidUnlockAll: () => Promise<void>, 
    status: () => Promise<DoorStatus[]>, 
    isClosed: () => Promise<boolean>,
    waitForClosed: (timeoutMs?: number, pollIntervalMs?: number) => Promise<boolean>,
    waitForOpenedThenClosed: (timeoutMs?: number, pollIntervalMs?: number) => Promise<boolean>,
}

export const Door: DoorFunctions = {
    unlock: async (): Promise<void> => {
        await invoke("unlock_door");
    },

    lock: async (): Promise<void> => {
        await invoke("lock_door");
    },

    paidUnlock: async (): Promise<void> => {
        await invoke("paid_unlock");
    },

    paidUnlockAll: async (): Promise<void> => {
        await invoke("paid_unlock_all_doors");
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

    waitForClosed: async (timeoutMs = 30000, pollIntervalMs = 1000): Promise<boolean> => {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            if (await Door.isClosed()) {
                return true;
            }
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
        return false; // door did not close within the timeout
    },

    // right after unlocking, the sensor can briefly report "closed" before the user actually opens it,
    // so we require an open sighting first and only then wait for it to close again.
    waitForOpenedThenClosed: async (timeoutMs = 30000, pollIntervalMs = 500): Promise<boolean> => {
        const startTime = Date.now();
        let wasOpened = false;
        while (Date.now() - startTime < timeoutMs) {
            const closed = await Door.isClosed();
            if (!wasOpened) {
                if (!closed) wasOpened = true;
            } else if (closed) {
                return true;
            }
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
        return false; // door was never opened+closed within the timeout
    },
};