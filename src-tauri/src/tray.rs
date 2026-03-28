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
    pub wallpaper_attached: AtomicBool,
}

impl Default for TrayState {
    fn default() -> Self {
        Self {
            is_online: AtomicBool::new(false),
            autostart_enabled: AtomicBool::new(false),
            wallpaper_attached: AtomicBool::new(false),
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

    // Build menu
    let menu = build_tray_menu(app.handle(), false, autostart_enabled, false)?;

    // Create tray icon ONCE — never recreate, only swap menus
    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| {
            let id = event.id();
            match id.as_ref() {
                "quit" => {
                    app.exit(0);
                }
                "refresh" => {
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
                "toggle_wallpaper" => {
                    let _ = app.emit("tray-toggle-wallpaper", ());
                }
                "autostart" => {
                    let state = app.state::<Arc<TrayState>>();
                    let current = state.autostart_enabled.load(Ordering::Relaxed);
                    let new_val = !current;
                    state.autostart_enabled.store(new_val, Ordering::Relaxed);

                    let autostart = app.autolaunch();
                    if new_val {
                        let _ = autostart.enable();
                    } else {
                        let _ = autostart.disable();
                    }

                    // Refresh tray menu to update checkbox
                    refresh_tray_menu(app);
                }
                _ => {}
            }
        })
        .build(app.handle())?;

    Ok(())
}

/// Build a tray menu (returns the Menu, does NOT create/recreate tray icon).
fn build_tray_menu(
    handle: &AppHandle,
    is_online: bool,
    autostart_enabled: bool,
    wallpaper_attached: bool,
) -> Result<tauri::menu::Menu<tauri::Wry>, Box<dyn std::error::Error>> {
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

    // Wallpaper mode toggle (Windows only)
    #[cfg(target_os = "windows")]
    let wallpaper_text = if wallpaper_attached {
        "🖼️ 切换为窗口模式"
    } else {
        "🖥️ 切换为壁纸模式"
    };
    #[cfg(not(target_os = "windows"))]
    let wallpaper_text = {
        let _ = wallpaper_attached;
        "🖥️ 壁纸模式 (仅 Windows)"
    };

    let toggle_wallpaper = MenuItemBuilder::with_id("toggle_wallpaper", wallpaper_text)
        .enabled(cfg!(target_os = "windows"))
        .build(handle)?;

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
        .item(&toggle_wallpaper)
        .item(&autostart)
        .separator()
        .item(&quit)
        .build()?;

    Ok(menu)
}

/// Refresh the tray menu (swap menu on existing tray icon, no recreation).
fn refresh_tray_menu(handle: &AppHandle) {
    let Some(state) = handle.try_state::<Arc<TrayState>>() else {
        return;
    };
    let is_online = state.is_online.load(Ordering::Relaxed);
    let autostart = state.autostart_enabled.load(Ordering::Relaxed);
    let wallpaper = state.wallpaper_attached.load(Ordering::Relaxed);

    if let Ok(menu) = build_tray_menu(handle, is_online, autostart, wallpaper) {
        if let Some(tray) = handle.tray_by_id("main-tray") {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

/// Update tray menu to reflect current Gateway status.
pub fn update_tray_status(handle: &AppHandle, is_online: bool) {
    if let Some(state) = handle.try_state::<Arc<TrayState>>() {
        state.is_online.store(is_online, Ordering::Relaxed);
        refresh_tray_menu(handle);
    }
}

/// Update tray menu to reflect wallpaper mode status.
pub fn update_tray_wallpaper(handle: &AppHandle, attached: bool) {
    if let Some(state) = handle.try_state::<Arc<TrayState>>() {
        state.wallpaper_attached.store(attached, Ordering::Relaxed);
        refresh_tray_menu(handle);
    }
}
