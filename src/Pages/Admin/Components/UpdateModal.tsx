
import { useState } from "react";
import { Modal } from "@mantine/core";
import { invoke } from "@tauri-apps/api/core";
import { PrimaryButton } from "../../../Components/Button";
import type { CSSProperties } from "react";

const dev = import.meta.env.DEV;

const killAppAfeter3Secs = async () => {
    try {
        setTimeout(async () => {
            await invoke("kill_app");
        }, 3000);
    } catch (error) {
        dev && console.error("Failed to kill app:", error);
    }
};

export { UpdateModal };

interface UpdateModalProps {
    opened: boolean;
    onClose: () => void;
}

const UpdateModal = ({ opened, onClose }: UpdateModalProps) => {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);


    const handleCheckForUpdates = async () => {
        setLoading(true);
        try {
            setLoading(true);
            await invoke("install_update");
            setMessage("Update installed - killing app now... Please Restart");
            await killAppAfeter3Secs();
        } catch (error) {
            setMessage(error as string);
            setTimeout(() => setMessage(null), 5000);
            dev && console.error("Install update failed:", error);
        } finally {
            setLoading(false);
        }
    }

    return (
        <Modal opened={opened} onClose={onClose} title={"Update"} size="lg">
            <div style={styles.grid}>
                <PrimaryButton
                    title={loading ? "Updating..." : "Get Latest Update"}
                    onClick={handleCheckForUpdates}
                    size="xl"
                />
            </div>
            {message && (
                <p style={styles.successText}>{message}</p>
            )}
        </Modal>
    );
};

const styles: { [key: string]: CSSProperties } = {
    grid: {
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "1rem",
    },
    successText: {
        marginTop: "1rem",
        fontSize: "1.2rem",
        textAlign: "center",
        color: "#ffffff",
        fontWeight: 800,
    },
};
