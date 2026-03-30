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
import { PIXEL_FONT, COLORS } from "../../styles/pixel-theme";
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

// ── Window Control Button ───────────────────────────────────

const ControlButton: React.FC<{
  icon: string;
  hoverBg: string;
  onClick: () => void;
  title: string;
}> = ({ icon, hoverBg, onClick, title }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title}
      style={{
        width: 28,
        height: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: hovered ? hoverBg : "transparent",
        border: "none",
        cursor: "pointer",
        fontFamily: PIXEL_FONT,
        fontSize: 10,
        color: hovered ? "#fff" : COLORS.textDim,
        transition: "background 0.1s",
        borderRadius: 3,
      }}
    >
      {icon}
    </button>
  );
};

// ── Main Component ──────────────────────────────────────────

export const PixelWindowControls: React.FC = () => {
  const [showConfirm, setShowConfirm] = useState(false);

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
    // Stop gateway
    useAppStore.getState().setStopPending(true);
    useGatewayStore.getState().disconnect();
    try { await stopOpenClaw(); } catch { /* ignore */ }

    // Exit app
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().close();
  }, []);

  return (
    <>
      {/* Draggable title bar area */}
      <div
        data-tauri-drag-region
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 32,
          zIndex: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 4px 0 10px",
          background: "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, transparent 100%)",
          // Allow clicks to pass through to Phaser except on buttons
          pointerEvents: "auto",
        }}
      >
        {/* Title */}
        <div
          data-tauri-drag-region
          style={{
            fontFamily: PIXEL_FONT,
            fontSize: 9,
            color: "rgba(255,255,255,0.6)",
            pointerEvents: "none",
          }}
        >
          🦞 OpenClaw Wallpaper
        </div>

        {/* Window controls */}
        <div style={{ display: "flex", gap: 2 }}>
          <ControlButton icon="─" hoverBg="rgba(255,255,255,0.15)" onClick={handleMinimize} title="最小化" />
          <ControlButton icon="□" hoverBg="rgba(255,255,255,0.15)" onClick={handleMaximize} title="全屏/还原" />
          <ControlButton icon="✕" hoverBg="#cc4444" onClick={() => setShowConfirm(true)} title="关闭" />
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
