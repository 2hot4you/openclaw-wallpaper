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

/** Update tray icon status (called when connection status changes). */
export async function updateTrayStatus(isOnline: boolean): Promise<void> {
  return invoke<void>("update_tray_status", { isOnline });
}
