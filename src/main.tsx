import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Route, Router, Switch } from "wouter";
import "@mantine/core/styles.css";

import { App } from "./Pages/App/App";
import { Setup } from "./Pages/Setup/Setup";
import { Admin } from "./Pages/Admin/Admin";
import { applyTheme, defaultTheme, ThemeStore, type Theme } from "./Helpers/theme";
import "./styles.css";

const ThemedApp = () => {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    ThemeStore.getTheme().then((loadedTheme) => {
      applyTheme(loadedTheme);
      setTheme(loadedTheme);
    });
  }, []);

  if (!theme) return null;

  return (
    <MantineProvider defaultColorScheme="dark">
      <Router>
        <Switch>
          <Route path="/setup" component={Setup} />
          <Route path="/admin" component={Admin} />
          <Route path="/" component={App} />
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