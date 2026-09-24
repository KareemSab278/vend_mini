import { Button } from "@mantine/core";
import { IconX } from "@tabler/icons-react";
export { PrimaryButton, RemoveButton };

export interface PrimaryButtonProps {
  title: string|React.ReactNode;
  onClick?: () => void;
  color?: string;
  textColor?: string;
  onDoubleClick?: () => void;
  size?: "sm" | "md" | "lg" | "xl";
}

const PrimaryButton = ({ title, onClick, color, textColor, onDoubleClick, size }: PrimaryButtonProps) => {
  return (
    <section style={{ display: "inline-block", margin: "8px" }}>
      <Button
        variant="filled"
        size={size || "lg"}
        radius="xl"
        style={{
          ...styles.primary,
          backgroundColor: color || styles.primary.backgroundColor,
          color: textColor || styles.primary.color,
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.opacity = "0.8";
          e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.18)";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.opacity = "1";
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

const RemoveButton = ({ onClick }: { onClick: () => void }) => {
  return (
    <section >
      <Button
        variant="subtle"
        size="sm"
        radius="xl"
        onClick={onClick}
      >
        <IconX size={30} stroke={3} color="red"/>
      </Button>
    </section>
  );
};

const styles = {
  primary: {
    backgroundColor: "var(--theme-primary, rgba(99, 99, 99, 0.42))",
    color: "var(--theme-text, #fff)",
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
    padding: "8px 8px",
    fontWeight: "bold",
    fontSize: "1rem",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.50)",
    border: "none",
    borderRadius: "2px",
    cursor: "pointer",
    transition: "background 0.2s, box-shadow 0.2s",
  },
};
