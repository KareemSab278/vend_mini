
import { useState } from "react";
import { Modal, PasswordInput, Stack } from "@mantine/core";
import { invoke } from "@tauri-apps/api/core";
import { PrimaryButton } from "../../../Components/Button";
import type { CSSProperties } from "react";

const dev = import.meta.env.DEV;
const NO_AUTH_AGENT_ERROR = "NO_AUTH_AGENT:";

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
    const [needsPassword, setNeedsPassword] = useState(false);
    const [password, setPassword] = useState("");

    const handleUpdateSuccess = () => {
        setMessage("Update installed - killing app now... Please Restart");
        setNeedsPassword(false);
        setPassword("");
        void killAppAfeter3Secs();
    };

    const handleError = (error: unknown) => {
        const err = String(error);
        if (err.includes(NO_AUTH_AGENT_ERROR)) {
            setNeedsPassword(true);
            setMessage("A password is required to install the update.");
        } else {
            setMessage(err);
            setTimeout(() => setMessage(null), 8000);
        }
        dev && console.error("Install update failed:", error);
    };

    const handleCheckForUpdates = async () => {
        if (loading) return;
        setLoading(true);
        setMessage(null);
        setNeedsPassword(false);
        try {
            await invoke("install_update");
            handleUpdateSuccess();
        } catch (error) {
            handleError(error);
        } finally {
            setLoading(false);
        }
    };

    const handleInstallWithPassword = async () => {
        if (loading || !password) return;
        setLoading(true);
        try {
            await invoke("install_update_with_password", { password });
            handleUpdateSuccess();
        } catch (error) {
            handleError(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal opened={opened} onClose={onClose} title={"Update"} size="lg">
            <Stack>
                <div style={styles.grid}>
                    <PrimaryButton
                        title={loading ? "Updating..." : "Get Latest Update"}
                        onClick={handleCheckForUpdates}
                        size="xl"
                    />
                </div>
                {needsPassword && (
                    <PasswordInput
                        label="Sudo password"
                        placeholder="Enter device password"
                        value={password}
                        onChange={(event) => setPassword(event.currentTarget.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                void handleInstallWithPassword();
                            }
                        }}
                    />
                )}
                {needsPassword && password && (
                    <PrimaryButton
                        title={loading ? "Installing..." : "Install with password"}
                        onClick={handleInstallWithPassword}
                        size="xl"
                    />
                )}
                {message && (
                    <p style={styles.successText}>{message}</p>
                )}
            </Stack>
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
