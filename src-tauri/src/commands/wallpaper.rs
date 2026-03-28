use tauri::{AppHandle, Manager};

/// Enter wallpaper mode (Windows: attach to WorkerW + pin for interaction fallback).
///
/// Strategy: Use Tauri's setAlwaysOnBottom to keep window below all others,
/// combined with fullscreen + no decorations + skip taskbar. This gives
/// a "wallpaper" feel while preserving full mouse interaction when
/// the user clicks on the desktop (Win+D or clicking empty desktop area).
///
/// On Windows, also uses the wallpaper plugin's attach for true WorkerW
/// embedding. Mouse events DO work when desktop is focused (no other
/// window in foreground).
#[tauri::command]
pub async fn attach_wallpaper(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main")
        .ok_or("Main window not found")?;

    // Fullscreen, no decorations, skip taskbar, always on bottom
    window.set_decorations(false).map_err(|e| e.to_string())?;
    window.set_fullscreen(true).map_err(|e| e.to_string())?;
    window.set_skip_taskbar(true).map_err(|e| e.to_string())?;
    window.set_always_on_bottom(true).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        // Also attach via WorkerW for true wallpaper embedding.
        // The window ends up behind desktop icons. Mouse events are received
        // when the desktop is focused (user clicked desktop or pressed Win+D).
        use tauri_plugin_wallpaper::{WallpaperExt, AttachRequest};
        if let Err(e) = app.wallpaper().attach(AttachRequest::new("main")) {
            // Non-fatal — we still have the always-on-bottom fallback
            eprintln!("[Wallpaper] WorkerW attach failed (non-fatal): {}", e);
        }
    }

    Ok(())
}

/// Exit wallpaper mode.
#[tauri::command]
pub async fn detach_wallpaper(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use tauri_plugin_wallpaper::{WallpaperExt, DetachRequest};
        // Detach from WorkerW first
        let _ = app.wallpaper().detach(DetachRequest::new("main"));
    }

    let window = app.get_webview_window("main")
        .ok_or("Main window not found")?;

    // Restore normal window mode
    window.set_always_on_bottom(false).map_err(|e| e.to_string())?;
    window.set_fullscreen(false).map_err(|e| e.to_string())?;
    window.set_decorations(true).map_err(|e| e.to_string())?;
    window.set_skip_taskbar(false).map_err(|e| e.to_string())?;

    // Restore window size
    use tauri::LogicalSize;
    window.set_size(tauri::Size::Logical(LogicalSize { width: 1280.0, height: 720.0 }))
        .map_err(|e| e.to_string())?;
    window.center().map_err(|e| e.to_string())?;

    Ok(())
}

/// Check if wallpaper mode is supported on this platform.
#[tauri::command]
pub async fn is_wallpaper_supported() -> bool {
    cfg!(target_os = "windows")
}
