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

    it("counts multiple regular cans from distance increases", () => {
        let channels: CanChannelMap = new Map();

        channels = updateCanChannelMap(channels, [
            { channel: 63, live_distance: 548 },
        ]);
        channels = updateCanChannelMap(channels, [
            { channel: 63, live_distance: 568 },
        ]);
        channels = updateCanChannelMap(channels, [
            { channel: 63, live_distance: 588 },
        ]);
        expect(channels.get(63)?.removedCans).toBe(0);

        channels = updateCanChannelMap(channels, [
            { channel: 63, live_distance: 614 },
        ]);
        expect(channels.get(63)?.removedCans).toBe(1);

        channels = updateCanChannelMap(channels, [
            { channel: 63, live_distance: 744 },
        ]);
        expect(channels.get(63)).toEqual({
            previousDistance: 614,
            currentDistance: 744,
            lastCountedDistance: 743,
            removedCans: 3,
        });
    });

    it("uses the slim threshold for bottles and ignores invalid channels", () => {
        const channels = updateCanChannelMap(new Map(), [
            { channel: 0, live_distance: 500 },
            { channel: 64, live_distance: 500 },
        ]);
        const updated = updateCanChannelMap(channels, [
            { channel: 0, live_distance: 551 },
        ]);

        expect(updated.size).toBe(1);
        expect(updated.get(0)?.removedCans).toBe(1);
    });

    it("subtracts cans when the distance rises after a return", () => {
        let channels: CanChannelMap = updateCanChannelMap(new Map(), [
            { channel: 63, live_distance: 548 },
        ]);
        channels = updateCanChannelMap(channels, [
            { channel: 63, live_distance: 614 },
        ]);
        expect(channels.get(63)?.removedCans).toBe(1);

        channels = updateCanChannelMap(channels, [
            { channel: 63, live_distance: 548 },
        ]);
        expect(channels.get(63)?.removedCans).toBe(0);

        channels = updateCanChannelMap(channels, [
            { channel: 63, live_distance: 614 },
        ]);
        expect(channels.get(63)?.removedCans).toBe(1);
    });

    it("resets the session count without losing the distance baseline", () => {
        let channels: CanChannelMap = updateCanChannelMap(new Map(), [
            { channel: 63, live_distance: 548 },
        ]);
        channels = updateCanChannelMap(channels, [
            { channel: 63, live_distance: 614 },
        ]);

        channels = resetRemovedCanCounts(channels);
        expect(channels.get(63)?.removedCans).toBe(0);
        expect(channels.get(63)?.lastCountedDistance).toBe(613);

        channels = updateCanChannelMap(channels, [
            { channel: 63, live_distance: 548 },
        ]);
        channels = updateCanChannelMap(channels, [
            { channel: 63, live_distance: 614 },
        ]);
        expect(channels.get(63)?.removedCans).toBe(1);
    });
});
