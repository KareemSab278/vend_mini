const dev = import.meta.env.DEV;

import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

interface PaymentFunctions {
    initialize: () => Promise<string>, // initialize payment device - returns the connected serial port name on success
    start: (amount: number, onResult: (success: boolean) => void) => Promise<void>, // start payment with amount and get result in callback
    end: (success: boolean) => Promise<void>, // settle the payment as approved or failed
    cancel: () => Promise<void>, // kill the in-progress payment
}

let paymentPort: string | null = null;
let currentUnlisten: UnlistenFn | undefined;

export const Payment: PaymentFunctions = {

    initialize: async (): Promise<string> => {
        try {
            const port = await invoke<string>("initialize_payment_device");
            dev && console.log("Payment device initialized on port:", port);
            paymentPort = port;
            return port;
        } catch (error) {
            dev && console.error("Error initializing payment device:", error);
            throw error;
        }
    },

    end: async (success: boolean): Promise<void> => {
        if (!paymentPort) {
            dev && console.error("Payment port not initialized");
            return;
        }
        await invoke("end_payment", { paymentPort, success });
    },

    cancel: async (): Promise<void> => {
        if (!paymentPort) {
            dev && console.error("Payment port not initialized");
            return;
        }
        currentUnlisten?.();
        currentUnlisten = undefined;
        await invoke("kill_payment", { paymentPort });
    },

    start: async (amount: number, onResult: (success: boolean) => void): Promise<void> => {
        try {
            if (!paymentPort) {
                dev && console.error("Payment port not initialized");
                onResult(false);
                return;
            }

            currentUnlisten?.();
            currentUnlisten = await listen<boolean>("payment-result", (event) => {
                currentUnlisten?.();
                currentUnlisten = undefined;
                onResult(event.payload);
            });
            await invoke("start_payment", { paymentPort, amount });
        } catch (error) {
            currentUnlisten?.();
            currentUnlisten = undefined;
            dev && console.error("Error starting payment:", error);
            onResult(false);
        }
    }
};
