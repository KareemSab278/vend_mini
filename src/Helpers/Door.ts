import { invoke } from "@tauri-apps/api/core";
import { LEDs } from "./LED";
const dev = import.meta.env.DEV;

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
    status: () => Promise<DoorStatus | null>,
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

    status: async (): Promise<DoorStatus | null> => {
        try {
            return await invoke<DoorStatus>("get_door_status");
        } catch (error) {
            dev && console.error("Failed to get door status:", error);
            return null;
        }
    },

    isClosed: async (): Promise<boolean> => {
        const status = await Door.status();
        return status !== null && status.door_closed;
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

    waitForOpenedThenClosed: async (timeoutMs = Infinity, pollIntervalMs = 1500): Promise<boolean> => {
        let closedStreak = 0;
        const requiredStreak = 2;

        // allow time to ensure the door has been opened before we start checking for it to close again.
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            const closed = await Door.isClosed();

            if (!closed) closedStreak = 0;

            if (closed) {
                closedStreak++;

                if (closedStreak >= requiredStreak) {
                    return true;
                }
            } else {
                closedStreak = 0;
            }

            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }

        return false;
    },
};