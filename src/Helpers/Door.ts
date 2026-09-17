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
    // We also debounce: a single flaky "open" or "closed" reading should not count.
    waitForOpenedThenClosed: async (timeoutMs = 30000, pollIntervalMs = 2000): Promise<boolean> => {
        const startTime = Date.now();
        let wasOpened = false;
        let openStreak = 0;
        let closedStreak = 0;
        const requiredStreak = 2;

        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

        while (Date.now() - startTime < timeoutMs) {
            const closed = await Door.isClosed();
            console.log(`[door] waiting: closed=${closed}, wasOpened=${wasOpened}, openStreak=${openStreak}, closedStreak=${closedStreak}`);

            if (!wasOpened) {
                if (closed) {
                    openStreak = 0;
                } else {
                    openStreak += 1;
                    if (openStreak >= requiredStreak) {
                        wasOpened = true;
                        openStreak = 0;
                        console.log("[door] door detected as opened");
                    }
                }
            } else {
                if (closed) {
                    closedStreak += 1;
                    if (closedStreak >= requiredStreak) {
                        console.log("[door] door detected as closed after being opened");
                        return true;
                    }
                } else {
                    closedStreak = 0;
                }
            }

            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

        }
        console.warn("[door] timed out waiting for opened-then-closed");
        return false; // door was never opened+closed within the timeout
    },
};