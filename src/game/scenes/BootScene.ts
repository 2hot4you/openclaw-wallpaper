/**
 * BootScene — Preloads all assets (tilesets, character spritesheets, emotes).
 * Transitions to OfficeScene once loading is complete.
 */

import Phaser from "phaser";
import { CHARACTER_SPRITES, FRAME_WIDTH, FRAME_HEIGHT } from "../config/animations";
import { EMOTE_SHEET_KEY, EMOTE_SHEET_PATH, EMOTE_FRAME_SIZE } from "../config/emotes";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
    // ── Tilemap ─────────────────────────────────────
    this.load.tilemapTiledJSON("office", "/maps/office2.json");

    // Dynamically load tileset images referenced by the map
    this.load.once("filecomplete-tilemapJSON-office", () => {
      const cached = this.cache.tilemap.get("office");
      if (!cached?.data?.tilesets) return;
      for (const ts of cached.data.tilesets) {
        const basename = (ts.image as string).split("/").pop()!;
        this.load.image(ts.name, `/tilesets/${basename}`);
      }
    });

    // ── Character spritesheets ──────────────────────
    for (const sprite of CHARACTER_SPRITES) {
      this.load.spritesheet(sprite.key, sprite.path, {
        frameWidth: FRAME_WIDTH,
        frameHeight: FRAME_HEIGHT,
      });
    }

    // ── Emote spritesheet ───────────────────────────
    this.load.spritesheet(EMOTE_SHEET_KEY, EMOTE_SHEET_PATH, {
      frameWidth: EMOTE_FRAME_SIZE,
      frameHeight: EMOTE_FRAME_SIZE,
    });

    // ── Loading progress ────────────────────────────
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;

    const barBg = this.add.rectangle(w / 2, h / 2, 200, 16, 0x222222);
    barBg.setOrigin(0.5, 0.5);

    const barFill = this.add.rectangle(w / 2 - 98, h / 2, 0, 12, 0x44aaff);
    barFill.setOrigin(0, 0.5);

    const loadText = this.add
      .text(w / 2, h / 2 - 24, "Loading...", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffffff",
      })
      .setOrigin(0.5, 0.5);

    this.load.on("progress", (value: number) => {
      barFill.width = 196 * value;
      loadText.setText(`Loading... ${Math.round(value * 100)}%`);
    });
  }

  create(): void {
    this.scene.start("OfficeScene");
  }
}
