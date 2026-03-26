/**
 * UIOverlayLayer — Status text overlay (connection status, FPS, scene info).
 */

import { Container, Text, TextStyle } from "pixi.js";

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

export class UIOverlayLayer {
  public readonly container: Container;
  private statusText: Text;
  private fpsText: Text;
  private _fpsAccum = 0;
  private _fpsFrames = 0;
  private _displayFps = 0;

  constructor() {
    this.container = new Container();
    this.container.label = "ui-overlay-layer";

    // Status text (top-left)
    this.statusText = new Text({
      text: "🦞 OpenClaw Wallpaper — Mock Mode",
      style: STATUS_STYLE,
    });
    this.statusText.x = 8;
    this.statusText.y = 8;
    this.container.addChild(this.statusText);

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

  update(dt: number): void {
    // FPS counter: update every ~30 frames
    this._fpsAccum += dt;
    this._fpsFrames++;
    if (this._fpsAccum >= 30) {
      this._displayFps = Math.round(this._fpsFrames / (this._fpsAccum / 60));
      this.fpsText.text = `FPS: ${this._displayFps}`;
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
