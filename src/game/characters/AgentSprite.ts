/**
 * AgentSprite — A single agent character rendered with spritesheet animations.
 *
 * Features:
 * - Idle / walk-direction / work (sitting) animations
 * - Emote bubble above head for status indication (⚡💤❌)
 * - Name tag below sprite
 * - Tweened movement between positions (no physics needed)
 * - Click interaction for info panel
 */

import Phaser from "phaser";
import {
  FRAME_HEIGHT,
  MOVE_SPEED,
  type Direction,
} from "../config/animations";
import {
  EMOTE_SHEET_KEY,
  STATUS_EMOTE_MAP,
} from "../config/emotes";

export type AgentStatus = "idle" | "working" | "error";
export type CharacterClickHandler = (
  id: string,
  globalX: number,
  globalY: number,
) => void;

const EMOTE_Y_OFFSET = 0.7; // Fraction of FRAME_HEIGHT above sprite

export class AgentSprite {
  public readonly id: string;
  public readonly spriteKey: string;
  public readonly displayName: string;

  public sprite: Phaser.GameObjects.Sprite;
  public nameTag: Phaser.GameObjects.Text;
  public emoteSprite: Phaser.GameObjects.Sprite | null = null;

  private scene: Phaser.Scene;
  private _status: AgentStatus = "idle";
  private _facing: Direction = "down";
  private _isMoving = false;
  private _isDespawned = false;
  private _isDespawning = false;
  private moveTimeline: Phaser.Tweens.Tween | null = null;
  private clickHandler: CharacterClickHandler | null = null;
  private currentEmoteKey: string | null = null;

  /** Spawn animation state */
  private spawnComplete = false;

