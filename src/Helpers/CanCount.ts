/*
    the helper is complete. but now is the hard part: 
        i need to get the live planogram data and then figure out the mapping.
            meaning i need to figure out how many rebdulls there are compared to a can of coke. theyre different widths.
                but since i have the live_distance, i can do the calculation on the fly here
                    - which sucks because it would have been better to have the mapping done in the hardware directly
        
    what is the planogram data going to look like? and how can i map it to the live_distance?
        should i ignore the count of cans and simply do the calulating here? only listen for when the count is 0 or 1?
            that might work out better...
    
    all cans are 65 mm in diameter (includes monster)
        redbull cans are 50 mm in diameter (some other drinks as well like iced coffees)

*/

import { invoke } from "@tauri-apps/api/core";
import { fakePlanogram, categories } from "./planogramData";

// received from rust invoke. this is ONE column of cans
export type CanCol = {
    column: number;
    count: number | null;
    live_distance: number | null;
};

type CanCount = CanCol[];

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
        return await invoke<CanCount>("cans_listen", { command: "start" });
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

// measured average distances (mm) for 0, 1, 2 and 3 standard cans in a column.
// the steps are not linear, so the counts are matched to the closest measurement
const CALIBRATED_DISTANCES_MM = [475, 445, 397, 335];
const STANDARD_CAN_DIAMETER_MM = 65;
const SLIM_CAN_DIAMETER_MM = 50;
const SLIM_CAN_NAMES = /red\s?bull|coffee/i;

const isCanProduct = (entry: PlanogramEntry): boolean =>
    categories.includes(entry.product_category) && entry.product_category.startsWith("Cans");

const canDiameterMm = (entry: PlanogramEntry): number =>
    SLIM_CAN_NAMES.test(entry.product_name) ? SLIM_CAN_DIAMETER_MM : STANDARD_CAN_DIAMETER_MM;

// the hardware count is only used for null/0. a lone can is not reliably "1" there,
// so everything else is calculated from the distance
export const calculateCanCount = (
    hardwareCount: number | null,
    distance: number | null,
    diameterMm = STANDARD_CAN_DIAMETER_MM,
): number => {
    if (!hardwareCount || distance === null) return 0;

    // normalise slim cans onto the standard-can scale
    const empty = CALIBRATED_DISTANCES_MM[0];
    const d = empty - ((empty - distance) * STANDARD_CAN_DIAMETER_MM) / diameterMm;

    const last = CALIBRATED_DISTANCES_MM.length - 1;
    if (d < CALIBRATED_DISTANCES_MM[last]) {
        return last + Math.round((CALIBRATED_DISTANCES_MM[last] - d) / STANDARD_CAN_DIAMETER_MM);
    }
    const canCount = CALIBRATED_DISTANCES_MM.reduce(
        (best, ref, i) =>
            Math.abs(ref - d) < Math.abs(CALIBRATED_DISTANCES_MM[best] - d) ? i : best,
        0,
    );
    console.log(`Calculated can count: ${canCount} for distance: ${distance} and hardware count: ${hardwareCount}`);
    return canCount;
};

// one sensor covers one physical column, so each column_id is counted once
// even when the planogram lists it on several rows
export const countCansPerSlot = (
    readings: CanCount,
    planogram: PlanogramEntry[] = fakePlanogram,
): SlotCanCount[] => {
    const columns = new Map<number, PlanogramEntry>();
    for (const entry of planogram.filter(isCanProduct)) {
        if (!columns.has(entry.column_id)) columns.set(entry.column_id, entry);
    }
    return [...columns.values()].map((entry) => {
        const reading = readings.find((r) => r.column === entry.column_id);
        return {
            column_id: entry.column_id,
            product_id: entry.product_id,
            product_name: entry.product_name,
            count: reading ? calculateCanCount(reading.count, reading.live_distance, canDiameterMm(entry)) : 0,
        };
    });
};

export const cansPickedUp = (before: SlotCanCount[], after: SlotCanCount[]): SlotCanCount[] =>
    before.flatMap((slot) => {
        const now = after.find((s) => s.column_id === slot.column_id)?.count ?? 0;
        const removed = slot.count - now;
        return removed > 0 ? [{ ...slot, count: removed }] : [];
    });
