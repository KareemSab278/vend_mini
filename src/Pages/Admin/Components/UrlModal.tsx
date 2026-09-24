import { Modal } from "@mantine/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { PrimaryButton } from "../../../Components/Button";
import { QRCodeSVG } from 'qrcode.react';

export { UrlModal };

interface UrlModalProps {
  opened: boolean;
  onClose: () => void;
  editorUrl: string;
}

const UrlModal = ({ opened, onClose, editorUrl }: UrlModalProps) => {
  return (
    <Modal opened={opened} onClose={onClose} title="URL Editor" size="xl">
      <div style={styles.inner}>
        <p style={styles.label}>Editor URL:</p>
        <p style={styles.url}>{editorUrl || "Loading…"}</p>
        <div style={styles.QRContainer}>
          <QRCodeSVG value={editorUrl || ''} size={256*1.5} />
        </div>
        <PrimaryButton
          title="Open Admin Page"
          onClick={() => editorUrl && openUrl(editorUrl)}
          size="xl"
        />
      </div>
    </Modal>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  inner: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: "1rem",
  },
  label: {
    margin: 0,
    fontSize: "1rem",
    opacity: 0.8,
  },
  url: {
    margin: 0,
    fontSize: "1.5rem",
    fontWeight: "bold",
    wordBreak: "break-all",
  },
  QRContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '20px',
    border: '1px solid #ccc',
    borderRadius: '8px',
    backgroundColor: '#fff',
    width: 'fit-content',
    margin: '0 auto'
  }
};