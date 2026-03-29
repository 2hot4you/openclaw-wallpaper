use std::process::Command;
use std::path::PathBuf;

/// Default Gateway HTTP port.
const DEFAULT_PORT: u16 = 18789;

// ─── Windows: Hidden Process Execution ──────────────────────

/// On Windows, find node.exe by scanning known paths + PATH env var.
/// Never calls external commands (no `where`, no `.cmd`).
#[cfg(target_os = "windows")]
fn find_node_exe() -> Option<PathBuf> {
    // 1. Check PATH env var entries directly (no subprocess!)
    if let Ok(path_env) = std::env::var("PATH") {
        for dir in path_env.split(';') {
            let candidate = PathBuf::from(dir).join("node.exe");
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    // 2. Well-known locations
    let extras = [
        std::env::var("NVM_SYMLINK").ok().map(|p| PathBuf::from(p).join("node.exe")),
        Some(PathBuf::from(r"C:\Program Files\nodejs\node.exe")),
        std::env::var("ProgramFiles").ok().map(|p| PathBuf::from(p).join("nodejs").join("node.exe")),
    ];
    for c in extras.iter().flatten() {
        if c.exists() {
            return Some(c.clone());
        }
    }

    None
}

/// Find the openclaw JS entry point by reading the .cmd wrapper
/// or checking known npm global paths. No subprocesses.
#[cfg(target_os = "windows")]
fn find_openclaw_js() -> Option<PathBuf> {
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    let npm_prefix = PathBuf::from(&appdata).join("npm");
    let cmd_path = npm_prefix.join("openclaw.cmd");

    if cmd_path.exists() {
        // Parse the .cmd file to extract the JS entry path.
        // npm-generated .cmd files look like:
        //   @IF EXIST "%~dp0\node.exe" ( "%~dp0\node.exe" "%~dp0\node_modules\openclaw\dist\cli.js" %* ) ELSE (...)
        //   or: @"%~dp0\node_modules\openclaw\dist\cli.js" %*
        if let Ok(content) = std::fs::read_to_string(&cmd_path) {
            for line in content.lines() {
                if let Some(idx) = line.find("node_modules") {
                    let rest = &line[idx..];
                    if let Some(js_end) = rest.find(".js") {
                        let rel_path = rest[..js_end + 3].replace("\\\\", "\\");
                        let full_path = npm_prefix.join(&rel_path);
                        if full_path.exists() {
                            return Some(full_path);
                        }
                    }
                }
            }
        }
    }

    // Fallback: common npm global structure
    let common = npm_prefix.join("node_modules").join("openclaw").join("dist").join("cli.js");
    if common.exists() {
        return Some(common);
    }

    None
}

/// Spawn a completely hidden process on Windows.
/// Uses CREATE_NO_WINDOW + DETACHED_PROCESS to ensure zero console windows.
#[cfg(target_os = "windows")]
fn spawn_hidden(program: &PathBuf, args: &[&str]) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    // CREATE_NO_WINDOW (0x08000000) | DETACHED_PROCESS (0x00000008)
    const FLAGS: u32 = 0x08000008;

    Command::new(program)
        .args(args)
        .creation_flags(FLAGS)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("spawn_hidden({:?}): {}", program, e))?;

    Ok(())
}

/// Run openclaw CLI with args. On Windows, uses node.exe directly
/// to avoid .cmd console window flash.
pub fn run_openclaw_hidden(args: &[&str]) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let node = find_node_exe()
            .ok_or("Cannot find node.exe. Is Node.js installed and in PATH?")?;
        let js = find_openclaw_js()
            .ok_or("Cannot find openclaw JS entry. Is openclaw installed (npm i -g openclaw)?")?;

        let mut full_args: Vec<&str> = vec![js.to_str().unwrap_or("")];
        full_args.extend_from_slice(args);
        return spawn_hidden(&node, &full_args);
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

// ─── Non-Windows helpers ────────────────────────────────────

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
