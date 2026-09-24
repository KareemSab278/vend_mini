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

  // added code for friday 25th sep
  // Determine if the modal should block closing based on the current payment status
  // if the payment status is one of the blocking statuses, prevent the modal from closing unless
  // the user explicitly cancels using the "Cancel" button or the payment process completes.

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

        {(payStatus === "error" || payStatus === "done") && (
          <PrimaryButton title="Dismiss" onClick={onDismiss} size="xl" />
        )}

        {payStatus === "paying" && (
          <PrimaryButton title="Cancel" onClick={async () => await onCancel()} size="xl" />
        )}
      </section>
    </Modal>
  );
};

export { CheckoutModal };
