import { useEffect, useRef, useState } from "react";
import { PrimaryButton } from "../../../Components/Button";
import { Admin, type User } from "../../../Helpers/Admins";
import { NFC } from "../../../Helpers/Nfc";
import { styles as appStyles } from "../../App/styles";

interface SetupNFCProps {
  onNext: () => void;
}

const MAX_ADMINS = 3;

const SetupNFC = ({ onNext }: SetupNFCProps) => {
  const [admins, setAdmins] = useState<User[]>([]);
  const [isRegistering, setIsRegistering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // avoids stale closures over `admins`/`isRegistering` inside the event listener
  const adminsRef = useRef<User[]>([]);
  const registeringRef = useRef(false);

  useEffect(() => {
    adminsRef.current = admins;
  }, [admins]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    NFC.listenUnknownTag(async (tagId) => {
      if (registeringRef.current) return;
      if (adminsRef.current.length >= MAX_ADMINS) return;

      if (adminsRef.current.some((a) => a.tag_id === tagId)) {
        setMessage("This tag is already registered.");
        return;
      }

      registeringRef.current = true;
      setIsRegistering(true);
      setMessage("Registering tag…");

      const newAdmin: User = {
        tag_id: tagId,
        full_name: `Admin ${adminsRef.current.length + 1}`,
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

      registeringRef.current = false;
      setIsRegistering(false);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => unlisten?.();
  }, []);

  const canAddMore = admins.length < MAX_ADMINS;
  const canFinish = admins.length > 0;

  return (
    <div style={appStyles.body}>
      <div style={styles.inner}>
        <h1 style={styles.heading}>Register Admin Tags</h1>
        <p style={styles.text}>
          Please tap your NFC tag on the reader to register an admin. Once detected, the admin user information will be auto-filled and added to the list.
        </p>

        <p style={styles.counter}>
          Admins registered: {admins.length} / {MAX_ADMINS}
        </p>

        {canAddMore && (
          <p style={styles.message}>
            {message ?? (isRegistering ? "Registering…" : "Waiting for tap…")}
          </p>
        )}
        {!canAddMore && message && <p style={styles.message}>{message}</p>}

        <div style={styles.buttons}>
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
