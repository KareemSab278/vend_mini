import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

const toggleFullScreen = async () => {
  const window = getCurrentWindow();
  const isFullscreen = await window.isFullscreen();
  await window.setFullscreen(!isFullscreen);
};

export const appKeyMap: Record<string, () => void | Promise<void>> = {
  "Control+q": () => invoke("kill_app"),
  "Control+f": toggleFullScreen,
};

export const KeyPressListener = () => {
    useEffect(() => {
        const handleKeyPressEvent = (event: KeyboardEvent) => {
            const keyString = `${event.ctrlKey ? "Control+" : ""}${event.key}`;
            const action = appKeyMap[keyString];
            if (!action) return;
            action();
            event.preventDefault();
        };

        window.addEventListener("keydown", handleKeyPressEvent);
        return () => window.removeEventListener("keydown", handleKeyPressEvent);
    }, []);

    return null;
};
