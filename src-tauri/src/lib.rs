use dotenv::dotenv;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
mod database;
pub mod motion_sensor;
pub mod nfc;
mod server;
mod users_database;

const FLASK_BASE: &str = "http://127.0.0.1:8080";

static SERVER_STARTED: AtomicBool = AtomicBool::new(false);

#[derive(Serialize, Deserialize, Debug, Clone)]
struct BasketItem {
    id: u32,
    name: String,
    price: u32,
    qty: u32,
}

// ─────────────────────────────────────────────────────────────────────────────

fn make_client() -> Result<Client, String> {
    Client::builder()
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))
}

// Source - https://stackoverflow.com/q/62546180 (edited)
// Posted by elementory, modified by community. See post 'Timeline' for change history
// Retrieved 2026-04-16, License - CC BY-SA 4.0
fn get_api_token() -> String {
    dotenv().ok();
    let api_token = std::env::var("API_TOKEN");
    match api_token {
        Ok(token) => token.to_string(),
        Err(_) => {
            eprintln!("API_TOKEN not set");
            "".to_string()
        }
    }
}

// fn auth_header() -> String {
//     format!("Bearer {}", get_api_token())
// }

// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn initialize_database() -> Result<(), String> {
    database::initialize_database().map_err(|e| format!("Database initialization failed: {}", e))
}

// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn initialize_user_database() -> Result<(), String> {
    users_database::initialize_user_database()
        .map_err(|e| format!("User database initialization failed: {}", e))
}

// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn get_balance_by_tag_id(tag_id: String) -> Result<Option<f64>, String> {
    // success return f64 else string err
    users_database::get_balance_by_tag_id(&tag_id)
        .map_err(|e| format!("Failed to get balance: {}", e))
        .map(|balance| balance)
}

// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn update_balance_by_tag_id(tag_id: String, amount: f64) -> Result<f64, String> {
    // success return new balance else string err
    users_database::update_balance_by_tag_id(&tag_id, amount)
        .map_err(|e| format!("Failed to update balance: {}", e))
}

// ────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn get_tag_id() -> Result<String, String> {
    nfc::listen_for_tag_ids().map_err(|e| format!("Failed to get tag ID: {}", e))
}

// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn return_editor_url() -> String {
    server::return_editor_url()
}

// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn insert_order(product_id: i32, quantity: i32, price: f64) -> Result<(), String> {
    database::insert_order(product_id, quantity, price)
        .map_err(|e| format!("Failed to add order: {}", e))
}

// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn query_products() -> Result<Vec<database::Product>, String> {
    database::query_products().map_err(|e| format!("Failed to query products: {}", e))
}

// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn is_raspberry_pi() -> bool {
    return cfg!(all(target_arch = "arm", target_os = "linux"))
        || cfg!(all(target_arch = "aarch64", target_os = "linux"));
}

// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn initialize_payment_server() -> Result<(), String> {
    // must run cargo run --bin server before anything in this folder
    let project_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or("Failed to determine project root")?
        .to_path_buf();

    Command::new(if cfg!(target_os = "windows") {
        "python"
    } else {
        "python3"
    })
    .arg("app_vend.py")
    .current_dir(&project_root)
    .spawn()
    .map_err(|e| format!("Failed to spawn payment server: {}", e))?;


    // println!("Payment server process started successfully with api key: {}.", get_api_token());
    if get_api_token().is_empty() || get_api_token() == "" {
        eprintln!("Warning: API_TOKEN is not set. The payment server may reject requests without a valid token.");
    }

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn terminate_payment() -> Result<(), String> {
    // comminucate with the Flask server to tell the nayax reader to stop waiting for payments
    let client = make_client()?;
    let _ = client
        .post(format!("{}/api/state/terminate", FLASK_BASE))
        .header("Authorization", get_api_token())
        .send()
        .await
        .map_err(|e| format!("Failed to terminate payment: {}", e))?;
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn initialize_static_page_server() -> Result<(), String> {
    if SERVER_STARTED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_ok()
    {
        tokio::spawn(server::start());
    }
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn initiate_payment(slot: u32, items: Vec<BasketItem>) -> Result<String, String> {
    let client = make_client()?;

    let body = serde_json::json!({
        "slot": slot,
        "items": items,
    });

    // println!("initiate_payment fn called with slot: {}, items: {:?} and header as Authorization {}", slot, items, get_api_token());

    let resp = client
        .post(format!("{}/api/basket/pay", FLASK_BASE))
        .header("Authorization", get_api_token())
        .json(&body)
        .send()
        .await
        .map_err(|_| {
            format!("Payment request failed. Is app_vend.py running on :8080? Is api token set?")
        })?;

    resp.text()
        .await
        .map_err(|e| format!("Failed to read payment response: {}", e))
}

// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn new_product(
    product_name: &str,
    product_category: &str,
    product_price: f64,
    product_availability: bool,
) -> Result<(), String> {
    database::new_product(
        product_name,
        product_category,
        product_price,
        product_availability,
    )
    .map_err(|e| format!("Failed to add new product: {}", e))
}

// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn delete_product(product_id: i32) -> Result<(), String> {
    database::delete_product(product_id).map_err(|e| format!("Failed to delete product: {}", e))
}

// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn dispense_item(slot: u32, success: bool) -> Result<String, String> {
    let client = make_client()?;

    let body = serde_json::json!({
        "slot": slot,
        "success": success,
    });

    let resp = client
        .post(format!("{}/api/basket/dispense", FLASK_BASE))
        .header("Authorization", get_api_token())
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Dispense request failed: {}", e))?;

    resp.text()
        .await
        .map_err(|e| format!("Failed to read dispense response: {}", e))
}

// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn get_pay_state() -> Result<String, String> {
    let client = make_client()?;

    let resp = client
        .get(format!("{}/api/state", FLASK_BASE))
        .header("Authorization", get_api_token())
        .send()
        .await
        .map_err(|e| format!("State request failed: {}", e))?;

    resp.text()
        .await
        .map_err(|e| format!("Failed to read state response: {}", e))
}

// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn get_door_status() -> Result<String, String> {
    let client = make_client()?;
    let resp = client
        .get(format!("http://10.20.1.252/status"))
        .send()
        .await
        .map_err(|e| format!("Failed to get door status: {}", e))?;
    resp.text()
        .await
        .map_err(|e| format!("Failed to read door status response: {}", e))
}

// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn kill_app() -> Result<(), String> {
    std::process::exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn install_deb(path: String) -> Result<(), String> {
    Command::new("pkexec")
        .args(["dpkg", "-i", &path])
        .spawn()
        .map_err(|e| format!("Failed to run dpkg: {}", e))?
        .wait()
        .map_err(|e| format!("dpkg failed: {}", e))?;
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            dispense_item,
            // Flask bridge commands & Payment
            initiate_payment,
            get_pay_state,
            initialize_payment_server,
            terminate_payment,
            // DB related commands
            initialize_database,
            initialize_user_database,
            insert_order,
            query_products,
            get_balance_by_tag_id,
            update_balance_by_tag_id,
            // Product management
            delete_product,
            new_product,
            // Door
            get_door_status,
            // NFC
            get_tag_id,
            // Utility
            kill_app,
            initialize_static_page_server,
            return_editor_url,
            install_deb,
            is_raspberry_pi
        ])
        .setup(|app| {
            #[cfg(desktop)]
            let _ = app
                .handle()
                .plugin(tauri_plugin_updater::Builder::new().build());

            // println!("Auth header: {}", get_api_token());

            motion_sensor::start_motion_listener(app.handle().clone());

            nfc::start_nfc_listener(app.handle().clone());

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app_handle, _event| {});
}
