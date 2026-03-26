/**
 * GroundLayer — Green ground surface + stone path connecting buildings.
 */

import { Container, Graphics } from "pixi.js";

export class GroundLayer {
  public readonly container: Container;
  private groundGraphics: Graphics;
  private sceneWidth = 800;
  private sceneHeight = 600;

  constructor() {
    this.container = new Container();
    this.container.label = "ground-layer";

    this.groundGraphics = new Graphics();
    this.container.addChild(this.groundGraphics);
  }

  init(w: number, h: number): void {
    this.sceneWidth = w;
    this.sceneHeight = h;
    this.drawGround();
  }

  private drawGround(): void {
    this.groundGraphics.clear();

    const w = this.sceneWidth;
    const h = this.sceneHeight;
    const groundY = h * 0.78;
    const groundH = h - groundY;

    // Main ground (green)
    this.groundGraphics.rect(0, groundY, w, groundH);
    this.groundGraphics.fill(0x5a8f29);

    // Darker strip at top of ground (grass edge)
    this.groundGraphics.rect(0, groundY, w, 4);
    this.groundGraphics.fill(0x4a7a22);

    // Dirt/earth at very bottom
    this.groundGraphics.rect(0, h - groundH * 0.3, w, groundH * 0.3);
    this.groundGraphics.fill(0x8b6914);

    // Stone path connecting buildings
    const pathY = groundY + 15;
    const pathH = 18;
    const pathStartX = w * 0.1;
    const pathEndX = w * 0.92;

    // Path background (dirt)
    this.groundGraphics.rect(pathStartX, pathY, pathEndX - pathStartX, pathH);
    this.groundGraphics.fill(0x9b8b6e);

    // Stone tiles along the path
    const stoneW = 14;
    const stoneH = 10;
    const stoneGap = 4;
    let sx = pathStartX + 4;
    let row = 0;
    while (sx < pathEndX - stoneW) {
      const offsetY = row % 2 === 0 ? 2 : pathH - stoneH - 2;
      this.groundGraphics.roundRect(sx, pathY + offsetY, stoneW, stoneH, 2);
      this.groundGraphics.fill(0xb0a89a);
      this.groundGraphics.roundRect(sx, pathY + offsetY, stoneW, stoneH, 2);
      this.groundGraphics.stroke({ color: 0x8a8278, width: 1 });
      sx += stoneW + stoneGap;
      row++;
    }

    // Grass patches (small darker green rects)
    const patchPositions = [0.05, 0.25, 0.42, 0.58, 0.73, 0.95];
    for (const px of patchPositions) {
      const patchX = w * px;
      const patchY = groundY + 5 + Math.random() * 8;
      this.groundGraphics.rect(patchX, patchY, 6, 3);
      this.groundGraphics.fill(0x4a7a22);
      this.groundGraphics.rect(patchX + 8, patchY + 3, 4, 2);
      this.groundGraphics.fill(0x4a7a22);
    }
  }

  onResize(w: number, h: number): void {
    this.sceneWidth = w;
    this.sceneHeight = h;
    this.drawGround();
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
