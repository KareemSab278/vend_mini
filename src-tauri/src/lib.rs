use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
mod database;
pub mod motion_sensor;
pub mod nfc;
mod server;

const FLASK_BASE: &str = "http://127.0.0.1:8080";
const API_TOKEN: &str = "supersecret";

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

fn auth_header() -> String {
    format!("Bearer {}", API_TOKEN)
}

// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn initialize_database() -> Result<(), String> {
    database::initialize_database().map_err(|e| format!("Database initialization failed: {}", e))
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

    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
async fn terminate_payment() -> Result<(), String> {
    // comminucate with the Flask server to tell the nayax reader to stop waiting for payments
    let client = make_client()?;
    let _ = client
        .post(format!("{}/api/state/terminate", FLASK_BASE))
        .header("Authorization", auth_header())
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
        .header("Authorization", auth_header())
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
        .header("Authorization", auth_header())
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
            insert_order,
            query_products,
            // Product management
            delete_product,
            new_product,
            // Door
            get_door_status,
            // Utility
            kill_app,
            initialize_static_page_server,
            return_editor_url,
            install_deb
        ])
        .setup(|app| {
            #[cfg(desktop)]
            let _ = app
                .handle()
                .plugin(tauri_plugin_updater::Builder::new().build());

                motion_sensor::start_motion_listener(app.handle().clone());
                nfc::start_nfc_listener(app.handle().clone());

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app_handle, _event| {});
}
