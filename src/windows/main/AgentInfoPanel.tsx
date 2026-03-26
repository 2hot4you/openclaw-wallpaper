import React, { useEffect, useRef, useCallback } from "react";
import { useAppStore } from "../../stores/appStore";
import { useGatewayStore } from "../../stores/gatewayStore";

/** Format relative time like "2 分钟前" */
function formatRelativeTime(timestamp: number | undefined): string {
  if (!timestamp) return "未知";
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

/** Map status to display info */
function getStatusDisplay(status: string | undefined): { emoji: string; label: string; color: string } {
  switch (status) {
    case "active":
    case "running":
    case "busy":
    case "working":
      return { emoji: "🟡", label: "工作中", color: "#ffd700" };
    case "error":
    case "failed":
      return { emoji: "🔴", label: "错误", color: "#ff4444" };
    default:
      return { emoji: "🟢", label: "空闲", color: "#44ff44" };
  }
}

export const AgentInfoPanel: React.FC = () => {
  const selectedId = useAppStore((s) => s.selectedCharacterId);
  const setSelectedId = useAppStore((s) => s.setSelectedCharacterId);
  const sessions = useGatewayStore((s) => s.sessions);
  const agents = useGatewayStore((s) => s.agents);
  const panelRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Find matching session and agent data
  const session = selectedId ? sessions.find((s) => s.key === selectedId) : null;
  const agent = session?.agentId ? agents.find((a) => a.agentId === session.agentId) : null;

  // Close on click outside
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setSelectedId(null);
      }
    },
    [setSelectedId],
  );

  useEffect(() => {
    if (selectedId) {
      // Slight delay to avoid the same click closing the panel
      const timer = setTimeout(() => {
        document.addEventListener("mousedown", handleClickOutside);
      }, 50);
      return () => {
        clearTimeout(timer);
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [selectedId, handleClickOutside]);

  if (!selectedId || !session) return null;

  const statusDisplay = getStatusDisplay(session.status);
  const displayName = session.label ?? agent?.name ?? `Agent ${session.key.slice(0, 8)}`;

  // Position panel near the clicked character
  const pos = posRef.current;
  const panelStyle: React.CSSProperties = {
    position: "absolute",
    left: Math.min(pos.x + 20, window.innerWidth - 280),
    top: Math.max(pos.y - 120, 10),
    width: 250,
    zIndex: 1000,
    // Pixel-art style border using box-shadow
    background: "rgba(20, 20, 30, 0.92)",
    color: "#fff",
    fontFamily: "monospace",
    fontSize: 12,
    padding: "14px 16px",
    boxShadow: `
      inset 2px 2px 0 rgba(255,255,255,0.15),
      inset -2px -2px 0 rgba(0,0,0,0.3),
      4px 4px 0 rgba(0,0,0,0.4),
      -1px -1px 0 #555,
      1px -1px 0 #555,
      -1px 1px 0 #555,
      1px 1px 0 #555
    `,
    borderRadius: 2,
    pointerEvents: "auto" as const,
  };

  return (
    <div ref={panelRef} style={panelStyle}>
      {/* Agent name */}
      <div style={{ fontSize: 16, fontWeight: "bold", marginBottom: 8 }}>
        {agent?.emoji ? `${agent.emoji} ` : ""}{displayName}
      </div>

      {/* Status */}
      <div style={{ marginBottom: 6 }}>
        <span style={{ color: statusDisplay.color }}>
          {statusDisplay.emoji} {statusDisplay.label}
        </span>
      </div>

      {/* Session key */}
      <div style={{ color: "#888", fontSize: 10, marginBottom: 6 }}>
        Session: {session.key}
      </div>

      {/* Model */}
      {session.model && (
        <div style={{ marginBottom: 4 }}>
          <span style={{ color: "#aaa" }}>Model: </span>
          <span style={{ color: "#88ccff" }}>{session.model}</span>
        </div>
      )}

      {/* Token usage */}
      {session.totalTokens != null && session.totalTokens > 0 && (
        <div style={{ marginBottom: 4 }}>
          <span style={{ color: "#aaa" }}>Tokens: </span>
          <span style={{ color: "#ffcc88" }}>{session.totalTokens.toLocaleString()}</span>
        </div>
      )}

      {/* Last updated */}
      <div style={{ color: "#666", fontSize: 10, marginTop: 8 }}>
        更新于 {formatRelativeTime(session.updatedAt)}
      </div>
    </div>
  );
};

/**
 * Set the position where the next info panel should appear.
 * Called from the PixiJS click handler before selecting a character.
 */
export function setInfoPanelPosition(x: number, y: number): void {
  // Access the static posRef through a module-level variable
  _panelPosition.x = x;
  _panelPosition.y = y;
}

// Module-level position storage (shared between setInfoPanelPosition and the component)
const _panelPosition = { x: 0, y: 0 };

/**
 * Wrapper component that properly handles position updates.
 */
export const AgentInfoPanelWithPosition: React.FC = () => {
  const selectedId = useAppStore((s) => s.selectedCharacterId);
  const panelRef = useRef<HTMLDivElement>(null);
  const setSelectedId = useAppStore((s) => s.setSelectedCharacterId);
  const sessions = useGatewayStore((s) => s.sessions);
  const agents = useGatewayStore((s) => s.agents);

  const session = selectedId ? sessions.find((s) => s.key === selectedId) : null;
  const agent = session?.agentId ? agents.find((a) => a.agentId === session.agentId) : null;

  // Close on click outside
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setSelectedId(null);
      }
    },
    [setSelectedId],
  );

  useEffect(() => {
    if (selectedId) {
      const timer = setTimeout(() => {
        document.addEventListener("mousedown", handleClickOutside);
      }, 50);
      return () => {
        clearTimeout(timer);
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [selectedId, handleClickOutside]);

  if (!selectedId || !session) return null;

  const statusDisplay = getStatusDisplay(session.status);
  const displayName = session.label ?? agent?.name ?? `Agent ${session.key.slice(0, 8)}`;

  const pos = _panelPosition;
  const panelStyle: React.CSSProperties = {
    position: "absolute",
    left: Math.min(pos.x + 20, window.innerWidth - 280),
    top: Math.max(pos.y - 120, 10),
    width: 250,
    zIndex: 1000,
    background: "rgba(20, 20, 30, 0.92)",
    color: "#fff",
    fontFamily: "monospace",
    fontSize: 12,
    padding: "14px 16px",
    boxShadow: `
      inset 2px 2px 0 rgba(255,255,255,0.15),
      inset -2px -2px 0 rgba(0,0,0,0.3),
      4px 4px 0 rgba(0,0,0,0.4),
      -1px -1px 0 #555,
      1px -1px 0 #555,
      -1px 1px 0 #555,
      1px 1px 0 #555
    `,
    borderRadius: 2,
    pointerEvents: "auto",
  };

  return (
    <div ref={panelRef} style={panelStyle}>
      <div style={{ fontSize: 16, fontWeight: "bold", marginBottom: 8 }}>
        {agent?.emoji ? `${agent.emoji} ` : ""}{displayName}
      </div>
      <div style={{ marginBottom: 6 }}>
        <span style={{ color: statusDisplay.color }}>
          {statusDisplay.emoji} {statusDisplay.label}
        </span>
      </div>
      <div style={{ color: "#888", fontSize: 10, marginBottom: 6 }}>
        Session: {session.key}
      </div>
      {session.model && (
        <div style={{ marginBottom: 4 }}>
          <span style={{ color: "#aaa" }}>Model: </span>
          <span style={{ color: "#88ccff" }}>{session.model}</span>
        </div>
      )}
      {session.totalTokens != null && session.totalTokens > 0 && (
        <div style={{ marginBottom: 4 }}>
          <span style={{ color: "#aaa" }}>Tokens: </span>
          <span style={{ color: "#ffcc88" }}>{session.totalTokens.toLocaleString()}</span>
        </div>
      )}
      <div style={{ color: "#666", fontSize: 10, marginTop: 8 }}>
        更新于 {formatRelativeTime(session.updatedAt)}
      </div>
    </div>
  );
};
