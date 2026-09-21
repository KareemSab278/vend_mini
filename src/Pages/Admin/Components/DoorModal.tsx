import { useState } from "react";
import { Modal } from "@mantine/core";
import { PrimaryButton } from "../../../Components/Button";
import { Door } from "../../../Helpers/Door";

export { DoorModal };

interface DoorModalProps {
  opened: boolean;
  onClose: () => void;
}

const DoorModal = ({ opened, onClose }: DoorModalProps) => {
  const [statusText, setStatusText] = useState<string>("");

  const showStatus = async () => {
    const statuses = await Door.status();
    setStatusText(JSON.stringify(statuses, null, 2));
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Door Controls" size="lg">
      <div style={styles.grid}>
        <PrimaryButton
          title="Unlock"
          onClick={() => Door.unlock()}
          size="xl"
        />
        <PrimaryButton
          title="Lock"
          onClick={() => Door.lock()}
          size="xl"
        />
        <PrimaryButton
          title="Paid Unlock"
          onClick={() => Door.paidUnlock()}
          size="xl"
        />
        <PrimaryButton
          title="Get Status"
          onClick={showStatus}
          size="xl"
        />
      </div>
      {statusText && (
        <pre style={styles.status}>{statusText}</pre>
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
    maxHeight: "200px",
    overflow: "auto",
    textAlign: "left",
  },
};