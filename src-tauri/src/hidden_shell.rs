/// Hidden shell — a persistent, windowless cmd.exe process
/// for executing commands without any console window flashing.
///
/// Architecture: One cmd.exe with CREATE_NO_WINDOW is spawned at startup.
/// Commands are sent via stdin pipe. We do NOT read stdout to avoid
/// deadlocks — this is fire-and-forget only. For commands that need
/// output, use exec_with_output() which spawns a separate process.

#[cfg(target_os = "windows")]
pub mod win {
    use std::io::Write;
    use std::process::{Command, Stdio};
    use std::sync::Mutex;

    static SHELL_STDIN: Mutex<Option<std::process::ChildStdin>> = Mutex::new(None);

    /// Initialize the hidden shell. Call once at app startup.
    pub fn init() -> Result<(), String> {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let mut child = Command::new("cmd.exe")
            .args(["/Q", "/K"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())  // Don't capture stdout — avoids deadlocks
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to spawn hidden shell: {}", e))?;

        let stdin = child.stdin.take().ok_or("Failed to get shell stdin")?;
        println!("[shell] Hidden cmd.exe started (pid={})", child.id());

        // Store stdin handle. The Child is intentionally leaked (detached)
        // so the shell stays alive for the app's lifetime.
        std::mem::forget(child);

        let mut guard = SHELL_STDIN.lock().map_err(|e| e.to_string())?;
        *guard = Some(stdin);

        Ok(())
    }

    /// Execute a command in the hidden shell (fire-and-forget).
    /// The command runs inside the hidden console session — no new windows.
    pub fn exec_detached(command: &str) -> Result<(), String> {
        let mut guard = SHELL_STDIN.lock().map_err(|e| e.to_string())?;
        let stdin = guard.as_mut().ok_or("Hidden shell not initialized")?;

        // Write command directly. It runs in the hidden cmd.exe's console.
        writeln!(stdin, "{}", command)
            .map_err(|e| format!("Shell write failed: {}", e))?;
        stdin.flush()
            .map_err(|e| format!("Shell flush failed: {}", e))?;

        println!("[shell] Executed: {}", command);
        Ok(())
    }

    /// Shut down the hidden shell.
    pub fn shutdown() {
        if let Ok(mut guard) = SHELL_STDIN.lock() {
            if let Some(mut stdin) = guard.take() {
                let _ = writeln!(stdin, "exit");
                println!("[shell] Shutdown");
            }
        }
    }
}
