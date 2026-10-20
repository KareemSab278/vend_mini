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

type SetupStep = "checking" | "failsafe" | "greeting" | "nfc" | "complete";

const Setup = () => {

  const startFullScreen = async (): Promise<void> => {
    setTimeout(async () => {
      const isPi = await isPiOs();
      await getCurrentWindow().setFullscreen(isPi);
    }, 1000);
  };

  useEffect(() => { startFullScreen(); }, []);

  const [, navigate] = useLocation();
  const [step, setStep] = useState<SetupStep>("checking");
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    Admin.areFailsafeUsersPresent()
      .then((present) => {
        if (isMounted) setStep(present ? "greeting" : "failsafe");
      })
      .catch((error) => {
        console.error("Failed to verify setup readiness:", error);
        if (isMounted) {
          setSetupError("Could not check setup readiness. Press Next to try again.");
          setStep("greeting");
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const finish = () => navigate("/");
  const finishFailsafeSetup = () => {
    setSetupError(null);
    setStep("greeting");
  };
  const startAdminSetup = async () => {
    try {
      const failsafePresent = await Admin.areFailsafeUsersPresent();
      if (failsafePresent) {
        setSetupError(null);
        setStep("nfc");
      } else {
        setSetupError(null);
        setStep("failsafe");
      }
    } catch (error) {
      console.error("Failed to verify setup readiness:", error);
      setSetupError("Could not check setup readiness. Please try again.");
    }
  };

  switch (step) {
    case "checking":
      return null;
    case "failsafe":
      return <><KeyPressListener /><SetupFailsafe onNext={finishFailsafeSetup} /></>;
    case "greeting":
      return <><KeyPressListener /><Greeting onNext={startAdminSetup} error={setupError} /></>;
    case "nfc":
      return <><KeyPressListener /><SetupNFC onNext={() => setStep("complete")} /></>;
    case "complete":
      return <><KeyPressListener /><SetupComplete onFinish={finish} /></>;
    default:
      return null;
  }
};

export { Setup };