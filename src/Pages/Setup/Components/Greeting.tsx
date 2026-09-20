import { PrimaryButton } from "../../../Components/Button";

interface GreetingProps {
  onNext: () => void;
}

const Greeting = ({ onNext }: GreetingProps) => {
  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Welcome</h1>
      <p style={styles.text}>
        Before you can start using the application, you'll need to add some admin users using the NFC reader.
      </p>
      <p style={styles.text}>
        You can set up a maximum of 3 admin users. This is required to ensure proper management of the application.
      </p>
      <PrimaryButton title="Next" onClick={onNext} size="xl" />
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: "2rem",
    textAlign: "center",
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

export { Greeting };
