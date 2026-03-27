/**
 * OfficeScene — Main Phaser scene that renders the pixel office tilemap.
 *
 * - Loads office2.json tilemap from Agent Town
 * - Renders all tile layers (floor, walls, ground, furniture, objects, props, overhead)
 * - Camera fills the screen and centers on the map
 * - Exposes character layer for AgentManager to place sprites
 * - No physics or player control (wallpaper mode)
 */

import Phaser from "phaser";
import {
  CHARACTER_SPRITES,
  registerCharacterAnims,
} from "../config/animations";
import { EMOTE_SHEET_KEY, EMOTE_ANIMS } from "../config/emotes";

export class OfficeScene extends Phaser.Scene {
  /** Container group for character sprites — AgentManager adds to this */
  public characterLayer!: Phaser.GameObjects.Group;

  /** Map dimensions in pixels */
  public mapWidth = 0;
  public mapHeight = 0;

  /** Parsed spawn points from the tilemap */
  public seatPositions: Array<{
    seatId: string;
    x: number;
    y: number;
    facing: string;
  }> = [];

  /** Parsed POI positions (rest area, etc.) */
  public poiPositions: Array<{
    name: string;
    x: number;
    y: number;
  }> = [];

  constructor() {
    super({ key: "OfficeScene" });
  }

  create(): void {
    // ── Register character animations ────────────────
    for (const sprite of CHARACTER_SPRITES) {
      registerCharacterAnims(this, sprite.key);
    }

    // ── Register emote animations ────────────────────
    for (const def of EMOTE_ANIMS) {
      if (this.anims.exists(def.key)) continue;
      const frames = def.frames.map((f) => ({ key: EMOTE_SHEET_KEY, frame: f }));
      this.anims.create({
        key: def.key,
        frames,
        frameRate: def.frameRate,
        repeat: def.repeat,
      });
    }

    // ── Build tilemap ───────────────────────────────
    const map = this.make.tilemap({ key: "office" });

    const allTilesets: Phaser.Tilemaps.Tileset[] = [];
    for (const ts of map.tilesets) {
      const added = map.addTilesetImage(ts.name, ts.name);
      if (added) allTilesets.push(added);
    }

    if (allTilesets.length === 0) {
      console.error("[OfficeScene] No tilesets loaded");
      return;
    }

    // Create tile layers in order
    const layerNames = [
      "floor",
      "walls",
      "ground",
      "furniture",
      "objects",
    ];

    for (const name of layerNames) {
      const layer = map.createLayer(name, allTilesets);
      if (layer) {
        layer.setDepth(layerNames.indexOf(name));
      }
    }

    // Render "props" and "props-over" as object layers (tile objects)
    this.renderTileObjectLayer(map, "props", allTilesets, 5);
    this.renderTileObjectLayer(map, "props-over", allTilesets, 11);

    // Overhead layer on top of characters
    const overheadLayer = map.createLayer("overhead", allTilesets);
    if (overheadLayer) overheadLayer.setDepth(10);

    // Store map dimensions
    this.mapWidth = map.widthInPixels;
    this.mapHeight = map.heightInPixels;

    // ── Parse spawns & POIs ─────────────────────────
    this.parseSpawns(map);
    this.parsePOIs(map);
    console.log("[OfficeScene] Seats:", this.seatPositions.length, this.seatPositions);
    console.log("[OfficeScene] POIs:", this.poiPositions.length, this.poiPositions);
    console.log("[OfficeScene] Map size:", this.mapWidth, "x", this.mapHeight);

    // ── Character layer ─────────────────────────────
    this.characterLayer = this.add.group();

    // ── Camera setup ────────────────────────────────
    this.cameras.main.setBounds(0, 0, this.mapWidth, this.mapHeight);
    this.centerCamera();

    // ── Background color ────────────────────────────
    this.cameras.main.setBackgroundColor("#2a2a3d");

    // ── Listen for resize ───────────────────────────
    this.scale.on("resize", () => {
      this.centerCamera();
    });

    // ── Emit ready event ────────────────────────────
    this.events.emit("scene-ready");
  }

  /**
   * Center the camera on the tilemap, fitting the map to the screen.
   * Uses zoom to scale the pixel art to fill the viewport.
   */
  private centerCamera(): void {
    if (!this.mapWidth || !this.mapHeight) return;

    const viewW = this.scale.width;
    const viewH = this.scale.height;

    // Calculate zoom to fit map in viewport (fill mode — cover, not contain)
    const zoomX = viewW / this.mapWidth;
    const zoomY = viewH / this.mapHeight;
    const zoom = Math.max(zoomX, zoomY);

    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(this.mapWidth / 2, this.mapHeight / 2);
  }

  /**
   * Parse spawn points from the tilemap's "spawns" object layer.
   */
  private parseSpawns(map: Phaser.Tilemaps.Tilemap): void {
    const spawnsLayer = map.getObjectLayer("spawns");
    if (!spawnsLayer) return;

    this.seatPositions = spawnsLayer.objects
      .filter((obj) => obj.name !== "boss") // Skip boss spawn
      .map((obj, index) => {
        const props = obj.properties as
          | Array<{ name: string; value: string }>
          | undefined;
        const facingProp = props?.find((p) => p.name === "facing");
        return {
          seatId: obj.name || `seat-${index}`,
          x: obj.x!,
          y: obj.y!,
          facing: facingProp?.value ?? "down",
        };
      });
  }

  /**
   * Parse POI (Points of Interest) from the tilemap's "pois" object layer.
   */
  private parsePOIs(map: Phaser.Tilemaps.Tilemap): void {
    const layer = map.getObjectLayer("pois");
    if (!layer) return;

    this.poiPositions = layer.objects
      .filter((obj) => obj.name && typeof obj.x === "number" && typeof obj.y === "number")
      .map((obj) => ({
        name: obj.name!,
        x: obj.x!,
        y: obj.y!,
      }));
  }

  /**
   * Render a Tiled "tile object" layer (objects that reference tiles from a tileset).
   */
  private renderTileObjectLayer(
    map: Phaser.Tilemaps.Tilemap,
    layerName: string,
    tilesets: Phaser.Tilemaps.Tileset[],
    depth: number,
  ): void {
    const objectLayer = map.getObjectLayer(layerName);
    if (!objectLayer) return;

    for (const obj of objectLayer.objects) {
      if (!obj.gid) continue;

      let tileset: Phaser.Tilemaps.Tileset | null = null;
      for (let i = tilesets.length - 1; i >= 0; i--) {
        if (obj.gid >= tilesets[i].firstgid) {
          tileset = tilesets[i];
          break;
        }
      }
      if (!tileset) continue;

      const localId = obj.gid - tileset.firstgid;
      const tileW = tileset.tileWidth;
      const tileH = tileset.tileHeight;
      const srcX = (localId % tileset.columns) * tileW;
      const srcY = Math.floor(localId / tileset.columns) * tileH;

      const frameKey = localId.toString();

      // Ensure frame exists on the texture
      const tex = this.textures.get(tileset.name);
      if (tex && !tex.has(frameKey)) {
        tex.add(frameKey, 0, srcX, srcY, tileW, tileH);
      }

      this.add
        .image(obj.x!, obj.y! - tileH, tileset.name, frameKey)
        .setOrigin(0, 0)
        .setDepth(depth);
    }
  }

  update(_time: number, _delta: number): void {
    // Characters handle their own updates via AgentManager
  }
}
