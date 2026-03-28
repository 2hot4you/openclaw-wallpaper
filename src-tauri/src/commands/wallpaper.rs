use tauri::AppHandle;

/// Attach the main window as wallpaper (Windows only).
/// Places window behind desktop icons using WorkerW technique.
#[tauri::command]
pub async fn attach_wallpaper(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use tauri_plugin_wallpaper::{WallpaperExt, AttachRequest};
        app.wallpaper()
            .attach(AttachRequest::new("main"))
            .map_err(|e| format!("Failed to attach wallpaper: {}", e))?;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("Wallpaper mode is only available on Windows".into())
    }
}

/// Detach the main window from wallpaper mode.
#[tauri::command]
pub async fn detach_wallpaper(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use tauri_plugin_wallpaper::{WallpaperExt, DetachRequest};
        app.wallpaper()
            .detach(DetachRequest::new("main"))
            .map_err(|e| format!("Failed to detach wallpaper: {}", e))?;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("Wallpaper mode is only available on Windows".into())
    }
}

/// Check if wallpaper mode is supported on this platform.
#[tauri::command]
pub async fn is_wallpaper_supported() -> bool {
    cfg!(target_os = "windows")
}
