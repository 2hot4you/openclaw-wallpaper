use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};
use tauri_plugin_autostart::ManagerExt;

/// Shared state for tray status tracking.
pub struct TrayState {
    pub is_online: AtomicBool,
    pub autostart_enabled: AtomicBool,
}

impl Default for TrayState {
    fn default() -> Self {
        Self {
            is_online: AtomicBool::new(false),
            autostart_enabled: AtomicBool::new(false),
        }
    }
}

pub fn create_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tray state
    let tray_state = Arc::new(TrayState::default());
    app.manage(tray_state.clone());

    // Check if autostart is enabled
    let autostart_enabled = {
        let autostart = app.autolaunch();
        autostart.is_enabled().unwrap_or(false)
    };
    tray_state
        .autostart_enabled
        .store(autostart_enabled, Ordering::Relaxed);

    build_tray_menu(app.handle(), false, autostart_enabled)?;

    Ok(())
}

/// Build (or rebuild) the tray menu with current status.
fn build_tray_menu(
    handle: &AppHandle,
    is_online: bool,
    autostart_enabled: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let title_text = if is_online {
        "🟢 OpenClaw: Running"
    } else {
        "🔴 OpenClaw: Offline"
    };

    let title = MenuItemBuilder::with_id("title", title_text)
        .enabled(false)
        .build(handle)?;

    let refresh = MenuItemBuilder::with_id("refresh", "🔄 刷新状态").build(handle)?;

    let toggle_text = if is_online {
        "⏹️ 停止 OpenClaw"
    } else {
        "▶️ 启动 OpenClaw"
    };
    let toggle_openclaw =
        MenuItemBuilder::with_id("toggle_openclaw", toggle_text).build(handle)?;

    let autostart = CheckMenuItemBuilder::with_id("autostart", "🚀 开机自启")
        .checked(autostart_enabled)
        .build(handle)?;

    let quit = MenuItemBuilder::with_id("quit", "退出").build(handle)?;

    let menu = MenuBuilder::new(handle)
        .item(&title)
        .separator()
        .item(&refresh)
        .item(&toggle_openclaw)
        .separator()
        .item(&autostart)
        .separator()
        .item(&quit)
        .build()?;

    // Try to remove existing tray, ignore if not found
    let _ = handle.remove_tray_by_id("main-tray");

    TrayIconBuilder::with_id("main-tray")
        .icon(handle.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| {
            let id = event.id();
            match id.as_ref() {
                "quit" => {
                    app.exit(0);
                }
                "refresh" => {
                    // Emit event for frontend to handle refresh
                    let _ = app.emit("tray-refresh-status", ());
                }
                "toggle_openclaw" => {
                    let state = app.state::<Arc<TrayState>>();
                    let currently_online = state.is_online.load(Ordering::Relaxed);
                    if currently_online {
                        let _ = app.emit("tray-stop-openclaw", ());
                    } else {
                        let _ = app.emit("tray-start-openclaw", ());
                    }
                }
                "autostart" => {
                    let state = app.state::<Arc<TrayState>>();
                    let current = state.autostart_enabled.load(Ordering::Relaxed);
                    let new_val = !current;
                    state.autostart_enabled.store(new_val, Ordering::Relaxed);

                    // Toggle autostart via plugin
                    let autostart = app.autolaunch();
                    if new_val {
                        let _ = autostart.enable();
                    } else {
                        let _ = autostart.disable();
                    }
                }
                _ => {}
            }
        })
        .build(handle)?;

    Ok(())
}

/// Update tray menu to reflect current Gateway status.
/// Called from IPC or event handlers.
pub fn update_tray_status(handle: &AppHandle, is_online: bool) {
    if let Some(state) = handle.try_state::<Arc<TrayState>>() {
        state.is_online.store(is_online, Ordering::Relaxed);
        let autostart = state.autostart_enabled.load(Ordering::Relaxed);
        let _ = build_tray_menu(handle, is_online, autostart);
    }
}
