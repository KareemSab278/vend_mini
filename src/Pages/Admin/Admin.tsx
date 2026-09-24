import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { invoke } from "@tauri-apps/api/core";
import { PrimaryButton, PrimaryButtonProps } from "../../Components/Button";
import { KeyPressListener } from "../../Helpers/KeyPressListener";
import { styles as appStyles } from "../App/styles";
import { AdminModal } from "./Components/AdminModal";
import { DoorModal } from "./Components/DoorModal";
import { LedModal } from "./Components/LedModal";
import { SystemModal } from "./Components/SystemModal";
import { UrlModal } from "./Components/UrlModal";
import { UpdateModal } from "./Components/UpdateModal";
import { ThemeSetter } from "./Components/ThemeSetter";

import { IconWorldUpload } from '@tabler/icons-react';
import { IconProgressDown } from '@tabler/icons-react';
import { IconBrush } from '@tabler/icons-react';
import { IconAdjustmentsCog } from '@tabler/icons-react';
import { IconUserExclamation } from '@tabler/icons-react';
import { IconDoor } from '@tabler/icons-react';
import { IconSun } from '@tabler/icons-react';
import { IconLogout2 } from '@tabler/icons-react';

export { Admin };

type AdminModalType = "addAdmin" | "door" | "led" | "system" | "url" | "update" | "theme" | null;
const currentVersion = import.meta.env.VITE_APP_VERSION as string;

const Admin = () => {
  const [, navigate] = useLocation();
  const [activeModal, setActiveModal] = useState<AdminModalType>(null);
  const [editorUrl, setEditorUrl] = useState<string>("");

  useEffect(() => {
    const initialize = async () => {
      try {
        await invoke("initialize_static_page_server");
        const url = (await invoke("return_editor_url")) as string | null;
        setEditorUrl(url ?? "Could not get url");
      } catch (e) {
        console.error("Failed to initialize static page server:", e);
      }
    };

    initialize();
  }, []);
  const optionTheme = { display: "flex", alignItems: "center", gap: "0.5rem" };

  const options: { [key: string]: PrimaryButtonProps } = {
    theme: {
      title: <div style={optionTheme}><IconBrush size={30} stroke={2} />Theme</div>,
      onClick: () => setActiveModal("theme"),
    },
    addAdmin: {
      title: <div style={optionTheme}><IconUserExclamation size={30} stroke={2} />Admins</div>,
      onClick: () => setActiveModal("addAdmin"),
    },
    led: {
      title: <div style={optionTheme}><IconSun size={30} stroke={2} />LED</div>,
      onClick: () => setActiveModal("led"),
    },
    door: {
      title: <div style={optionTheme}><IconDoor size={30} stroke={2} />Door</div>,
      onClick: () => setActiveModal("door"),
    },
    system: {
      title: <div style={optionTheme}><IconAdjustmentsCog size={30} stroke={2} />System</div>,
      onClick: () => setActiveModal("system"),
    },
    url: {
      title: <div style={optionTheme}><IconWorldUpload size={30} stroke={2} />Editor</div>,
      onClick: () => setActiveModal("url"),
    },
    update: {
      title: <div style={optionTheme}><IconProgressDown size={30} stroke={2} /> Update</div>,
      onClick: () => setActiveModal("update"),
    },
  };

  return (
    <main style={appStyles.body}>
      <p style={styles.versionText}>{currentVersion}</p>

      <KeyPressListener />
      <div style={styles.inner}>

        <h1 style={styles.heading}>Admin Panel</h1>

        <div style={styles.grid}>
          {Object.keys(options).map((key) => (
            <PrimaryButton key={key} {...options[key]} />
          ))}
        </div>

        <PrimaryButton
          title={
            <div style={optionTheme}>
              <IconLogout2 size={30} color="#a50000" stroke={2} />
              <p style={{ color: "#a50000" }}>Back</p>
            </div>
          }
          onClick={() => navigate("/")}
          size="xl"
        />
      </div>

      <AdminModal opened={activeModal === "addAdmin"} onClose={() => setActiveModal(null)} />
      <LedModal opened={activeModal === "led"} onClose={() => setActiveModal(null)} />
      <DoorModal opened={activeModal === "door"} onClose={() => setActiveModal(null)} />
      <SystemModal opened={activeModal === "system"} onClose={() => setActiveModal(null)} />

      <UrlModal
        opened={activeModal === "url"}
        onClose={() => setActiveModal(null)}
        editorUrl={editorUrl}
      />

      <UpdateModal
        opened={activeModal === "update"}
        onClose={() => setActiveModal(null)}
      />

      <ThemeSetter opened={activeModal === "theme"} onClose={() => setActiveModal(null)} />
    </main>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  inner: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "2rem",
    width: "100%",
    maxWidth: "900px",
  },
  heading: {
    fontSize: "3rem",
    marginBottom: "2rem",
  },
  grid: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: "1rem",
    marginBottom: "2rem",
  },
  versionText: {
    position: "absolute",
    display: 'flex',
    justifyContent: 'flex-start',
    bottom: "0rem",
    right: "1rem",
    color: "#ffffff",
    fontWeight: 600,
  },
};