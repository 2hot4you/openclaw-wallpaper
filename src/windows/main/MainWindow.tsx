import React, { useEffect, useRef, useState, useCallback } from "react";
import { useGatewayStore } from "../../stores/gatewayStore";
import { useAppStore } from "../../stores/appStore";
import {
  checkOpenClawStatus,
  getGatewayUrl,
  getGatewayToken,
  startOpenClaw,
  stopOpenClaw,
  updateTrayStatus,
} from "../../utils/tauri-ipc";
import { AgentInfoPanelWithPosition, setInfoPanelPosition } from "./AgentInfoPanel";
import type { ConnectionStatus } from "../../gateway/types";

// Lazy-load GameManager to isolate Phaser init
let GameManagerModule: typeof import("../../game/GameManager") | null = null;

/** Tauri event listener type — simplified to avoid needing full @tauri-apps/api/event import */
type UnlistenFn = () => void;

/** Gateway status check interval (15 seconds) */
const STATUS_CHECK_INTERVAL = 15_000;

/** Connection status display strings */
const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  connected: "🟢 Connected to Gateway",
  disconnected: "🔴 Gateway Disconnected",
  connecting: "🟡 Connecting...",
  reconnecting: "🟡 Reconnecting...",
};

export const MainWindow: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameManagerRef = useRef<InstanceType<NonNullable<typeof GameManagerModule>["GameManager"]> | null>(null);
  const [status, setStatus] = useState<string>("Starting...");
  const [error, setError] = useState<string | null>(null);
  const [gameReady, setGameReady] = useState(false);

  // Gateway store
  const connect = useGatewayStore((s) => s.connect);
  const disconnect = useGatewayStore((s) => s.disconnect);
  const connectionStatus = useGatewayStore((s) => s.connectionStatus);
  const sessions = useGatewayStore((s) => s.sessions);
  const refreshSessions = useGatewayStore((s) => s.refreshSessions);

  // App store
  const setOpenclawOnline = useAppStore((s) => s.setOpenclawOnline);
  const setSelectedCharacterId = useAppStore((s) => s.setSelectedCharacterId);

  // Track connection status for scene sync
  const connectionStatusRef = useRef<ConnectionStatus>(connectionStatus);
  connectionStatusRef.current = connectionStatus;

  // Handle character click from Phaser
  const handleCharacterClick = useCallback(
    (id: string, globalX: number, globalY: number) => {
      setInfoPanelPosition(globalX, globalY);
      setSelectedCharacterId(id);
    },
    [setSelectedCharacterId],
  );

  // ─── Phaser Initialization ──────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    async function initGame() {
      try {
        console.log("[Wallpaper] Loading Phaser module...");
        setStatus("Loading Phaser module...");
        GameManagerModule = await import("../../game/GameManager");
        if (cancelled) return;

        console.log("[Wallpaper] Creating GameManager...");
        setStatus("Creating GameManager...");
        const gm = new GameManagerModule.GameManager();
        gameManagerRef.current = gm;

        console.log("[Wallpaper] Initializing Phaser game...");
        setStatus("Initializing Phaser game...");
        await gm.init(containerRef.current!);
        if (cancelled) return;

        // Register character click handler
        gm.onCharacterClick(handleCharacterClick);

        // Start in offline mode until Gateway connects
        gm.setOnlineMode(false);
        gm.setStatusText("🦞 OpenClaw Wallpaper");

        console.log("[Wallpaper] Phaser ready, setting gameReady=true");
        setStatus("Running");
        setGameReady(true);
      } catch (err) {
        if (cancelled) return;
        console.error("[Wallpaper] Phaser init error:", err);
        setError(err instanceof Error ? err.message : String(err));
        setStatus("Failed");
      }
    }

    initGame();

    return () => {
      cancelled = true;
      if (gameManagerRef.current) {
        gameManagerRef.current.destroy();
        gameManagerRef.current = null;
      }
    };
  }, [handleCharacterClick]);

  // ─── Gateway Connection ─────────────────────────────

  const gameReadyRef = useRef(gameReady);
  gameReadyRef.current = gameReady;

  useEffect(() => {
    console.log("[Wallpaper] Gateway useEffect triggered");

    let cancelled = false;
    let statusCheckTimer: ReturnType<typeof setInterval> | null = null;
    let connected = false;

    async function getTokens(): Promise<{ gatewayToken?: string; deviceToken?: string }> {
      try {
        const result = await getGatewayToken();
        console.log("[Wallpaper] Got tokens - gateway:", result.gatewayToken ? `${result.gatewayToken.substring(0, 8)}...` : "none", "device:", result.deviceToken ? `${result.deviceToken.substring(0, 8)}...` : "none");
        return result;
      } catch (err) {
        console.warn("[Wallpaper] Failed to get tokens:", err);
        return {};
      }
    }

    async function connectToGateway() {
      try {
        console.log("[Wallpaper] Checking OpenClaw status...");
        const online = await checkOpenClawStatus();
        console.log("[Wallpaper] OpenClaw online:", online);
        if (cancelled) return;

        if (online) {
          const url = await getGatewayUrl();
          console.log("[Wallpaper] Gateway URL:", url);
          if (cancelled) return;
          const { gatewayToken, deviceToken } = await getTokens();
          console.log("[Wallpaper] Connecting to Gateway...");
          await connect(url, gatewayToken, deviceToken);
          console.log("[Wallpaper] Connect call completed");
        } else {
          console.log("[Wallpaper] OpenClaw not online, staying in offline mode");
        }
      } catch (err) {
        console.error("[Wallpaper] connectToGateway error:", err);
      }
    }

    // Initial connection attempt
    connectToGateway().then(() => { connected = true; }).catch(() => {});

    // Periodic status check (reconnect if disconnected)
    statusCheckTimer = setInterval(async () => {
      if (cancelled) return;

      const currentStatus = connectionStatusRef.current;
      if (currentStatus === "disconnected") {
        try {
          const online = await checkOpenClawStatus();
          if (online && !cancelled) {
            const url = await getGatewayUrl();
            if (!cancelled) {
              const { gatewayToken, deviceToken } = await getTokens();
              await connect(url, gatewayToken, deviceToken);
            }
          }
        } catch {
          // Ignore — will retry next interval
        }
      }
    }, STATUS_CHECK_INTERVAL);

    return () => {
      cancelled = true;
      if (statusCheckTimer) clearInterval(statusCheckTimer);
      // Only disconnect on true unmount, not on re-render
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Tray Events ────────────────────────────────────

  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    async function getTokens(): Promise<{ gatewayToken?: string; deviceToken?: string }> {
      try {
        return await getGatewayToken();
      } catch {
        return {};
      }
    }

    async function setupTrayListeners() {
      try {
        const { listen } = await import("@tauri-apps/api/event");

        const u1 = await listen("tray-refresh-status", async () => {
          try {
            const online = await checkOpenClawStatus();
            if (online && connectionStatusRef.current === "disconnected") {
              const url = await getGatewayUrl();
              const { gatewayToken, deviceToken } = await getTokens();
              await connect(url, gatewayToken, deviceToken);
            } else if (connectionStatusRef.current === "connected") {
              await refreshSessions();
            }
          } catch {
            // Ignore
          }
        });
        unlisteners.push(u1);

        const u2 = await listen("tray-start-openclaw", async () => {
          try {
            await startOpenClaw();
            // Wait a moment for Gateway to start, then try connecting
            setTimeout(async () => {
              try {
                const online = await checkOpenClawStatus();
                if (online) {
                  const url = await getGatewayUrl();
                  const { gatewayToken, deviceToken } = await getTokens();
                  await connect(url, gatewayToken, deviceToken);
                }
              } catch {
                // Ignore
              }
            }, 3000);
          } catch {
            // Ignore
          }
        });
        unlisteners.push(u2);

        const u3 = await listen("tray-stop-openclaw", async () => {
          try {
            await stopOpenClaw();
            disconnect();
          } catch {
            // Ignore
          }
        });
        unlisteners.push(u3);
      } catch {
        // Tauri event system not available (e.g. in browser)
      }
    }

    setupTrayListeners();

    return () => {
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, [connect, disconnect, refreshSessions]);

  // ─── Sync connection status → scene + tray ──────────

  useEffect(() => {
    const gm = gameManagerRef.current;
    if (!gm) return;

    const isOnline = connectionStatus === "connected";
    gm.setOnlineMode(isOnline);
    setOpenclawOnline(isOnline);

    // Update connection status on status bar
    gm.setConnectionStatus(connectionStatus);

    // Update status text
    if (isOnline) {
      gm.setStatusText("🦞 OpenClaw Wallpaper");
    } else {
      gm.setStatusText(`🦞 OpenClaw Wallpaper — ${CONNECTION_LABELS[connectionStatus]}`);
    }

    // Update tray status (fire and forget)
    updateTrayStatus(isOnline).catch(() => {});
  }, [connectionStatus, setOpenclawOnline, gameReady]);

  // ─── Sync sessions → characters ─────────────────────

  useEffect(() => {
    const gm = gameManagerRef.current;
    if (!gm) return;

    const charManager = gm.getCharacterManager();
    if (charManager) {
      console.log("[Wallpaper] Syncing characters with sessions:", sessions.length, "sessions");
      charManager.syncWithSessions(sessions);
    }
  }, [sessions, connectionStatus, gameReady]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#2a2a3d",
      }}
    >
      {/* Loading overlay until Phaser is ready */}
      {!gameReady && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "white",
            fontFamily: "monospace",
            fontSize: 18,
            textAlign: "center",
            background: "rgba(0,0,0,0.6)",
            padding: 32,
            borderRadius: 12,
            zIndex: 999,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 16 }}>🦞 OpenClaw Wallpaper</div>
          <div style={{ marginBottom: 8 }}>Status: {status}</div>
          {error && (
            <div style={{ color: "#ff6b6b", marginTop: 12, fontSize: 14, maxWidth: 400 }}>
              Error: {error}
            </div>
          )}
        </div>
      )}

      {/* Agent Info Panel (floating, appears on character click) */}
      {gameReady && <AgentInfoPanelWithPosition />}
    </div>
  );
};
