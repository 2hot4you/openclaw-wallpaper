import React, { useEffect, useRef, useState } from "react";
import type { SessionData } from "../../gateway/types";

// Lazy-load SceneManager to isolate PixiJS init
let SceneManagerModule: typeof import("../../pixi/engine/SceneManager") | null = null;

/** Mock session data: 3 agents in different states */
const MOCK_SESSIONS: SessionData[] = [
  {
    key: "agent-pm-001",
    label: "PM",
    kind: "session",
    status: "idle",
    agentId: "pm",
  },
  {
    key: "agent-frontend-002",
    label: "Frontend",
    kind: "session",
    status: "active", // maps to "working"
    agentId: "frontend",
  },
  {
    key: "agent-backend-003",
    label: "Backend",
    kind: "session",
    status: "error",
    agentId: "backend",
  },
];

export const MainWindow: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneManagerRef = useRef<InstanceType<NonNullable<typeof SceneManagerModule>["SceneManager"]> | null>(null);
  const [status, setStatus] = useState<string>("Starting...");
  const [error, setError] = useState<string | null>(null);
  const [pixiReady, setPixiReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    async function initPixi() {
      try {
        setStatus("Loading PixiJS module...");
        // Dynamic import to catch module-level errors
        SceneManagerModule = await import("../../pixi/engine/SceneManager");
        if (cancelled) return;

        setStatus("Creating SceneManager...");
        const sm = new SceneManagerModule.SceneManager();
        sceneManagerRef.current = sm;

        setStatus("Initializing renderer...");
        await sm.init(containerRef.current!);
        if (cancelled) return;

        setStatus("Loading Workshop Scene...");
        // Sync mock session data to character manager
        const charManager = sm.getCharacterManager();
        if (charManager) {
          charManager.syncWithSessions(MOCK_SESSIONS);
        }

        setStatus("Running");
        setPixiReady(true);
      } catch (err) {
        if (cancelled) return;
        console.error("PixiJS init failed:", err);
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
  }, []);

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
    </div>
  );
};
