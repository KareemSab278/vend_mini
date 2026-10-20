import { useEffect, useState } from "react";
import { Modal } from "@mantine/core";
import { PrimaryButton } from "../../../Components/Button";
import { Admin, type User } from "../../../Helpers/Admins";
import { KeyboardInput } from "../../../Components/KeyboardInput";

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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [tagId, setTagId] = useState(user.tag_id);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setUsername(user.username ?? user.full_name);
    setNewPassword("");
    setConfirmPassword("");
    setShowPasswords(false);
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
    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match.");
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
        <KeyboardInput
          id="admin-username"
          autoComplete="username"
          value={username}
          onValueChange={setUsername}
        />
        <label style={styles.label} htmlFor="admin-new-password">New password</label>
        <KeyboardInput
          id="admin-new-password"
          autoComplete="new-password"
          placeholder="Leave blank to keep current password"
          type={showPasswords ? "text" : "password"}
          value={newPassword}
          onValueChange={setNewPassword}
        />
        <label style={styles.label} htmlFor="admin-confirm-password">Confirm new password</label>
        <KeyboardInput
          id="admin-confirm-password"
          autoComplete="new-password"
          placeholder="Confirm new password"
          type={showPasswords ? "text" : "password"}
          value={confirmPassword}
          onValueChange={setConfirmPassword}
        />
        <label style={styles.showPasswords}>
          <input
            type="checkbox"
            checked={showPasswords}
            onChange={(event) => setShowPasswords(event.target.checked)}
          />
          Show passwords
        </label>
        <label style={styles.label} htmlFor="admin-tag-id">NFC tag ID</label>
        <KeyboardInput
          id="admin-tag-id"
          autoComplete="off"
          value={tagId}
          onValueChange={setTagId}
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
  showPasswords: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  message: {
    color: "#ff8080",
  },
};

export { AdminProfileModal };
