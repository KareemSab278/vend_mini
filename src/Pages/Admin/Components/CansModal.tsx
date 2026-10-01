import { useState, useEffect } from "react";
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
    const [timeRemaining, setTimeRemaining] = useState<number>(0);

    useEffect(() => {
        if (timeRemaining > 0) {
            const timer = setInterval(() => {
                setTimeRemaining((prev) => prev - 1);
            }, 1000);
            setStatusText(`Time remaining: ${timeRemaining - 1}s`);
            return () => clearInterval(timer);
        }
    }, [timeRemaining]);
    const showCount = async () => {
        if (!prepaidEnabled) return;
        try {
            setTimeRemaining(4);
            const counts = await Cans.Listen(3);
            setStatusText(JSON.stringify(counts, null, 2));
        } catch (e) {
            setTimeRemaining(4);
            setStatusText(`Error: ${e}`);
        }
    };

    return (
        <Modal opened={opened} onClose={onClose} title="Can Counter" size="xl">
            {
                prepaidEnabled
                    ?
                    <div style={styles.grid}>
                        <PrimaryButton title="Get 3 Samples" onClick={showCount} size="xl" />
                    </div>
                    :
                    <p>This machine is not set as prepaid or does not sell cans.</p>
            }
            {prepaidEnabled && statusText && <pre style={styles.status}>{statusText}</pre>}
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
