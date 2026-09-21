import { Modal } from "@mantine/core";
import { PrimaryButton } from "../../../Components/Button";
import { LEDs } from "../../../Helpers/LED";

export { LedModal };

interface LedModalProps {
  opened: boolean;
  onClose: () => void;
}
interface PrimaryButtonProps {
  title: string;
  onClick: () => void;
  color?: string;
  textColor?: string;
  onDoubleClick?: () => void;
  size?: "sm" | "md" | "lg" | "xl";
}

const btns: { [key: string]: PrimaryButtonProps } = {
  white: {
    title: "White",
    onClick: () => LEDs.setWhite(),
    color: "#FFFFFF",
    textColor: "#000000",
    size: "xl"
  },
  green: {
    title: "Green",
    onClick: () => LEDs.setGreen(),
    color: "#00FF00",
    textColor: "#000000",
    size: "xl"
  },
  red: {
    title: "Red",
    onClick: () => LEDs.setRed(),
    color: "#FF0000",
    size: "xl"
  },
  blue: {
    title: "Blue",
    onClick: () => LEDs.setBlue(),
    color: "#0000FF",
    size: "xl"
  },
  yellow: {
    title: "Yellow",
    onClick: () => LEDs.setYellow(),
    color: "#FFFF00",
    textColor: "#000000",
    size: "xl"
  }
}

const LedModal = ({ opened, onClose }: LedModalProps) => {
  return (
    <Modal opened={opened} onClose={onClose} title="LED Controls" size="lg">
      <div style={styles.grid}>
        {Object.values(btns).map((btn) => (
          <PrimaryButton
            key={btn.title}
            title={btn.title}
            onClick={btn.onClick}
            color={btn.color}
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