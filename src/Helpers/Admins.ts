import { invoke } from "@tauri-apps/api/core";

export type User = {
    user_id?: number; // can be undefined for inserts instead of updates
    tag_id: string;
    full_name: string;
    is_admin: boolean;
    balance: number;
};

export interface Response {
    success: boolean;
    message?: string;
}

export const Admin = {
    create: async (user: User): Promise<Response> => {
        try {
            await invoke("new_user", {
                tagId: user.tag_id,
                fullName: user.full_name,
                isAdmin: user.is_admin,
                balance: user.balance,
            });
            return { success: true, message: "User added successfully" };
        } catch (error) {
            return {
                success: false,
                message: typeof error === "string" ? error : "Failed to create user",
            };
        }
    },

    areAdminsPresent: async (): Promise<boolean> =>
        await invoke("are_admins_present") as boolean
    ,
};