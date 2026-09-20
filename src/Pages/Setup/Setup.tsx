import { useState } from "react";
import { useLocation } from "wouter";
import { Greeting } from "./Components/Greeting";
import { SetupNFC } from "./Components/SetupNFC";
import { SetupComplete } from "./Components/SetupComplete";

type SetupStep = "greeting" | "nfc" | "complete";

const Setup = () => {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<SetupStep>("greeting");

  const finish = () => navigate("/");

  switch (step) {
    case "greeting":
      return <Greeting onNext={() => setStep("nfc")} />;
    case "nfc":
      return <SetupNFC onNext={() => setStep("complete")} />;
    case "complete":
      return <SetupComplete onFinish={finish} />;
    default:
      return null;
  }
};

export { Setup };