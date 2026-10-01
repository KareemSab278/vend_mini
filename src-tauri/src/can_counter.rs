/*
    send "stop_listen" to arduino uno using serial communication to get back "{\"status\": \"stopped\"}"

    send "start_listen" to arduino uno using serial communication to get back "{\"status\": \"started\"}"
        then put the next lines of data for x seconds into a buffer for processing.
            buffer type <Vec<String>>
                then process the buffer into type: Vec<CanColCount>
                    Serial.print("\"column_");
                    Serial.print(i + 1);
                    Serial.print("\": ");
                    Serial.print(count);
*/


// save the buffer into ram and then process the buffer into json. return it
// need to make serial comms write to a buffer in RAM but thats something ill do a little later

use crate::serial_comms;
use serde::Deserialize;

#[derive(Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
struct CanColCount {
    column: u8, // no more than 20 columns anyway
    count: Option<u8>, // cant be more then 12 cans anyway so u8 is ok
}


enum CansCountCmds {
    StopListen,
    StartListen,
    ListenWithDuration(u8)
}

impl CansCountCmds {
    fn execute(&self) {
        match self {
            CansCountCmds::StopListen => {
                serial_comms::send("stop");
            }
            CansCountCmds::StartListen => {
                serial_comms::send("start");
            }
            CansCountCmds::ListenWithDuration(duration) => {
                serial_comms::send("start");
                std::thread::sleep(std::time::Duration::from_secs(*duration as u64));
                serial_comms::send("stop");
                // need to save the buffer somwehere here... 
            }
        }
    }
}


#[tauri::command]
pub async fn cans_listen(command: Option<String>) {
    let cmd = match command.as_deref() {
        Some("stop") => CansCountCmds::StopListen,
        Some("start") => CansCountCmds::StartListen,
        Some("listen") => CansCountCmds::ListenWithDuration(3),
        _ => return,
    };
    cmd.execute();
}

fn process_buffer(buffer: Vec<String>) -> Vec<CanColCount> {
    let mut result = Vec::new();
    for line in buffer {
        if let Ok(count) = serde_json::from_str::<CanColCount>(&line) {
            result.push(count);
        }
    }
    result
}