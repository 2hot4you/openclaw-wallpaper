/** OpenClaw Gateway default WebSocket URL */
export const GATEWAY_URL = "ws://127.0.0.1:18789";

/** Default gateway port */
export const GATEWAY_PORT = 18789;

/** FPS settings */
export const FPS = {
  ACTIVE: 30,
  IDLE: 12,
  OCCLUDED: 1,
} as const;

/** Idle timeout in ms (30s) */
export const IDLE_TIMEOUT_MS = 30_000;
