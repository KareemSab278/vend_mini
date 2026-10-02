import { useState, useEffect, useRef } from "react";
import { Modal } from "@mantine/core";
import { PrimaryButton } from "../../../Components/Button";
import Cans from "../../../Helpers/CanCount";

export { CansModal };

interface CansModalProps {
    opened: boolean;
    onClose: () => void;
}
const prepaidEnabled = import.meta.env.VITE_PREPAID_ENABLED === "true";

const CansModal = ({ opened, onClose }: CansModalProps) => {
    const [statusText, setStatusText] = useState<string>("");
    const [liveText, setLiveText] = useState<string>("");
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
        setLiveText("");
        try {
            await Cans.Stop();
        } catch {
            // ignore
        }
    };

    const showCount = async () => {
        if (!prepaidEnabled) return;
        await stopLive();
        setStatusText("Listening for 3 samples...");
        setLiveText("");
        try {
            const counts = await Cans.Listen(3);
            setStatusText(JSON.stringify(counts, null, 2));
        } catch (e) {
            setStatusText(`Error: ${e}`);
        }
    };

    const showLiveCount = async () => {
        if (!prepaidEnabled) return;
        if (liveActive) {
            stopLive();
            return;
        }
        setStatusText("");
        setLiveText("Starting live count...");
        try {
            const cursor = await Cans.StartLive();
            cursorRef.current = cursor;
            setLiveActive(true);
            liveInterval.current = setInterval(async () => {
                try {
                    const result = await Cans.Poll(cursorRef.current);
                    cursorRef.current = result.cursor;
                    if (result.counts.length > 0) {
                        const snapshot = JSON.stringify(result.counts, null, 2);
                        setLiveText(snapshot);
                    }
                } catch (e) {
                    setLiveText(`Error: ${e}`);
                    stopLive();
                }
            }, 500);
        } catch (e) {
            setLiveText(`Error: ${e}`);
        }
    };

    const handleClose = () => {
        stopLive();
        onClose();
    };

    const listRef = useRef<HTMLPreElement>(null);

    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [liveText]);

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
            {prepaidEnabled && statusText && <pre style={styles.status}>{statusText}</pre>}
            
            {prepaidEnabled && liveText && (
                <pre ref={listRef} style={styles.status}>
                    {liveText}
                </pre>
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
    status: {
        marginTop: "1rem",
        padding: "1rem",
        background: "rgba(0, 0, 0, 0.25)",
        borderRadius: "8px",
        fontSize: "0.9rem",
        minHeight: "20rem",
        maxHeight: "30rem",
        overflow: "auto",
        textAlign: "left",
    },
};
