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
    const END_MARKER: &str = "___OPENCLAW_SHELL_END___";

    static SHELL: Mutex<Option<HiddenShell>> = Mutex::new(None);

    struct HiddenShell {
        stdin: std::process::ChildStdin,
        reader: BufReader<std::process::ChildStdout>,
        _child: Child,
    }

    /// Initialize the hidden shell. Call once at app startup.
    pub fn init() -> Result<(), String> {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let mut child = Command::new("cmd.exe")
            .args(["/Q", "/K"])  // /Q = quiet (no echo), /K = keep alive
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to spawn hidden shell: {}", e))?;

        let stdin = child.stdin.take().ok_or("Failed to get shell stdin")?;
        let stdout = child.stdout.take().ok_or("Failed to get shell stdout")?;
        let reader = BufReader::new(stdout);

        println!("[shell] Hidden cmd.exe started (pid={})", child.id());

        let mut guard = SHELL.lock().map_err(|e| e.to_string())?;
        *guard = Some(HiddenShell {
            stdin,
            reader,
            _child: child,
        });

        // Drain any initial output
        let _ = exec_inner_locked(guard.as_mut().unwrap(), "echo ready");

        Ok(())
    }

    /// Execute a command and return its output (blocking).
    pub fn exec(command: &str) -> Result<String, String> {
        let mut guard = SHELL.lock().map_err(|e| e.to_string())?;
        let shell = guard.as_mut().ok_or("Hidden shell not initialized")?;
        exec_inner_locked(shell, command)
    }

    fn exec_inner_locked(shell: &mut HiddenShell, command: &str) -> Result<String, String> {
        // Write command followed by echo of end marker
        let full = format!("{}\r\necho {}\r\n", command, END_MARKER);
        shell.stdin.write_all(full.as_bytes())
            .map_err(|e| format!("Shell write failed: {}", e))?;
        shell.stdin.flush()
            .map_err(|e| format!("Shell flush failed: {}", e))?;

        // Read lines until we see the marker
        let mut output = String::new();
        loop {
            let mut line = String::new();
            match shell.reader.read_line(&mut line) {
                Ok(0) => return Err("Shell process ended unexpectedly".into()),
                Ok(_) => {
                    let trimmed = line.trim();
                    if trimmed == END_MARKER {
                        break;
                    }
                    // Skip echo of our own commands
                    if trimmed.starts_with("echo ") && trimmed.contains(END_MARKER) {
                        continue;
                    }
                    output.push_str(&line);
                }
                Err(e) => return Err(format!("Shell read failed: {}", e)),
            }
        }

        Ok(output.trim().to_string())
    }

    /// Execute a command without waiting for output (fire-and-forget).
    /// Uses `start /B` to run in background within the hidden shell.
    pub fn exec_detached(command: &str) -> Result<(), String> {
        let mut guard = SHELL.lock().map_err(|e| e.to_string())?;
        let shell = guard.as_mut().ok_or("Hidden shell not initialized")?;

        // `start /B` runs the command in the background within the same console
        // session (no new window). The hidden shell's console is invisible,
        // so everything stays hidden.
        let full = format!("start /B {}\r\n", command);
        shell.stdin.write_all(full.as_bytes())
            .map_err(|e| format!("Shell write failed: {}", e))?;
        shell.stdin.flush()
            .map_err(|e| format!("Shell flush failed: {}", e))?;

        println!("[shell] Detached: {}", command);
        Ok(())
    }

    /// Shut down the hidden shell.
    pub fn shutdown() {
        if let Ok(mut guard) = SHELL.lock() {
            if let Some(mut shell) = guard.take() {
                let _ = writeln!(shell.stdin, "exit\r");
                println!("[shell] Hidden shell terminated");
            }
        }
    }
}
