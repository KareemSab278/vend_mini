import { Modal } from "@mantine/core";
import { PrimaryButton } from "../../../Components/Button";
import { LEDColor, LEDs } from "../../../Helpers/LED";
import { IconCircleFilled } from '@tabler/icons-react';

export { LedModal };

interface LedModalProps {
  opened: boolean;
  onClose: () => void;
}
interface PrimaryButtonProps {
  title: string | React.ReactNode;
  onClick: () => void;
  color?: string;
  textColor?: string;
  onDoubleClick?: () => void;
  size?: "sm" | "md" | "lg" | "xl";
}
const btnStyle = { display: "flex", alignItems: "center" };

const genBtn = (color: LEDColor, hex: string) => ({
  title: <div style={btnStyle}><IconCircleFilled size={30} color={hex} /></div>,
  onClick: async () => await LEDs.set(color),
  color: color,
});

const btns: { [key: string]: PrimaryButtonProps } = {
  white: genBtn("white", "#FFFFFF"),
  green: genBtn("green", "#00FF00"),
  red: genBtn("red", "#FF0000"),
  blue: genBtn("blue", "#0000FF"),
  yellow: genBtn("yellow", "#FFFF00"),
  none: genBtn("none", "#000000")
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
    padding: "1rem",
  },
};
