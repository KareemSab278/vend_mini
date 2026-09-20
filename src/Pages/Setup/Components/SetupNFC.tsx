import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PrimaryButton } from "../../../Components/Button";
import { Admin, type User } from "../../../Helpers/Admins";
import { styles as appStyles } from "../../App/styles";

interface SetupNFCProps {
  onNext: () => void;
}

const MAX_ADMINS = 3;

const SetupNFC = ({ onNext }: SetupNFCProps) => {
  const [admins, setAdmins] = useState<User[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const scanTag = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setMessage("Please tap your NFC tag on the reader…");

    try {
      const tagId = (await invoke("get_tag_id")) as string;
      if (cancelledRef.current) return;

      if (!tagId) {
        setMessage("No tag detected. Please try again.");
        setIsScanning(false);
        return;
      }

      if (admins.some((a) => a.tag_id === tagId)) {
        setMessage("This tag is already registered.");
        setIsScanning(false);
        return;
      }

      const newAdmin: User = {
        tag_id: tagId,
        full_name: `Admin ${admins.length + 1}`,
        is_admin: true,
        balance: 0,
      };

      const result = await Admin.create(newAdmin);
      if (result.success) {
        setAdmins((prev) => [...prev, newAdmin]);
        setMessage(`Admin registered: ${newAdmin.full_name}`);
      } else {
        setMessage(result.message ?? "Failed to register admin.");
      }
    } catch (error) {
      setMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsScanning(false);
    }
  };

  const canAddMore = admins.length < MAX_ADMINS;
  const canFinish = admins.length > 0;

  return (
    <div style={appStyles.body}>
      <div style={styles.inner}>
        <h1 style={styles.heading}>Register Admin Tags</h1>
        <p style={styles.text}>
          Please tap your NFC tag to register an admin. Once detected, the admin user information will be auto-filled and added to the list.
        </p>

        <p style={styles.counter}>
          Admins registered: {admins.length} / {MAX_ADMINS}
        </p>

        {message && <p style={styles.message}>{message}</p>}

        <div style={styles.buttons}>
          {canAddMore && (
            <PrimaryButton
              title={isScanning ? "Scanning…" : "Register NFC Tag"}
              onClick={scanTag}
              size="xl"
            />
          )}
          {canFinish && (
            <PrimaryButton
              title="I'm Done"
              onClick={onNext}
              size="xl"
              color={canAddMore ? "#4a4a4a" : undefined}
            />
          )}
        </div>

        {admins.length > 0 && (
          <ul style={styles.list}>
            {admins.map((admin, idx) => (
              <li key={idx} style={styles.listItem}>
                {admin.full_name} — {admin.tag_id}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  inner: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "2rem",
  },
  heading: {
    fontSize: "3rem",
    marginBottom: "1.5rem",
  },
  text: {
    fontSize: "1.5rem",
    maxWidth: "800px",
    marginBottom: "1rem",
    lineHeight: 1.5,
  },
  counter: {
    fontSize: "1.25rem",
    marginBottom: "1.5rem",
    opacity: 0.8,
  },
  message: {
    fontSize: "1.25rem",
    marginBottom: "1.5rem",
    minHeight: "2rem",
  },
  buttons: {
    display: "flex",
    gap: "1rem",
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: "2rem",
  },
  list: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    fontSize: "1.25rem",
  },
  listItem: {
    padding: "0.5rem 1rem",
    marginBottom: "0.5rem",
    background: "rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
  },
};

export { SetupNFC };
