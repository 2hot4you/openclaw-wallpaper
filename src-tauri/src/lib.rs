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

            // Auto-start Gateway on app launch (in background)
            std::thread::spawn(|| {
                // Small delay to let the app window init first
                std::thread::sleep(std::time::Duration::from_secs(2));

                // Check if gateway is already running via health endpoint
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build();
                if let Ok(rt) = rt {
                    let already_running = rt.block_on(async {
                        match reqwest::get("http://127.0.0.1:18789/health").await {
                            Ok(resp) if resp.status().is_success() => true,
                            _ => false,
                        }
                    });

                    if !already_running {
                        println!("[OpenClaw Wallpaper] Gateway not running, starting...");
                        if let Err(e) = commands::openclaw::run_openclaw_hidden(&["gateway", "start"]) {
                            eprintln!("[OpenClaw Wallpaper] Failed to auto-start gateway: {}", e);
                        } else {
                            println!("[OpenClaw Wallpaper] Gateway start command sent");
                        }
                    } else {
                        println!("[OpenClaw Wallpaper] Gateway already running");
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
