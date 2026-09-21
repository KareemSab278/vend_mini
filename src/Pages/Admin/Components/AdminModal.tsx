import { useEffect, useRef, useState } from "react";
import { Modal } from "@mantine/core";
import { PrimaryButton } from "../../../Components/Button";
import { Admin, type User } from "../../../Helpers/Admins";
import { NFC } from "../../../Helpers/Nfc";

export { AdminModal };

interface AdminModalProps {
  opened: boolean;
  onClose: () => void;
}

const MAX_ADMINS = 3;

const AdminModal = ({ opened, onClose }: AdminModalProps) => {
  const [admins, setAdmins] = useState<User[]>([]);
  const [isRegistering, setIsRegistering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const adminsRef = useRef<User[]>([]);
  const registeringRef = useRef(false);

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
  }, [opened]);

  const canAddMore = admins.length < MAX_ADMINS;

  return (
    <Modal opened={opened} onClose={onClose} title="Add Admins" size="lg">
      <div style={styles.inner}>
        <p style={styles.text}>
          Place and hold a new NFC tag on the reader to register an admin.
        </p>

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
};