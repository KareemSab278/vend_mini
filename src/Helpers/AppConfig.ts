/*
    some helpers here to configure the application

    it also gets the cpu uid

    it also gets the machine id based on the cpu uid and saves it in ls for future use
*/

import { LS } from "./LS";
import { invoke } from "@tauri-apps/api/core";
import { API } from "./API";

const CAN_MODE_CHANGED_EVENT = "app-config:can-mode-changed";
const dev = import.meta.env.DEV;

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
    findCpuId: async (): Promise<void> => {
        const uid = await invoke<string>("environment::get_cpu_uid");
        await LS.save("cpuId", uid);
    },
    getCpuId: async (): Promise<string> => {
        return await LS.get("cpuId", "");
    },
    findMachineId: async (): Promise<void> => {
        const cpuId = await AppConfig.getCpuId();
        const machineId = await API.actionPost('machine_id', { device_uid: cpuId });
        dev && console.log('Machine ID:', machineId);
        await LS.save("machineId", machineId);
    },
    // cache the machine ID for future use - reduce load on the backend
    getMachineId: async (): Promise<string> => await LS.get("machineId", "")
};
