import { useState, useEffect, useRef } from "react";
import { Modal } from "@mantine/core";
import { PrimaryButton } from "../../../Components/Button";
import { Cans, type CanCount } from "../../../Helpers/CanCount";

export { CansModal };

interface CansModalProps {
    opened: boolean;
    onClose: () => void;
}
const prepaidEnabled = import.meta.env.VITE_PREPAID_ENABLED === "true";

const CansModal = ({ opened, onClose }: CansModalProps) => {
    const [statusText, setStatusText] = useState<string>("");
    const [readings, setReadings] = useState<CanCount | null>(null);
    const [liveActive, setLiveActive] = useState<boolean>(false);
    const liveInterval = useRef<ReturnType<typeof setInterval> | null>(null);
    const cursorRef = useRef<number>(0);

    useEffect(() => {
        return () => {
            if (liveInterval.current) {
                clearInterval(liveInterval.current);
                liveInterval.current = null;
            }
            Cans.Stop().catch(() => { });
        };
    }, []);

    const stopLive = async () => {
        if (liveInterval.current) {
            clearInterval(liveInterval.current);
            liveInterval.current = null;
        }
        setLiveActive(false);
        try {
            await Cans.Stop();
        } catch {
            // ignore
        }
    };

    const showCount = async () => {
        if (!prepaidEnabled) return;
        await stopLive();
        setReadings(null);
        setStatusText("Listening for 3 samples...");
        try {
            const counts = await Cans.Start();
            setReadings(counts);
            setStatusText("3-sample readings");
        } catch (e) {
            setStatusText(`Error: ${e}`);
        }
    };

    const showLiveCount = async () => {
        if (!prepaidEnabled) return;
        if (liveActive) {
            stopLive();
            setStatusText("Live count stopped — latest snapshot shown.");
            return;
        }
        setReadings(null);
        setStatusText("Starting live count...");
        try {
            const cursor = await Cans.StartLive();
            cursorRef.current = cursor;
            setLiveActive(true);
            liveInterval.current = setInterval(async () => {
                try {
                    const result = await Cans.Poll(cursorRef.current);
                    cursorRef.current = result.cursor;
                    if (result.counts.length > 0) {
                        setReadings(result.counts);
                        setStatusText("Live readings (latest snapshot)");
                    }
                } catch (e) {
                    setStatusText(`Error: ${e}`);
                    stopLive();
                }
            }, 500);
        } catch (e) {
            setStatusText(`Error: ${e}`);
        }
    };

    const handleClose = () => {
        stopLive();
        setReadings(null);
        setStatusText("");
        onClose();
    };

    return (
        <Modal opened={opened} onClose={handleClose} title="Can Counter" size="xl">
            {
                prepaidEnabled
                    ?
                    <div style={styles.grid}>
                        <PrimaryButton title="Get 3 Samples" onClick={showCount} size="xl" />
                        <PrimaryButton title={liveActive ? "Stop Live Count" : "Get Live Count"} onClick={showLiveCount} size="xl" />
                    </div>
                    :
                    <p>This machine is not set as prepaid or does not sell cans.</p>
            }
            {prepaidEnabled && statusText && (
                <p role="status" style={styles.statusText}>{statusText}</p>
            )}
            {prepaidEnabled && readings && (
                <div style={styles.readingsPanel}>
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th scope="col" style={styles.headerCell}>Column</th>
                                <th scope="col" style={styles.headerCell}>Sensor count</th>
                                <th scope="col" style={styles.headerCell}>Distance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {readings.map((reading, index) => (
                                <tr key={`${reading.column}-${index}`}>
                                    <th scope="row" style={styles.rowHeader}>{reading.column}</th>
                                    <td style={styles.cell}>{reading.count ?? "—"}</td>
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
            )}
        </Modal>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    grid: {
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "1rem",
    },
    statusText: {
        marginTop: "1rem",
        marginBottom: "0.5rem",
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
};
