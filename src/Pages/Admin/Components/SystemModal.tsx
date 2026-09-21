import { useState } from "react";
import { Modal } from "@mantine/core";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PrimaryButton } from "../../../Components/Button";
import { Payment } from "../../../Helpers/Payment";
import { isPiOs } from "../../App/Helpers";

export { SystemModal };

interface SystemModalProps {
  opened: boolean;
  onClose: () => void;
}

const SystemModal = ({ opened, onClose }: SystemModalProps) => {
  const [fullScreen, setFullScreen] = useState<boolean>(false);
  const [paymentResult, setPaymentResult] = useState<boolean | null>(null);

  const toggleFullScreen = async () => {
    const next = !fullScreen;
    setFullScreen(next);
    try {
      const isPi = await isPiOs();
      await getCurrentWindow().setFullscreen(isPi && next);
    } catch (e) {
      console.error("Failed to toggle fullscreen:", e);
    }
  };

  const testPayment = () => {
    Payment.start(0.1, (success: boolean) => {
      setPaymentResult(success);
    });
  };

  return (
    <Modal opened={opened} onClose={onClose} title="System" size="lg">
      <div style={styles.grid}>
        <PrimaryButton
          title={fullScreen ? "Exit Full Screen" : "Enter Full Screen"}
          onClick={toggleFullScreen}
          size="xl"
        />
        <PrimaryButton
          title="Kill App (Double Click)"
          onClick={() => {}}
          onDoubleClick={() => invoke("kill_app")}
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
      </div>
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