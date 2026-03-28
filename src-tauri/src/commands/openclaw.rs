use std::process::Command;
use std::path::PathBuf;

/// Default Gateway HTTP port.
const DEFAULT_PORT: u16 = 18789;

/// Find the openclaw executable path.
/// On Windows, npm global installs go to %APPDATA%\npm\openclaw.cmd
/// On macOS/Linux, it's usually in PATH or ~/.nvm/versions/node/*/bin/openclaw
fn find_openclaw_bin() -> String {
    // Try common locations
    let candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
        let appdata = std::env::var("APPDATA").unwrap_or_default();
        let userprofile = std::env::var("USERPROFILE").unwrap_or_default();
        vec![
            PathBuf::from(&appdata).join("npm").join("openclaw.cmd"),
            PathBuf::from(&userprofile).join("AppData").join("Roaming").join("npm").join("openclaw.cmd"),
            PathBuf::from(r"C:\Program Files\nodejs\openclaw.cmd"),
            PathBuf::from("openclaw"), // fallback to PATH
        ]
    } else {
        let home = dirs::home_dir().unwrap_or_default();
        vec![
            PathBuf::from("/usr/local/bin/openclaw"),
            PathBuf::from("/opt/homebrew/bin/openclaw"),
            home.join(".nvm").join("versions").join("node"),  // will need glob, skip
            PathBuf::from("openclaw"), // fallback to PATH
        ]
    };

    for candidate in &candidates {
        if candidate.exists() {
            return candidate.to_string_lossy().to_string();
        }
    }

    // Fallback
    "openclaw".to_string()
}

/// Create a Command for openclaw that runs completely hidden on Windows.
/// Uses PowerShell -WindowStyle Hidden to suppress all console windows,
/// including child processes spawned by the gateway.
/// This works around OpenClaw's own missing windowsHide:true (issue #44693).
pub fn build_openclaw_command() -> Command {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let bin = find_openclaw_bin();

        // Use PowerShell to run the command completely hidden
        // This suppresses the main cmd window AND any child Node.js windows
        let mut cmd = Command::new("powershell");
        cmd.args([
            "-WindowStyle", "Hidden",
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-Command",
            &format!("& '{}'", bin),
        ]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    }

    #[cfg(not(target_os = "windows"))]
    {
        let bin = find_openclaw_bin();
        Command::new(bin)
    }
}

/// Build a command with extra args appended.
/// On Windows: uses `wscript` with a temporary VBS script to run completely hidden.
/// This is the only reliable way to hide ALL console windows including child processes.
pub fn build_openclaw_command_with_args(args: &[&str]) -> Command {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let bin = find_openclaw_bin();
        let args_str = args.join(" ");

        // Create a temporary VBS script that runs the command completely hidden
        // WScript.Shell.Run with 0 = hidden window, false = don't wait
        let vbs_content = format!(
            "Set WshShell = CreateObject(\"WScript.Shell\")\nWshShell.Run \"cmd /c \"\"{}\"\" {}\", 0, False",
            bin.replace("\\", "\\\\"),
            args_str
        );

        let vbs_path = std::env::temp_dir().join("openclaw_wallpaper_cmd.vbs");
        let _ = std::fs::write(&vbs_path, &vbs_content);

        let mut cmd = Command::new("wscript");
        cmd.arg(vbs_path.to_string_lossy().to_string());
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    }

    #[cfg(not(target_os = "windows"))]
    {
        let bin = find_openclaw_bin();
        let mut cmd = Command::new(bin);
        cmd.args(args);
        cmd
    }
}

/// Find node.exe on Windows
fn find_node_exe() -> String {
    let candidates = [
        r"C:\Program Files\nodejs\node.exe",
    ];
    for c in &candidates {
        if std::path::Path::new(c).exists() {
            return c.to_string();
        }
    }
    // Try PATH
    if let Ok(output) = Command::new("where").arg("node").output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if let Some(first_line) = stdout.lines().next() {
            let p = first_line.trim();
            if !p.is_empty() && std::path::Path::new(p).exists() {
                return p.to_string();
            }
        }
    }
    String::new()
}

/// Find the openclaw JS entry point on Windows
fn find_openclaw_js() -> String {
    let home = dirs::home_dir().unwrap_or_default();
    let candidates = [
        home.join("AppData").join("Roaming").join("npm").join("node_modules").join("openclaw").join("dist").join("index.js"),
    ];
    for c in &candidates {
        if c.exists() {
            return c.to_string_lossy().to_string();
        }
    }
    String::new()
}

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
    match build_openclaw_command_with_args(&["gateway", "status"])
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
/// On Windows, uses 'openclaw gateway start' which manages a Scheduled Task service.
/// The command itself should return quickly — the actual gateway runs as a background service.
#[tauri::command]
pub async fn start_openclaw() -> Result<(), String> {
    let mut cmd = build_openclaw_command_with_args(&["gateway", "start"]);
    cmd.stdin(std::process::Stdio::null());
    cmd.stdout(std::process::Stdio::null());
    cmd.stderr(std::process::Stdio::null());
    cmd.spawn()
        .map_err(|e| format!("Failed to start OpenClaw Gateway: {}", e))?;
    Ok(())
}

/// Stop the OpenClaw Gateway via CLI.
#[tauri::command]
pub async fn stop_openclaw() -> Result<(), String> {
    let mut cmd = build_openclaw_command_with_args(&["gateway", "stop"]);
    cmd.stdin(std::process::Stdio::null());
    cmd.stdout(std::process::Stdio::null());
    cmd.stderr(std::process::Stdio::null());
    cmd.output()
        .map_err(|e| format!("Failed to stop OpenClaw Gateway: {}", e))?;
    Ok(())
}

/// Restart the OpenClaw Gateway via CLI.
#[tauri::command]
pub async fn restart_openclaw() -> Result<(), String> {
    let mut cmd = build_openclaw_command_with_args(&["gateway", "restart"]);
    cmd.stdin(std::process::Stdio::null());
    cmd.stdout(std::process::Stdio::null());
    cmd.stderr(std::process::Stdio::null());
    cmd.spawn()
        .map_err(|e| format!("Failed to restart OpenClaw Gateway: {}", e))?;
    Ok(())
}

/// Return the Gateway WebSocket URL (always local for now).
#[tauri::command]
pub async fn get_gateway_url() -> Result<String, String> {
    Ok(format!("ws://127.0.0.1:{}", DEFAULT_PORT))
}

/// Read auth tokens for Gateway connection.
///
/// Returns JSON: { "gatewayToken": "...", "deviceToken": "..." }
/// - gatewayToken: shared token from openclaw.json (for auth.token)
/// - deviceToken: device operator token from device-auth.json (for auth.deviceToken, preserves scopes)
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

    // Return as JSON
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
