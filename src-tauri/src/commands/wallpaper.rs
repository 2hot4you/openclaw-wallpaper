use tauri::{AppHandle, Manager};

/// Enter wallpaper mode.
///
/// Makes the window act as a desktop wallpaper:
/// - Fullscreen, no decorations, hidden from taskbar
/// - Always on bottom (behind all other windows)
///
/// The window is fully interactive when the desktop is focused
/// (click empty desktop area or press Win+D). Other windows
/// naturally cover it when opened.
///
/// NOTE: We do NOT use WorkerW attach because WorkerW places the
/// window under the desktop icon layer, which completely blocks
/// all mouse events. There is no reliable workaround short of
/// installing a global mouse hook (like Lively Wallpaper does).
#[tauri::command]
pub async fn attach_wallpaper(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main")
        .ok_or("Main window not found")?;

    // Order matters: set bottom AFTER fullscreen to avoid z-order race
    window.set_decorations(false).map_err(|e| e.to_string())?;
    window.set_skip_taskbar(true).map_err(|e| e.to_string())?;
    window.set_fullscreen(true).map_err(|e| e.to_string())?;

    // Small delay to let fullscreen settle before setting z-order
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    window.set_always_on_bottom(true).map_err(|e| e.to_string())?;

    Ok(())
}

/// Exit wallpaper mode, restore normal window.
#[tauri::command]
pub async fn detach_wallpaper(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main")
        .ok_or("Main window not found")?;

    window.set_always_on_bottom(false).map_err(|e| e.to_string())?;
    window.set_fullscreen(false).map_err(|e| e.to_string())?;
    window.set_decorations(true).map_err(|e| e.to_string())?;
    window.set_skip_taskbar(false).map_err(|e| e.to_string())?;

    use tauri::LogicalSize;
    window.set_size(tauri::Size::Logical(LogicalSize { width: 1280.0, height: 720.0 }))
        .map_err(|e| e.to_string())?;
    window.center().map_err(|e| e.to_string())?;

    Ok(())
}

/// Check if wallpaper mode is supported on this platform.
#[tauri::command]
pub async fn is_wallpaper_supported() -> bool {
    // Wallpaper mode (always-on-bottom + fullscreen) works on all platforms
    true
}
