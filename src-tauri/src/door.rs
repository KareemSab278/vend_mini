// Communicates with CADLOCK door controllers through the persistent, role-aware serial manager.
// Commands are CRLF-terminated and are never sent to the PicoVend payment bridge.

use crate::serial_comms as SRL_CMS;
use serde::Serialize;
use serde_json::{json, Value};

#[derive(Serialize)]
pub struct DoorStatus {
    pub door: i8, // -1 means unknown/invalid door number
    pub door_number: i8,
    pub lock: String,
    pub door_closed: bool,
    pub locked: bool,
    pub raw: String,
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

#[tauri::command]
pub async fn unlock_door(door: Option<u8>) -> Result<(), String> {
    // if door is None, it means unlock all doors. If Some(0), also means unlock all doors. If Some(n), unlock door n.
    let door = door.unwrap_or(0);

    if door == 0 {
        return SRL_CMS::broadcast_cmd_to_all_ports("u");
    } else {
        SRL_CMS::broadcast_cmd_to_all_ports(format!("{}u", door).as_str())
    }
}

#[tauri::command]
pub async fn lock_door(door: Option<u8>) -> Result<(), String> {
    let door = door.unwrap_or(0);

    if door == 0 {
        return SRL_CMS::broadcast_cmd_to_all_ports("l");
    } else {
        SRL_CMS::broadcast_cmd_to_all_ports(format!("{}l", door).as_str())
    }
}

#[tauri::command]
pub async fn paid_unlock_door(door: u8, millis: Option<u16>) -> Result<(), String> {
    let mut seconds = millis.unwrap_or(30);

    if seconds >= u16::MAX || seconds == 0 {
        seconds = 30;
    }

    SRL_CMS::broadcast_cmd_to_all_ports(&format!("{}pu {}", door, seconds))
}

#[tauri::command]
pub async fn paid_unlock_all_doors(millis: Option<u16>) -> Result<(), String> {
    let seconds = millis.unwrap_or(30);

    let doors = get_all_doors_status().await?;

    for door in doors
        .as_array()
        .ok_or("Expected doors to be a JSON array")?
    {
        let door_number = door["door_number"]
            .as_i64()
            .ok_or("Expected door_number to be an integer")?;

        if !(1..=127).contains(&door_number) {
            continue; // 0 or 128 or anything else invalid - skip. dont send 0pu because no door is 0.
        }

        paid_unlock_door(door_number as u8, Some(seconds)).await?;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_all_doors_status() -> Result<serde_json::Value, String> {
    let raws = SRL_CMS::status();

    let statuses: Vec<serde_json::Value> = raws
        .iter()
        .map(|raw| {
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

            json!(DoorStatus {
                door: door_number,
                door_number,
                lock,
                door_closed,
                locked,
                raw: raw.to_string(),
            })
        })
        .collect();

    Ok(serde_json::Value::Array(statuses))
}
