/// Default Gateway HTTP port.
const DEFAULT_PORT: u16 = 18789;

// ─── Hidden Process Execution (Windows) ─────────────────────

/// Query the Scheduled Task "OpenClaw Gateway" to find the actual
/// command it runs, then execute that command directly with CREATE_NO_WINDOW.
#[cfg(target_os = "windows")]
fn start_gateway_hidden() -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    // Step 1: Query the scheduled task to find what command it runs
    // schtasks /Query /TN "OpenClaw Gateway" /XML returns the full task XML
    let query = std::process::Command::new("schtasks.exe")
        .args(["/Query", "/TN", "OpenClaw Gateway", "/XML"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("schtasks query failed: {}", e))?;

    if !query.status.success() {
        // Task doesn't exist, fall back to PowerShell
        println!("[openclaw] Scheduled task not found, falling back to PowerShell");
        return run_via_powershell(&["gateway", "start"]);
    }

    let xml = String::from_utf8_lossy(&query.stdout);
    println!("[openclaw] Task XML:\n{}", xml);

    // Step 2: Parse the command and arguments from XML
    // Look for <Command>...</Command> and <Arguments>...</Arguments>
    let exe = extract_xml_value(&xml, "Command");
    let task_args = extract_xml_value(&xml, "Arguments");

    if let Some(exe_path) = exe {
        println!("[openclaw] Task command: {:?}, args: {:?}", exe_path, task_args);

        let mut cmd = std::process::Command::new(&exe_path);
        if let Some(ref a) = task_args {
            // Split arguments (they may contain quoted paths)
            for arg in shell_split(a) {
                cmd.arg(arg);
            }
        }
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.stdin(std::process::Stdio::null());
        cmd.stdout(std::process::Stdio::null());
        cmd.stderr(std::process::Stdio::null());

        cmd.spawn()
            .map_err(|e| format!("Failed to spawn gateway: {}", e))?;

        println!("[openclaw] Gateway started directly (no task, no cmd window)");
        return Ok(());
    }

    // Fallback
    println!("[openclaw] Could not parse task XML, falling back to PowerShell");
    run_via_powershell(&["gateway", "start"])
}

/// Extract value between <tag>...</tag> from XML string.
#[cfg(target_os = "windows")]
fn extract_xml_value(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    if let Some(start) = xml.find(&open) {
        let value_start = start + open.len();
        if let Some(end) = xml[value_start..].find(&close) {
            let value = xml[value_start..value_start + end].trim().to_string();
            if !value.is_empty() {
                return Some(value);
            }
        }
    }
    None
}

/// Simple shell argument splitter (handles quoted strings).
#[cfg(target_os = "windows")]
fn shell_split(s: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut current = String::new();
    let mut in_quote = false;

    for ch in s.chars() {
        match ch {
            '"' => in_quote = !in_quote,
            ' ' if !in_quote => {
                if !current.is_empty() {
                    result.push(current.clone());
                    current.clear();
                }
            }
            _ => current.push(ch),
        }
    }
    if !current.is_empty() {
        result.push(current);
    }
    result
}

/// Stop the Gateway.
#[cfg(target_os = "windows")]
fn stop_gateway_hidden() -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    // Stop via schtasks
    let _ = std::process::Command::new("schtasks.exe")
        .args(["/End", "/TN", "OpenClaw Gateway"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    // Also kill any node process running the gateway
    // taskkill is more reliable than schtasks /End
    let _ = std::process::Command::new("taskkill.exe")
        .args(["/F", "/FI", "WINDOWTITLE eq OpenClaw Gateway"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    Ok(())
}

/// Run any command via PowerShell hidden (fallback).
#[cfg(target_os = "windows")]
fn run_via_powershell(args: &[&str]) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let ps_script = format!("& openclaw {}", args.join(" "));
    println!("[openclaw] PowerShell fallback: {}", ps_script);

    std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &ps_script])
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("PowerShell failed: {}", e))?;

    Ok(())
}

/// Run openclaw CLI command, completely hidden.
pub fn run_openclaw_hidden(args: &[&str]) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if args.len() >= 2 && args[0] == "gateway" {
            return match args[1] {
                "start" | "restart" => start_gateway_hidden(),
                "stop" => stop_gateway_hidden(),
                _ => run_via_powershell(args),
            };
        }
        return run_via_powershell(args);
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
    // Graceful HTTP shutdown (async, won't panic)
    let url = format!("http://127.0.0.1:{}/shutdown", DEFAULT_PORT);
    let _ = reqwest::Client::new().post(&url).send().await;

    // Also run CLI stop via PowerShell
    #[cfg(target_os = "windows")]
    {
        run_via_powershell(&["gateway", "stop"])?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = run_openclaw_hidden(&["gateway", "stop"]);
    }
    Ok(())
}

#[tauri::command]
pub async fn restart_openclaw() -> Result<(), String> {
    // Stop
    let url = format!("http://127.0.0.1:{}/shutdown", DEFAULT_PORT);
    let _ = reqwest::Client::new().post(&url).send().await;
    #[cfg(target_os = "windows")]
    {
        let _ = run_via_powershell(&["gateway", "stop"]);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = run_openclaw_hidden(&["gateway", "stop"]);
    }

    // Wait then start
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    run_openclaw_hidden(&["gateway", "start"])
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
