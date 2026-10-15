import { useState, useEffect, useRef } from "react";
import { Modal } from "@mantine/core";
import {
    Cans,
    type CanChannelMap,
    type CanCountsBySlot,
    type CanReadings,
    canSlotKey,
    countCansPerSlot,
    removedCanCountsBySlot,
    updateCanChannelMap,
    type SlotCanCount,
} from "../../../Helpers/CanCount";
import { AppConfig } from "../../../Helpers/AppConfig";
import { PrimaryButton } from "../../../Components/Button";

export { CansModal };

interface CansModalProps {
    opened: boolean;
    onClose: () => void;
}

const CansModal = ({ opened, onClose }: CansModalProps) => {
    const [error, setError] = useState<string | null>(null);
    const [readings, setReadings] = useState<CanReadings | null>(null);
    const [channelCounts, setChannelCounts] = useState<CanCountsBySlot>(new Map());
    const channelStatesRef = useRef<CanChannelMap>(new Map());

    const [canModeEnabled, setCanModeEnabled] = useState<boolean | null>(null);

    const toggleCanMode = async () => {
        if (canModeEnabled === null) return;

        const next = !canModeEnabled;
        setError(null);
        try {
            await AppConfig.toggleCanMode(next);
            setCanModeEnabled(next);
        } catch (e) {
            setError(`Failed to update Can Mode: ${e}`);
        } finally {
            onClose();
        }
    };

    useEffect(() => {
        if (!opened) return;

        let active = true;
        let started = false;
        let pollInProgress = false;
        let cursor = 0;
        let pollTimer: ReturnType<typeof setInterval> | null = null;
        setReadings(null);
        setChannelCounts(new Map());
        channelStatesRef.current = new Map();

        setError(null);
        AppConfig.getCanMode()
            .then((enabled) => {
                if (active) setCanModeEnabled(enabled);
            })
            .catch((e) => {
                if (active) setError(`Failed to load Can Mode: ${e}`);
            });


        const poll = async () => {
            if (!active || pollInProgress) return;
            pollInProgress = true;
            try {
                const result = await Cans.Poll(cursor);
                cursor = result.cursor;
                if (active && result.readings.length > 0) {
                    channelStatesRef.current = updateCanChannelMap(
                        channelStatesRef.current,
                        result.readings,
                    );
                    setChannelCounts(removedCanCountsBySlot(channelStatesRef.current));
                    setReadings(latestReadingPerChannel(result.readings) ?? null);
                }
            } catch (e) {
                if (active) setError(`Error: ${e}`);
            } finally {
                pollInProgress = false;
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        };


        const startListening = async () => {
            try {
                cursor = await Cans.StartLive();
                started = true;
                if (!active) {
                    started = false;
                    await Cans.Stop();
                    return;
                }
                pollTimer = setInterval(() => {
                    void poll();
                }, 500);
            } catch (e) {
                if (active) {
                    setError(`Error: ${e}`);
                } else {
                    console.error("Failed to stop live can readings:", e);
                }
            }
        };

        void startListening();

        return () => {
            active = false;
            if (pollTimer) clearInterval(pollTimer);
            if (started) {
                started = false;
                void Cans.Stop().catch((e) => {
                    console.error("Failed to stop live can readings:", e);
                });
            }
        };
    }, [opened]);

    const mappedSlots: SlotCanCount[] = readings ? countCansPerSlot(channelCounts) : [];

    return (
        <Modal opened={opened} onClose={onClose} title="Live Can Sensor Readings" size="xl">



            {!canModeEnabled ?
                <p role="status" style={styles.statusText}>This machine is not set as prepaid or does not track cans or bottles.</p>
                : error && <p role="status" style={styles.statusText}>{error}</p>}


            <div style={styles.toggleButton}>
                <PrimaryButton
                    title={canModeEnabled === null
                        ? "Loading Can Mode..."
                        : `${canModeEnabled ? "Disable" : "Enable"} Can Mode`}
                    onClick={toggleCanMode}
                    size="xl"
                />
            </div>

            {canModeEnabled && readings && (
                <>
                    <div style={styles.readingsPanel}>

                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th scope="col" style={styles.headerCell}>Row</th>
                                    <th scope="col" style={styles.headerCell}>Channel / Column</th>
                                    <th scope="col" style={styles.headerCell}>Distance</th>
                                </tr>
                            </thead>
                            <tbody>
                                {readings.map((reading, index) => (
                                    <tr key={`${reading.row_id}-${reading.channel}-${index}`}>
                                        <th scope="row" style={styles.rowHeader}>{reading.row_id}</th>
                                        <th scope="row" style={styles.rowHeader}>{reading.channel}</th>
                                        <td style={styles.cell}>
                                            {reading.live_distance === null ? "—" : `${reading.live_distance} mm`}
                                        </td>
                                    </tr>
                                ))}
                                {readings.length === 0 && (
                                    <tr>
                                        <td colSpan={3} style={styles.emptyCell}>No readings received.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ ...styles.readingsPanel, marginTop: "1rem" }}>
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th scope="col" style={styles.headerCell}>Row</th>
                                    <th scope="col" style={styles.headerCell}>Column</th>
                                    <th scope="col" style={styles.headerCell}>Product</th>
                                    <th scope="col" style={styles.headerCell}>Product ID</th>
                                </tr>
                            </thead>
                            <tbody>
                                {mappedSlots.map((s, i) => (
                                    <tr key={`${s.row_id}-${s.column_id}-${i}`}>
                                        <th scope="row" style={styles.rowHeader}>{s.row_id}</th>
                                        <th scope="row" style={styles.rowHeader}>{s.column_id}</th>
                                        <td style={styles.cell}>{s.product_name}</td>
                                        <td style={styles.cell}>{s.product_id}</td>
                                    </tr>
                                ))}
                                {mappedSlots.length === 0 && (
                                    <tr>
                                        <td colSpan={4} style={styles.emptyCell}>No mapped slots.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <pre style={styles.readingsPanel}>
                        {JSON.stringify(readings, null, 2)}
                    </pre>
                </>
            )}
        </Modal >
    );
};

const latestReadingPerChannel = (readings: CanReadings): CanReadings => {
    const latest = new Map<string, CanReadings[number]>();
    for (const reading of readings) {
        latest.set(canSlotKey(reading.row_id, reading.channel), reading);
    }
    return [...latest.values()];
};

const styles: { [key: string]: React.CSSProperties } = {
    statusText: {
        marginTop: "1rem",
        marginBottom: "0.5rem",
        textAlign: "center",
    },
    readingsPanel: {
        marginTop: "0.5rem",
        maxHeight: "30rem",
        overflow: "auto",
        borderRadius: "8px",
        border: "1px solid rgba(128, 128, 128, 0.35)",
    },
    table: {
        width: "100%",
        borderCollapse: "collapse",
        textAlign: "left",
    },
    headerCell: {
        position: "sticky",
        top: 0,
        padding: "0.75rem 1rem",
        background: "var(--mantine-color-body)",
        borderBottom: "1px solid rgba(128, 128, 128, 0.35)",
    },
    rowHeader: {
        padding: "0.75rem 1rem",
        fontWeight: 600,
        borderBottom: "1px solid rgba(128, 128, 128, 0.2)",
    },
    cell: {
        padding: "0.75rem 1rem",
        fontVariantNumeric: "tabular-nums",
        borderBottom: "1px solid rgba(128, 128, 128, 0.2)",
    },
    emptyCell: {
        padding: "1rem",
        textAlign: "center",
    },
    toggleButton: {
        marginBottom: "1rem",
        display: "flex",
        justifyContent: "center",
    }
};
