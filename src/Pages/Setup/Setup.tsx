import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Greeting } from "./Components/Greeting";
import { SetupNFC } from "./Components/SetupNFC";
import { SetupComplete } from "./Components/SetupComplete";
import { SetupFailsafe } from "./Components/SetupFailsafe";
import { KeyPressListener } from "../../Helpers/KeyPressListener";
import { isPiOs } from "../App/Helpers";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Admin } from "../../Helpers/Admins";

type SetupStep = "greeting" | "failsafe" | "nfc" | "complete";

const Setup = () => {

  const startFullScreen = async (): Promise<void> => {
    setTimeout(async () => {
      const isPi = await isPiOs();
      await getCurrentWindow().setFullscreen(isPi);
    }, 1000);
  };

  useEffect(() => { startFullScreen(); }, []);

  const [, navigate] = useLocation();
  const [step, setStep] = useState<SetupStep>("greeting");
  const [setupError, setSetupError] = useState<string | null>(null);

  const finish = () => navigate("/");
  const startAdminSetup = async () => {
    try {
      const failsafePresent = await Admin.areFailsafeUsersPresent();
      setStep(failsafePresent ? "nfc" : "failsafe");
    } catch (error) {
      console.error("Failed to check failsafe account:", error);
      setSetupError(typeof error === "string" ? error : "Failed to check failsafe account.");
    }
  };

  switch (step) {
    case "greeting":
      return <><KeyPressListener /><Greeting onNext={startAdminSetup} error={setupError} /></>;
    case "failsafe":
      return <><KeyPressListener /><SetupFailsafe onNext={() => setStep("nfc")} /></>;
    case "nfc":
      return <><KeyPressListener /><SetupNFC onNext={() => setStep("complete")} /></>;
    case "complete":
      return <><KeyPressListener /><SetupComplete onFinish={finish} /></>;
    default:
      return null;
  }
};

export { Setup };