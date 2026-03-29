/// Hidden shell — a persistent, windowless cmd.exe process
/// that accepts commands via stdin pipe and returns output via stdout pipe.
///
/// This avoids spawning a new process (and potentially flashing a window)
/// for every command. One cmd.exe is created at startup with CREATE_NO_WINDOW,
/// and all subsequent commands are piped through it.

#[cfg(target_os = "windows")]
pub mod win {
    use std::io::{BufRead, BufReader, Write};
    use std::process::{Child, Command, Stdio};
    use std::sync::Mutex;

    /// Marker string to detect end of command output.
    const END_MARKER: &str = "___OPENCLAW_CMD_DONE___";

    static SHELL: Mutex<Option<ShellProcess>> = Mutex::new(None);

    struct ShellProcess {
        child: Child,
    }

    /// Initialize the hidden shell. Call once at app startup.
    pub fn init() -> Result<(), String> {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let child = Command::new("cmd.exe")
            .args(["/K", "echo SHELL_READY"])  // /K keeps cmd alive
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())  // merge stderr into stdout would be nice but cmd doesn't support it easily
            .spawn()
            .map_err(|e| format!("Failed to spawn hidden shell: {}", e))?;

        println!("[shell] Hidden cmd.exe started (pid={})", child.id());

        let mut guard = SHELL.lock().map_err(|e| e.to_string())?;
        *guard = Some(ShellProcess { child });

        Ok(())
    }

    /// Execute a command in the hidden shell and return the output.
    /// This is synchronous — call from a background thread if needed.
    pub fn exec(command: &str) -> Result<String, String> {
        let mut guard = SHELL.lock().map_err(|e| e.to_string())?;
        let shell = guard.as_mut().ok_or("Hidden shell not initialized")?;

        let stdin = shell.child.stdin.as_mut().ok_or("Shell stdin closed")?;
        let stdout = shell.child.stdout.as_mut().ok_or("Shell stdout closed")?;

        // Write command + echo marker so we know when output ends
        let full_cmd = format!("{}\r\necho {}\r\n", command, END_MARKER);
        stdin.write_all(full_cmd.as_bytes())
            .map_err(|e| format!("Failed to write to shell: {}", e))?;
        stdin.flush()
            .map_err(|e| format!("Failed to flush shell stdin: {}", e))?;

        // Read output until we see the marker
        let reader = BufReader::new(stdout);
        let mut output = String::new();
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    if l.trim() == END_MARKER {
                        break;
                    }
                    // Skip the echo of our command itself
                    if l.trim() == command.trim() || l.contains(END_MARKER) {
                        continue;
                    }
                    output.push_str(&l);
                    output.push('\n');
                }
                Err(e) => return Err(format!("Failed to read shell output: {}", e)),
            }
        }

        Ok(output.trim().to_string())
    }

    /// Execute a command in the hidden shell without waiting for output (fire-and-forget).
    pub fn exec_detached(command: &str) -> Result<(), String> {
        let mut guard = SHELL.lock().map_err(|e| e.to_string())?;
        let shell = guard.as_mut().ok_or("Hidden shell not initialized")?;

        let stdin = shell.child.stdin.as_mut().ok_or("Shell stdin closed")?;

        // Just write the command, don't wait for output
        let full_cmd = format!("{}\r\n", command);
        stdin.write_all(full_cmd.as_bytes())
            .map_err(|e| format!("Failed to write to shell: {}", e))?;
        stdin.flush()
            .map_err(|e| format!("Failed to flush shell stdin: {}", e))?;

        println!("[shell] Fired: {}", command);
        Ok(())
    }

    /// Shut down the hidden shell.
    pub fn shutdown() {
        if let Ok(mut guard) = SHELL.lock() {
            if let Some(mut shell) = guard.take() {
                let _ = shell.child.kill();
                println!("[shell] Hidden shell terminated");
            }
        }
    }
}
