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

// ── Module-level position storage ────────────────────────────

const _panelPosition = { x: 0, y: 0 };

/**
 * Set the screen position where the info panel should appear.
 * Called from the Phaser click handler before selecting a character.
 */
export function setInfoPanelPosition(x: number, y: number): void {
  _panelPosition.x = x;
  _panelPosition.y = y;
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
  const sessions = useGatewayStore((s) => s.sessions);
  const agents = useGatewayStore((s) => s.agents);
  const panelRef = useRef<HTMLDivElement>(null);

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

  if (!selectedId || !session) return null;

  const statusDisplay = getStatusDisplay(session.status);
  const displayName =
    session.label ?? agent?.name ?? `Agent ${session.key.slice(0, 8)}`;

  // ── Position calculation ──────────────────────────
  const charX = _panelPosition.x;
  const charY = _panelPosition.y;
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
          fontFamily: '"Press Start 2P", monospace',
          fontSize: 8,
          color: "#222",
          lineHeight: 1.7,
        }}
      >
        {/* Agent name */}
        <div
          style={{
            fontSize: 10,
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
            fontSize: 7,
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
            <div style={{ color: "#b07030", fontSize: 7, marginTop: 3 }}>
              💺 {seatName}
            </div>
          ) : null;
        })()}

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
