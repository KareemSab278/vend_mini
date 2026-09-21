const dev = import.meta.env.DEV;
const TAG_POLL_INTERVAL_MS = 250;

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface NfcFunctions {
    listenAdminFound: (onAdminFound: () => void) => Promise<() => void>, // subscribe to nfc-admin-found, returns the unlisten fn
    listenUnknownTag: (onUnknown: (tagId: string) => void) => Promise<() => void>, // subscribe to nfc-unknown-tag, returns the unlisten fn
    payment: (amount: number, onSuccess: (newBalance: number) => void, onError: (error: Error) => void) => Promise<number>, // read tag, check balance, deduct amount
    listenTags: () => Promise<string | undefined>, // read a single tag id
}

export const NFC: NfcFunctions = {
    listenAdminFound: async (onAdminFound: () => void): Promise<() => void> => {
        const unlisten = await listen("nfc-admin-found", () => {
            dev && console.log("[NFC] Admin tag detected!");
            onAdminFound();
        });
        return unlisten;
    },

    listenUnknownTag: async (onUnknown: (tagId: string) => void): Promise<() => void> => {
        const unlisten = await listen("nfc-unknown-tag", (event) => {
            const tagId = String((event as any).payload ?? event);
            dev && console.log(`NFC unknown tag: ${tagId}`);
            onUnknown(tagId);
        });
        return unlisten;
    },

    payment: async (
        amount: number,
        onSuccess: (newBalance: number) => void,
        onError: (error: Error) => void
    ): Promise<number> => {
        try {
            const tagId = (await invoke("get_tag_id")) as string;
            if (!tagId) throw new Error("No tag detected");

            // must be tagId for tag_id in rust tauri backend because it is enforced to be camelCase in js and snake_case in rust under tauri.
            const balance = (await invoke("get_balance_by_tag_id", { tagId })) as number | null;
            if (balance === null) throw new Error("Tag not recognised");
            if (balance < amount) throw new Error("Insufficient balance");

            const newBalance = (await invoke("update_balance_by_tag_id", { tagId, amount })) as number;
            onSuccess(newBalance);
            return newBalance;
        } catch (error) {
            dev && console.error("NFC payment failed:", error);
            onError(error as Error);
            throw error;
        }
    },

    listenTags: async (): Promise<string | undefined> => {
        while (true) {
            const tagId = (await invoke("get_tag_id")) as string | undefined;
            if (tagId) return tagId;
            await new Promise((resolve) => setTimeout(resolve, TAG_POLL_INTERVAL_MS));
        }
    },
};
