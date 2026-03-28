/**
 * SettingsModal — Pixel-art modal for OpenClaw configuration.
 *
 * Triggered by clicking the whiteboard in the Phaser scene.
 * Allows configuring: Gateway URL, token, model settings.
 */

import React, { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../stores/appStore";
import { useGatewayStore } from "../../stores/gatewayStore";
import { PIXEL_FONT, COLORS, pixelBorder, pixelButton, pixelInput } from "../../styles/pixel-theme";
import {
  getGatewayUrl,
  getGatewayToken,
} from "../../utils/tauri-ipc";

export const SettingsModal: React.FC = () => {
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const connectionStatus = useGatewayStore((s) => s.connectionStatus);

  const [gwUrl, setGwUrl] = useState("");
  const [gwToken, setGwToken] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load current settings
  useEffect(() => {
    if (!settingsOpen) return;
    setLoading(true);
    setSaved(false);

    Promise.all([
      getGatewayUrl().catch(() => "ws://127.0.0.1:18789"),
      getGatewayToken().catch(() => ({ gatewayToken: "", deviceToken: "" })),
    ]).then(([url, tokens]) => {
      setGwUrl(url);
      setGwToken(tokens.gatewayToken ?? "");
      setLoading(false);
    });
  }, [settingsOpen]);

  const handleSave = useCallback(async () => {
    // TODO: Implement setGatewayUrl/setGatewayToken Tauri IPC commands
    console.log("[Settings] Save not yet implemented — URL:", gwUrl, "Token:", gwToken ? "***" : "(empty)");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [gwUrl, gwToken]);

  const handleClose = useCallback(() => {
    setSettingsOpen(false);
  }, [setSettingsOpen]);

  if (!settingsOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        zIndex: 200,
      }}
      onClick={handleClose}
    >
      <div
        style={{
          width: 460,
          maxHeight: "80vh",
          background: COLORS.bg,
          ...pixelBorder(COLORS.accent),
          padding: 0,
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div
          style={{
            padding: "10px 14px",
            background: COLORS.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontFamily: PIXEL_FONT,
              fontSize: "12px",
              color: COLORS.textBright,
            }}
          >
            ⚙️ Settings
          </span>
          <button
            onClick={handleClose}
            style={{
              ...pixelButton,
              background: "transparent",
              border: "none",
              boxShadow: "none",
              padding: "2px 6px",
              fontSize: "13px",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: "14px" }}>
          {loading ? (
            <div style={{ fontFamily: PIXEL_FONT, fontSize: "13px", color: COLORS.textDim, textAlign: "center", padding: 20 }}>
              Loading settings...
            </div>
          ) : (
            <>
              {/* Connection status */}
              <div
                style={{
                  fontFamily: PIXEL_FONT,
                  fontSize: "13px",
                  color: connectionStatus === "connected" ? COLORS.success : COLORS.error,
                  marginBottom: 14,
                  padding: "6px 8px",
                  background: "rgba(255,255,255,0.05)",
                  border: `1px solid ${COLORS.inputBorder}`,
                }}
              >
                {connectionStatus === "connected" ? "🟢 Connected" : "🔴 Disconnected"}
              </div>

              {/* Gateway URL */}
              <SettingsField label="Gateway URL">
                <input
                  type="text"
                  value={gwUrl}
                  onChange={(e) => setGwUrl(e.target.value)}
                  placeholder="ws://127.0.0.1:18789"
                  style={pixelInput}
                />
              </SettingsField>

              {/* Gateway Token */}
              <SettingsField label="Gateway Token">
                <input
                  type="password"
                  value={gwToken}
                  onChange={(e) => setGwToken(e.target.value)}
                  placeholder="(optional)"
                  style={pixelInput}
                />
              </SettingsField>

              {/* Save button */}
              <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                {saved && (
                  <span style={{ fontFamily: PIXEL_FONT, fontSize: "13px", color: COLORS.success, alignSelf: "center" }}>
                    ✓ Saved!
                  </span>
                )}
                <button onClick={handleSave} style={pixelButton}>
                  💾 Save
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Field wrapper ───────────────────────────────────────

const SettingsField: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div style={{ marginBottom: 12 }}>
    <div
      style={{
        fontFamily: PIXEL_FONT,
        fontSize: "13px",
        color: COLORS.textDim,
        marginBottom: 4,
      }}
    >
      {label}
    </div>
    {children}
  </div>
);
