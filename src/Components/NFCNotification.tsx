import { styles } from "../Pages/App/styles";

interface NFCNotificationProps {
  message: string | null;
}

const NFCNotification = ({ message }: NFCNotificationProps) => (
  <div style={styles.nfcNotification}>{`TAG ID: ${message}`}</div>
);

export { NFCNotification };
