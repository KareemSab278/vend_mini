import { Modal } from "@mantine/core";
import { PrimaryButton } from "../../../Components/Button";
import { styles } from "../styles";
import * as helpers from "../Helpers";

type PayStatus = "paying" | "dispensing" | "done" | "waiting_door" | "error" | "idle" | "nfc";

interface CheckoutModalProps {
  opened: boolean;
  payMessage: string;
  payStatus: PayStatus;
  onDismiss: () => void;
  onCancel: () => void;
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
  const blockClose = payStatus === "waiting_door";

  return (
    <Modal
      opened={opened}
      onClose={blockClose ? () => {} : onDismiss}
      title={`${paymentType === "card" ? "Card" : "NFC"} Contactless Payment`}
      withCloseButton={!blockClose}
      closeOnClickOutside={!blockClose}
      closeOnEscape={!blockClose}
    >
      <section style={styles.paymentSection}>
        <div style={styles.statusIcon}>
          {paymentType !== "nfc"
            ? helpers.statusIcon(payStatus)
            : helpers.statusIcon("nfc")}
        </div>

        <p style={styles.statusMessage}>{payMessage}</p>

        {(payStatus === "error" || payStatus === "done") && (
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
