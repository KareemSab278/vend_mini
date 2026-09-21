import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Greeting } from "./Components/Greeting";
import { SetupNFC } from "./Components/SetupNFC";
import { SetupComplete } from "./Components/SetupComplete";
import { KeyPressListener } from "../../Helpers/KeyPressListener";
import { isPiOs } from "../App/Helpers";
import { getCurrentWindow } from "@tauri-apps/api/window";

type SetupStep = "greeting" | "nfc" | "complete";

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

  const finish = () => navigate("/");

  switch (step) {
    case "greeting":
      return <><KeyPressListener /><Greeting onNext={() => setStep("nfc")} /></>;
    case "nfc":
      return <><KeyPressListener /><SetupNFC onNext={() => setStep("complete")} /></>;
    case "complete":
      return <><KeyPressListener /><SetupComplete onFinish={finish} /></>;
    default:
      return null;
  }
};

export { Setup };