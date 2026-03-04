use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::process::Command;

// ── MDB bridge connection ──────────────────────────────────────────────────────
// The Python app_vend.py Flask server runs on :8080 and handles all serial
// communication with the PicoVend EZ Bridge hardware.
// Tauri acts purely as an HTTP client — no direct serial access needed here.
const FLASK_BASE: &str = "http://127.0.0.1:8080";
const API_TOKEN: &str = "supersecret"; // matches API_TOKEN env-var default in app_vend.py

// ── Basket item (matches Flask API format) ────────────────────────────────────
// `price` is a scaled integer: £1.25 → 125, 50p → 50 (same unit Flask uses)
#[derive(Serialize, Deserialize, Debug, Clone)]
struct BasketItem {
    id: u32,
    name: String,
    price: u32,
    qty: u32,
}

fn make_client() -> Result<Client, String> {
    Client::builder()
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))
}

fn auth_header() -> String {
    format!("Bearer {}", API_TOKEN)
}

#[tauri::command]
async fn kill_app() -> Result<(), String> {
    std::process::exit(0);
}

// in order to run this command youll need to first run:
// sudo apt install python3-flask python3-serial
#[tauri::command]
async fn initialize_payment_server() -> Result<(), String> {
    let project_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or("Failed to determine project root")?
        .to_path_buf();

    Command::new("python3")
        .arg("app_vend.py")
        .current_dir(&project_root)
        .spawn()
        .map_err(|e| format!("Failed to spawn payment server: {}", e))?;

    std::thread::sleep(std::time::Duration::from_secs(2));
    Ok(())
}

// ── COMMAND: start contactless payment flow ───────────────────────────────────
// Calls POST /api/basket/pay on the Flask bridge.
// Flask spawns a background thread that does RESET→ENABLE→VNDREQ and waits
// for the customer to tap their card (VNDAPP unsolicited message).
// Returns {"ok": true} immediately if accepted; the actual approval comes
// asynchronously — poll get_pay_state until state.pay.approved == true.
#[tauri::command]
async fn initiate_payment(slot: u32, items: Vec<BasketItem>) -> Result<String, String> {
    let client = make_client()?;

    let body = serde_json::json!({
        "slot": slot,
        "items": items,
    });

    let resp = client
        .post(format!("{}/api/basket/pay", FLASK_BASE))
        .header("Authorization", auth_header())
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Payment request failed — is app_vend.py running on :8080? ({})",
                e
            )
        })?;

    resp.text()
        .await
        .map_err(|e| format!("Failed to read payment response: {}", e))
}

// ── COMMAND: report one item dispensed ───────────────────────────────────────
// Calls POST /api/basket/dispense.
// Each call sends VNDSUCC/VNDFAIL for one item and returns:
//   {"ok": true, "done": false, "remaining": N}  — more items pending
//   {"ok": true, "done": true,  "remaining": 0}  — basket complete
// Call in a loop (success=true) until done=true.
#[tauri::command]
async fn dispense_item(slot: u32, success: bool) -> Result<String, String> {
    let client = make_client()?;

    let body = serde_json::json!({
        "slot": slot,
        "success": success,
    });

    let resp = client
        .post(format!("{}/api/basket/dispense", FLASK_BASE))
        .header("Authorization", auth_header())
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Dispense request failed: {}", e))?;

    resp.text()
        .await
        .map_err(|e| format!("Failed to read dispense response: {}", e))
}

// ── COMMAND: poll bridge state (used to detect card-tap approval) ─────────────
// Calls GET /api/state.
// Key fields the frontend watches:
//   state.pay.approved    — true once VNDAPP received from card reader
//   state.pay.in_progress — true while pay_flow thread is running
//   state.pay.last_status — human-readable status string
//   state.pay.last_error  — non-empty if something went wrong
#[tauri::command]
async fn get_pay_state() -> Result<String, String> {
    let client = make_client()?;

    let resp = client
        .get(format!("{}/api/state", FLASK_BASE))
        .header("Authorization", auth_header())
        .send()
        .await
        .map_err(|e| format!("State request failed: {}", e))?;

    resp.text()
        .await
        .map_err(|e| format!("Failed to read state response: {}", e))
}

// #[tauri::command]
// fn go_fullscreen(window: tauri::Window) {
//     thread::spawn(move || {
//         thread::sleep(Duration::from_secs(2));
//         window.set_fullscreen(true).unwrap();
//     });
// }

// ─────────────────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            initiate_payment,
            dispense_item,
            get_pay_state,
            initialize_payment_server,
            kill_app,
            // go_fullscreen
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
