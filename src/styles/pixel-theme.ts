/**
 * Shared pixel-art UI styles for React overlay components.
 * Matches the Phaser scene aesthetic.
 */

import type React from "react";

export const PIXEL_FONT = '"Press Start 2P", monospace';

export const COLORS = {
  bg: "#1a1a2e",
  bgLight: "#16213e",
  bgPanel: "#0f3460",
  border: "#e94560",
  borderDim: "#533483",
  text: "#e0e0e0",
  textDim: "#8888aa",
  textBright: "#ffffff",
  accent: "#e94560",
  accentDim: "#c73e54",
  input: "#0a0a1a",
  inputBorder: "#333366",
  success: "#44ff88",
  warning: "#ffcc44",
  error: "#ff4444",
  bubble: "#fef9e7",
};

export const pixelBorder = (color = COLORS.border): React.CSSProperties => ({
  border: `2px solid ${color}`,
  boxShadow: `
    inset -2px -2px 0 0 rgba(0,0,0,0.3),
    inset 2px 2px 0 0 rgba(255,255,255,0.1),
    4px 4px 0 0 rgba(0,0,0,0.4)
  `,
});

export const pixelButton: React.CSSProperties = {
  fontFamily: PIXEL_FONT,
  fontSize: "8px",
  padding: "6px 12px",
  background: COLORS.accent,
  color: COLORS.textBright,
  border: `2px solid ${COLORS.border}`,
  cursor: "pointer",
  imageRendering: "pixelated" as const,
  boxShadow: "2px 2px 0 0 rgba(0,0,0,0.5)",
};

export const pixelInput: React.CSSProperties = {
  fontFamily: PIXEL_FONT,
  fontSize: "8px",
  padding: "6px 8px",
  background: COLORS.input,
  color: COLORS.text,
  border: `2px solid ${COLORS.inputBorder}`,
  outline: "none",
  width: "100%",
  boxSizing: "border-box" as const,
};
