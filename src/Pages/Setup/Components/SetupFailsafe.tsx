import { useState } from "react";
import { PrimaryButton } from "../../../Components/Button";
import { Admin } from "../../../Helpers/Admins";
import { styles as appStyles } from "../../App/styles";

interface SetupFailsafeProps {
  onNext: () => void;
}

const SetupFailsafe = ({ onNext }: SetupFailsafeProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const createFailsafe = async () => {
    const credentials = { username: username.trim(), password };
    if (credentials.username.length < 3 || credentials.password.length < 8) {
      setMessage("Enter a username (at least 3 characters) and password (at least 8 characters).");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      await Admin.createFailsafeUser(credentials);
      onNext();
    } catch (error) {
      setMessage(typeof error === "string" ? error : "Failed to create failsafe account.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={appStyles.body}>
      <div style={styles.inner}>
        <h1 style={styles.heading}>Set Up Failsafe Login</h1>
        <p style={styles.text}>
          This private username and password are only for signing in to the admin web screen. No NFC tag is needed.
        </p>
        <div style={styles.credentials}>
          <input
            aria-label="Failsafe username"
            autoComplete="username"
            placeholder="Failsafe username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <input
            aria-label="Failsafe password"
            autoComplete="new-password"
            placeholder="Failsafe password (8+ characters)"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {message && <p style={styles.message}>{message}</p>}
        <PrimaryButton
          title={saving ? "Saving…" : "Save and Continue"}
          onClick={createFailsafe}
          size="xl"
          disabled={saving}
        />
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
  credentials: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    width: "min(100%, 28rem)",
    marginBottom: "1rem",
  },
  message: {
    fontSize: "1.1rem",
    marginBottom: "1.5rem",
  },
};

export { SetupFailsafe };
