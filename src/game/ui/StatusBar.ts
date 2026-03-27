/**
 * StatusBar — Bottom status bar rendered as Phaser DOM overlay.
 *
 * Shows: connection status, agent count, OpenClaw branding.
 * Rendered as a Phaser text element positioned at the bottom of the camera viewport.
 */

import Phaser from "phaser";
import type { ConnectionStatus } from "../../gateway/types";

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connected: "#44ff44",
  disconnected: "#ff4444",
  connecting: "#ffcc44",
  reconnecting: "#ffcc44",
};

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: "🟢 Connected",
  disconnected: "🔴 Disconnected",
  connecting: "🟡 Connecting...",
  reconnecting: "🟡 Reconnecting...",
};

export class StatusBar {
  private statusText: Phaser.GameObjects.Text;
  private brandText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {

    // Brand text (top-left, fixed to camera)
    this.brandText = scene.add
      .text(8, 8, "🦞 OpenClaw Wallpaper", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setScrollFactor(0)
      .setDepth(100);

    // Connection status (below brand)
    this.statusText = scene.add
      .text(8, 24, STATUS_LABELS.disconnected, {
        fontFamily: "monospace",
        fontSize: "10px",
        color: STATUS_COLORS.disconnected,
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(100);
  }

  /**
   * Update connection status display.
   */
  setConnectionStatus(status: ConnectionStatus): void {
    this.statusText.setText(STATUS_LABELS[status]);
    this.statusText.setColor(STATUS_COLORS[status]);
  }

  /**
   * Set the main status text (override brand text).
   */
  setStatusText(text: string): void {
    this.brandText.setText(text);
  }

  /**
   * Clean up.
   */
  destroy(): void {
    this.statusText.destroy();
    this.brandText.destroy();
  }
}