  constructor(
    scene: Phaser.Scene,
    id: string,
    displayName: string,
    spriteKey: string,
    x: number,
    y: number,
    /** If true, spawn fully visible immediately (used for entrance walk-in) */
    spawnVisible = false,
  ) {
    this.scene = scene;
    this.id = id;
    this.displayName = displayName;
    this.spriteKey = spriteKey;

    // ── Character sprite ────────────────────────────
    this.sprite = scene.add.sprite(x, y, spriteKey, 0);
    this.sprite.setDepth(6);
    this.sprite.setOrigin(0.5, 1); // Bottom-center anchor
    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on("pointerdown", () => {
      if (this.clickHandler) {
        // Convert to screen coordinates
        const cam = scene.cameras.main;
        const screenX = (this.sprite.x - cam.scrollX) * cam.zoom;
        const screenY = (this.sprite.y - cam.scrollY) * cam.zoom;
        this.clickHandler(this.id, screenX, screenY);
      }
    });

    // ── Name tag ────────────────────────────────────
    this.nameTag = scene.add
      .text(x, y + 4, displayName, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "7px",
        color: "#e0e0e0",
        backgroundColor: "rgba(0,0,0,0.7)",
        padding: { x: 3, y: 2 },
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setDepth(20);

    // ── Emote sprite ────────────────────────────────
    if (scene.textures.exists(EMOTE_SHEET_KEY)) {
      this.emoteSprite = scene.add.sprite(
        x,
        y - FRAME_HEIGHT * EMOTE_Y_OFFSET,
        EMOTE_SHEET_KEY,
        0,
      );
      this.emoteSprite.setDepth(22);
      this.emoteSprite.setVisible(false);
      this.emoteSprite.setOrigin(0.5, 1);
    }

    // ── Spawn animation ─────────────────────────────
    if (spawnVisible) {
      // Spawn immediately visible (subagent at entrance, will walk in)
      this.sprite.setScale(1);
      this.sprite.setAlpha(1);
      this.nameTag.setAlpha(1);
      this.spawnComplete = true;
      this.playIdleAnim();
    } else {
      // Pop-in spawn animation (boss / default)
      this.sprite.setScale(0);
      this.sprite.setAlpha(0);
      this.nameTag.setAlpha(0);

      scene.tweens.add({
        targets: [this.sprite],
        scaleX: 1,
        scaleY: 1,
        alpha: 1,
        duration: 400,
        ease: "Back.easeOut",
        onComplete: () => {
          this.spawnComplete = true;
          this.playIdleAnim();
        },
      });

      scene.tweens.add({
        targets: [this.nameTag],
        alpha: 1,
        duration: 400,
        delay: 200,
      });
    }
  }

  get status(): AgentStatus {
    return this._status;
  }

  get isDespawned(): boolean {
    return this._isDespawned;
  }

  get isMoving(): boolean {
    return this._isMoving;
  }

  /**
   * Set click handler for info panel.
   */
  setClickHandler(handler: CharacterClickHandler | null): void {
    this.clickHandler = handler;
  }

  /**
   * Set the agent's status and update emote + animation.
   */
  setStatus(status: AgentStatus): void {
    if (this._status === status || this._isDespawning) return;
    const prev = this._status;
    this._status = status;

    // Clean up previous status effects
    if (prev === "working") this.stopWorkBob();
    if (prev === "error") this.stopErrorFlash();

    this.updateEmote();
    // If not moving, immediately update animation
    if (!this._isMoving) {
      this.playStatusAnim();
    }
  }

  /**
   * Move to a world position with walking animation.
   * After arriving, plays the appropriate animation based on status.
   */
  moveTo(targetX: number, targetY: number, onComplete?: () => void): void {
    if (this._isDespawned || !this.spawnComplete) return;

    // Cancel any existing movement
    this.stopMovement();

    const dx = targetX - this.sprite.x;
    const dy = targetY - this.sprite.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 4) {
      this.playStatusAnim();
      onComplete?.();
      return;
    }

    const duration = (distance / MOVE_SPEED) * 1000;

    // Determine facing direction
    if (Math.abs(dx) > Math.abs(dy)) {
      this._facing = dx > 0 ? "right" : "left";
    } else {
      this._facing = dy > 0 ? "down" : "up";
    }

    // Play walk animation
    this._isMoving = true;
    const walkKey = `${this.spriteKey}:walk-${this._facing}`;
    if (this.scene.anims.exists(walkKey)) {
      this.sprite.play(walkKey);
    }

    // Tween movement
    this.moveTimeline = this.scene.tweens.add({
      targets: this.sprite,
      x: targetX,
      y: targetY,
      duration,
      ease: "Linear",
      onUpdate: () => {
        this.updateAttachedPositions();
      },
      onComplete: () => {
        this._isMoving = false;
        this.moveTimeline = null;
        // After arriving, play the appropriate anim for current status
        this.playStatusAnim();
        onComplete?.();
      },
    });
  }

  /**
   * Despawn with fade-out animation (immediate, no walk).
   */
  despawn(): void {
    if (this._isDespawned) return;
    this._isDespawned = true;

    this.stopMovement();
    this.stopWorkBob();
    this.stopErrorFlash();
    this.hideEmote();

    this.scene.tweens.add({
      targets: [this.sprite, this.nameTag],
      alpha: 0,
      scaleX: 0.5,
      scaleY: 0.5,
      duration: 300,
      ease: "Power2",
      onComplete: () => {
        this.destroy();
      },
    });
  }

  /**
   * Walk to a target position, then fade out and despawn.
   * Used for subagents leaving through the exit.
   */
  walkThenDespawn(targetX: number, targetY: number): void {
    if (this._isDespawned) return;
    // Mark as despawning to prevent further status updates
    this._isDespawning = true;
    this.hideEmote();
    this.stopWorkBob();
    this.stopErrorFlash();

    this.moveTo(targetX, targetY, () => {
      this.despawn();
    });
  }

  get isDespawning(): boolean {
    return this._isDespawning;
  }

  /**
   * Update positions of name tag and emote relative to sprite.
   */
  private updateAttachedPositions(): void {
    this.nameTag.setPosition(this.sprite.x, this.sprite.y + 4);

    if (this.emoteSprite) {
      this.emoteSprite.setPosition(
        this.sprite.x,
        this.sprite.y - FRAME_HEIGHT * EMOTE_Y_OFFSET,
      );
    }
  }

