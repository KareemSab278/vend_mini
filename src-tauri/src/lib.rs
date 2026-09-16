use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
mod config;
mod database;
mod door;
pub mod nfc;
mod pay;
mod serial_comms;
mod server;
mod users_database;

static SERVER_STARTED: AtomicBool = AtomicBool::new(false);

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
            // Payment (direct serial PicoVend/Nayax bridge)
            pay::initialize_payment_device,
            pay::start_payment,
            pay::end_payment,
            pay::kill_payment,
            // Doors (direct serial CADLOCK controllers)
            door::unlock_door,
            door::lock_door,
            door::paid_unlock_door,
            door::paid_unlock_all_doors,
            door::get_all_doors_status,
            // Serial utilities
            serial_comms::get_all_serial_ports,
            serial_comms::kill_polling,
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

            nfc::start_nfc_listener(app.handle().clone());

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app_handle, _event| {});
}
