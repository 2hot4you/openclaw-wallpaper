/**
 * POIInteraction — Makes POI objects in the tilemap clickable.
 *
 * Creates invisible interactive zones over POI positions.
 * Currently supports: Whiteboard → opens Settings modal.
 */

import Phaser from "phaser";
import type { OfficeScene } from "../scenes/OfficeScene";

/** Callback when a POI is clicked */
export type POIClickHandler = (poiName: string) => void;

const CLICK_ZONE_SIZE = 48; // pixels, matches tile size

export class POIInteraction {
  private scene: OfficeScene;
  private zones: Phaser.GameObjects.Zone[] = [];
  private handler: POIClickHandler | null = null;
  private highlights: Phaser.GameObjects.Rectangle[] = [];

  constructor(scene: OfficeScene) {
    this.scene = scene;
    this.createZones();
  }

  /**
   * Register a handler for POI clicks.
   */
  onPOIClick(handler: POIClickHandler | null): void {
    this.handler = handler;
  }

  /**
   * Create clickable zones for interactive POIs.
   */
  private createZones(): void {
    const interactivePOIs = this.scene.poiPositions.filter((p) => {
      const name = p.name.toLowerCase();
      return name.includes("whiteboard");
    });

    for (const poi of interactivePOIs) {
      // Invisible interactive zone
      const zone = this.scene.add
        .zone(poi.x, poi.y, CLICK_ZONE_SIZE * 2, CLICK_ZONE_SIZE * 1.5)
        .setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true })
        .setDepth(15);

      // Subtle highlight on hover
      const highlight = this.scene.add
        .rectangle(poi.x, poi.y, CLICK_ZONE_SIZE * 2, CLICK_ZONE_SIZE * 1.5, 0xffffff, 0)
        .setOrigin(0.5, 0.5)
        .setDepth(14);

      zone.on("pointerover", () => {
        highlight.setFillStyle(0xffffff, 0.1);
      });

      zone.on("pointerout", () => {
        highlight.setFillStyle(0xffffff, 0);
      });

      zone.on("pointerdown", () => {
        // Flash effect
        highlight.setFillStyle(0xffffff, 0.3);
        this.scene.time.delayedCall(150, () => {
          highlight.setFillStyle(0xffffff, 0);
        });

        this.handler?.(poi.name);
      });

      this.zones.push(zone);
      this.highlights.push(highlight);
    }

    if (interactivePOIs.length > 0) {
      console.log("[POIInteraction] Created", interactivePOIs.length, "interactive zones:", interactivePOIs.map((p) => p.name));
    }
  }

  destroy(): void {
    for (const z of this.zones) z.destroy();
    for (const h of this.highlights) h.destroy();
    this.zones = [];
    this.highlights = [];
  }
}
