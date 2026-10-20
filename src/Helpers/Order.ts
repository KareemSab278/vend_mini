import { invoke } from "@tauri-apps/api/core";

type InsertOrderParams = {
    productId: number | string;
    quantity: number;
    price: number;
};

export const Order = {
    insertOrder: async ({ productId, quantity, price }: InsertOrderParams) => {
        try {
            await invoke("insert_order", {
                productId,
                quantity,
                price,
            });
        } catch (e) {
            console.error("Failed to insert order:", e);
        }
    },
};