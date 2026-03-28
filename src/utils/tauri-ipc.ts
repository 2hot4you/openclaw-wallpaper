import { invoke } from "@tauri-apps/api/core";

/**
 * Thin, type-safe wrappers around Tauri `invoke` for the OpenClaw
 * process-management IPC commands registered in Rust.
 */

/** Check whether the OpenClaw Gateway is online. */
export async function checkOpenClawStatus(): Promise<boolean> {
  return invoke<boolean>("check_openclaw_status");
}

/** Start the OpenClaw Gateway (`openclaw gateway start`). */
export async function startOpenClaw(): Promise<void> {
  return invoke<void>("start_openclaw");
}

/** Stop the OpenClaw Gateway (`openclaw gateway stop`). */
export async function stopOpenClaw(): Promise<void> {
  return invoke<void>("stop_openclaw");
}

/** Restart the OpenClaw Gateway (`openclaw gateway restart`). */
export async function restartOpenClaw(): Promise<void> {
  return invoke<void>("restart_openclaw");
}

/** Get the Gateway WebSocket URL (e.g. `ws://127.0.0.1:18789`). */
export async function getGatewayUrl(): Promise<string> {
  return invoke<string>("get_gateway_url");
}

/** Get the Gateway auth tokens from OpenClaw config. Returns { gatewayToken, deviceToken } */
export async function getGatewayToken(): Promise<{ gatewayToken: string; deviceToken: string }> {
  const raw = await invoke<string>("get_gateway_token");
  return JSON.parse(raw);
}

/** Update tray icon status (called when connection status changes). */
export async function updateTrayStatus(isOnline: boolean): Promise<void> {
  return invoke<void>("update_tray_status", { isOnline });
}

/** Update tray wallpaper mode status. */
export async function updateTrayWallpaper(attached: boolean): Promise<void> {
  return invoke<void>("update_tray_wallpaper", { attached });
}

// ─── Wallpaper Mode ─────────────────────────────────────────

/** Check if wallpaper mode is supported on this platform (Windows only). */
export async function isWallpaperSupported(): Promise<boolean> {
  return invoke<boolean>("is_wallpaper_supported");
}

/** Attach the main window as desktop wallpaper (behind icons). */
export async function attachWallpaper(): Promise<void> {
  return invoke<void>("attach_wallpaper");
}

/** Detach the main window from wallpaper mode back to normal window. */
export async function detachWallpaper(): Promise<void> {
  return invoke<void>("detach_wallpaper");
}

/**
 * Toggle wallpaper mode.
 * All window management (fullscreen, decorations, attach/detach) is handled
 * by the Rust backend IPC commands.
 */
export async function toggleWallpaperMode(toWallpaper: boolean): Promise<void> {
  if (toWallpaper) {
    await attachWallpaper();
  } else {
    await detachWallpaper();
  }
}
