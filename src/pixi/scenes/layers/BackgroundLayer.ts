/**
 * BackgroundLayer — Distant green hills/mountains silhouette.
 * Programmatically drawn using simple bezier curves.
 */

import { Container, Graphics } from "pixi.js";

export class BackgroundLayer {
  public readonly container: Container;
  private hillsGraphics: Graphics;
  private sceneWidth = 800;
  private sceneHeight = 600;

  constructor() {
    this.container = new Container();
    this.container.label = "background-layer";

    this.hillsGraphics = new Graphics();
    this.container.addChild(this.hillsGraphics);
  }

  init(w: number, h: number): void {
    this.sceneWidth = w;
    this.sceneHeight = h;
    this.drawHills();
  }

  private drawHills(): void {
    this.hillsGraphics.clear();

    const baseY = this.sceneHeight * 0.55;
    const w = this.sceneWidth;

    // Far hills (lighter green)
    this.hillsGraphics.moveTo(0, baseY);
    this.hillsGraphics.quadraticCurveTo(w * 0.15, baseY - 80, w * 0.3, baseY - 30);
    this.hillsGraphics.quadraticCurveTo(w * 0.45, baseY - 100, w * 0.6, baseY - 20);
    this.hillsGraphics.quadraticCurveTo(w * 0.8, baseY - 90, w, baseY - 40);
    this.hillsGraphics.lineTo(w, baseY + 20);
    this.hillsGraphics.lineTo(0, baseY + 20);
    this.hillsGraphics.closePath();
    this.hillsGraphics.fill(0x6db86b);

    // Near hills (darker green)
    const nearBaseY = this.sceneHeight * 0.6;
    this.hillsGraphics.moveTo(0, nearBaseY);
    this.hillsGraphics.quadraticCurveTo(w * 0.2, nearBaseY - 50, w * 0.4, nearBaseY - 15);
    this.hillsGraphics.quadraticCurveTo(w * 0.55, nearBaseY - 60, w * 0.75, nearBaseY - 10);
    this.hillsGraphics.quadraticCurveTo(w * 0.9, nearBaseY - 45, w, nearBaseY - 20);
    this.hillsGraphics.lineTo(w, nearBaseY + 20);
    this.hillsGraphics.lineTo(0, nearBaseY + 20);
    this.hillsGraphics.closePath();
    this.hillsGraphics.fill(0x4a9e48);

    // Tree silhouettes on hills (simple triangles)
    const treePositions = [0.12, 0.28, 0.5, 0.72, 0.88];
    for (const tx of treePositions) {
      const treeX = w * tx;
      const treeBaseY = nearBaseY - 10 - Math.sin(tx * Math.PI * 2) * 20;
      const treeH = 25 + Math.random() * 15;
      const treeW = 12 + Math.random() * 8;

      this.hillsGraphics.moveTo(treeX, treeBaseY);
      this.hillsGraphics.lineTo(treeX - treeW / 2, treeBaseY);
      this.hillsGraphics.lineTo(treeX, treeBaseY - treeH);
      this.hillsGraphics.closePath();
      this.hillsGraphics.fill(0x3a7d38);

      this.hillsGraphics.moveTo(treeX, treeBaseY);
      this.hillsGraphics.lineTo(treeX + treeW / 2, treeBaseY);
      this.hillsGraphics.lineTo(treeX, treeBaseY - treeH);
      this.hillsGraphics.closePath();
      this.hillsGraphics.fill(0x2e6b2c);
    }
  }

  onResize(w: number, h: number): void {
    this.sceneWidth = w;
    this.sceneHeight = h;
    this.drawHills();
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
