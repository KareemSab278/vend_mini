import { useState } from "react";
import { useLocation } from "wouter";
import { Greeting } from "./Components/Greeting";
import { SetupNFC } from "./Components/SetupNFC";
import { SetupComplete } from "./Components/SetupComplete";
import { KeyPressListener } from "../../Helpers/KeyPressListener";

type SetupStep = "greeting" | "nfc" | "complete";

const Setup = () => {
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