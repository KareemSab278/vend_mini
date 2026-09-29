import { styles } from "../styles";
const dev = import.meta.env.DEV;

interface NFCNotificationProps {
  message: string | null;
}

const NFCNotification = ({ message }: NFCNotificationProps) => (
  dev && <div style={styles.nfcNotification}>{message}</div>
);

export { NFCNotification };
