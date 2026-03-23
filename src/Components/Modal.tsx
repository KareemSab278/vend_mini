export { Modal };

const Modal = ({ opened, closed, title, children, innerStyle }:
  { opened: boolean;
    closed: () => void;
    title: string;
    children: React.ReactNode;
    innerStyle?: React.CSSProperties;
  }
) => {
  if (!opened) return null;

  return (
    <div style={styles.mainBody} onClick={closed}>
      <div style={{ ...styles.innerBody, ...innerStyle }} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.title}>{title}</h2>
        {children}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  mainBody: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    background: "rgba(0, 0, 0, 0.74)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  title: { marginTop: 0, color: "#fff", marginBottom: "1.5rem", textAlign: "center" },
  innerBody: {
    background: "#1e1e1e",
    border: "1px solid #333",
    borderRadius: 8,
    padding: "1.5rem",
    width: "90vw",
    maxWidth: "400px",
    maxHeight: "80vh",
    overflow: "auto",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
    color: "#d4d4d4",
  },
};
