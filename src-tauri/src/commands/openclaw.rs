use std::process::Command;
use std::path::PathBuf;

/// Default Gateway HTTP port.
const DEFAULT_PORT: u16 = 18789;

/// Windows Scheduled Task name for OpenClaw Gateway.
#[cfg(target_os = "windows")]
const GATEWAY_TASK_NAME: &str = "OpenClaw Gateway";

// ─── Helpers ────────────────────────────────────────────────

/// Find the openclaw executable path.
fn find_openclaw_bin() -> String {
    let candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
        let appdata = std::env::var("APPDATA").unwrap_or_default();
        vec![
            PathBuf::from(&appdata).join("npm").join("openclaw.cmd"),
            PathBuf::from(r"C:\Program Files\nodejs\openclaw.cmd"),
        ]
    } else {
        let home = dirs::home_dir().unwrap_or_default();
        vec![
            PathBuf::from("/usr/local/bin/openclaw"),
            PathBuf::from("/opt/homebrew/bin/openclaw"),
            home.join(".nvm").join("versions").join("node"),
        ]
    };

    for c in &candidates {
        if c.exists() {
            return c.to_string_lossy().to_string();
        }
    }
    "openclaw".to_string()
}

/// Run a command completely hidden on Windows using a VBS wrapper.
/// WScript.Shell.Run with windowStyle=0 hides the entire process tree.
#[cfg(target_os = "windows")]
fn run_hidden(program: &str, args: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    // VBS script: WshShell.Run "command", 0 (hidden), False (don't wait)
    let vbs = format!(
        "Set s = CreateObject(\"WScript.Shell\")\ns.Run \"{} {}\", 0, False",
        program.replace("\"", "\"\""),
        args.replace("\"", "\"\""),
    );

    let vbs_path = std::env::temp_dir().join("openclaw_wp_run.vbs");
    std::fs::write(&vbs_path, &vbs)
        .map_err(|e| format!("Failed to write VBS: {}", e))?;

    Command::new("wscript.exe")
        .arg("//Nologo")
        .arg(vbs_path.to_string_lossy().to_string())
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to run wscript: {}", e))?;

    Ok(())
}

/// Run openclaw CLI with args, completely hidden on Windows.
pub fn run_openclaw_hidden(args: &[&str]) -> Result<(), String> {
    let args_str = args.join(" ");

    #[cfg(target_os = "windows")]
    {
        let bin = find_openclaw_bin();
        return run_hidden(&bin, &args_str);
    }

    #[cfg(not(target_os = "windows"))]
    {
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

// ─── IPC Commands ───────────────────────────────────────────

/// Check whether the OpenClaw Gateway is reachable via HTTP health endpoint.
#[tauri::command]
pub async fn check_openclaw_status() -> Result<bool, String> {
    let url = format!("http://127.0.0.1:{}/health", DEFAULT_PORT);
    match reqwest::get(&url).await {
        Ok(resp) if resp.status().is_success() => Ok(true),
        _ => Ok(false),
    }
}

/// Start the OpenClaw Gateway completely hidden.
#[tauri::command]
pub async fn start_openclaw() -> Result<(), String> {
    run_openclaw_hidden(&["gateway", "start"])
}

/// Stop the OpenClaw Gateway gracefully.
#[tauri::command]
pub async fn stop_openclaw() -> Result<(), String> {
    // Try graceful stop via openclaw CLI (hidden)
    let _ = run_openclaw_hidden(&["gateway", "stop"]);
    Ok(())
}

/// Restart the OpenClaw Gateway.
#[tauri::command]
pub async fn restart_openclaw() -> Result<(), String> {
    let _ = run_openclaw_hidden(&["gateway", "restart"]);
    Ok(())
}

/// Return the Gateway WebSocket URL.
#[tauri::command]
pub async fn get_gateway_url() -> Result<String, String> {
    Ok(format!("ws://127.0.0.1:{}", DEFAULT_PORT))
}

/// Read auth tokens for Gateway connection.
#[tauri::command]
pub async fn get_gateway_token() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let mut gateway_token = String::new();
    let mut device_token = String::new();

    // Read shared gateway token
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

    // Read device operator token
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

/// Update tray status from frontend.
#[tauri::command]
pub async fn update_tray_status(app: tauri::AppHandle, is_online: bool) -> Result<(), String> {
    crate::tray::update_tray_status(&app, is_online);
    Ok(())
}
