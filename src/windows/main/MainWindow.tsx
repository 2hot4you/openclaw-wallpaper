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

// Lazy-load SceneManager to isolate PixiJS init
let SceneManagerModule: typeof import("../../pixi/engine/SceneManager") | null = null;

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
  const sceneManagerRef = useRef<InstanceType<NonNullable<typeof SceneManagerModule>["SceneManager"]> | null>(null);
  const [status, setStatus] = useState<string>("Starting...");
  const [error, setError] = useState<string | null>(null);
  const [pixiReady, setPixiReady] = useState(false);

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

  // Handle character click from PixiJS
  const handleCharacterClick = useCallback(
    (id: string, globalX: number, globalY: number) => {
      setInfoPanelPosition(globalX, globalY);
      setSelectedCharacterId(id);
    },
    [setSelectedCharacterId],
  );

  // ─── PixiJS Initialization ──────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    async function initPixi() {
      try {
        console.log("[Wallpaper] Loading PixiJS module...");
        setStatus("Loading PixiJS module...");
        SceneManagerModule = await import("../../pixi/engine/SceneManager");
        if (cancelled) return;

        console.log("[Wallpaper] Creating SceneManager...");
        setStatus("Creating SceneManager...");
        const sm = new SceneManagerModule.SceneManager();
        sceneManagerRef.current = sm;

        console.log("[Wallpaper] Initializing renderer...");
        setStatus("Initializing renderer...");
        await sm.init(containerRef.current!);
        if (cancelled) return;

        // Register character click handler
        sm.onCharacterClick(handleCharacterClick);

        // Start in offline mode until Gateway connects
        sm.setOnlineMode(false);
        sm.setStatusText("🦞 OpenClaw Wallpaper");

        console.log("[Wallpaper] PixiJS ready, setting pixiReady=true");
        setStatus("Running");
        setPixiReady(true);
      } catch (err) {
        if (cancelled) return;
        console.error("[Wallpaper] PixiJS init error:", err);
        setError(err instanceof Error ? err.message : String(err));
        setStatus("Failed");
      }
    }

    initPixi();

    return () => {
      cancelled = true;
      if (sceneManagerRef.current) {
        sceneManagerRef.current.destroy();
        sceneManagerRef.current = null;
      }
    };
  }, [handleCharacterClick]);

  // ─── Gateway Connection ─────────────────────────────

  useEffect(() => {
    console.log("[Wallpaper] Gateway useEffect triggered, pixiReady:", pixiReady);

    let cancelled = false;
    let statusCheckTimer: ReturnType<typeof setInterval> | null = null;

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
          let token: string | undefined;
          try {
            token = await getGatewayToken();
            console.log("[Wallpaper] Got token:", token ? `${token.substring(0, 8)}...` : "none");
          } catch (tokenErr) {
            console.warn("[Wallpaper] Failed to get token:", tokenErr);
          }
          console.log("[Wallpaper] Connecting to Gateway...");
          await connect(url, token);
          console.log("[Wallpaper] Connect call completed");
        } else {
          console.log("[Wallpaper] OpenClaw not online, staying in offline mode");
        }
      } catch (err) {
        console.error("[Wallpaper] connectToGateway error:", err);
      }
    }

    // Initial connection attempt
    connectToGateway();

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
              let token: string | undefined;
              try { token = await getGatewayToken(); } catch {}
              await connect(url, token);
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
      disconnect();
    };
  }, [pixiReady, connect, disconnect]);

  // ─── Tray Events ────────────────────────────────────

  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    async function setupTrayListeners() {
      try {
        const { listen } = await import("@tauri-apps/api/event");

        const u1 = await listen("tray-refresh-status", async () => {
          try {
            const online = await checkOpenClawStatus();
            if (online && connectionStatusRef.current === "disconnected") {
              const url = await getGatewayUrl();
              let token: string | undefined;
              try { token = await getGatewayToken(); } catch {}
              await connect(url, token);
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
                  let token: string | undefined;
                  try { token = await getGatewayToken(); } catch {}
                  await connect(url, token);
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
    const sm = sceneManagerRef.current;
    if (!sm) return;

    const isOnline = connectionStatus === "connected";
    sm.setOnlineMode(isOnline);
    setOpenclawOnline(isOnline);

    // Update UI overlay
    const scene = sm.getScene();
    if (scene) {
      const uiOverlay = scene.getUIOverlayLayer();
      uiOverlay.setConnectionStatus(connectionStatus);
    }

    // Update status text
    if (isOnline) {
      sm.setStatusText("🦞 OpenClaw Wallpaper");
    } else {
      sm.setStatusText(`🦞 OpenClaw Wallpaper — ${CONNECTION_LABELS[connectionStatus]}`);
    }

    // Update tray status (fire and forget)
    updateTrayStatus(isOnline).catch(() => {});
  }, [connectionStatus, setOpenclawOnline]);

  // ─── Mock sessions for offline/demo mode ─────────────

  const MOCK_SESSIONS: import("../../gateway/types").SessionData[] = [
    { key: "mock-pm", label: "PM", status: "idle", agentId: "pm" },
    { key: "mock-frontend", label: "Frontend", status: "active", agentId: "frontend" },
    { key: "mock-backend", label: "Backend", status: "active", agentId: "backend" },
    { key: "mock-qa", label: "QA", status: "error", agentId: "qa" },
    { key: "mock-devops", label: "DevOps", status: "idle", agentId: "devops" },
  ];

  // ─── Sync sessions → characters ─────────────────────

  useEffect(() => {
    const sm = sceneManagerRef.current;
    if (!sm) return;

    const charManager = sm.getCharacterManager();
    if (charManager) {
      // Use real sessions when connected, mock when disconnected
      const data = connectionStatus === "connected" && sessions.length > 0
        ? sessions
        : MOCK_SESSIONS;
      charManager.syncWithSessions(data);
    }
  }, [sessions, connectionStatus, pixiReady]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#5b9bd5",
      }}
    >
      {/* Loading overlay until PixiJS is ready */}
      {!pixiReady && (
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
      {pixiReady && <AgentInfoPanelWithPosition />}
    </div>
  );
};
