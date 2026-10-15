use crate::serial_comms;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
pub struct CanDistanceReading {
    pub channel: u8,
    pub live_distance: Option<f32>,
}

enum CansCountCmds {
    StopListen,
    StartListen,
    ListenWithDuration(u8),
}

impl CansCountCmds {
    fn execute(&self) -> Result<Vec<CanDistanceReading>, String> {
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
    invoke('cans_listen', 'stop') to stop listening for distance readings.
    invoke('cans_listen', 'start') to start listening for distance readings.
    invoke('cans_listen', 'listen', seconds) to listen for distance readings for a default duration of 3 seconds.
*/

#[tauri::command]
pub async fn cans_listen(
    command: Option<String>,
    duration: Option<u8>,
) -> Result<Vec<CanDistanceReading>, String> {
    let cmd = match command.as_deref() {
        Some("stop") => CansCountCmds::StopListen,
        Some("start") => CansCountCmds::StartListen,
        Some("listen") => CansCountCmds::ListenWithDuration(duration.unwrap_or(3)),
        _ => return Err("invalid can-counter command".to_string()),
    };
    cmd.execute()
}

#[derive(Serialize, Debug)]
pub struct CanLivePoll {
    pub readings: Vec<CanDistanceReading>,
    pub cursor: u64,
}

#[tauri::command]
pub async fn cans_listen_live_start() -> Result<u64, String> {
    let connection = serial_comms::can_counter_connection()?;
    connection.send("start")
}
#[tauri::command]
pub async fn cans_listen_live_poll(cursor: u64) -> Result<CanLivePoll, String> {
    let connection = serial_comms::can_counter_connection()?;
    let (buffer, next_cursor) = connection.lines_since_with_seq(cursor)?;
    let readings = process_buffer(buffer);
    Ok(CanLivePoll {
        readings,
        cursor: next_cursor,
    })
}

fn process_buffer(buffer: Vec<String>) -> Vec<CanDistanceReading> {
    let buffer = buffer
        .iter()
        .flat_map(|line| parse_can_distance_line(line))
        .collect::<Vec<CanDistanceReading>>();
    buffer
}

fn parse_can_distance_line(line: &str) -> Vec<CanDistanceReading> {
    let trimmed = line.trim();

    if let Ok(readings) = serde_json::from_str::<Vec<CanDistanceReading>>(trimmed) {
        return readings;
    }

    if let Ok(reading) = serde_json::from_str::<CanDistanceReading>(trimmed) {
        return vec![reading];
    }

    // Some firmware emits each array item separately, leaving the final `]` on the item line.
    let object_fragment = trimmed.trim_end_matches(']').trim_end_matches(',').trim();
    if let Ok(reading) = serde_json::from_str::<CanDistanceReading>(object_fragment) {
        return vec![reading];
    }

    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::{parse_can_distance_line, CanDistanceReading};

    #[test]
    fn parses_arduino_distance_array() {
        let readings = parse_can_distance_line(
            r#"[{"channel":2,"live_distance":341.25},{"channel":3,"live_distance":469.0}]"#,
        );

        assert_eq!(readings.len(), 2);
        assert_eq!(readings[0].channel, 2);
        assert_eq!(readings[0].live_distance, Some(341.25));
        assert_eq!(readings[1].channel, 3);
        assert_eq!(readings[1].live_distance, Some(469.0));
    }

    #[test]
    fn serializes_live_distance_with_arduino_field_name() {
        let reading = CanDistanceReading {
            channel: 2,
            live_distance: Some(341.25),
        };

        let json = serde_json::to_string(&reading).unwrap();

        assert!(json.contains(r#""live_distance":341.25"#));
        assert!(!json.contains(r#""count""#));
    }
}
