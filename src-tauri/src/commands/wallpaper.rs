use tauri::AppHandle;

/// Enter wallpaper mode.
///
/// On Windows:
///   1. Uses tauri-plugin-wallpaper to attach the window to the WorkerW layer
///      (behind desktop icons, above the actual wallpaper image)
///   2. Starts a global low-level mouse hook to forward mouse events to the
///      wallpaper window when the desktop is focused (same technique as Lively Wallpaper)
///   3. Desktop icons remain visible and functional
///
/// On other platforms:
///   Falls back to setAlwaysOnBottom + fullscreen (no icon layer issue)
#[tauri::command]
pub async fn attach_wallpaper(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use tauri::Manager;
        use tauri_plugin_wallpaper::{WallpaperExt, AttachRequest};

        // Attach to WorkerW layer (behind desktop icons)
        app.wallpaper()
            .attach(AttachRequest::new("main"))
            .map_err(|e| format!("WorkerW attach failed: {}", e))?;

        // Get the native HWND for the wallpaper window
        let window = app.get_webview_window("main")
            .ok_or("Main window not found")?;

        // Get the raw HWND via Tauri's window handle
        use tauri::Emitter;
        let hwnd = {
            let raw = window.hwnd().map_err(|e| e.to_string())?;
            raw.0 as isize
        };

        // Start mouse input forwarding hook
        crate::mouse_hook::win::start_mouse_hook(hwnd)?;

        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        // macOS/Linux: no WorkerW, use always-on-bottom fallback
        use tauri::Manager;
        let window = app.get_webview_window("main")
            .ok_or("Main window not found")?;
        window.set_decorations(false).map_err(|e| e.to_string())?;
        window.set_skip_taskbar(true).map_err(|e| e.to_string())?;
        window.set_fullscreen(true).map_err(|e| e.to_string())?;
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        window.set_always_on_bottom(true).map_err(|e| e.to_string())?;
        Ok(())
    }
}

/// Exit wallpaper mode.
#[tauri::command]
pub async fn detach_wallpaper(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use tauri_plugin_wallpaper::{WallpaperExt, DetachRequest};

        // Stop mouse hook first
        crate::mouse_hook::win::stop_mouse_hook();

        // Detach from WorkerW
        app.wallpaper()
            .detach(DetachRequest::new("main"))
            .map_err(|e| format!("WorkerW detach failed: {}", e))?;

        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        use tauri::Manager;
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
}

/// Check if wallpaper mode is supported on this platform.
#[tauri::command]
pub async fn is_wallpaper_supported() -> bool {
    true
}
