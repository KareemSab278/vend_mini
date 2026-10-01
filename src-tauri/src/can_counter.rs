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
use serde_json::Value;

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
pub struct CanColCount {
    pub column: u8,    // no more than 20 columns anyway
    pub count: Option<u8>, // cant be more then 12 cans anyway so u8 is ok
}

enum CansCountCmds {
    StopListen,
    StartListen,
    ListenWithDuration(u8),
}

impl CansCountCmds {
    fn execute(&self) -> Result<Vec<CanColCount>, String> {
        let connection = serial_comms::can_counter_connection()?;
        match self {
            CansCountCmds::StopListen => {
                connection.send("stop")?;
                Ok(Vec::new())
            }
            CansCountCmds::StartListen => {
                connection.send("start")?;
                Ok(Vec::new())
            }
            CansCountCmds::ListenWithDuration(duration) => {
                let cursor = connection.send("start")?;
                std::thread::sleep(std::time::Duration::from_secs(*duration as u64));
                let stop_cursor = connection.send("stop")?;
                let _ = connection.wait_for_any(
                    stop_cursor,
                    &["{\"status\""],
                    &[],
                    200, // should show up in the buffer within this time frame - instant
                    || false,
                );
                let buffer = connection.lines_since(cursor)?;
                Ok(process_buffer(buffer))
            }
        }
    }
}

/*
    Frontend usage:
    invoke('cans_listen', 'stop') to stop listening for can counts.
    invoke('cans_listen', 'start') to start listening for can counts.
    invoke('cans_listen', 'listen', seconds) to listen for can counts for a default duration of 3 seconds.
*/

#[tauri::command]
pub async fn cans_listen(
    command: Option<String>,
    duration: Option<u8>,
) -> Result<Vec<CanColCount>, String> {
    let cmd = match command.as_deref() {
        Some("stop") => CansCountCmds::StopListen,
        Some("start") => CansCountCmds::StartListen,
        Some("listen") => CansCountCmds::ListenWithDuration(duration.unwrap_or(3)),
        _ => return Err("invalid can-counter command".to_string()),
    };
    cmd.execute()
}

fn process_buffer(buffer: Vec<String>) -> Vec<CanColCount> {
    let buffer = buffer
        .iter()
        .filter_map(|line| parse_can_count_line(line))
        .collect::<Vec<CanColCount>>();
    println!("Processed buffer: {:?}", buffer);
    buffer
}

fn parse_can_count_line(line: &str) -> Option<CanColCount> {
    let trimmed = line.trim();

    // Try the canonical form: {"column": 1, "count": 3}
    if let Ok(count) = serde_json::from_str::<CanColCount>(trimmed) {
        return Some(count);
    }

    // Try the Arduino object form: {"column_1": 3} or {"section_1": 3}
    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        if let Some(obj) = value.as_object() {
            for (key, val) in obj {
                let column = key
                    .strip_prefix("column_")
                    .or_else(|| key.strip_prefix("section_"))
                    .and_then(|s| s.parse().ok());
                if let Some(column) = column {
                    let count = val.as_u64().map(|n| n as u8);
                    return Some(CanColCount { column, count });
                }
            }
        }
    }

    // Fallback for raw fragments like "column_1": 3 (missing braces)
    if trimmed.starts_with("\"column_") || trimmed.starts_with("\"section_") {
        let key_end = trimmed.find("\":")?;
        let key = &trimmed[1..key_end];
        let column = key
            .strip_prefix("column_")
            .or_else(|| key.strip_prefix("section_"))
            .and_then(|s| s.parse().ok())?;
        let value_part = trimmed[key_end + 2..].trim().trim_end_matches(',');
        let count = value_part.parse().ok();
        return Some(CanColCount { column, count });
    }

    None
}