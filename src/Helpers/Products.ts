const dev = import.meta.env.DEV;
import { invoke } from "@tauri-apps/api/core";

export type ProductType = {
  product_id: string;
  product_name: string;
  product_category: string;
  product_price: number;
  product_availability: boolean;
  count: number;
};

const Products = {
    fetchProducts: async () => {
        try {
            const products = await invoke("query_products") as ProductType[];
            return products;
        } catch (e) {
            console.error("Failed to fetch products:", e);
            return [];
        }
    },
    fetchCategories: async (): Promise<string[]> => {
        try {
            const categories = await invoke("get_categories") as string[];
            return categories;
        } catch (e) {
            console.error("Failed to fetch categories:", e);
            return [];
        }
    }
};

export { Products };