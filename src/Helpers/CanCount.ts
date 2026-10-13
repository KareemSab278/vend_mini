import { invoke } from "@tauri-apps/api/core";
import { fakePlanogram, categories } from "./planogramData";

export type CanCol = {
    channel: number;
    count: number | null;
    live_distance: number | null;
};

export type CanCount = CanCol[];

interface LivePollResult {
    counts: CanCount;
    cursor: number;
}

interface CansFunctions {
    Start: () => Promise<CanCount>;
    Stop: () => Promise<CanCount>;
    Listen: (seconds?: number) => Promise<CanCount>; // can have null/undefined seconds
    StartLive: () => Promise<number>;
    Poll: (cursor: number) => Promise<LivePollResult>;
}

export const Cans: CansFunctions = {
    Start: async (): Promise<CanCount> => {

        const result = await invoke<CanCount>("cans_listen", { command: "start" });
        console.log('result of Start: ', result);
        return result;
    },
    Stop: async (): Promise<CanCount> => {
        return await invoke<CanCount>("cans_listen", { command: "stop" });
    },
    Listen: async (seconds?: number): Promise<CanCount> => {
        return await invoke<CanCount>("cans_listen", {
            command: "listen",
            duration: seconds,
        });
    },
    StartLive: async (): Promise<number> => {
        return await invoke<number>("cans_listen_live_start");
    },
    Poll: async (cursor: number): Promise<LivePollResult> => {
        return await invoke<LivePollResult>("cans_listen_live_poll", { cursor });
    },
};

type PlanogramEntry = (typeof fakePlanogram)[number];

export type SlotCanCount = {
    column_id: number;
    product_id: number;
    product_name: string;
    count: number;
};

const isCanProduct = (entry: PlanogramEntry): boolean =>
    categories.includes(entry.product_category) && entry.product_category.startsWith("Cans");

// can count for every column the hardware reported
export const countCansPerColumn = (readings: CanCount): { channel: number; count: number }[] =>
    readings.map((r) => ({ channel: r.channel, count: r.count ?? 0 }));

// one sensor covers one physical column, so each column_id is counted once
// even when the planogram lists it on several rows
export const countCansPerSlot = (
    readings: CanCount,
    planogram: PlanogramEntry[] = fakePlanogram,
): SlotCanCount[] => {
    // Build a map of planogram entries keyed by column_id for quick lookup
    const columns = new Map<number, PlanogramEntry>();
    for (const entry of planogram.filter(isCanProduct)) {
        if (!columns.has(entry.column_id)) columns.set(entry.column_id, entry);
    }

    const used = new Set<number>();
    const result: SlotCanCount[] = [];

    // Go by the channel (reading.channel) first and map to planogram entries
    for (const r of readings) {
        const entry = columns.get(r.channel);
        if (entry) {
            used.add(entry.column_id);
            result.push({
                column_id: entry.column_id,
                product_id: entry.product_id,
                product_name: entry.product_name,
                count: r.count ?? 0,
            });
        } else {
            // Channel not present in planogram: still show the channel with a placeholder product
            result.push({
                column_id: r.channel,
                product_id: -1,
                product_name: `Channel ${r.channel}`,
                count: r.count ?? 0,
            });
        }
    }

    // Add any planogram slots that had no readings (count = 0)
    for (const [, entry] of columns.entries()) {
        if (!used.has(entry.column_id)) {
            result.push({
                column_id: entry.column_id,
                product_id: entry.product_id,
                product_name: entry.product_name,
                count: 0,
            });
        }
    }

    return result;
};

export const cansPickedUp = (before: SlotCanCount[], after: SlotCanCount[]): SlotCanCount[] =>
    before.flatMap((slot) => {
        const now = after.find((s) => s.column_id === slot.column_id)?.count ?? 0;
        const removed = slot.count - now;
        return removed > 0 ? [{ ...slot, count: removed }] : [];
    });
