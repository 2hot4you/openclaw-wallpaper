/**
 * Character spritesheet animation configuration.
 *
 * All Premade_Character_48x48_XX.png sheets share the same layout:
 *   48×96 frames, 56 cols × ~20 rows
 *     Row 0: preview/idle thumbnails
 *     Row 1: idle — right(6) · up(6) · left(6) · down(6)
 *     Row 2: walk — right(6) · up(6) · left(6) · down(6)
 *
 * These are loaded via Phaser's `load.spritesheet()` which auto-generates
 * frames with integer indices (0, 1, 2, ...).
 */

export const FRAME_WIDTH = 48;
export const FRAME_HEIGHT = 96;
export const SHEET_COLUMNS = 56;

const FRAMES_PER_DIR = 6;

/** Pixel/sec movement speed for character walking */
export const MOVE_SPEED = 120;

export type Direction = "right" | "up" | "left" | "down";

export interface AnimDef {
  key: string;
  start: number;
  end: number;
  frameRate: number;
  repeat: number;
}

/** Available character sprite sheets */
export const CHARACTER_SPRITES = [
  { key: "character_01", path: "/characters/Premade_Character_48x48_01.png" },
  { key: "character_02", path: "/characters/Premade_Character_48x48_02.png" },
  { key: "character_03", path: "/characters/Premade_Character_48x48_03.png" },
  { key: "character_04", path: "/characters/Premade_Character_48x48_04.png" },
  { key: "character_05", path: "/characters/Premade_Character_48x48_05.png" },
  { key: "character_06", path: "/characters/Premade_Character_48x48_06.png" },
  { key: "character_09", path: "/characters/Premade_Character_48x48_09.png" },
];

/**
 * Build per-direction animation defs for a given sprite key + row.
 */
export function makeAnims(
  spriteKey: string,
  prefix: string,
  row: number,
  frameRate: number,
): AnimDef[] {
  const directions: Direction[] = ["right", "up", "left", "down"];
  return directions.map((dir, i) => ({
    key: `${spriteKey}:${prefix}-${dir}`,
    start: row * SHEET_COLUMNS + i * FRAMES_PER_DIR,
    end: row * SHEET_COLUMNS + i * FRAMES_PER_DIR + FRAMES_PER_DIR - 1,
    frameRate,
    repeat: -1,
  }));
}

/**
 * Register idle and walk animations for a given sprite key.
 * Assumes spritesheet was loaded with Phaser's load.spritesheet()
 * which auto-generates integer frame indices.
 */
export function registerCharacterAnims(scene: Phaser.Scene, spriteKey: string): void {
  if (scene.anims.exists(`${spriteKey}:idle-down`)) return;

  const idleAnims = makeAnims(spriteKey, "idle", 1, 8);
  const walkAnims = makeAnims(spriteKey, "walk", 2, 10);

  for (const anim of [...idleAnims, ...walkAnims]) {
    scene.anims.create({
      key: anim.key,
      frames: scene.anims.generateFrameNumbers(spriteKey, {
        start: anim.start,
        end: anim.end,
      }),
      frameRate: anim.frameRate,
      repeat: anim.repeat,
    });
  }
}
