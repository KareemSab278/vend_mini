import { Modal } from "@mantine/core";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { PrimaryButton } from "../../../Components/Button";
import { styles } from "../styles";
import { Door } from "../../../Helpers/Door";
import { Payment } from "../../../Helpers/Payment";
import { LEDs } from "../../../Helpers/LED";

interface AdminModalProps {
  opened: boolean;
  onClose: () => void;
  editorUrl: string;
  onToggleFullScreen: () => void;
  fullScreenState: boolean;
}

const AdminModal = ({
  opened,
  onClose,
  editorUrl,
  onToggleFullScreen,
  fullScreenState,
}: AdminModalProps) => {
  const [paymentResult, setPaymentResult] = useState<boolean | null>(null);

  const adminOptions = [
    {
      title: fullScreenState ? "Exit Full Screen" : "Enter Full Screen",
      onClick: onToggleFullScreen,
    },
    {
      title: "Kill App (Double Click)",
      onClick: () => invoke("kill_app"),
      doubleClick: true,
    },
    { title: "Refresh Products", onClick: () => window.location.reload() },
    { title: "Open Admin Page", onClick: () => openUrl(editorUrl) },
    { title: "Unlock Door", onClick: () => Door.unlock() },
    { title: "Lock Door", onClick: () => Door.lock() },
    {
      title: "Test Payment",
      onClick: async () =>
        await Payment.start(0.1, (success: boolean) => {
          setPaymentResult(success);
        }),
    },
    { title: "Set Light Green", onClick: () => LEDs.setGreen() },
    { title: "Set Light Red", onClick: () => LEDs.setRed() },
    { title: "Set Light Blue", onClick: () => LEDs.setBlue() },
    { title: "Set Light White", onClick: () => LEDs.setWhite() },
  ];

  return (
    <Modal opened={opened} onClose={onClose} title="Admin Panel" size='xl'>
      <section>
        {adminOptions.map((opt, idx) => (
          <PrimaryButton
            key={idx}
            title={opt.title}
            onClick={
              opt.doubleClick || opt.title === "Test Payment"
                ? () => {}
                : opt.onClick
            }
            onDoubleClick={opt.doubleClick ? opt.onClick : undefined}
          />
        ))}
        <p>Editor Url Active at: {editorUrl}</p>
        <p>
          Payment Test Result:{" "}
          {paymentResult !== null
            ? paymentResult
              ? "Success"
              : "Failure"
            : "Not Tested"}
        </p>
      </section>
    </Modal>
  );
};

export { AdminModal };
