use std::process::Command;
use std::path::PathBuf;

/// Default Gateway HTTP port.
const DEFAULT_PORT: u16 = 18789;

// ─── Windows: Hidden Process Execution ──────────────────────

/// On Windows, find node.exe by scanning PATH + well-known locations.
/// Never calls external commands.
#[cfg(target_os = "windows")]
fn find_node_exe() -> Option<PathBuf> {
    let mut searched: Vec<String> = Vec::new();

    // 1. PATH env var
    if let Ok(path_env) = std::env::var("PATH") {
        for dir in path_env.split(';') {
            if dir.is_empty() { continue; }
            let candidate = PathBuf::from(dir).join("node.exe");
            if candidate.exists() {
                println!("[openclaw] Found node.exe via PATH: {:?}", candidate);
                return Some(candidate);
            }
        }
        searched.push(format!("PATH ({} entries)", path_env.split(';').count()));
    }

    // 2. Well-known locations
    let mut well_known: Vec<PathBuf> = Vec::new();

    // nvm-windows
    if let Ok(symlink) = std::env::var("NVM_SYMLINK") {
        well_known.push(PathBuf::from(&symlink).join("node.exe"));
    }
    if let Ok(nvm_home) = std::env::var("NVM_HOME") {
        // nvm-windows stores versions in NVM_HOME\vX.X.X\node.exe
        if let Ok(entries) = std::fs::read_dir(&nvm_home) {
            for entry in entries.flatten() {
                let p = entry.path().join("node.exe");
                if p.exists() {
                    well_known.push(p);
                }
            }
        }
    }

    // Standard installs
    well_known.push(PathBuf::from(r"C:\Program Files\nodejs\node.exe"));
    if let Ok(pf) = std::env::var("ProgramFiles") {
        well_known.push(PathBuf::from(&pf).join("nodejs").join("node.exe"));
    }

    // User-local installs (fnm, volta, nvm-windows symlink)
    if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
        // fnm
        let fnm = PathBuf::from(&localappdata).join("fnm_multishells");
        if fnm.exists() {
            if let Ok(entries) = std::fs::read_dir(&fnm) {
                for entry in entries.flatten() {
                    let p = entry.path().join("node.exe");
                    if p.exists() {
                        well_known.push(p);
                    }
                }
            }
        }
        // Volta
        let volta = PathBuf::from(&localappdata).join("Volta").join("bin").join("node.exe");
        well_known.push(volta);
    }

    // User profile .nvm (nvm-windows default)
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        let nvm_default = PathBuf::from(&userprofile).join(".nvm");
        if nvm_default.exists() {
            if let Ok(entries) = std::fs::read_dir(&nvm_default) {
                for entry in entries.flatten() {
                    let p = entry.path().join("node.exe");
                    if p.exists() {
                        well_known.push(p);
                    }
                }
            }
        }
    }

    for c in &well_known {
        if c.exists() {
            println!("[openclaw] Found node.exe at well-known path: {:?}", c);
            return Some(c.clone());
        }
    }

    searched.push(format!("well-known ({} paths)", well_known.len()));
    eprintln!("[openclaw] node.exe NOT FOUND. Searched: {}", searched.join(", "));
    None
}

/// Find the openclaw JS entry point. No subprocesses.
#[cfg(target_os = "windows")]
fn find_openclaw_js() -> Option<PathBuf> {
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    let npm_prefix = PathBuf::from(&appdata).join("npm");

    // 1. Parse the .cmd wrapper to find the JS entry
    let cmd_path = npm_prefix.join("openclaw.cmd");
    println!("[openclaw] Looking for cmd wrapper: {:?} exists={}", cmd_path, cmd_path.exists());

    if cmd_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&cmd_path) {
            println!("[openclaw] openclaw.cmd content:\n{}", content);
            for line in content.lines() {
                if let Some(idx) = line.find("node_modules") {
                    let rest = &line[idx..];
                    if let Some(js_end) = rest.find(".js") {
                        let rel_path = rest[..js_end + 3]
                            .replace("\\\\", "\\")
                            .replace("\"", "")
                            .trim()
                            .to_string();
                        let full_path = npm_prefix.join(&rel_path);
                        println!("[openclaw] Extracted JS path: {:?} exists={}", full_path, full_path.exists());
                        if full_path.exists() {
                            return Some(full_path);
                        }
                    }
                }
            }
        }
    }

    // 2. Fallback: common npm global paths
    let fallbacks = [
        npm_prefix.join("node_modules").join("openclaw").join("dist").join("cli.js"),
        npm_prefix.join("node_modules").join("openclaw").join("dist").join("index.js"),
        npm_prefix.join("node_modules").join("openclaw").join("bin").join("openclaw.js"),
    ];
    for fb in &fallbacks {
        println!("[openclaw] Checking fallback: {:?} exists={}", fb, fb.exists());
        if fb.exists() {
            return Some(fb.clone());
        }
    }

    // 3. Also check global node_modules from PATH
    if let Ok(path_env) = std::env::var("PATH") {
        for dir in path_env.split(';') {
            if dir.is_empty() { continue; }
            let p = PathBuf::from(dir);
            // Check if dir itself contains openclaw.cmd
            let cmd_in_dir = p.join("openclaw.cmd");
            if cmd_in_dir.exists() && p != npm_prefix {
                // Try to find node_modules relative to this dir
                let js = p.join("node_modules").join("openclaw").join("dist").join("cli.js");
                if js.exists() {
                    println!("[openclaw] Found JS via PATH dir: {:?}", js);
                    return Some(js);
                }
            }
        }
    }

    eprintln!("[openclaw] openclaw JS entry NOT FOUND");
    None
}

/// Spawn a completely hidden process on Windows.
#[cfg(target_os = "windows")]
fn spawn_hidden(program: &PathBuf, args: &[&str]) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const FLAGS: u32 = 0x08000008; // CREATE_NO_WINDOW | DETACHED_PROCESS

    println!("[openclaw] spawn_hidden: {:?} {:?}", program, args);

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

/// Run openclaw CLI with args, completely hidden on Windows.
pub fn run_openclaw_hidden(args: &[&str]) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let node = find_node_exe()
            .ok_or("Cannot find node.exe. Is Node.js installed and in PATH?")?;
        let js = find_openclaw_js()
            .ok_or("Cannot find openclaw JS entry. Is openclaw installed (npm i -g openclaw)?")?;

        let js_str = js.to_string_lossy().to_string();
        let mut full_args: Vec<&str> = vec![&js_str];
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
