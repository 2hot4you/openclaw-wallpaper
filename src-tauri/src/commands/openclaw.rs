use std::path::PathBuf;

/// Default Gateway HTTP port.
const DEFAULT_PORT: u16 = 18789;

// ─── Hidden Process Execution ───────────────────────────────

/// Run a command through the user's shell environment, completely hidden.
///
/// On Windows: Uses Win32 CreateProcessW with STARTUPINFO.wShowWindow = SW_HIDE.
/// This spawns cmd.exe /c "command" with a hidden console window.
/// Unlike CREATE_NO_WINDOW, this correctly handles .cmd files while
/// keeping the window invisible.
///
/// This is the same technique used by Windows services and scheduled tasks
/// to run console commands without visible windows.
#[cfg(target_os = "windows")]
fn run_shell_hidden(command: &str) -> Result<(), String> {
    use windows::Win32::System::Threading::*;
    use windows::Win32::Foundation::*;
    use windows::core::PWSTR;

    // Build command line: cmd.exe /c "openclaw gateway start"
    let cmd_line = format!("cmd.exe /c {}", command);
    let mut cmd_wide: Vec<u16> = cmd_line.encode_utf16().chain(std::iter::once(0)).collect();

    unsafe {
        let mut si = STARTUPINFOW::default();
        si.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
        si.dwFlags = STARTF_USESHOWWINDOW;
        si.wShowWindow = 0; // SW_HIDE

        let mut pi = PROCESS_INFORMATION::default();

        let success = CreateProcessW(
            None,                          // lpApplicationName
            PWSTR(cmd_wide.as_mut_ptr()),   // lpCommandLine
            None,                          // lpProcessAttributes
            None,                          // lpThreadAttributes
            false,                         // bInheritHandles
            CREATE_NEW_CONSOLE,            // dwCreationFlags - new console (but hidden via SW_HIDE)
            None,                          // lpEnvironment (inherit)
            None,                          // lpCurrentDirectory (inherit)
            &si,                           // lpStartupInfo
            &mut pi,                       // lpProcessInformation
        );

        if let Err(e) = success {
            return Err(format!("CreateProcessW failed: {}", e));
        }

        // Close handles (we don't wait for the process)
        let _ = CloseHandle(pi.hProcess);
        let _ = CloseHandle(pi.hThread);
    }

    println!("[openclaw] Launched hidden: {}", cmd_line);
    Ok(())
}

/// Run openclaw CLI command, completely hidden on all platforms.
pub fn run_openclaw_hidden(args: &[&str]) -> Result<(), String> {
    let _cmd = format!("openclaw {}", args.join(" "));

    #[cfg(target_os = "windows")]
    {
        return run_shell_hidden(&_cmd);
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::process::Command;
        let bin = find_openclaw_bin();
        Command::new(&bin)
            .args(args)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to run openclaw: {}", e))?;
        Ok(())
    }
}

// ─── Non-Windows ────────────────────────────────────────────

#[cfg(not(target_os = "windows"))]
fn find_openclaw_bin() -> String {
    let home = dirs::home_dir().unwrap_or_default();
    let candidates: Vec<PathBuf> = vec![
        PathBuf::from("/usr/local/bin/openclaw"),
        PathBuf::from("/opt/homebrew/bin/openclaw"),
        home.join(".nvm").join("versions").join("node"),
    ];
    for c in &candidates {
        if c.exists() {
            return c.to_string_lossy().to_string();
        }
    }
    "openclaw".to_string()
}

// ─── IPC Commands ───────────────────────────────────────────

#[tauri::command]
pub async fn check_openclaw_status() -> Result<bool, String> {
    let url = format!("http://127.0.0.1:{}/health", DEFAULT_PORT);
    match reqwest::get(&url).await {
        Ok(resp) if resp.status().is_success() => Ok(true),
        _ => Ok(false),
    }
}

#[tauri::command]
pub async fn start_openclaw() -> Result<(), String> {
    run_openclaw_hidden(&["gateway", "start"])
}

#[tauri::command]
pub async fn stop_openclaw() -> Result<(), String> {
    let _ = run_openclaw_hidden(&["gateway", "stop"]);
    Ok(())
}

#[tauri::command]
pub async fn restart_openclaw() -> Result<(), String> {
    let _ = run_openclaw_hidden(&["gateway", "restart"]);
    Ok(())
}

#[tauri::command]
pub async fn get_gateway_url() -> Result<String, String> {
    Ok(format!("ws://127.0.0.1:{}", DEFAULT_PORT))
}

#[tauri::command]
pub async fn get_gateway_token() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let mut gateway_token = String::new();
    let mut device_token = String::new();

    let config_path = home.join(".openclaw").join("openclaw.json");
    if config_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&config_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(t) = json.pointer("/gateway/auth/token").and_then(|v| v.as_str()) {
                    gateway_token = t.to_string();
                }
            }
        }
    }

    let device_auth_path = home.join(".openclaw").join("identity").join("device-auth.json");
    if device_auth_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&device_auth_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(t) = json.pointer("/tokens/operator/token").and_then(|v| v.as_str()) {
                    device_token = t.to_string();
                }
            }
        }
    }

    if gateway_token.is_empty() && device_token.is_empty() {
        return Err("No auth tokens found".to_string());
    }

    Ok(serde_json::json!({
        "gatewayToken": gateway_token,
        "deviceToken": device_token
    }).to_string())
}

#[tauri::command]
pub async fn update_tray_status(app: tauri::AppHandle, is_online: bool) -> Result<(), String> {
    crate::tray::update_tray_status(&app, is_online);
    Ok(())
}

#[tauri::command]
pub async fn update_tray_wallpaper(app: tauri::AppHandle, attached: bool) -> Result<(), String> {
    crate::tray::update_tray_wallpaper(&app, attached);
    Ok(())
}
