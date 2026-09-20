import { PrimaryButton } from "../../../Components/Button";
import { styles as appStyles } from "../../App/styles";

interface SetupCompleteProps {
  onFinish: () => void;
}

const SetupComplete = ({ onFinish }: SetupCompleteProps) => {
  return (
    <div style={appStyles.body}>
      <div style={styles.inner}>
        <h1 style={styles.heading}>Setup Complete</h1>
        <p style={styles.text}>
          You can now start using the application with the configured admin users.
        </p>
        <p style={styles.text}>
          If you ever want to edit admins or products, you can do so from the admin URL.
        </p>
        <p style={styles.text}>
          You can find the admin URL from the main page when you tap your admin tag to the NFC reader.
        </p>
        <PrimaryButton title="Finish" onClick={onFinish} size="xl" />
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
};

export { SetupComplete };
