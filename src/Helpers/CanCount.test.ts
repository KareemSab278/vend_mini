import { describe, expect, it } from "vitest";
import {
    countCansPerSlot,
    getCanType,
    removedCanCountsBySlot,
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
            { row_id: 1, channel: 63, live_distance: 548 },
        ]);
        channels = updateCanChannelMap(channels, [
            { row_id: 1, channel: 63, live_distance: 568 },
        ]);
        channels = updateCanChannelMap(channels, [
            { row_id: 1, channel: 63, live_distance: 588 },
        ]);
        expect(channels.get(1)?.get(63)?.removedCans).toBe(0);

        channels = updateCanChannelMap(channels, [
            { row_id: 1, channel: 63, live_distance: 614 },
        ]);
        expect(channels.get(1)?.get(63)?.removedCans).toBe(1);

        channels = updateCanChannelMap(channels, [
            { row_id: 1, channel: 63, live_distance: 744 },
        ]);
        expect(channels.get(1)?.get(63)).toEqual({
            previousDistance: 614,
            currentDistance: 744,
            lastCountedDistance: 743,
            removedCans: 3,
        });
    });

    it("uses the slim threshold for bottles and ignores invalid channels", () => {
        const channels = updateCanChannelMap(new Map(), [
            { row_id: 0, channel: 0, live_distance: 500 },
            { row_id: 0, channel: 64, live_distance: 500 },
        ]);
        const updated = updateCanChannelMap(channels, [
            { row_id: 0, channel: 0, live_distance: 551 },
        ]);

        expect(updated.get(0)?.size).toBe(1);
        expect(updated.get(0)?.get(0)?.removedCans).toBe(1);
    });

    it("subtracts cans when the distance rises after a return", () => {
        let channels: CanChannelMap = updateCanChannelMap(new Map(), [
            { row_id: 1, channel: 63, live_distance: 548 },
        ]);
        channels = updateCanChannelMap(channels, [
            { row_id: 1, channel: 63, live_distance: 614 },
        ]);
        expect(channels.get(1)?.get(63)?.removedCans).toBe(1);

        channels = updateCanChannelMap(channels, [
            { row_id: 1, channel: 63, live_distance: 548 },
        ]);
        expect(channels.get(1)?.get(63)?.removedCans).toBe(0);

        channels = updateCanChannelMap(channels, [
            { row_id: 1, channel: 63, live_distance: 614 },
        ]);
        expect(channels.get(1)?.get(63)?.removedCans).toBe(1);
    });

    it("recognizes a returned can with a shorter distance decrease", () => {
        let channels: CanChannelMap = updateCanChannelMap(new Map(), [
            { row_id: 1, channel: 63, live_distance: 548 },
        ]);
        channels = updateCanChannelMap(channels, [
            { row_id: 1, channel: 63, live_distance: 615 },
        ]);
        expect(channels.get(1)?.get(63)?.removedCans).toBe(1);

        channels = updateCanChannelMap(channels, [
            { row_id: 1, channel: 63, live_distance: 560 },
        ]);
        expect(channels.get(1)?.get(63)?.removedCans).toBe(0);
    });

    it("does not count a small distance fluctuation as a returned can", () => {
        let channels: CanChannelMap = updateCanChannelMap(new Map(), [
            { row_id: 1, channel: 63, live_distance: 548 },
        ]);
        channels = updateCanChannelMap(channels, [
            { row_id: 1, channel: 63, live_distance: 615 },
        ]);
        channels = updateCanChannelMap(channels, [
            { row_id: 1, channel: 63, live_distance: 562 },
        ]);

        expect(channels.get(1)?.get(63)?.removedCans).toBe(1);
    });

    it("does not decrement below zero when distance falls without a removed can", () => {
        let channels: CanChannelMap = updateCanChannelMap(new Map(), [
            { row_id: 1, channel: 63, live_distance: 548 },
        ]);
        channels = updateCanChannelMap(channels, [
            { row_id: 1, channel: 63, live_distance: 495 },
        ]);

        expect(channels.get(1)?.get(63)?.removedCans).toBe(0);
    });

    it("resets the session count without losing the distance baseline", () => {
        let channels: CanChannelMap = updateCanChannelMap(new Map(), [
            { row_id: 1, channel: 63, live_distance: 548 },
        ]);
        channels = updateCanChannelMap(channels, [
            { row_id: 1, channel: 63, live_distance: 614 },
        ]);

        channels = resetRemovedCanCounts(channels);
        expect(channels.get(1)?.get(63)?.removedCans).toBe(0);
        expect(channels.get(1)?.get(63)?.lastCountedDistance).toBe(613);

        channels = updateCanChannelMap(channels, [
            { row_id: 1, channel: 63, live_distance: 548 },
        ]);
        channels = updateCanChannelMap(channels, [
            { row_id: 1, channel: 63, live_distance: 614 },
        ]);
        expect(channels.get(1)?.get(63)?.removedCans).toBe(1);
    });

    it("maps the same channel in different rows to different planogram products", () => {
        let channels: CanChannelMap = updateCanChannelMap(new Map(), [
            { row_id: 1, channel: 2, live_distance: 400 },
            { row_id: 2, channel: 2, live_distance: 400 },
        ]);
        channels = updateCanChannelMap(channels, [
            { row_id: 1, channel: 2, live_distance: 451 },
            { row_id: 2, channel: 2, live_distance: 451 },
        ]);

        const slots = countCansPerSlot(removedCanCountsBySlot(channels));
        expect(slots.find((slot) => slot.row_id === 1 && slot.column_id === 2))
            .toMatchObject({ product_name: "600ml CHERRY PEPSI M", count: 1 });
        expect(slots.find((slot) => slot.row_id === 2 && slot.column_id === 2))
            .toMatchObject({ product_name: "JBURST APPLE JUICE", count: 1 });
    });
});
