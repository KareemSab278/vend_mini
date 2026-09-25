import { Modal } from "@mantine/core";
import { useState, useEffect } from "react";
import { PrimaryButton } from "../../../Components/Button";
import { styles } from "../styles";
import * as helpers from "../Helpers";

type PayStatus = "paying" | "dispensing" | "done" | "waiting_door" | "error" | "idle" | "nfc";

interface CheckoutModalProps {
  opened: boolean;
  payMessage: string;
  payStatus: PayStatus;
  onDismiss: () => void;
  onCancel: () => Promise<void>;
  paymentType: "card" | "nfc" | null;
}

const CheckoutModal = ({
  opened,
  payMessage,
  payStatus,
  onDismiss,
  onCancel,
  paymentType,
}: CheckoutModalProps) => {
  const [showDismissDoorButton, setShowDismissDoorButton] = useState(false);

  useEffect(() => {
    if (payStatus !== "waiting_door") {
      setShowDismissDoorButton(false);
      return;
    }

    // waiting_door: start the 30s timer
    const id = setTimeout(() => setShowDismissDoorButton(true), 30000);
    return () => clearTimeout(id);
  }, [payStatus]);

  const canDismiss =
    payStatus === "error" ||
    payStatus === "done" ||
    (payStatus === "waiting_door" && showDismissDoorButton);

  return (
    <Modal
      opened={opened}
      onClose={()=>{}}
      title={`${paymentType === "card" ? "Card" : "NFC"} Contactless Payment`}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      size="xl"
    >
      <section style={styles.paymentSection}>
        <div style={styles.statusIcon}>
          {paymentType !== "nfc"
            ? helpers.statusIcon(payStatus)
            : helpers.statusIcon("nfc")}
        </div>

        <p style={styles.statusMessage}>{payMessage}</p>

        {canDismiss && (
          <PrimaryButton title="Dismiss" onClick={onDismiss} size="xl" />
        )}

        {payStatus === "paying" && (
          <PrimaryButton title="Cancel" onClick={onCancel} size="xl" />
        )}
      </section>
    </Modal>
  );
};

export { CheckoutModal };
