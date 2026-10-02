/*
    this helper method will listen to rust for can detection events and provide updates accordingly.

    will return the number of cans per column.

    there should be a planogram here received from the cad backend. dont know the structure yet...
    
    the plaogram should be mapped to the cans map and then identify which cans are in the correct positions
    
    so planogram says coke is in column 1, we should check if the detected cans match this arrangement
        - if 5 cans in col 1 we can safely assume these cans are coke. this depends if set up correctly
    
    will code the stuff soon
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


/*
    Frontend usage:
    invoke('cans_listen', 'stop') to stop listening for can counts.
    invoke('cans_listen', 'start') to start listening for can counts.
    invoke('cans_listen', 'listen', seconds) to listen for can counts for a default duration of 3 seconds.

    #[tauri::command]
    pub async fn cans_listen(command: Option<String>, duration: Option<u8>) -> Result<String, String> {
        let cmd = match command.as_deref() {
            Some("stop") => CansCountCmds::StopListen,
            Some("start") => CansCountCmds::StartListen,
            Some("listen") => CansCountCmds::ListenWithDuration(duration.unwrap_or(3)),
            _ => return Err("invalid can-counter command".to_string()),
        };
        cmd.execute()
    }
*/

const Cans: CansFunctions = {
    Start: async (): Promise<CanCount> => {
        return await invoke<CanCount>("cans_listen", { command: "start" });
    },
    Stop: async (): Promise<CanCount> => {
        return await invoke<CanCount>("cans_listen", { command: "stop" });
    },
    // this is the fn you want to use - it listens and returns the data you need
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

export default Cans;