  /**
   * Play the appropriate animation based on current status.
   * - working: face down (toward screen), fast idle anim to simulate typing
   * - idle: normal idle facing current direction
   * - error: idle with red tint flash
   */
  private playStatusAnim(): void {
    if (this._isDespawned) return;

    if (this._status === "working") {
      // Face down (toward screen/desk) and play a faster idle to look like typing
      this._facing = "down";
      const workKey = `${this.spriteKey}:idle-down`;
      if (this.scene.anims.exists(workKey)) {
        this.sprite.play({ key: workKey, frameRate: 16 }); // faster = typing feel
      }
      // Subtle bobbing to show activity
      if (!this._workBob) {
        this._workBob = this.scene.tweens.add({
          targets: this.sprite,
          y: this.sprite.y - 2,
          duration: 400,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }
    } else {
      // Stop work bob if active
      this.stopWorkBob();
      this.sprite.clearTint();

      if (this._status === "error") {
        // Red tint flash for error
        this.playIdleAnim();
        if (!this._errorFlash) {
          this._errorFlash = this.scene.time.addEvent({
            delay: 500,
            callback: () => {
              if (this._isDespawned) return;
              if (this.sprite.tintTopLeft === 0xff4444) {
                this.sprite.clearTint();
              } else {
                this.sprite.setTint(0xff4444);
              }
            },
            loop: true,
          });
        }
      } else {
        // Normal idle
        this.stopErrorFlash();
        this.playIdleAnim();
      }
    }
  }

  private _workBob: Phaser.Tweens.Tween | null = null;
  private _errorFlash: Phaser.Time.TimerEvent | null = null;

  private stopWorkBob(): void {
    if (this._workBob) {
      this._workBob.stop();
      this._workBob = null;
    }
  }

  private stopErrorFlash(): void {
    if (this._errorFlash) {
      this._errorFlash.destroy();
      this._errorFlash = null;
      this.sprite.clearTint();
    }
  }

  /**
   * Play the idle animation for the current facing direction.
   */
  private playIdleAnim(): void {
    if (this._isDespawned) return;
    const idleKey = `${this.spriteKey}:idle-${this._facing}`;
    if (this.scene.anims.exists(idleKey)) {
      this.sprite.play(idleKey);
    }
  }

  /**
   * Stop any active movement tween.
   */
  private stopMovement(): void {
    if (this.moveTimeline) {
      this.moveTimeline.stop();
      this.moveTimeline = null;
    }
    this._isMoving = false;
  }

  /**
   * Update the emote bubble based on current status.
   */
  private updateEmote(): void {
    const emoteKey = STATUS_EMOTE_MAP[this._status];
    if (emoteKey) {
      this.showEmote(emoteKey);
    } else {
      this.hideEmote();
    }
  }

  /**
   * Show an emote animation above the character.
   */
  private showEmote(emoteKey: string): void {
    if (!this.emoteSprite) return;
    if (this.currentEmoteKey === emoteKey) return;

    this.currentEmoteKey = emoteKey;
    this.emoteSprite.setVisible(true);

    if (this.scene.anims.exists(emoteKey)) {
      this.emoteSprite.play(emoteKey);
    }
  }

  /**
   * Hide the emote bubble.
   */
  private hideEmote(): void {
    if (!this.emoteSprite) return;
    this.emoteSprite.removeAllListeners("animationcomplete");
    this.emoteSprite.setVisible(false);
    this.emoteSprite.stop();
    this.currentEmoteKey = null;
  }

  /**
   * Clean up all game objects.
   */
  destroy(): void {
    this.stopMovement();
    this.stopWorkBob();
    this.stopErrorFlash();
    this.sprite.destroy();
    this.nameTag.destroy();
    if (this.emoteSprite) {
      this.emoteSprite.destroy();
      this.emoteSprite = null;
    }
  }
}
