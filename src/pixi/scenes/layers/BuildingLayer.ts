/**
 * BuildingLayer — Three placeholder buildings:
 * - Workshop (left) — rectangle + triangle roof + chimney
 * - Dispatch Station (center) — rectangle + flag
 * - Rest Area (right) — rectangle + campfire circle
 * Each has a label below.
 */

import { Container, Graphics, Text, TextStyle } from "pixi.js";

const LABEL_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 12,
  fill: 0xffffff,
  stroke: { color: 0x000000, width: 3 },
  align: "center",
});

export class BuildingLayer {
  public readonly container: Container;
  private buildingsGraphics: Graphics;
  private labels: Text[] = [];
  private sceneWidth = 800;
  private sceneHeight = 600;

  constructor() {
    this.container = new Container();
    this.container.label = "building-layer";

    this.buildingsGraphics = new Graphics();
    this.container.addChild(this.buildingsGraphics);
  }

  init(w: number, h: number): void {
    this.sceneWidth = w;
    this.sceneHeight = h;
    this.drawBuildings();
  }

  private drawBuildings(): void {
    this.buildingsGraphics.clear();

    // Clear old labels
    for (const label of this.labels) {
      label.destroy();
    }
    this.labels = [];

    const groundY = this.sceneHeight * 0.78;
    const w = this.sceneWidth;

    // === Workshop (left) ===
    const wsX = w * 0.15;
    const wsW = 100;
    const wsH = 80;
    const wsY = groundY - wsH;

    // Wall
    this.buildingsGraphics.rect(wsX - wsW / 2, wsY, wsW, wsH);
    this.buildingsGraphics.fill(0x8b6914);
    this.buildingsGraphics.rect(wsX - wsW / 2, wsY, wsW, wsH);
    this.buildingsGraphics.stroke({ color: 0x5c4610, width: 2 });

    // Roof (triangle)
    this.buildingsGraphics.moveTo(wsX - wsW / 2 - 10, wsY);
    this.buildingsGraphics.lineTo(wsX, wsY - 40);
    this.buildingsGraphics.lineTo(wsX + wsW / 2 + 10, wsY);
    this.buildingsGraphics.closePath();
    this.buildingsGraphics.fill(0xc0392b);
    this.buildingsGraphics.moveTo(wsX - wsW / 2 - 10, wsY);
    this.buildingsGraphics.lineTo(wsX, wsY - 40);
    this.buildingsGraphics.lineTo(wsX + wsW / 2 + 10, wsY);
    this.buildingsGraphics.closePath();
    this.buildingsGraphics.stroke({ color: 0x922b21, width: 2 });

    // Chimney
    this.buildingsGraphics.rect(wsX + wsW / 4, wsY - 55, 12, 25);
    this.buildingsGraphics.fill(0x7f8c8d);
    this.buildingsGraphics.rect(wsX + wsW / 4, wsY - 55, 12, 25);
    this.buildingsGraphics.stroke({ color: 0x5a6366, width: 1 });

    // Door
    this.buildingsGraphics.rect(wsX - 10, groundY - 30, 20, 30);
    this.buildingsGraphics.fill(0x5c3317);

    // Window
    this.buildingsGraphics.rect(wsX + 20, wsY + 20, 18, 18);
    this.buildingsGraphics.fill(0xf9e79f);
    this.buildingsGraphics.rect(wsX + 20, wsY + 20, 18, 18);
    this.buildingsGraphics.stroke({ color: 0x5c4610, width: 1 });

    const wsLabel = new Text({ text: "🔧 工作坊", style: LABEL_STYLE });
    wsLabel.anchor.set(0.5, 0);
    wsLabel.x = wsX;
    wsLabel.y = groundY + 6;
    this.container.addChild(wsLabel);
    this.labels.push(wsLabel);

    // === Dispatch Station (center) ===
    const dsX = w * 0.5;
    const dsW = 80;
    const dsH = 60;
    const dsY = groundY - dsH;

    // Wall
    this.buildingsGraphics.rect(dsX - dsW / 2, dsY, dsW, dsH);
    this.buildingsGraphics.fill(0x5d8aa8);
    this.buildingsGraphics.rect(dsX - dsW / 2, dsY, dsW, dsH);
    this.buildingsGraphics.stroke({ color: 0x3e6278, width: 2 });

    // Flat roof
    this.buildingsGraphics.rect(dsX - dsW / 2 - 5, dsY - 5, dsW + 10, 8);
    this.buildingsGraphics.fill(0x4a7a99);

    // Flag pole
    this.buildingsGraphics.rect(dsX + dsW / 4, dsY - 40, 3, 40);
    this.buildingsGraphics.fill(0x7f8c8d);

    // Flag
    this.buildingsGraphics.moveTo(dsX + dsW / 4 + 3, dsY - 40);
    this.buildingsGraphics.lineTo(dsX + dsW / 4 + 23, dsY - 33);
    this.buildingsGraphics.lineTo(dsX + dsW / 4 + 3, dsY - 26);
    this.buildingsGraphics.closePath();
    this.buildingsGraphics.fill(0xe74c3c);

    // Door
    this.buildingsGraphics.rect(dsX - 10, groundY - 28, 20, 28);
    this.buildingsGraphics.fill(0x3e6278);

    const dsLabel = new Text({ text: "📮 收发站", style: LABEL_STYLE });
    dsLabel.anchor.set(0.5, 0);
    dsLabel.x = dsX;
    dsLabel.y = groundY + 6;
    this.container.addChild(dsLabel);
    this.labels.push(dsLabel);

    // === Rest Area (right) ===
    const raX = w * 0.82;
    const raW = 70;
    const raH = 50;
    const raY = groundY - raH;

    // Shelter wall
    this.buildingsGraphics.rect(raX - raW / 2, raY, raW, raH);
    this.buildingsGraphics.fill(0x8d6e4c);
    this.buildingsGraphics.rect(raX - raW / 2, raY, raW, raH);
    this.buildingsGraphics.stroke({ color: 0x5c4830, width: 2 });

    // Sloped roof
    this.buildingsGraphics.moveTo(raX - raW / 2 - 8, raY);
    this.buildingsGraphics.lineTo(raX + raW / 2 + 8, raY);
    this.buildingsGraphics.lineTo(raX + raW / 2 + 8, raY - 15);
    this.buildingsGraphics.lineTo(raX - raW / 2 - 8, raY - 8);
    this.buildingsGraphics.closePath();
    this.buildingsGraphics.fill(0xa0522d);

    // Campfire (circle)
    const fireX = raX + raW / 2 + 30;
    const fireY = groundY - 10;
    // Fire ring
    this.buildingsGraphics.circle(fireX, fireY, 12);
    this.buildingsGraphics.fill(0x8b4513);
    // Fire
    this.buildingsGraphics.circle(fireX, fireY - 2, 7);
    this.buildingsGraphics.fill(0xff6600);
    this.buildingsGraphics.circle(fireX, fireY - 4, 4);
    this.buildingsGraphics.fill(0xffcc00);

    const raLabel = new Text({ text: "🏕️ 休息区", style: LABEL_STYLE });
    raLabel.anchor.set(0.5, 0);
    raLabel.x = raX;
    raLabel.y = groundY + 6;
    this.container.addChild(raLabel);
    this.labels.push(raLabel);
  }

  onResize(w: number, h: number): void {
    this.sceneWidth = w;
    this.sceneHeight = h;
    this.drawBuildings();
  }

  destroy(): void {
    for (const label of this.labels) {
      label.destroy();
    }
    this.labels = [];
    this.container.destroy({ children: true });
  }
}
