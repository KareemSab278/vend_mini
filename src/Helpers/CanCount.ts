import { invoke } from "@tauri-apps/api/core";
import { fakePlanogram, categories } from "./planogramData";

export type CanReading = {
    row_id: number;
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

export type CanChannelMap = Map<number, Map<number, CanChannelState>>;
export type CanCountsBySlot = Map<number, Map<number, number>>;

const MAX_CHANNELS = 64;
const SLIM_CAN_THRESHOLD_MM = 55;
const REGULAR_CAN_THRESHOLD_MM = 70;

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
    row_id: number;
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

export const canSlotKey = (rowId: number, columnId: number): string => `${rowId}:${columnId}`;

export const updateCanChannelMap = (
    current: ReadonlyMap<number, ReadonlyMap<number, CanChannelState>>,
    readings: CanReadings,
    planogram: PlanogramEntry[] = fakePlanogram,
): CanChannelMap => {
    const next = new Map<number, Map<number, CanChannelState>>(
        [...current].map(([rowId, channels]) => [rowId, new Map(channels)]),
    );

    for (const reading of readings) {
        const { row_id: rowId, channel, live_distance: distance } = reading;
        if (!Number.isInteger(rowId) || rowId < 0 || rowId > 255 ||
            !Number.isInteger(channel) || channel < 0 || channel >= MAX_CHANNELS ||
            distance === null || !Number.isFinite(distance) || distance < 0) {
            continue;
        }

        const rowChannels = next.get(rowId) ?? new Map<number, CanChannelState>();
        const previous = rowChannels.get(channel);
        if (!previous) {
            rowChannels.set(channel, {
                previousDistance: distance,
                currentDistance: distance,
                lastCountedDistance: distance,
                removedCans: 0,
            });
            next.set(rowId, rowChannels);
            continue;
        }

        const product = planogram.find((entry) =>
            entry.row_id === rowId && entry.column_id === channel && isCountableProduct(entry));
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

        rowChannels.set(channel, {
            previousDistance: previous.currentDistance,
            currentDistance: distance,
            lastCountedDistance,
            removedCans,
        });
        next.set(rowId, rowChannels);
    }

    return next;
};

export const removedCanCountsBySlot = (
    channels: ReadonlyMap<number, ReadonlyMap<number, CanChannelState>>,
): CanCountsBySlot =>
    new Map([...channels].map(([rowId, rowChannels]) => [
        rowId,
        new Map([...rowChannels].map(([channel, state]) => [channel, state.removedCans])),
    ]));

export const resetRemovedCanCounts = (
    channels: ReadonlyMap<number, ReadonlyMap<number, CanChannelState>>,
): CanChannelMap =>
    new Map([...channels].map(([rowId, rowChannels]) => [
        rowId,
        new Map([...rowChannels].map(([channel, state]) => [
            channel,
            { ...state, removedCans: 0 },
        ])),
    ]));

export const countCansPerSlot = (
    countsBySlot: ReadonlyMap<number, ReadonlyMap<number, number>>,
    planogram: PlanogramEntry[] = fakePlanogram,
): SlotCanCount[] => {
    const slots = new Map<string, PlanogramEntry>();
    for (const entry of planogram.filter(isCountableProduct)) {
        const key = canSlotKey(entry.row_id, entry.column_id);
        if (!slots.has(key)) slots.set(key, entry);
    }

    const used = new Set<string>();
    const result: SlotCanCount[] = [];

    for (const [rowId, rowCounts] of countsBySlot) {
        for (const [channel, count] of rowCounts) {
            const key = canSlotKey(rowId, channel);
            const entry = slots.get(key);
            if (entry) {
                used.add(key);
                result.push({
                    row_id: rowId,
                    column_id: channel,
                    product_id: entry.product_id,
                    product_name: entry.product_name,
                    product_category: entry.product_category,
                    count,
                });
            } else {
                result.push({
                    row_id: rowId,
                    column_id: channel,
                    product_id: -1,
                    product_name: `Row ${rowId}, column ${channel}`,
                    product_category: "Cans",
                    count,
                });
            }
        }
    }

    for (const [key, entry] of slots) {
        if (!used.has(key)) {
            result.push({
                row_id: entry.row_id,
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
        const previous = before.find((s) =>
            s.row_id === slot.row_id && s.column_id === slot.column_id)?.count ?? 0;
        const removed = slot.count - previous;
        return removed > 0 ? [{ ...slot, count: removed }] : [];
    });
