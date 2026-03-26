import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";

/**
 * A simple test scene to verify PixiJS rendering works correctly.
 * Renders: sky-blue gradient background + white circle + info text.
 * This will be replaced by the real Workshop scene in M2.
 */
export class TestScene {
  public container: Container;
  private app: Application;

  private bgGraphics: Graphics;
  private circle: Graphics;
  private infoText: Text;

  constructor(app: Application) {
    this.app = app;
    this.container = new Container();

    this.bgGraphics = new Graphics();
    this.circle = new Graphics();
    this.infoText = new Text({ text: "" });
  }

  async init(): Promise<void> {
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    // -- Gradient background (sky blue to light green) --
    this.drawBackground(w, h);
    this.container.addChild(this.bgGraphics);

    // -- White circle in center --
    this.drawCircle(w, h);
    this.container.addChild(this.circle);

    // -- Info text --
    const style = new TextStyle({
      fontFamily: "monospace",
      fontSize: 18,
      fill: 0xffffff,
      align: "center",
      dropShadow: {
        color: 0x000000,
        blur: 4,
        distance: 1,
        alpha: 0.5,
      },
    });

    this.infoText = new Text({
      text: "🎨 PixiJS v8 + Tauri v2\nOpenClaw Wallpaper — M1 Test Scene\n\nResize the window to verify responsive canvas.",
      style,
    });
    this.infoText.anchor.set(0.5, 0);
    this.infoText.x = w / 2;
    this.infoText.y = h * 0.12;
    this.container.addChild(this.infoText);

    // -- Floating animation on circle --
    let elapsed = 0;
    this.app.ticker.add((ticker) => {
      elapsed += ticker.deltaTime;
      this.circle.y = this.app.screen.height / 2 + Math.sin(elapsed * 0.03) * 15;
    });
  }

  private drawBackground(w: number, h: number): void {
    this.bgGraphics.clear();

    // Top color: sky blue #87CEEB
    // Bottom color: light green #90EE90
    // PixiJS v8: use fillGradientStops on rect via simple bands
    const steps = 64;
    const r1 = 0x87, g1 = 0xce, b1 = 0xeb;
    const r2 = 0x90, g2 = 0xee, b2 = 0x90;

    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const r = Math.round(r1 + (r2 - r1) * t);
      const g = Math.round(g1 + (g2 - g1) * t);
      const b = Math.round(b1 + (b2 - b1) * t);
      const color = (r << 16) | (g << 8) | b;
      const bandH = Math.ceil(h / steps) + 1;
      this.bgGraphics.rect(0, Math.floor(t * h), w, bandH);
      this.bgGraphics.fill(color);
    }
  }

  private drawCircle(w: number, h: number): void {
    this.circle.clear();
    this.circle.circle(0, 0, 50);
    this.circle.fill({ color: 0xffffff, alpha: 0.9 });
    this.circle.stroke({ color: 0xffffff, width: 2, alpha: 0.5 });
    this.circle.x = w / 2;
    this.circle.y = h / 2;
  }

  onResize(w: number, h: number): void {
    this.drawBackground(w, h);
    this.drawCircle(w, h);
    this.infoText.x = w / 2;
    this.infoText.y = h * 0.12;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
