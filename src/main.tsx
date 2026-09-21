import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Route, Router, Switch } from "wouter";
import "@mantine/core/styles.css";

import { App } from "./Pages/App/App";
import { Setup } from "./Pages/Setup/Setup";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="dark">
      <Router>
        <Switch>
          <Route path="/setup" component={Setup} />
          <Route path="/" component={App} />
        </Switch>
      </Router>
    </MantineProvider>
  </StrictMode>
);