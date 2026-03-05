import { Button } from "@mantine/core";
export { PrimaryButton, RemoveButton };

const PrimaryButton = ({ title, onClick, color = 'rgb(99, 99, 99)', onDoubleClick = new Function() }) => {
  return (
    <section style={{ display: "inline-block", margin: "8px" }}>
      <Button
        variant="filled"
        size="lg"
        radius="xl"
        style={{
          ...styles.primary,
          backgroundColor: color || styles.primary.backgroundColor,
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.backgroundColor = color
            ? `rgba(${parseInt(color.slice(1, 3), 16)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(color.slice(5, 7), 16)}, 0.7)`
            : "rgba(156, 156, 156, 0.7)";
          e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.18)";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor =
            color || styles.primary.backgroundColor;
          e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.12)";
        }}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        {title}
      </Button>
    </section>
  );
};

const RemoveButton = ({ onClick }) => {
  return (
    <section style={styles.removeBtnSection}>
      <Button
        variant="outline"
        size="lg"
        radius="xl"
        style={styles.removeBtn}
        onClick={onClick}
      >
        ❌
      </Button>
    </section>
  );
};

const styles = {
  primary: {
    backgroundColor: "rgba(99, 99, 99, 0.42)",
    color: "#fff",
    padding: "10px 15px",
    fontWeight: "bold",
    fontSize: "1.5rem",
    boxShadow: "0px 2px 10px rgba(0, 0, 0, 0.36)",
    border: "none",
    borderRadius: "24px",
    height: "50px",
    cursor: "pointer",
    transition: "background 0.2s, box-shadow 0.2s",
  },
  tab: {
    backgroundColor: "rgba(0, 0, 0, 0)",
    color: "#fff",
    padding: "4px 8px",
    fontWeight: "bold",
    fontSize: "1rem",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.50)",
    border: "none",
    borderRadius: "2px",
    cursor: "pointer",
    transition: "background 0.2s, box-shadow 0.2s",
  },
  tabActive: {
    backgroundColor: "rgba(255, 255, 255, 0.29)",
    color: "#fff",
    padding: "4px 8px",
    fontWeight: "bold",
    fontSize: "1rem",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.50)",
    border: "none",
    borderRadius: "2px",
    cursor: "pointer",
    transition: "background 0.2s, box-shadow 0.2s",
  },
  removeBtn: {
    backgroundColor: "rgba(0, 0, 0, 0.54)",
    color: "#fff",
    padding: "5px 10px",
    fontWeight: "bold",
    fontSize: "1.2rem",
    border: "none",
    borderRadius: "50px",
    cursor: "pointer",
    marginTop: -50,
  },
  removeBtnSection: { display: "inline-block", margin: "8px" },
};
