import { styles } from "../styles";

interface NFCNotificationProps {
  message: string | null;
}

const NFCNotification = ({ message }: NFCNotificationProps) => (
  <div style={styles.nfcNotification}>{message}</div>
);

export { NFCNotification };
