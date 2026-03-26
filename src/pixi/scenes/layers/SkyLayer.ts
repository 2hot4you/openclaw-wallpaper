/**
 * SkyLayer — Sky-blue gradient background with slowly scrolling clouds.
 * Clouds are programmatically drawn white ellipses.
 */

import { Container, Graphics } from "pixi.js";

interface Cloud {
  graphics: Graphics;
  x: number;
  y: number;
  speed: number;
  width: number;
  height: number;
}

export class SkyLayer {
  public readonly container: Container;
  private bgGraphics: Graphics;
  private clouds: Cloud[] = [];
  private sceneWidth = 800;
  private sceneHeight = 600;

  constructor() {
    this.container = new Container();
    this.container.label = "sky-layer";

    this.bgGraphics = new Graphics();
    this.container.addChild(this.bgGraphics);
  }

  init(w: number, h: number): void {
    this.sceneWidth = w;
    this.sceneHeight = h;
    this.drawBackground();
    this.createClouds();
  }

  private drawBackground(): void {
    this.bgGraphics.clear();

    // Sky gradient: top #5B9BD5 → bottom #87CEEB
    const steps = 48;
    const r1 = 0x5b, g1 = 0x9b, b1 = 0xd5;
    const r2 = 0x87, g2 = 0xce, b2 = 0xeb;
    const skyH = this.sceneHeight * 0.65; // sky takes 65% of screen

    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const r = Math.round(r1 + (r2 - r1) * t);
      const g = Math.round(g1 + (g2 - g1) * t);
      const b = Math.round(b1 + (b2 - b1) * t);
      const color = (r << 16) | (g << 8) | b;
      const bandH = Math.ceil(skyH / steps) + 1;
      this.bgGraphics.rect(0, Math.floor(t * skyH), this.sceneWidth, bandH);
      this.bgGraphics.fill(color);
    }
  }

  private createClouds(): void {
    // Remove existing clouds
    for (const cloud of this.clouds) {
      cloud.graphics.destroy();
    }
    this.clouds = [];

    // Create 5–8 clouds at random positions
    const count = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      const g = new Graphics();
      const cw = 60 + Math.random() * 80;
      const ch = 20 + Math.random() * 20;
      const cx = Math.random() * (this.sceneWidth + 200) - 100;
      const cy = 30 + Math.random() * (this.sceneHeight * 0.3);
      const speed = 0.15 + Math.random() * 0.25;

      // Draw cloud: overlapping ellipses
      g.ellipse(0, 0, cw / 2, ch / 2);
      g.fill({ color: 0xffffff, alpha: 0.8 });
      g.ellipse(cw * 0.25, -ch * 0.15, cw * 0.3, ch * 0.35);
      g.fill({ color: 0xffffff, alpha: 0.7 });
      g.ellipse(-cw * 0.2, -ch * 0.1, cw * 0.25, ch * 0.3);
      g.fill({ color: 0xffffff, alpha: 0.7 });

      g.x = cx;
      g.y = cy;

      this.container.addChild(g);
      this.clouds.push({ graphics: g, x: cx, y: cy, speed, width: cw, height: ch });
    }
  }

  /**
   * Update cloud positions (scrolling right to left).
   */
  update(dt: number): void {
    for (const cloud of this.clouds) {
      cloud.x -= cloud.speed * dt;
      // Wrap around when off-screen left
      if (cloud.x < -cloud.width) {
        cloud.x = this.sceneWidth + cloud.width;
        cloud.y = 30 + Math.random() * (this.sceneHeight * 0.3);
      }
      cloud.graphics.x = cloud.x;
      cloud.graphics.y = cloud.y;
    }
  }

  onResize(w: number, h: number): void {
    this.sceneWidth = w;
    this.sceneHeight = h;
    this.drawBackground();
    // Redistribute clouds on resize
    for (const cloud of this.clouds) {
      if (cloud.x > this.sceneWidth + cloud.width) {
        cloud.x = Math.random() * this.sceneWidth;
      }
      cloud.y = 30 + Math.random() * (this.sceneHeight * 0.3);
    }
  }

  destroy(): void {
    for (const cloud of this.clouds) {
      cloud.graphics.destroy();
    }
    this.clouds = [];
    this.container.destroy({ children: true });
  }
}
