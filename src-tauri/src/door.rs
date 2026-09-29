/*
    This only works with CADLOCK door controllers and only ONE door.
    It searches all connected devices to the ports and when it finds the first door, it uses it
    If there is more than one door then youre on your own.
*/

use crate::led;
use crate::serial_comms as SRL_CMS;
use serde::Serialize;
use serde_json::Value;

#[derive(Serialize)]
pub struct DoorStatus {
    pub door: i8, // -1 means unknown/invalid door number!
    pub door_number: i8,
    pub lock: String,
    pub door_closed: bool,
    pub locked: bool,
    pub raw: String,
}

#[tauri::command]
pub async fn unlock_door() -> Result<(), String> {
    #[cfg(target_os = "linux")]
    SRL_CMS::broadcast_cmd_to_all_ports("u");
    #[cfg(target_os = "linux")]
    let _ = led::set_color_w_timeout(led::Color::Green, None).await; // defaults to 6 secs
    Ok(())
}

#[tauri::command]
pub async fn lock_door() -> Result<(), String> {
    SRL_CMS::broadcast_cmd_to_all_ports("l")
}

#[tauri::command]
pub async fn paid_unlock() -> Result<(), String> {
    let found_door = get_door_status().await?;

    let door_number = found_door.door_number;

    if !(1..=127).contains(&door_number) {
        return Err("Invalid door number".to_string());
    }

    let seconds_before_lock = 30;
    SRL_CMS::broadcast_cmd_to_all_ports(&format!("{}pu {}", door_number, seconds_before_lock))?;
    #[cfg(target_os = "linux")]
    let _ = led::set_color_w_timeout(led::Color::Green, None).await;
    Ok(())
}

fn parse_door_number_from_device_id(device_id: &str) -> i8 {
    let tail_digits: String = device_id
        .chars()
        .rev()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    if tail_digits.is_empty() {
        return -1;
    }
    tail_digits.parse::<i8>().unwrap_or(-1)
}

fn extract_device_id(raw: &str) -> Option<String> {
    if let Ok(v) = serde_json::from_str::<Value>(raw) {
        if let Some(text) = v["device_id"].as_str() {
            return Some(text.to_string());
        }
    }
    SRL_CMS::extract_field(raw, "device_id")
}

fn parse_door_status(raw: &str) -> DoorStatus {
    let mut door = "UNKNOWN".to_string();
    let mut lock = "UNKNOWN".to_string();
    let mut door_number = -1;

    if let Ok(v) = serde_json::from_str::<Value>(raw) {
        if let Some(text) = v["door"].as_str() {
            door = text.to_string();
        }
        if let Some(text) = v["lock"].as_str() {
            lock = text.to_string();
        }
        if let Some(text) = v["device_id"].as_str() {
            door_number = parse_door_number_from_device_id(text);
        }
    }

    if door == "UNKNOWN" {
        if let Some(text) = SRL_CMS::extract_field(raw, "door") {
            door = text;
        }
    }
    if lock == "UNKNOWN" {
        if let Some(text) = SRL_CMS::extract_field(raw, "lock") {
            lock = text;
        }
    }
    if door_number == -1 {
        if let Some(device_id) = extract_device_id(raw) {
            door_number = parse_door_number_from_device_id(&device_id);
        }
    }

    let door_closed = door.eq_ignore_ascii_case("CLOSED");
    let locked = lock.eq_ignore_ascii_case("LOCKED");

    DoorStatus {
        door: door_number,
        door_number,
        lock,
        door_closed,
        locked,
        raw: raw.to_string(),
    }
}

#[tauri::command]
pub async fn get_door_status() -> Result<DoorStatus, String> {
    let door = SRL_CMS::status();
    let raw = door.first().ok_or("No doors found")?;
    Ok(parse_door_status(raw))
}

#[tauri::command]
pub async fn get_all_doors_status() -> Result<Vec<DoorStatus>, String> {
    let all_doors_found = SRL_CMS::status();
    if all_doors_found.is_empty() {
        return Err("No doors found".to_string());
    }
    Ok(all_doors_found
        .iter()
        .map(|raw| parse_door_status(raw))
        .collect())
}

/*
    DO NOT USE IN FRONTEND
    this fn runs all the time and checks the door status every 3 seconds.
    door opens, set door open timestamp. door closes, set door close timestamp.
    door open timestamp - door close timestamp = duration the door was open.
    if duration > 30 seconds then set light red.
*/

#[tauri::command]
pub async fn monitor_door_status() {
    const DOOR_OPEN_DURATION_THRESHOLD: u8 = 28;
    use std::time::{Duration, Instant};
    let mut door_open_timestamp: Option<Instant> = None;

    let mut door_warning = false;

    loop {
        if let Ok(status) = get_door_status().await {
            if !status.door_closed {
                if door_open_timestamp.is_none() {
                    door_open_timestamp = Some(Instant::now());
                }

                if let Some(open_time) = door_open_timestamp {
                    if open_time.elapsed().as_secs() >= DOOR_OPEN_DURATION_THRESHOLD as u64 && !door_warning {
                        door_warning = true;

                        println!("Door has been open too long");

                        if let Err(e) = led::set_color(led::Color::Red).await {
                            eprintln!("Failed to set LED red: {}", e);
                        }
                    }
                }
            } else {
                door_open_timestamp = None;

                if door_warning {
                    door_warning = false;

                    if let Err(e) = led::set_color(led::Color::White).await {
                        eprintln!("Failed to set LED white: {}", e);
                    }
                }
            }
        }

        tokio::time::sleep(Duration::from_secs(3)).await;
    }
}
