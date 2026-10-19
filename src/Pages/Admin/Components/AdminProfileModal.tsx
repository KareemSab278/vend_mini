import { useEffect, useState } from "react";
import { Modal } from "@mantine/core";
import { PrimaryButton } from "../../../Components/Button";
import { Admin, type User } from "../../../Helpers/Admins";

interface AdminProfileModalProps {
  opened: boolean;
  user: User;
  onClose: () => void;
  onSaved: (username: string, tagId: string) => void;
}

const AdminProfileModal = ({
  opened,
  user,
  onClose,
  onSaved,
}: AdminProfileModalProps) => {
  const [username, setUsername] = useState(user.username ?? user.full_name);
  const [newPassword, setNewPassword] = useState("");
  const [tagId, setTagId] = useState(user.tag_id);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setUsername(user.username ?? user.full_name);
    setNewPassword("");
    setTagId(user.tag_id);
    setMessage(null);
  }, [opened, user.tag_id]);

  const save = async () => {
    if (username.trim().length < 3) {
      setMessage("Username must be at least 3 characters.");
      return;
    }
    if (newPassword && newPassword.length < 8) {
      setMessage("New password must be at least 8 characters.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (user.user_id === undefined) {
        throw new Error("Could not identify the signed-in admin account.");
      }
      await Admin.updateProfile(
        user.user_id,
        username,
        newPassword,
        tagId,
      );
      onSaved(username.trim(), tagId);
      onClose();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Admin Account" size="md">
      <div style={styles.inner}>
        <label style={styles.label} htmlFor="admin-username">Username</label>
        <input
          id="admin-username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <label style={styles.label} htmlFor="admin-new-password">New password</label>
        <input
          id="admin-new-password"
          autoComplete="new-password"
          placeholder="Leave blank to keep current password"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <label style={styles.label} htmlFor="admin-tag-id">NFC tag ID</label>
        <input
          id="admin-tag-id"
          autoComplete="off"
          value={tagId}
          onChange={(event) => setTagId(event.target.value)}
        />
        {message && <p role="alert" style={styles.message}>{message}</p>}
        <PrimaryButton
          title={saving ? "Saving…" : "Save account"}
          onClick={() => void save()}
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
    gap: "0.75rem",
  },
  label: {
    textAlign: "left",
  },
  message: {
    color: "#ff8080",
  },
};

export { AdminProfileModal };
