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

use crate::serial_comms;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
struct CanColCount {
    column: u8, // no more than 20 columns anyway
    count: Option<u8>, // cant be more then 12 cans anyway so u8 is ok
}

enum CansCountCmds {
    StopListen,
    StartListen,
    ListenWithDuration(u8),
}

impl CansCountCmds {
    fn execute(&self) -> Result<String, String> {
        let connection = serial_comms::can_counter_connection()?;
        match self {
            CansCountCmds::StopListen => {
                connection.send("stop")?;
                Ok("{\"status\":\"stopped\"}".to_string())
            }
            CansCountCmds::StartListen => {
                connection.send("start")?;
                Ok("{\"status\":\"started\"}".to_string())
            }
            CansCountCmds::ListenWithDuration(duration) => {
                let cursor = connection.send("start")?;
                std::thread::sleep(std::time::Duration::from_secs(*duration as u64));
                let stop_cursor = connection.send("stop")?;
                let _ = connection.wait_for_any(
                    stop_cursor,
                    &["{\"status\""],
                    &[],
                    1_000,
                    || false,
                );
                let buffer = connection.lines_since(cursor)?;
                Ok(process_buffer(buffer))
            }
        }
    }
}

#[tauri::command]
pub async fn cans_listen(command: Option<String>) -> Result<String, String> {
    let cmd = match command.as_deref() {
        Some("stop") => CansCountCmds::StopListen,
        Some("start") => CansCountCmds::StartListen,
        Some("listen") => CansCountCmds::ListenWithDuration(3),
        _ => return Err("invalid can-counter command".to_string()),
    };
    cmd.execute()
}

fn process_buffer(buffer: Vec<String>) -> String {
    let counts: Vec<CanColCount> = buffer
        .iter()
        .filter_map(|line| parse_can_count_line(line))
        .collect();
    serde_json::to_string(&counts).unwrap_or_else(|_| "[]".to_string())
}

fn parse_can_count_line(line: &str) -> Option<CanColCount> {
    if let Ok(count) = serde_json::from_str::<CanColCount>(line) {
        return Some(count);
    }

    let trimmed = line.trim();
    if trimmed.starts_with("\"column_") {
        let key_end = trimmed.find("\":")?;
        let key = &trimmed[1..key_end];
        let col_str = key.strip_prefix("column_")?;
        let column = col_str.parse().ok()?;
        let value_part = trimmed[key_end + 2..].trim().trim_end_matches(',');
        let count = value_part.parse().ok();
        return Some(CanColCount { column, count });
    }

    None
}