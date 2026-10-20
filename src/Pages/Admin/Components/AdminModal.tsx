import { useEffect, useRef, useState } from "react";
import { Modal } from "@mantine/core";
import { PrimaryButton } from "../../../Components/Button";
import { Admin, type NewAdminCredentials, type User } from "../../../Helpers/Admins";
import { NFC } from "../../../Helpers/Nfc";
import { Loading } from "../../../Components/Loading";

export { AdminModal };

interface AdminModalProps {
  opened: boolean;
  onClose: () => void;
}

const MAX_ADMINS = 9;

const AdminModal = ({ opened, onClose }: AdminModalProps) => {
  const [admins, setAdmins] = useState<User[]>([]);
  const [isRegistering, setIsRegistering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(false);
  const adminsRef = useRef<User[]>([]);
  const registeringRef = useRef(false);
  const credentialsRef = useRef({ username, password, confirmPassword });
  credentialsRef.current = { username, password, confirmPassword };

  useEffect(() => {
    adminsRef.current = admins;
  }, [admins]);

  useEffect(() => {
    if (!opened) return;
    setMessage(null);
    Admin.getAllAdmins()
      .then(setAdmins)
      .catch((e) => setMessage(String(e)));
  }, [opened]);

  useEffect(() => {
    if (!opened) return;
    let unlisten: (() => void) | undefined;

    NFC.listenUnknownTag(async (tagId) => {
      if (registeringRef.current) return;
      if (adminsRef.current.length >= MAX_ADMINS) return;

      const credentials = credentialsRef.current;
      if (credentials.username.trim().length < 3 || credentials.password.length < 8) {
        setMessage("Enter a username (at least 3 characters) and password (at least 8 characters) before scanning.");
        return;
      }
      if (credentials.password !== credentials.confirmPassword) {
        setMessage("Passwords do not match.");
        return;
      }

      if (adminsRef.current.some((a) => a.tag_id === tagId)) {
        setMessage("This tag is already registered.");
        return;
      }

      registeringRef.current = true;
      setIsRegistering(true);
      setMessage("Registering tag…");

      const newAdmin: User & NewAdminCredentials = {
        tag_id: tagId,
        full_name: credentials.username.trim(),
        username: credentials.username.trim(),
        password: credentials.password,
        is_admin: true,
        balance: 0,
      };

      setLoading(true);
      const result = await Admin.create(newAdmin);
      setLoading(false);

      if (result.success) {
        setAdmins((prev) => [...prev, newAdmin]);
        setMessage(`Admin registered: ${newAdmin.full_name}`);
        setUsername("");
        setPassword("");
        setConfirmPassword("");
        setShowPasswords(false);
      } else {
        setMessage(result.message ?? "Failed to register admin.");
      }

      registeringRef.current = false;
      setIsRegistering(false);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => unlisten?.();
  }, [opened]);

  const canAddMore = admins.length < MAX_ADMINS;

  return (
    <Modal opened={opened} onClose={onClose} title="Add Admins" size="xl">
      {loading && <Loading />}
      <div style={styles.inner}>
        <p style={styles.text}>
          Enter admin credentials, then place and hold a new NFC tag on the reader to register an admin.
        </p>
        <div style={styles.credentials}>
          <input
            aria-label="Admin username"
            autoComplete="username"
            placeholder="Admin username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <input
            aria-label="Admin password"
            autoComplete="new-password"
            placeholder="Admin password (8+ characters)"
            type={showPasswords ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <input
            aria-label="Confirm admin password"
            autoComplete="new-password"
            placeholder="Confirm admin password"
            type={showPasswords ? "text" : "password"}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          <label style={styles.showPasswords}>
            <input
              type="checkbox"
              checked={showPasswords}
              onChange={(event) => setShowPasswords(event.target.checked)}
            />
            Show passwords
          </label>
        </div>

        <p style={styles.counter}>
          Admins registered: {admins.length} / {MAX_ADMINS}
        </p>

        <p style={styles.message}>
          {message ??
            (canAddMore
              ? isRegistering
                ? "Registering…"
                : "Waiting for tap…"
              : "Maximum number of admins reached.")}
        </p>

        <PrimaryButton title="Done" onClick={onClose} size="xl" />

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
    </Modal>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  inner: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "1rem",
  },
  text: {
    fontSize: "1.25rem",
    maxWidth: "600px",
    marginBottom: "1rem",
    lineHeight: 1.5,
  },
  counter: {
    fontSize: "1.1rem",
    marginBottom: "1rem",
    opacity: 0.8,
  },
  message: {
    fontSize: "1.1rem",
    marginBottom: "1.5rem",
    minHeight: "2rem",
  },
  list: {
    listStyle: "none",
    padding: 0,
    margin: "1.5rem 0 0 0",
    fontSize: "1rem",
    width: "100%",
    maxWidth: "600px",
  },
  listItem: {
    padding: "0.5rem 1rem",
    marginBottom: "0.5rem",
    background: "rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    wordBreak: "break-all",
  },
  credentials: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    width: "min(100%, 28rem)",
    marginBottom: "1rem",
  },
  showPasswords: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
  },
};