/// Default Gateway HTTP port.
const DEFAULT_PORT: u16 = 18789;

// ─── Hidden Process Execution ───────────────────────────────

/// On Windows: find node.exe by scanning PATH env var directories.
/// Pure filesystem check, no subprocess calls.
#[cfg(target_os = "windows")]
fn find_node_exe() -> Option<std::path::PathBuf> {
    use std::path::PathBuf;
    if let Ok(path_env) = std::env::var("PATH") {
        for dir in path_env.split(';') {
            if dir.is_empty() { continue; }
            let candidate = PathBuf::from(dir).join("node.exe");
            if candidate.exists() {
                println!("[openclaw] Found node.exe: {:?}", candidate);
                return Some(candidate);
            }
        }
    }
    // Well-known fallbacks
    let fallbacks = [
        r"C:\Program Files\nodejs\node.exe",
    ];
    for fb in &fallbacks {
        let p = PathBuf::from(fb);
        if p.exists() {
            println!("[openclaw] Found node.exe at fallback: {:?}", p);
            return Some(p);
        }
    }
    eprintln!("[openclaw] node.exe NOT FOUND in PATH");
    None
}

/// Run openclaw CLI command, completely hidden on all platforms.
///
/// Windows strategy:
///   1. Find node.exe (pure PATH scan, no subprocess)
///   2. Run: node.exe -e "require('child_process').spawn('openclaw', [...args], {detached:true, stdio:'ignore'}).unref()"
///   3. node.exe with CREATE_NO_WINDOW = zero console windows
///   4. node's child_process.spawn inherits the shell environment and can find openclaw via PATH
pub fn run_openclaw_hidden(args: &[&str]) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let node = find_node_exe()
            .ok_or("Cannot find node.exe in PATH. Is Node.js installed?")?;

        // Build a JS one-liner that spawns openclaw detached
        let args_js: Vec<String> = args.iter().map(|a| format!("'{}'", a)).collect();
        let script = format!(
            "require('child_process').spawn('openclaw',[{}],{{detached:true,stdio:'ignore',shell:true}}).unref()",
            args_js.join(",")
        );

        println!("[openclaw] Running: {:?} -e '{}'", node, script);

        std::process::Command::new(&node)
            .args(["-e", &script])
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to spawn node.exe: {}", e))?;

        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let bin = find_openclaw_bin();
        std::process::Command::new(&bin)
            .args(args)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to run openclaw: {}", e))?;
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
fn find_openclaw_bin() -> String {
    use std::path::PathBuf;
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
