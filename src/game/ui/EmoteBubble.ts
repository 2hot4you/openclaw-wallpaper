/**
 * EmoteBubble — Standalone emote bubble that can be shown above any world position.
 *
 * This is a thin wrapper used by AgentSprite internally.
 * For the actual emote system, see AgentSprite.showEmote / hideEmote.
 *
 * This file exists to satisfy the module structure requirement and can be
 * extended later with additional bubble types (text chat, thought, etc.)
 */

import Phaser from "phaser";
import { EMOTE_SHEET_KEY } from "../config/emotes";

export class EmoteBubble {
  private scene: Phaser.Scene;
  private sprite: Phaser.GameObjects.Sprite | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;

    if (scene.textures.exists(EMOTE_SHEET_KEY)) {
      this.sprite = scene.add.sprite(x, y, EMOTE_SHEET_KEY, 0);
      this.sprite.setDepth(22);
      this.sprite.setVisible(false);
      this.sprite.setOrigin(0.5, 1);
    }
  }

  show(emoteKey: string): void {
    if (!this.sprite) return;
    this.sprite.setVisible(true);
    if (this.scene.anims.exists(emoteKey)) {
      this.sprite.play(emoteKey);
    }
  }

  hide(): void {
    if (!this.sprite) return;
    this.sprite.setVisible(false);
    this.sprite.stop();
  }

  setPosition(x: number, y: number): void {
    this.sprite?.setPosition(x, y);
  }

  destroy(): void {
    this.sprite?.destroy();
    this.sprite = null;
  }
}
