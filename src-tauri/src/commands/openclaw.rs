use std::process::Command;
use std::path::PathBuf;

/// Default Gateway HTTP port.
const DEFAULT_PORT: u16 = 18789;

// ─── Helpers ────────────────────────────────────────────────

/// Find the node.exe path on Windows.
#[cfg(target_os = "windows")]
fn find_node_exe() -> Option<PathBuf> {
    // Check common locations
    let candidates = [
        // nvm-windows
        std::env::var("NVM_SYMLINK").ok().map(|p| PathBuf::from(p).join("node.exe")),
        // Standard Node.js install
        Some(PathBuf::from(r"C:\Program Files\nodejs\node.exe")),
        // fnm / volta
        std::env::var("LOCALAPPDATA").ok().map(|p| PathBuf::from(p).join("fnm_multishells")),
    ];

    for c in candidates.iter().flatten() {
        if c.exists() {
            return Some(c.clone());
        }
    }

    // Fallback: find via PATH using `where node`
    if let Ok(output) = Command::new("where").arg("node").output() {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(line) = stdout.lines().next() {
                let p = PathBuf::from(line.trim());
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }

    None
}

/// Find the openclaw JS entry point from the .cmd wrapper.
/// Reads openclaw.cmd to extract the actual JS file path,
/// or falls back to known npm global locations.
#[cfg(target_os = "windows")]
fn find_openclaw_js() -> Option<PathBuf> {
    let appdata = std::env::var("APPDATA").unwrap_or_default();

    // Check npm global: the .cmd usually points to node_modules/openclaw/dist/...
    let npm_prefix = PathBuf::from(&appdata).join("npm");
    let cmd_path = npm_prefix.join("openclaw.cmd");

    if cmd_path.exists() {
        // Parse the .cmd to find the JS target
        // Typical content: @"%~dp0\node_modules\openclaw\dist\cli.js" %*
        // or: @node "%~dp0\node_modules\openclaw\dist\cli.js" %*
        if let Ok(content) = std::fs::read_to_string(&cmd_path) {
            for line in content.lines() {
                // Look for .js file reference
                if let Some(idx) = line.find("node_modules") {
                    let rest = &line[idx..];
                    // Extract path up to .js" or .js %
                    if let Some(js_end) = rest.find(".js") {
                        let rel_path = &rest[..js_end + 3];
                        let full_path = npm_prefix.join(rel_path);
                        if full_path.exists() {
                            return Some(full_path);
                        }
                    }
                }
            }
        }

        // Fallback: common openclaw npm structure
        let common_js = npm_prefix.join("node_modules").join("openclaw").join("dist").join("cli.js");
        if common_js.exists() {
            return Some(common_js);
        }
    }

    None
}

/// Run openclaw via node.exe directly (no .cmd, no console window).
#[cfg(target_os = "windows")]
fn run_openclaw_via_node(args: &[&str]) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let node = find_node_exe()
        .ok_or("Cannot find node.exe — is Node.js installed?")?;
    let js_entry = find_openclaw_js()
        .ok_or("Cannot find openclaw JS entry — is openclaw installed globally?")?;

    let mut cmd = Command::new(&node);
    cmd.arg(&js_entry);
    cmd.args(args);
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.stdin(std::process::Stdio::null());
    cmd.stdout(std::process::Stdio::null());
    cmd.stderr(std::process::Stdio::null());

    cmd.spawn()
        .map_err(|e| format!("Failed to spawn node {:?} {:?}: {}", node, js_entry, e))?;

    Ok(())
}

/// Find the openclaw executable path (non-Windows).
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

/// Run openclaw CLI with args, completely hidden (no console window).
pub fn run_openclaw_hidden(args: &[&str]) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        return run_openclaw_via_node(args);
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

/// Update tray status from frontend.
#[tauri::command]
pub async fn update_tray_status(app: tauri::AppHandle, is_online: bool) -> Result<(), String> {
    crate::tray::update_tray_status(&app, is_online);
    Ok(())
}

/// Update tray wallpaper mode status from frontend.
#[tauri::command]
pub async fn update_tray_wallpaper(app: tauri::AppHandle, attached: bool) -> Result<(), String> {
    crate::tray::update_tray_wallpaper(&app, attached);
    Ok(())
}
