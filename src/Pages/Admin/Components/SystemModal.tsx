import { useEffect, useState } from "react";
import { Modal } from "@mantine/core";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PrimaryButton } from "../../../Components/Button";
import { Payment } from "../../../Helpers/Payment";
import { AppConfig } from "../../../Helpers/AppConfig";

export { SystemModal };

interface SystemModalProps {
  opened: boolean;
  onClose: () => void;
}

const SystemModal = ({ opened, onClose }: SystemModalProps) => {
  const [fullScreen, setFullScreen] = useState<boolean>(false);
  const [paymentResult, setPaymentResult] = useState<boolean | null>(null);
  const [canModeEnabled, setCanModeEnabled] = useState<boolean | null>(null);
  const [canModeError, setCanModeError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;

    let active = true;
    setCanModeError(null);
    AppConfig.getCanMode()
      .then((enabled) => {
        if (active) setCanModeEnabled(enabled);
      })
      .catch((e) => {
        if (active) setCanModeError(`Failed to load Can Mode: ${e}`);
      });

    return () => {
      active = false;
    };
  }, [opened]);

  const toggleFullScreen = async () => {
    const next = !fullScreen;
    setFullScreen(next);
    try {
      await getCurrentWindow().setFullscreen(next);
    } catch (e) {
      console.error("Failed to toggle fullscreen:", e);
    }
  };

  const testPayment = () => {
    Payment.start(0.1, (success: boolean) => {
      setPaymentResult(success);
    });
  };

  const toggleCanMode = async () => {
    if (canModeEnabled === null) return;

    const next = !canModeEnabled;
    setCanModeError(null);
    try {
      await AppConfig.toggleCanMode(next);
      setCanModeEnabled(next);
    } catch (e) {
      setCanModeError(`Failed to update Can Mode: ${e}`);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="System" size="xl">
      <div style={styles.grid}>
        <PrimaryButton
          title={"Toggle Full Screen"}
          onClick={toggleFullScreen}
          size="xl"
        />
        <PrimaryButton
          title="Kill App"
          onClick={() => invoke("kill_app")}
          size="xl"
          color="#FF0000"
        />
        <PrimaryButton
          title="Refresh Products"
          onClick={() => window.location.reload()}
          size="xl"
        />
        <PrimaryButton
          title="Test Payment"
          onClick={testPayment}
          size="xl"
        />
        <PrimaryButton
          title={canModeEnabled === null
            ? "Loading Can Mode..."
            : `${canModeEnabled ? "Disable" : "Enable"} Can Mode`}
          onClick={toggleCanMode}
          size="xl"
        />
      </div>
      {canModeError && <p role="alert" style={styles.failure}>{canModeError}</p>}
      {paymentResult !== null && (
        <p style={styles.result}>
          Payment Test Result:{" "}
          {paymentResult ? (
            <span style={styles.success}>Success</span>
          ) : (
            <span style={styles.failure}>Failure</span>
          )}
        </p>
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
  result: {
    marginTop: "1rem",
    fontSize: "1.2rem",
    textAlign: "center",
  },
  success: {
    color: "#4caf50",
    fontWeight: "bold",
  },
  failure: {
    color: "#f44336",
    fontWeight: "bold",
  },
};