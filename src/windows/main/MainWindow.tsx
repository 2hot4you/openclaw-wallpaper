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
  updateTrayWallpaper,
  isWallpaperSupported,
  toggleWallpaperMode,
} from "../../utils/tauri-ipc";
import { ChatPanel } from "./ChatPanel";
import { SettingsModal } from "./SettingsModal";
import type { ConnectionStatus } from "../../gateway/types";

// Lazy-load GameManager to isolate Phaser init
let GameManagerModule: typeof import("../../game/GameManager") | null = null;

/** Tauri event listener type */
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
  const agents = useGatewayStore((s) => s.agents);
  const refreshSessions = useGatewayStore((s) => s.refreshSessions);

  // App store
  const setOpenclawOnline = useAppStore((s) => s.setOpenclawOnline);
  const setSelectedCharacterId = useAppStore((s) => s.setSelectedCharacterId);
  const setChatPanelOpen = useAppStore((s) => s.setChatPanelOpen);
  const setChatSessionKey = useAppStore((s) => s.setChatSessionKey);
  const chatPanelOpen = useAppStore((s) => s.chatPanelOpen);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setWallpaperSupported = useAppStore((s) => s.setWallpaperSupported);

  // Track connection status for scene sync
  const connectionStatusRef = useRef<ConnectionStatus>(connectionStatus);
  connectionStatusRef.current = connectionStatus;

  // Handle character click → open chat panel with that session
  const handleCharacterClick = useCallback(
    (id: string, _screenX: number, _screenY: number, _worldX: number, _worldY: number) => {
      setSelectedCharacterId(id);
      setChatSessionKey(id);
      setChatPanelOpen(true);
    },
    [setSelectedCharacterId, setChatSessionKey, setChatPanelOpen],
  );

  // Handle POI click → open settings on whiteboard
  const handlePOIClick = useCallback(
    (poiName: string) => {
      const name = poiName.toLowerCase();
      if (name.includes("whiteboard")) {
        setSettingsOpen(true);
      }
    },
    [setSettingsOpen],
  );

  // ─── Phaser Initialization ──────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    async function initGame() {
      try {
        setStatus("Loading Phaser module...");
        GameManagerModule = await import("../../game/GameManager");
        if (cancelled) return;

        setStatus("Creating GameManager...");
        const gm = new GameManagerModule.GameManager();
        gameManagerRef.current = gm;

        setStatus("Initializing Phaser game...");
        await gm.init(containerRef.current!);
        if (cancelled) return;

        // Register handlers
        gm.onCharacterClick(handleCharacterClick);
        gm.onPOIClick(handlePOIClick);

        // Start in offline mode until Gateway connects
        gm.setOnlineMode(false);
        gm.setStatusText("🦞 OpenClaw Wallpaper");

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
  }, [handleCharacterClick, handlePOIClick]);

  // ─── Check Wallpaper Support ────────────────────────

  useEffect(() => {
    isWallpaperSupported()
      .then((supported) => setWallpaperSupported(supported))
      .catch(() => setWallpaperSupported(false));
  }, [setWallpaperSupported]);

  // ─── Gateway Connection ─────────────────────────────

  const gameReadyRef = useRef(gameReady);
  gameReadyRef.current = gameReady;

  useEffect(() => {
    let cancelled = false;
    let statusCheckTimer: ReturnType<typeof setInterval> | null = null;

    async function getTokens(): Promise<{ gatewayToken?: string; deviceToken?: string }> {
      try {
        return await getGatewayToken();
      } catch {
        return {};
      }
    }

    async function connectToGateway() {
      try {
        const online = await checkOpenClawStatus();
        if (cancelled) return;

        if (online) {
          const url = await getGatewayUrl();
          if (cancelled) return;
          const { gatewayToken, deviceToken } = await getTokens();
          await connect(url, gatewayToken, deviceToken);
        }
      } catch (err) {
        console.error("[Wallpaper] connectToGateway error:", err);
      }
    }

    connectToGateway().catch(() => {});

    statusCheckTimer = setInterval(async () => {
      if (cancelled) return;
      if (connectionStatusRef.current === "disconnected") {
        try {
          const online = await checkOpenClawStatus();
          if (online && !cancelled) {
            const url = await getGatewayUrl();
            if (!cancelled) {
              const { gatewayToken, deviceToken } = await getTokens();
              await connect(url, gatewayToken, deviceToken);
            }
          }
        } catch { /* retry next interval */ }
      }
    }, STATUS_CHECK_INTERVAL);

    return () => {
      cancelled = true;
      if (statusCheckTimer) clearInterval(statusCheckTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Tray Events ────────────────────────────────────

  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    async function getTokens(): Promise<{ gatewayToken?: string; deviceToken?: string }> {
      try { return await getGatewayToken(); } catch { return {}; }
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
          } catch { /* Ignore */ }
        });
        unlisteners.push(u1);

        const u2 = await listen("tray-start-openclaw", async () => {
          try {
            await startOpenClaw();
            setTimeout(async () => {
              try {
                const online = await checkOpenClawStatus();
                if (online) {
                  const url = await getGatewayUrl();
                  const { gatewayToken, deviceToken } = await getTokens();
                  await connect(url, gatewayToken, deviceToken);
                }
              } catch { /* Ignore */ }
            }, 3000);
          } catch { /* Ignore */ }
        });
        unlisteners.push(u2);

        const u3 = await listen("tray-stop-openclaw", async () => {
          try { await stopOpenClaw(); disconnect(); } catch { /* Ignore */ }
        });
        unlisteners.push(u3);

        const u4 = await listen("tray-toggle-wallpaper", async () => {
          try {
            const currentMode = useAppStore.getState().windowMode;
            const toWallpaper = currentMode !== "wallpaper";
            await toggleWallpaperMode(toWallpaper);
            const newMode = toWallpaper ? "wallpaper" : "window";
            useAppStore.getState().setWindowMode(newMode);
            useAppStore.getState().setWallpaperAttached(toWallpaper);
            await updateTrayWallpaper(toWallpaper);
          } catch (err) {
            console.error("[Wallpaper] Toggle wallpaper mode failed:", err);
          }
        });
        unlisteners.push(u4);
      } catch { /* Tauri event system not available */ }
    }

    setupTrayListeners();
    return () => { for (const u of unlisteners) u(); };
  }, [connect, disconnect, refreshSessions]);

  // ─── Sync connection status → scene + tray ──────────

  useEffect(() => {
    const gm = gameManagerRef.current;
    if (!gm) return;

    const isOnline = connectionStatus === "connected";
    gm.setOnlineMode(isOnline);
    setOpenclawOnline(isOnline);
    gm.setConnectionStatus(connectionStatus);

    if (isOnline) {
      gm.setStatusText("🦞 OpenClaw Wallpaper");
    } else {
      gm.setStatusText(`🦞 OpenClaw Wallpaper — ${CONNECTION_LABELS[connectionStatus]}`);
    }

    updateTrayStatus(isOnline).catch(() => {});
  }, [connectionStatus, setOpenclawOnline, gameReady]);

  // ─── Sync sessions → characters ─────────────────────

  useEffect(() => {
    const gm = gameManagerRef.current;
    if (!gm) return;

    const charManager = gm.getCharacterManager();
    if (charManager) {
      if (connectionStatus === "connected") {
        charManager.syncWithSessions(sessions, agents);
      } else {
        // Gateway offline — clear all characters (triggers despawn animations)
        charManager.syncWithSessions([], []);
      }
    }
  }, [sessions, agents, connectionStatus, gameReady]);

  // ─── Periodic session refresh ───────────────────────

  useEffect(() => {
    if (connectionStatus !== "connected") return;
    const timer = setInterval(() => refreshSessions(), 3000);
    return () => clearInterval(timer);
  }, [connectionStatus, refreshSessions]);

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#2a2a3d",
        display: "flex",
      }}
    >
      {/* Phaser canvas container — takes remaining width */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          position: "relative",
          height: "100vh",
          overflow: "hidden",
        }}
      >
        {/* Loading overlay */}
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
      </div>

      {/* Chat Panel — right sidebar */}
      {gameReady && chatPanelOpen && <ChatPanel />}

      {/* Settings Modal — overlay */}
      {gameReady && <SettingsModal />}
    </div>
  );
};
