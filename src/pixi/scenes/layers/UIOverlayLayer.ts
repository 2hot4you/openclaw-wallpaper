/**
 * UIOverlayLayer — Status text overlay (connection status, FPS, scene info).
 */

import { Container, Text, TextStyle } from "pixi.js";
import type { ConnectionStatus } from "../../../gateway/types";

const STATUS_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 11,
  fill: 0xffffff,
  stroke: { color: 0x000000, width: 3 },
  align: "left",
});

const FPS_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 10,
  fill: 0xaaffaa,
  stroke: { color: 0x000000, width: 2 },
  align: "right",
});

const CONNECTION_STYLE_CONNECTED = new TextStyle({
  fontFamily: "monospace",
  fontSize: 10,
  fill: 0x44ff44,
  stroke: { color: 0x000000, width: 2 },
  align: "left",
});

const CONNECTION_STYLE_DISCONNECTED = new TextStyle({
  fontFamily: "monospace",
  fontSize: 10,
  fill: 0xff6666,
  stroke: { color: 0x000000, width: 2 },
  align: "left",
});

const CONNECTION_STYLE_CONNECTING = new TextStyle({
  fontFamily: "monospace",
  fontSize: 10,
  fill: 0xffcc44,
  stroke: { color: 0x000000, width: 2 },
  align: "left",
});

/** Map connection status to display info */
const STATUS_MAP: Record<ConnectionStatus, { emoji: string; label: string; style: TextStyle }> = {
  connected: { emoji: "🟢", label: "Connected", style: CONNECTION_STYLE_CONNECTED },
  disconnected: { emoji: "🔴", label: "Disconnected", style: CONNECTION_STYLE_DISCONNECTED },
  connecting: { emoji: "🟡", label: "Connecting...", style: CONNECTION_STYLE_CONNECTING },
  reconnecting: { emoji: "🟡", label: "Reconnecting...", style: CONNECTION_STYLE_CONNECTING },
};

export class UIOverlayLayer {
  public readonly container: Container;
  private statusText: Text;
  private connectionText: Text;
  private fpsText: Text;
  private _fpsAccum = 0;
  private _fpsFrames = 0;

  constructor() {
    this.container = new Container();
    this.container.label = "ui-overlay-layer";

    // Status text (top-left)
    this.statusText = new Text({
      text: "🦞 OpenClaw Wallpaper",
      style: STATUS_STYLE,
    });
    this.statusText.x = 8;
    this.statusText.y = 8;
    this.container.addChild(this.statusText);

    // Connection status (below main status)
    this.connectionText = new Text({
      text: "🔴 Disconnected",
      style: CONNECTION_STYLE_DISCONNECTED,
    });
    this.connectionText.x = 8;
    this.connectionText.y = 24;
    this.container.addChild(this.connectionText);

    // FPS counter (top-right)
    this.fpsText = new Text({
      text: "FPS: --",
      style: FPS_STYLE,
    });
    this.fpsText.anchor.set(1, 0);
    this.container.addChild(this.fpsText);
  }

  init(w: number, _h: number): void {
    this.fpsText.x = w - 8;
    this.fpsText.y = 8;
  }

  setStatus(text: string): void {
    this.statusText.text = text;
  }

  /**
   * Update the connection status indicator.
   */
  setConnectionStatus(status: ConnectionStatus): void {
    const info = STATUS_MAP[status];
    this.connectionText.text = `${info.emoji} ${info.label}`;
    this.connectionText.style = info.style;
  }

  update(dt: number): void {
    // FPS counter: update every ~30 frames
    this._fpsAccum += dt;
    this._fpsFrames++;
    if (this._fpsAccum >= 30) {
      const displayFps = Math.round(this._fpsFrames / (this._fpsAccum / 60));
      this.fpsText.text = `FPS: ${displayFps}`;
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }
  }

  onResize(w: number, _h: number): void {
    this.fpsText.x = w - 8;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
