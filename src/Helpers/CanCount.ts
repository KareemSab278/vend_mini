import { invoke } from "@tauri-apps/api/core";
import { fakePlanogram, categories } from "./planogramData";

export type CanReading = {
    channel: number;
    live_distance: number | null;
};

export type CanReadings = CanReading[];

export type CanType = "slim" | "regular";

export type CanChannelState = {
    previousDistance: number | null;
    currentDistance: number | null;
    lastCountedDistance: number;
    removedCans: number;
};

export type CanChannelMap = Map<number, CanChannelState>;

const MAX_CHANNELS = 64;
const SLIM_CAN_THRESHOLD_MM = 50;
const REGULAR_CAN_THRESHOLD_MM = 65;

interface LivePollResult {
    readings: CanReadings;
    cursor: number;
}

interface CansFunctions {
    Start: () => Promise<CanReadings>;
    Stop: () => Promise<CanReadings>;
    Listen: (seconds?: number) => Promise<CanReadings>;
    StartLive: () => Promise<number>;
    Poll: (cursor: number) => Promise<LivePollResult>;
}

export const Cans: CansFunctions = {
    Start: async (): Promise<CanReadings> => {

        const result = await invoke<CanReadings>("cans_listen", { command: "start" });
        console.log('result of Start: ', result);
        return result;
    },
    Stop: async (): Promise<CanReadings> => {
        return await invoke<CanReadings>("cans_listen", { command: "stop" });
    },
    Listen: async (seconds?: number): Promise<CanReadings> => {
        return await invoke<CanReadings>("cans_listen", {
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
    product_category: string;
    count: number;
};

const isCountableProduct = (entry: PlanogramEntry): boolean =>
    categories.includes(entry.product_category) &&
    (entry.product_category.startsWith("Cans") || entry.product_category.startsWith("Bottles"));

export const getCanType = (productName: string, productCategory = ""): CanType =>
    productCategory.startsWith("Bottles") || /coffee|cafe|café|slim|red[\s-]*bull/i.test(productName)
        ? "slim"
        : "regular";

export const updateCanChannelMap = (
    current: ReadonlyMap<number, CanChannelState>,
    readings: CanReadings,
    planogram: PlanogramEntry[] = fakePlanogram,
): CanChannelMap => {
    const next = new Map(current);

    for (const reading of readings) {
        const { channel, live_distance: distance } = reading;
        if (!Number.isInteger(channel) || channel < 0 || channel >= MAX_CHANNELS ||
            distance === null || !Number.isFinite(distance) || distance < 0) {
            continue;
        }

        const previous = next.get(channel);
        if (!previous) {
            next.set(channel, {
                previousDistance: distance,
                currentDistance: distance,
                lastCountedDistance: distance,
                removedCans: 0,
            });
            continue;
        }

        const product = planogram.find((entry) =>
            entry.column_id === channel && isCountableProduct(entry));
        const threshold = getCanType(product?.product_name ?? "", product?.product_category) === "slim"
            ? SLIM_CAN_THRESHOLD_MM
            : REGULAR_CAN_THRESHOLD_MM;
        // Removing a can increases sensor distance; returning one decreases it.
        const distanceIncrease = distance - previous.lastCountedDistance;
        const distanceDecrease = previous.lastCountedDistance - distance;
        let lastCountedDistance = previous.lastCountedDistance;
        let removedCans = previous.removedCans;

        if (distanceIncrease > threshold) {
            const newlyRemoved = Math.floor(distanceIncrease / threshold);
            removedCans += newlyRemoved;
            lastCountedDistance += newlyRemoved * threshold;
        } else if (distanceDecrease >= threshold) {
            const returned = Math.min(
                Math.floor(distanceDecrease / threshold),
                removedCans,
            );
            removedCans -= returned;
            lastCountedDistance -= returned * threshold;
            if (removedCans === 0) lastCountedDistance = distance;
        }

        next.set(channel, {
            previousDistance: previous.currentDistance,
            currentDistance: distance,
            lastCountedDistance,
            removedCans,
        });
    }

    return next;
};

export const removedCanCountsByChannel = (
    channels: ReadonlyMap<number, CanChannelState>,
): Map<number, number> =>
    new Map([...channels].map(([channel, state]) => [channel, state.removedCans]));

export const resetRemovedCanCounts = (
    channels: ReadonlyMap<number, CanChannelState>,
): CanChannelMap =>
    new Map([...channels].map(([channel, state]) => [channel, { ...state, removedCans: 0 }]));

// one sensor covers one physical column, so each column_id is counted once
// even when the planogram lists it on several rows
export const countCansPerSlot = (
    countsByChannel: ReadonlyMap<number, number>,
    planogram: PlanogramEntry[] = fakePlanogram,
): SlotCanCount[] => {
    // Build a map of planogram entries keyed by column_id for quick lookup
    const columns = new Map<number, PlanogramEntry>();
    for (const entry of planogram.filter(isCountableProduct)) {
        if (!columns.has(entry.column_id)) columns.set(entry.column_id, entry);
    }

    const used = new Set<number>();
    const result: SlotCanCount[] = [];

    // Go by the channel first and map it to a planogram entry
    for (const [channel, count] of countsByChannel) {
        const entry = columns.get(channel);
        if (entry) {
            used.add(entry.column_id);
            result.push({
                column_id: entry.column_id,
                product_id: entry.product_id,
                product_name: entry.product_name,
                product_category: entry.product_category,
                count,
            });
        } else {
            // Channel not present in planogram: still show the channel with a placeholder product
            result.push({
                column_id: channel,
                product_id: -1,
                product_name: `Channel ${channel}`,
                product_category: "Cans",
                count,
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
                product_category: entry.product_category,
                count: 0,
            });
        }
    }

    return result;
};

export const cansPickedUp = (before: SlotCanCount[], after: SlotCanCount[]): SlotCanCount[] =>
    after.flatMap((slot) => {
        const previous = before.find((s) => s.column_id === slot.column_id)?.count ?? 0;
        const removed = slot.count - previous;
        return removed > 0 ? [{ ...slot, count: removed }] : [];
    });
