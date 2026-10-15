import { LS } from "./LS";

/*
    some helpers here to configure the application
*/

const CAN_MODE_CHANGED_EVENT = "app-config:can-mode-changed";

export const AppConfig = {
    toggleCanMode: async (enabled: boolean): Promise<void> => {
        await LS.save("canOnlyMode", enabled);
        window.dispatchEvent(new CustomEvent(CAN_MODE_CHANGED_EVENT, { detail: enabled }));
    },
    getCanMode: async (): Promise<boolean> => (await LS.get("canOnlyMode", false)) === true,
    onCanModeChanged: (listener: (enabled: boolean) => void): (() => void) => {
        const handler = (event: Event) => {
            const enabled = (event as CustomEvent<unknown>).detail;
            if (typeof enabled === "boolean") listener(enabled);
        };
        window.addEventListener(CAN_MODE_CHANGED_EVENT, handler);
        return () => window.removeEventListener(CAN_MODE_CHANGED_EVENT, handler);
    },
};
