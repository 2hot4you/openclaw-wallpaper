use std::process::Command;

/// Default Gateway HTTP port.
const DEFAULT_PORT: u16 = 18789;

// ─── IPC Commands ───────────────────────────────────────────

/// Check whether the OpenClaw Gateway is reachable.
///
/// Strategy:
///   1. Try HTTP GET `http://127.0.0.1:<port>/health`
///   2. Fallback: run `openclaw gateway status` and inspect stdout
#[tauri::command]
pub async fn check_openclaw_status() -> Result<bool, String> {
    let url = format!("http://127.0.0.1:{}/health", DEFAULT_PORT);

    // Attempt 1: HTTP health endpoint (most reliable)
    match reqwest::get(&url).await {
        Ok(resp) if resp.status().is_success() => return Ok(true),
        _ => {}
    }

    // Attempt 2: CLI fallback
    match Command::new("openclaw")
        .args(["gateway", "status"])
        .output()
    {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if stdout.contains("running") || stdout.contains("live") {
                return Ok(true);
            }
        }
        _ => {}
    }

    Ok(false)
}

/// Start the OpenClaw Gateway via CLI.
#[tauri::command]
pub async fn start_openclaw() -> Result<(), String> {
    Command::new("openclaw")
        .args(["gateway", "start"])
        .spawn()
        .map_err(|e| format!("Failed to start OpenClaw Gateway: {}", e))?;
    Ok(())
}

/// Stop the OpenClaw Gateway via CLI.
#[tauri::command]
pub async fn stop_openclaw() -> Result<(), String> {
    Command::new("openclaw")
        .args(["gateway", "stop"])
        .output()
        .map_err(|e| format!("Failed to stop OpenClaw Gateway: {}", e))?;
    Ok(())
}

/// Restart the OpenClaw Gateway via CLI.
#[tauri::command]
pub async fn restart_openclaw() -> Result<(), String> {
    Command::new("openclaw")
        .args(["gateway", "restart"])
        .output()
        .map_err(|e| format!("Failed to restart OpenClaw Gateway: {}", e))?;
    Ok(())
}

/// Return the Gateway WebSocket URL (always local for now).
#[tauri::command]
pub async fn get_gateway_url() -> Result<String, String> {
    Ok(format!("ws://127.0.0.1:{}", DEFAULT_PORT))
}

/// Read the Gateway auth token from the OpenClaw config file.
///
/// Priority:
///   1. Device operator token from ~/.openclaw/identity/device-auth.json (has full scopes)
///   2. Shared gateway token from ~/.openclaw/openclaw.json (may lack scopes on 2026.3.12+)
#[tauri::command]
pub async fn get_gateway_token() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;

    // Try device operator token first (has full operator scopes)
    let device_auth_path = home.join(".openclaw").join("identity").join("device-auth.json");
    if device_auth_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&device_auth_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(token) = json.pointer("/tokens/operator/token").and_then(|v| v.as_str()) {
                    if !token.is_empty() {
                        return Ok(token.to_string());
                    }
                }
            }
        }
    }

    // Fallback to shared gateway token
    let config_path = home.join(".openclaw").join("openclaw.json");
    if !config_path.exists() {
        return Err(format!("Config not found: {}", config_path.display()));
    }

    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;

    let json: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    json.pointer("/gateway/auth/token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "Token not found in config".to_string())
}

/// Update tray status from frontend.
#[tauri::command]
pub async fn update_tray_status(app: tauri::AppHandle, is_online: bool) -> Result<(), String> {
    crate::tray::update_tray_status(&app, is_online);
    Ok(())
}
