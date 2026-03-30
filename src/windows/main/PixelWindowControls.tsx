/**
 * PixelWindowControls — Custom title bar with pixel-art styled
 * minimize / maximize / close buttons.
 *
 * Replaces the native window decorations. The title bar area
 * is draggable for window movement.
 */

import React, { useState, useCallback } from "react";
import { useAppStore } from "../../stores/appStore";
import { useGatewayStore } from "../../stores/gatewayStore";
import { PIXEL_FONT } from "../../styles/pixel-theme";
import {
  stopOpenClaw,
} from "../../utils/tauri-ipc";

// ── Pixel Confirm Dialog ────────────────────────────────────

const PixelConfirmDialog: React.FC<{
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ message, onConfirm, onCancel }) => (
  <div
    style={{
      position: "fixed",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.6)",
      zIndex: 10000,
    }}
    onClick={onCancel}
  >
    <div
      style={{
        background: "#fef9e7",
        border: "3px solid #222",
        borderRadius: 8,
        padding: "16px 20px",
        maxWidth: 360,
        fontFamily: PIXEL_FONT,
        fontSize: 10,
        color: "#222",
        lineHeight: 1.8,
        boxShadow: "4px 4px 0px rgba(0,0,0,0.3)",
        animation: "pixelPop 0.15s ease-out",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ marginBottom: 14, fontSize: 11, fontWeight: "bold" }}>
        ⚠️ 确认关闭
      </div>
      <div style={{ marginBottom: 16, whiteSpace: "pre-line" }}>
        {message}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button
          onClick={onCancel}
          style={{
            fontFamily: PIXEL_FONT,
            fontSize: 9,
            padding: "6px 14px",
            background: "#e0d9c4",
            border: "2px solid #222",
            borderRadius: 4,
            cursor: "pointer",
            color: "#222",
          }}
        >
          取消
        </button>
        <button
          onClick={onConfirm}
          style={{
            fontFamily: PIXEL_FONT,
            fontSize: 9,
            padding: "6px 14px",
            background: "#cc4444",
            border: "2px solid #222",
            borderRadius: 4,
            cursor: "pointer",
            color: "#fff",
          }}
        >
          确认关闭
        </button>
      </div>
    </div>
    <style>{`
      @keyframes pixelPop {
        0% { transform: scale(0.8); opacity: 0; }
        100% { transform: scale(1); opacity: 1; }
      }
    `}</style>
  </div>
);

// ── Pixel Title Button ──────────────────────────────────────

const PixelTitleButton: React.FC<{
  icon: string;
  color: string;
  hoverColor: string;
  onClick: () => void;
  title: string;
}> = ({ icon, color, hoverColor, onClick, title }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title}
      style={{
        width: 36,
        height: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: hovered ? "rgba(255,255,255,0.08)" : "transparent",
        border: "none",
        borderLeft: "1px solid #2a2a4a",
        cursor: "pointer",
        fontFamily: PIXEL_FONT,
        fontSize: 12,
        color: hovered ? hoverColor : color,
        transition: "color 0.1s, background 0.1s",
      }}
    >
      {icon}
    </button>
  );
};

// ── Main Component ──────────────────────────────────────────

export const PixelWindowControls: React.FC = () => {
  const [showConfirm, setShowConfirm] = useState(false);
  const [barHovered, setBarHovered] = useState(false);

  const handleMinimize = useCallback(async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().minimize();
  }, []);

  const handleMaximize = useCallback(async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const isMax = await win.isMaximized();
    if (isMax) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }, []);

  const handleCloseConfirm = useCallback(async () => {
    useAppStore.getState().setStopPending(true);
    useGatewayStore.getState().disconnect();
    try { await stopOpenClaw(); } catch { /* ignore */ }
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().close();
  }, []);

  return (
    <>
      {/* Title bar — semi-transparent, fully visible on hover */}
      <div
        data-tauri-drag-region
        onMouseEnter={() => setBarHovered(true)}
        onMouseLeave={() => setBarHovered(false)}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 30,
          zIndex: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "0 0 0 10px",
          background: barHovered ? "rgba(10,10,20,0.85)" : "rgba(10,10,20,0.15)",
          transition: "background 0.2s, opacity 0.2s",
          pointerEvents: "auto",
        }}
      >
        {/* Title — only visible on hover */}
        <div
          data-tauri-drag-region
          style={{
            flex: 1,
            fontFamily: PIXEL_FONT,
            fontSize: 9,
            color: barHovered ? "rgba(255,255,255,0.6)" : "transparent",
            transition: "color 0.2s",
            pointerEvents: "none",
          }}
        >
          🦞 OpenClaw Wallpaper
        </div>

        {/* Controls — subtle when idle, clear on hover */}
        <div style={{
          display: "flex",
          opacity: barHovered ? 1 : 0.3,
          transition: "opacity 0.2s",
        }}>
          <PixelTitleButton icon="─" color="#6c8" hoverColor="#8ea" onClick={handleMinimize} title="最小化" />
          <PixelTitleButton icon="□" color="#68c" hoverColor="#8ae" onClick={handleMaximize} title="全屏/还原" />
          <PixelTitleButton icon="✕" color="#c44" hoverColor="#f66" onClick={() => setShowConfirm(true)} title="关闭" />
        </div>
      </div>

      {/* Confirm dialog */}
      {showConfirm && (
        <PixelConfirmDialog
          message={"关闭 OpenClaw Wallpaper 会同步\n关闭 OpenClaw Gateway 程序。\n\n是否继续关闭？"}
          onConfirm={handleCloseConfirm}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
};
