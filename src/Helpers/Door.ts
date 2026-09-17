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
};


const isDoorClosed = async (): Promise<boolean> => {
    // should poll every 3 second to see when the door closed after 5 seconds of door opening.
    // check repeatedly until the door is closed. when door is closed return true.
    // if after 30 seconds door not closed then return false to set light red.
    await new Promise((resolve) => setTimeout(resolve, 5000)); // wait for 5 seconds before checking if the door is closed

    const startTime = Date.now();
    while (Date.now() - startTime < 30000) { // poll for up to 30 seconds
        if (await Door.isClosed()) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 3000)); // poll every 3 seconds
    }
    return false; // door did not close within 30 seconds
};