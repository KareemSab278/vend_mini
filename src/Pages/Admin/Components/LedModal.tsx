import { Modal } from "@mantine/core";
import { PrimaryButton } from "../../../Components/Button";
import { LEDs } from "../../../Helpers/LED";
import { IconCircleFilled } from '@tabler/icons-react';

export { LedModal };

interface LedModalProps {
  opened: boolean;
  onClose: () => void;
}
interface PrimaryButtonProps {
  title: string|React.ReactNode;
  onClick: () => void;
  color?: string;
  textColor?: string;
  onDoubleClick?: () => void;
  size?: "sm" | "md" | "lg" | "xl";
}

const btns: { [key: string]: PrimaryButtonProps } = {
  white: {
    title: <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><IconCircleFilled size={30} color="#FFFFFF" />White</div>,
    onClick: () => LEDs.set("white"),
    color: "white",
  },
  green: {
    title: <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><IconCircleFilled size={30} color="#00FF00" />Green</div>,
    onClick: () => LEDs.set("green"),
    color: "green",
  },
  red: {
    title: <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><IconCircleFilled size={30} color="#FF0000" />Red</div>,
    onClick: () => LEDs.set("red"),
    color: "red",
  },
  blue: {
    title: <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><IconCircleFilled size={30} color="#0000FF" />Blue</div>,
    onClick: () => LEDs.set("blue"),
    color: "blue",
  },
  yellow: {
    title: <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><IconCircleFilled size={30} color="#FFFF00" />Yellow</div>,
    onClick: () => LEDs.set("yellow"),
    color: "yellow",
  }
}

const LedModal = ({ opened, onClose }: LedModalProps) => {
  return (
    <Modal opened={opened} onClose={onClose} title="LED Controls" size="xl">
      <div style={styles.grid}>
        {Object.values(btns).map((btn) => (
          <PrimaryButton
            key={btn.color}
            title={btn.title}
            onClick={btn.onClick}
            textColor={btn.textColor}
            size={btn.size}
          />
        ))}
      </div>
    </Modal>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  grid: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: "1rem",
  },
};