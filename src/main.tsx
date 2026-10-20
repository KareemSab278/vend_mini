import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Route, Router, Switch } from "wouter";
import "@mantine/core/styles.css";
import { AppConfig } from "./Helpers/AppConfig";

import { App } from "./Pages/App/App";
import { PrePaidApp } from "./Pages/App/PrePaidApp";
import { Setup } from "./Pages/Setup/Setup";
import { SetupFailsafe } from "./Pages/Setup/Components/SetupFailsafe";
import { Admin } from "./Pages/Admin/Admin";
import { applyTheme, ThemeStore, type Theme } from "./Helpers/theme";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./styles.css";

const startFullScreen = async (): Promise<void> => {
  await getCurrentWindow().setFullscreen(true);
};

// Find the machine ID on startup always
const findMachineId = async (): Promise<void> => {
  await AppConfig.findMachineId();
};

const ThemedApp = () => {
  const [theme, setTheme] = useState<Theme | null>(null);
  const [canModeEnabled, setCanModeEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    findMachineId();
    const unsubscribeCanMode = AppConfig.onCanModeChanged(setCanModeEnabled);
    ThemeStore.getTheme().then((loadedTheme) => {
      applyTheme(loadedTheme);
      setTheme(loadedTheme);
      startFullScreen();
    });

    AppConfig.getCanMode().then((enabled) => {
      setCanModeEnabled(enabled);
    });

    return unsubscribeCanMode;
  }, []);

  if (!theme || canModeEnabled === null) return null;

  return (
    <MantineProvider defaultColorScheme="dark">
      <Router>
        <Switch>
          <Route path="/installer/failsafe-setup" component={SetupFailsafe} />
          <Route path="/setup" component={Setup} />
          <Route path="/admin" component={Admin} />
          {/* conditionally render if the prepaid feature is enabled */}
          <Route path="/" component={canModeEnabled ? PrePaidApp : App} />
        </Switch>
      </Router>
    </MantineProvider>
  );
};

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ThemedApp />
  </StrictMode>
);