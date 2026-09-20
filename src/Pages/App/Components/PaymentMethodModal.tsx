import { Modal } from "@mantine/core";
import { PrimaryButton } from "../../../Components/Button";
import { styles } from "../styles";

interface PaymentMethodModalProps {
  opened: boolean;
  onClose: () => void;
  onSelectCard: () => void;
  onSelectNFC: () => void;
}

const PaymentMethodModal = ({
  opened,
  onClose,
  onSelectCard,
  onSelectNFC,
}: PaymentMethodModalProps) => (
  <Modal opened={opened} onClose={onClose} title="Select Payment Method">
    <section style={styles.paymentSection}>
      <PrimaryButton
        title="Card"
        onClick={() => {
          onSelectCard();
          onClose();
        }}
        size="xl"
      />
      <PrimaryButton
        title="NFC"
        onClick={() => {
          onSelectNFC();
          onClose();
        }}
        size="xl"
      />
    </section>
  </Modal>
);

export { PaymentMethodModal };
