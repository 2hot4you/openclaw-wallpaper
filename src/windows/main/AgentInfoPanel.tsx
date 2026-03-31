import React, { useEffect, useRef, useCallback, useState } from "react";
import { useAppStore } from "../../stores/appStore";
import { useGatewayStore } from "../../stores/gatewayStore";
import { resolveDisplayName } from "../../gateway/SessionMapper";

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
function getStatusDisplay(status: string | undefined): {
  emoji: string;
  label: string;
  color: string;
} {
  switch (status) {
    case "active":
    case "running":
    case "busy":
    case "working":
      return { emoji: "⚡", label: "工作中", color: "#c8860a" };
    case "error":
    case "failed":
      return { emoji: "💥", label: "错误", color: "#cc3333" };
    default:
      return { emoji: "💤", label: "空闲", color: "#4a7c59" };
  }
}

/** Check if a session status is considered "active" (running) */
function isActiveStatus(status: string | undefined): boolean {
  return status === "active" || status === "running" || status === "busy" || status === "working";
}

// ── Module-level position storage ────────────────────────────

/** World coordinates of the selected character (survives resize) */
const _selectedWorldPos = { x: 0, y: 0 };

/** Function to convert world coords → screen coords (set by MainWindow) */
let _worldToScreen: ((wx: number, wy: number) => { x: number; y: number }) | null = null;

/**
 * Set the world position of the selected character.
 * Called from the Phaser click handler before selecting a character.
 */
export function setInfoPanelPosition(_screenX: number, _screenY: number, worldX?: number, worldY?: number): void {
  if (worldX !== undefined && worldY !== undefined) {
    _selectedWorldPos.x = worldX;
    _selectedWorldPos.y = worldY;
  }
}

/**
 * Register a world→screen coordinate converter.
 * Called once from MainWindow after GameManager is ready.
 */
export function setWorldToScreenFn(fn: ((wx: number, wy: number) => { x: number; y: number }) | null): void {
  _worldToScreen = fn;
}

/**
 * Get current screen position from world coordinates.
 */
function getScreenPosition(): { x: number; y: number } {
  if (_worldToScreen) {
    return _worldToScreen(_selectedWorldPos.x, _selectedWorldPos.y);
  }
  return { x: 0, y: 0 };
}

// ── Module-level seat index lookup ───────────────────────────

let _seatIndexLookup: ((sessionKey: string) => string | null) | null = null;

/**
 * Register a function that returns the seat name for a given session key.
 * Called once from MainWindow after GameManager is ready.
 */
export function setSeatIndexLookup(fn: ((sessionKey: string) => string | null) | null): void {
  _seatIndexLookup = fn;
}

// ── Bubble constants ─────────────────────────────────────────

const BUBBLE_WIDTH = 230;
const BUBBLE_OFFSET_X = 24; // offset right of character
const BUBBLE_OFFSET_Y = -130; // offset above character
const TAIL_SIZE = 10;

/**
 * Comic speech bubble info panel.
 *
 * Appears at the top-right of the clicked character with a triangular
 * tail pointing down-left toward the character. Pixel-art styled.
 */
