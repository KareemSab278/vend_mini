import { describe, expect, it } from "vitest";
import {
    getCanType,
    resetRemovedCanCounts,
    updateCanChannelMap,
    type CanChannelMap,
} from "./CanCount";

describe("can distance counting", () => {
    it("classifies slim cans, coffee, Red Bull, and bottles", () => {
        expect(getCanType("Iced Coffee Can")).toBe("slim");
        expect(getCanType("RED BULL")).toBe("slim");
        expect(getCanType("Slim Can")).toBe("slim");
        expect(getCanType("500ML Coke", "Bottles - Coca cola")).toBe("slim");
        expect(getCanType("330ML Coke Can", "Cans - Coca cola")).toBe("regular");
    });

    it("counts multiple regular cans from distance decreases", () => {
        let channels: CanChannelMap = new Map();

        channels = updateCanChannelMap(channels, [
            { channel: 63, live_distance: 548 },
        ]);
        channels = updateCanChannelMap(channels, [
            { channel: 63, live_distance: 528 },
        ]);
        channels = updateCanChannelMap(channels, [
            { channel: 63, live_distance: 508 },
        ]);
        expect(channels.get(63)?.removedCans).toBe(0);

        channels = updateCanChannelMap(channels, [
            { channel: 63, live_distance: 482 },
        ]);
        expect(channels.get(63)?.removedCans).toBe(1);

        channels = updateCanChannelMap(channels, [
            { channel: 63, live_distance: 352 },
        ]);
        expect(channels.get(63)).toEqual({
            previousDistance: 482,
            currentDistance: 352,
            lastCountedDistance: 353,
            removedCans: 3,
        });
    });

    it("uses the slim threshold for bottles and ignores invalid channels", () => {
        const channels = updateCanChannelMap(new Map(), [
            { channel: 0, live_distance: 500 },
            { channel: 64, live_distance: 500 },
        ]);
        const updated = updateCanChannelMap(channels, [
            { channel: 0, live_distance: 449 },
        ]);

        expect(updated.size).toBe(1);
        expect(updated.get(0)?.removedCans).toBe(1);
    });

    it("subtracts cans when the distance rises after a return", () => {
        let channels: CanChannelMap = updateCanChannelMap(new Map(), [
            { channel: 63, live_distance: 548 },
        ]);
        channels = updateCanChannelMap(channels, [
            { channel: 63, live_distance: 482 },
        ]);
        expect(channels.get(63)?.removedCans).toBe(1);

        channels = updateCanChannelMap(channels, [
            { channel: 63, live_distance: 548 },
        ]);
        expect(channels.get(63)?.removedCans).toBe(0);

        channels = updateCanChannelMap(channels, [
            { channel: 63, live_distance: 482 },
        ]);
        expect(channels.get(63)?.removedCans).toBe(1);
    });

    it("resets the session count without losing the distance baseline", () => {
        let channels: CanChannelMap = updateCanChannelMap(new Map(), [
            { channel: 63, live_distance: 548 },
        ]);
        channels = updateCanChannelMap(channels, [
            { channel: 63, live_distance: 482 },
        ]);

        channels = resetRemovedCanCounts(channels);
        expect(channels.get(63)?.removedCans).toBe(0);
        expect(channels.get(63)?.lastCountedDistance).toBe(483);

        channels = updateCanChannelMap(channels, [
            { channel: 63, live_distance: 548 },
        ]);
        channels = updateCanChannelMap(channels, [
            { channel: 63, live_distance: 482 },
        ]);
        expect(channels.get(63)?.removedCans).toBe(1);
    });
});
