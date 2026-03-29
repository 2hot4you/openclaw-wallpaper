/// Mouse input forwarding for WorkerW wallpaper mode (Windows only).
///
/// When a window is attached to the WorkerW layer (behind desktop icons),
/// it cannot receive mouse events because the desktop icon layer (SysListView32)
/// sits on top and captures all input.
///
/// Solution (same technique as Lively Wallpaper):
/// 1. Install a global low-level mouse hook (WH_MOUSE_LL)
/// 2. When the desktop (Progman/WorkerW) has foreground focus,
///    intercept mouse events and forward them via PostMessage
///    to our wallpaper window's HWND
/// 3. Convert screen coordinates to client coordinates for the target window

#[cfg(target_os = "windows")]
pub mod win {
    use std::sync::atomic::{AtomicIsize, AtomicBool, Ordering};
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::*;
    use windows::Win32::UI::Input::KeyboardAndMouse::*;
    use windows::Win32::Graphics::Gdi::ScreenToClient;

    /// Target HWND to forward mouse events to (our wallpaper webview window)
    static TARGET_HWND: AtomicIsize = AtomicIsize::new(0);
    /// Whether the hook is active
    static HOOK_ACTIVE: AtomicBool = AtomicBool::new(false);
    /// The hook handle
    static HOOK_HANDLE: AtomicIsize = AtomicIsize::new(0);

    /// HWND class names that indicate the desktop is focused
    static DESKTOP_CLASSES: &[&str] = &["Progman", "WorkerW"];

    /// Check if the foreground window is the desktop
    fn is_desktop_focused() -> bool {
        unsafe {
            let fg = GetForegroundWindow();
            if fg.0 == std::ptr::null_mut() {
                return false;
            }
            let mut class_buf = [0u16; 64];
            let len = GetClassNameW(fg, &mut class_buf);
            if len == 0 {
                return false;
            }
            let class_name = String::from_utf16_lossy(&class_buf[..len as usize]);
            DESKTOP_CLASSES.iter().any(|&dc| class_name == dc)
        }
    }

    /// Low-level mouse hook callback.
    /// When desktop has focus, forward mouse messages to the wallpaper window.
    unsafe extern "system" fn mouse_hook_proc(
        code: i32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if code >= 0 && HOOK_ACTIVE.load(Ordering::Relaxed) {
            let target_raw = TARGET_HWND.load(Ordering::Relaxed);
            if target_raw != 0 && is_desktop_focused() {
                let target = HWND(target_raw as *mut _);
                let ms = &*(lparam.0 as *const MSLLHOOKSTRUCT);
                let mut pt = ms.pt;

                // Convert screen coordinates to client coordinates of the target window
                let _ = ScreenToClient(target, &mut pt);

                // Pack coordinates into LPARAM (low=x, high=y)
                let lparam_coords = LPARAM(
                    ((pt.y as u32) << 16 | (pt.x as u32 & 0xFFFF)) as isize,
                );

                let msg = wparam.0 as u32;
                match msg {
                    WM_MOUSEMOVE | WM_LBUTTONDOWN | WM_LBUTTONUP
                    | WM_RBUTTONDOWN | WM_RBUTTONUP
                    | WM_MOUSEWHEEL => {
                        // Build wParam: include mouse button state flags
                        let mut mk_flags: u32 = 0;
                        if GetAsyncKeyState(VK_LBUTTON.0 as i32) as u16 & 0x8000 != 0 {
                            mk_flags |= 0x0001; // MK_LBUTTON
                        }
                        if GetAsyncKeyState(VK_RBUTTON.0 as i32) as u16 & 0x8000 != 0 {
                            mk_flags |= 0x0002; // MK_RBUTTON
                        }

                        // For mouse wheel, high word of wParam = wheel delta
                        let w = if msg == WM_MOUSEWHEEL {
                            let delta = (ms.mouseData >> 16) as i16;
                            WPARAM(((delta as u32) << 16 | mk_flags) as usize)
                        } else {
                            WPARAM(mk_flags as usize)
                        };

                        let _ = PostMessageW(Some(target), msg, w, lparam_coords);
                    }
                    _ => {}
                }
            }
        }

        let hook = HHOOK(HOOK_HANDLE.load(Ordering::Relaxed) as *mut _);
        CallNextHookEx(Some(hook), code, wparam, lparam)
    }

    /// Start the global mouse hook and forward events to the given HWND.
    pub fn start_mouse_hook(target_hwnd: isize) -> Result<(), String> {
        if HOOK_ACTIVE.load(Ordering::Relaxed) {
            // Already running, just update target
            TARGET_HWND.store(target_hwnd, Ordering::Relaxed);
            return Ok(());
        }

        TARGET_HWND.store(target_hwnd, Ordering::Relaxed);

        // Install the hook on a dedicated thread with a message pump
        std::thread::spawn(move || {
            unsafe {
                let hook = SetWindowsHookExW(
                    WH_MOUSE_LL,
                    Some(mouse_hook_proc),
                    None, // global hook
                    0,
                ).map_err(|e| format!("SetWindowsHookEx failed: {}", e)).unwrap();

                HOOK_HANDLE.store(hook.0 as isize, Ordering::Relaxed);
                HOOK_ACTIVE.store(true, Ordering::Relaxed);

                // Must run a message pump for low-level hooks to work
                let mut msg = MSG::default();
                while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                    if !HOOK_ACTIVE.load(Ordering::Relaxed) {
                        break;
                    }
                    TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }

                let _ = UnhookWindowsHookEx(hook);
                HOOK_HANDLE.store(0, Ordering::Relaxed);
            }
        });

        Ok(())
    }

    /// Stop the global mouse hook.
    pub fn stop_mouse_hook() {
        HOOK_ACTIVE.store(false, Ordering::Relaxed);
        TARGET_HWND.store(0, Ordering::Relaxed);
    }
}
