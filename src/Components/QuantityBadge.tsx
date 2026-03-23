export { QuantityBadge };

const QuantityBadge = ({ count = 0, color = "#e53935" }: {
  count?: number;
  color?: string;
}) => {
  if (!count || count <= 0) return null;

  return (
    <div style={{
      ...styles.badge,
      backgroundColor: color,
    }}>
      {count}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  badge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "26px",
    height: "26px",
    borderRadius: "999px",
    color: "#fff",
    fontWeight: "bold",
    fontSize: "0.9rem",
    padding: "0 10px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
    userSelect: "none",
    marginLeft: "0.5rem",
  },
};
