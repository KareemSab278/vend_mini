mod config;
mod database;
mod door;
mod images;
pub mod nfc;
mod pay;
mod serial_comms;
mod server;
mod update;
mod users_database;

#[tauri::command]
async fn kill_app() -> Result<(), String> {
    std::process::exit(0);
}

#[tauri::command]
async fn is_raspberry_pi() -> bool {
    cfg!(all(target_arch = "arm", target_os = "linux"))
        || cfg!(all(target_arch = "aarch64", target_os = "linux"))
}

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
            door::paid_unlock,
            door::get_door_status,
            door::get_all_doors_status,
            // Serial utilities
            serial_comms::get_all_serial_ports,
            serial_comms::kill_polling,
            // DB related commands
            database::initialize_database,
            database::insert_order,
            database::query_products,
            // User DB
            users_database::initialize_user_database,
            users_database::are_admins_present,
            users_database::new_user,
            users_database::get_all_admins,
            // Product management
            database::new_product,
            database::delete_product,
            database::get_categories,
            // Users / balance
            users_database::get_balance_by_tag_id,
            users_database::update_balance_by_tag_id,
            // NFC
            nfc::get_tag_id,
            // Utility
            kill_app,
            update::install_update, // get latest updates
            update::install_update_with_password, // sudo password fallback
            server::initialize_static_page_server,
            server::return_editor_url,
            images::list_images_command,
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
