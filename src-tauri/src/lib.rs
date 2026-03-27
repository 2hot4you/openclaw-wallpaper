mod commands;
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            commands::openclaw::check_openclaw_status,
            commands::openclaw::start_openclaw,
            commands::openclaw::stop_openclaw,
            commands::openclaw::restart_openclaw,
            commands::openclaw::get_gateway_url,
            commands::openclaw::get_gateway_token,
            commands::openclaw::update_tray_status,
        ])
        .setup(|app| {
            tray::create_tray(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
