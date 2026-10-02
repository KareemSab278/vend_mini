/*
    the helper is complete. but now is the hard part: 
        i need to get the live planogram data and then figure out the mapping.
            meaning i need to figure out how many rebdulls there are compared to a can of coke. theyre different widths.
                but since i have the live_distance, i can do the calculation on the fly here
                    - which sucks because it would have been better to have the mapping done in the hardware directly
        
    what is the planogram data going to look like? and how can i map it to the live_distance?
        should i ignore the count of cans and simply do the calulating here? only listen for when the count is 0 or 1?
            that might work out better...
*/

import { invoke } from "@tauri-apps/api/core";


// received from rust invoke. this is ONE column of cans
type CanCol = {
    column: number;
    count: number | null;
    live_distance: number | null;
};

type CanCount = CanCol[];

interface LivePollResult {
    counts: CanCount;
    cursor: number;
}

interface CansFunctions {
    Start: () => Promise<CanCount>;
    Stop: () => Promise<CanCount>;
    Listen: (seconds?: number) => Promise<CanCount>; // can have null/undefined seconds
    StartLive: () => Promise<number>;
    Poll: (cursor: number) => Promise<LivePollResult>;
}

export const Cans: CansFunctions = {
    Start: async (): Promise<CanCount> => {
        return await invoke<CanCount>("cans_listen", { command: "start" });
    },
    Stop: async (): Promise<CanCount> => {
        return await invoke<CanCount>("cans_listen", { command: "stop" });
    },
    Listen: async (seconds?: number): Promise<CanCount> => {
        return await invoke<CanCount>("cans_listen", {
            command: "listen",
            duration: seconds,
        });
    },
    StartLive: async (): Promise<number> => {
        return await invoke<number>("cans_listen_live_start");
    },
    Poll: async (cursor: number): Promise<LivePollResult> => {
        return await invoke<LivePollResult>("cans_listen_live_poll", { cursor });
    },
};