export const AgentInfoPanelWithPosition: React.FC = () => {
  const selectedId = useAppStore((s) => s.selectedCharacterId);
  const setSelectedId = useAppStore((s) => s.setSelectedCharacterId);
  const setChatPanelOpen = useAppStore((s) => s.setChatPanelOpen);
  const setChatSessionKey = useAppStore((s) => s.setChatSessionKey);
  const sessions = useGatewayStore((s) => s.sessions);
  const agents = useGatewayStore((s) => s.agents);
  const deleteSession = useGatewayStore((s) => s.deleteSession);
  const abortSession = useGatewayStore((s) => s.abortSession);
  const panelRef = useRef<HTMLDivElement>(null);

  // Confirmation state for destructive actions
  const [confirmAction, setConfirmAction] = useState<"abort" | "delete" | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Force re-render on window resize so position recalculates
  const [, setResizeCount] = useState(0);
  useEffect(() => {
    const onResize = () => setResizeCount((c) => c + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Reset confirm state when selection changes
  useEffect(() => {
    setConfirmAction(null);
    if (confirmTimerRef.current) { clearTimeout(confirmTimerRef.current); confirmTimerRef.current = null; }
  }, [selectedId]);

  const session = selectedId
    ? sessions.find((s) => s.key === selectedId)
    : null;
  const agent = session?.agentId
    ? agents.find((a) => a.agentId === session.agentId)
    : null;

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

  // Action button handlers
  const handleChat = useCallback(() => {
    if (!selectedId) return;
    setChatSessionKey(selectedId);
    setChatPanelOpen(true);
  }, [selectedId, setChatSessionKey, setChatPanelOpen]);

  const handleAbort = useCallback(() => {
    if (!selectedId) return;
    if (confirmAction === "abort") {
      // Second click — execute
      abortSession(selectedId).catch((err) => console.warn("[AgentInfoPanel] abort failed:", err));
      setConfirmAction(null);
      if (confirmTimerRef.current) { clearTimeout(confirmTimerRef.current); confirmTimerRef.current = null; }
      return;
    }
    // First click — enter confirm state
    setConfirmAction("abort");
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = setTimeout(() => setConfirmAction(null), 2000);
  }, [selectedId, confirmAction, abortSession]);

  const handleDelete = useCallback(() => {
    if (!selectedId) return;
    if (confirmAction === "delete") {
      // Second click — execute
      deleteSession(selectedId).catch((err) => console.warn("[AgentInfoPanel] delete failed:", err));
      setConfirmAction(null);
      setSelectedId(null);
      if (confirmTimerRef.current) { clearTimeout(confirmTimerRef.current); confirmTimerRef.current = null; }
      return;
    }
    // First click — enter confirm state
    setConfirmAction("delete");
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = setTimeout(() => setConfirmAction(null), 2000);
  }, [selectedId, confirmAction, deleteSession, setSelectedId]);

  if (!selectedId || !session) return null;

  const statusDisplay = getStatusDisplay(session.status);
  const displayName = resolveDisplayName(session, agent ?? undefined);

  // ── Position calculation (real-time from world coords) ──
  const screenPos = getScreenPosition();
  const charX = screenPos.x;
  const charY = screenPos.y;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Default: bubble top-right of character
  let bubbleLeft = charX + BUBBLE_OFFSET_X;
  let bubbleTop = charY + BUBBLE_OFFSET_Y;

  // Flip horizontally if it goes off the right edge
  const flippedX = bubbleLeft + BUBBLE_WIDTH > vw - 10;
  if (flippedX) {
    bubbleLeft = charX - BUBBLE_WIDTH - BUBBLE_OFFSET_X;
  }

  // Clamp to viewport
  if (bubbleTop < 10) bubbleTop = 10;
  if (bubbleTop + 180 > vh - 10) bubbleTop = vh - 190;
  if (bubbleLeft < 10) bubbleLeft = 10;

  // Tail: points toward the character
  // When not flipped: tail on the left side pointing down-left
  // When flipped: tail on the right side pointing down-right
  const tailStyle: React.CSSProperties = flippedX
    ? {
        position: "absolute",
        bottom: -TAIL_SIZE,
        right: 16,
        width: 0,
        height: 0,
        borderLeft: `${TAIL_SIZE}px solid transparent`,
        borderRight: `${TAIL_SIZE}px solid transparent`,
        borderTop: `${TAIL_SIZE}px solid #222`,
      }
    : {
        position: "absolute",
        bottom: -TAIL_SIZE,
        left: 16,
        width: 0,
        height: 0,
        borderLeft: `${TAIL_SIZE}px solid transparent`,
        borderRight: `${TAIL_SIZE}px solid transparent`,
        borderTop: `${TAIL_SIZE}px solid #222`,
      };

  // Inner tail (to create the filled effect matching background)
  const tailInnerStyle: React.CSSProperties = flippedX
    ? {
        position: "absolute",
        bottom: -TAIL_SIZE + 2,
        right: 18,
        width: 0,
        height: 0,
        borderLeft: `${TAIL_SIZE - 2}px solid transparent`,
        borderRight: `${TAIL_SIZE - 2}px solid transparent`,
        borderTop: `${TAIL_SIZE - 2}px solid #fef9e7`,
      }
    : {
        position: "absolute",
        bottom: -TAIL_SIZE + 2,
        left: 18,
        width: 0,
        height: 0,
        borderLeft: `${TAIL_SIZE - 2}px solid transparent`,
        borderRight: `${TAIL_SIZE - 2}px solid transparent`,
        borderTop: `${TAIL_SIZE - 2}px solid #fef9e7`,
      };

  return (
    <div
      ref={panelRef}
      style={{
        position: "absolute",
        left: bubbleLeft,
        top: bubbleTop,
        width: BUBBLE_WIDTH,
        zIndex: 1000,
        pointerEvents: "auto",
        filter: "drop-shadow(2px 3px 0px rgba(0,0,0,0.25))",
        animation: "bubblePop 0.2s ease-out",
      }}
    >
      {/* Bubble body */}
      <div
        style={{
          position: "relative",
          background: "#fef9e7",
          border: "2px solid #222",
          borderRadius: 10,
          padding: "10px 12px",
          fontFamily: '"Segoe UI", "Noto Sans SC", system-ui, sans-serif',
          fontSize: 12,
          color: "#222",
          lineHeight: 1.7,
        }}
      >
        {/* Agent name */}
        <div
          style={{
            fontSize: 14,
            fontWeight: "bold",
            marginBottom: 6,
            color: "#1a1a2e",
            borderBottom: "1px dashed #d4c89a",
            paddingBottom: 5,
            wordBreak: "break-all",
          }}
        >
          {agent?.emoji ? `${agent.emoji} ` : "🤖 "}
          {displayName}
        </div>

        {/* Status */}
        <div style={{ marginBottom: 5 }}>
          <span style={{ color: statusDisplay.color }}>
            {statusDisplay.emoji} {statusDisplay.label}
          </span>
        </div>

        {/* Model */}
        {session.model && (
          <div style={{ marginBottom: 4, color: "#666" }}>
            🧠 {session.model}
          </div>
        )}

        {/* Token usage */}
        {session.totalTokens != null && session.totalTokens > 0 && (
          <div style={{ marginBottom: 4, color: "#666" }}>
            📊 {session.totalTokens.toLocaleString()} tokens
          </div>
        )}

        {/* Last updated */}
        <div
          style={{
            color: "#999",
            fontSize: 11,
            marginTop: 6,
            borderTop: "1px dashed #d4c89a",
            paddingTop: 4,
          }}
        >
          🕐 {formatRelativeTime(session.updatedAt)}
        </div>

        {/* Debug: seat name */}
        {(() => {
          const seatName = _seatIndexLookup?.(session.key);
          return seatName ? (
            <div style={{ color: "#b07030", fontSize: 11, marginTop: 3 }}>
              💺 {seatName}
            </div>
          ) : null;
        })()}

        {/* Action buttons */}
        <div
          style={{
            display: "flex",
            gap: 6,
            marginTop: 8,
            paddingTop: 6,
            borderTop: "1px dashed #d4c89a",
            flexWrap: "wrap",
          }}
        >
          {/* Chat button */}
          <button
            onClick={handleChat}
            style={{
              flex: 1,
              minWidth: 60,
              padding: "4px 8px",
              fontSize: 11,
              fontFamily: '"Segoe UI", "Noto Sans SC", system-ui, sans-serif',
              border: "1px solid #aaa",
              borderRadius: 4,
              background: "#e8e0c8",
              color: "#4a7c59",
              cursor: "pointer",
            }}
          >
            💬 Chat
          </button>

          {/* Stop button — only for active sessions */}
          {isActiveStatus(session.status) && (
            <button
              onClick={handleAbort}
              style={{
                flex: 1,
                minWidth: 60,
                padding: "4px 8px",
                fontSize: 11,
                fontFamily: '"Segoe UI", "Noto Sans SC", system-ui, sans-serif',
                border: confirmAction === "abort" ? "1px solid #cc3333" : "1px solid #aaa",
                borderRadius: 4,
                background: confirmAction === "abort" ? "#ffdddd" : "#e8e0c8",
                color: confirmAction === "abort" ? "#cc3333" : "#c8860a",
                cursor: "pointer",
              }}
            >
              {confirmAction === "abort" ? "Sure?" : "⏹ Stop"}
            </button>
          )}

          {/* Delete button */}
          <button
            onClick={handleDelete}
            style={{
              flex: 1,
              minWidth: 60,
              padding: "4px 8px",
              fontSize: 11,
              fontFamily: '"Segoe UI", "Noto Sans SC", system-ui, sans-serif',
              border: confirmAction === "delete" ? "1px solid #cc3333" : "1px solid #aaa",
              borderRadius: 4,
              background: confirmAction === "delete" ? "#ffdddd" : "#e8e0c8",
              color: confirmAction === "delete" ? "#cc3333" : "#888",
              cursor: "pointer",
            }}
          >
            {confirmAction === "delete" ? "Sure?" : "🗑 Delete"}
          </button>
        </div>

        {/* Triangle tail (border) */}
        <div style={tailStyle} />
        {/* Triangle tail (fill) */}
        <div style={tailInnerStyle} />
      </div>

      {/* Inline keyframe animation */}
      <style>{`
        @keyframes bubblePop {
          0% {
            opacity: 0;
            transform: scale(0.8) translateY(8px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

// Keep the old export name for backward compat (not used anymore but safe)
export const AgentInfoPanel = AgentInfoPanelWithPosition;
