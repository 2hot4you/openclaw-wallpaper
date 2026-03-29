mod commands;
mod tray;
#[cfg(target_os = "windows")]
mod mouse_hook;
#[cfg(target_os = "windows")]
mod hidden_shell;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ));

    #[cfg(target_os = "windows")]
    {
        builder = builder.plugin(tauri_plugin_wallpaper::init());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            commands::openclaw::check_openclaw_status,
            commands::openclaw::start_openclaw,
            commands::openclaw::stop_openclaw,
            commands::openclaw::restart_openclaw,
            commands::openclaw::get_gateway_url,
            commands::openclaw::get_gateway_token,
            commands::openclaw::update_tray_status,
            commands::openclaw::update_tray_wallpaper,
            commands::wallpaper::attach_wallpaper,
            commands::wallpaper::detach_wallpaper,
            commands::wallpaper::is_wallpaper_supported,
        ])
        .setup(|app| {
            tray::create_tray(app)?;

            // Initialize hidden shell (Windows only) — persistent cmd.exe
            // with no window for executing all CLI commands
            #[cfg(target_os = "windows")]
            {
                if let Err(e) = hidden_shell::win::init() {
                    eprintln!("[OpenClaw Wallpaper] Failed to init hidden shell: {}", e);
                }
            }

            // Auto-start Gateway on app launch (in background)
            std::thread::spawn(|| {
                std::thread::sleep(std::time::Duration::from_secs(2));

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
