/**
 * AgentCharacter — A single agent character rendered with programmatic Graphics.
 *
 * Visual: 32×48 body rectangle + circular head, different colors per agent.
 * Name text above head with pixel-style font.
 * Status emoji icon above name.
 * 5 animation states driven by AnimationStateMachine.
 */

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { AnimationStateMachine, AnimationState } from "./AnimationStateMachine";
import { CharacterPalette } from "./PaletteSwap";

const BODY_W = 32;
const BODY_H = 48;
const HEAD_RADIUS = 14;

/** Duration constants (in ticker frames at ~30fps) */
const SPAWN_DURATION = 20;
const DESPAWN_DURATION = 20;

/** Status icon map */
const STATUS_ICONS: Record<string, string> = {
  working: "⚡",
  idle: "💤",
  error: "❌",
  spawn: "",
  despawn: "",
};

export class AgentCharacter {
  public readonly container: Container;
  public readonly id: string;
  public name: string;

  private bodyGraphics: Graphics;
  private headGraphics: Graphics;
  private nameText: Text;
  private statusText: Text;
  private palette: CharacterPalette;
  private stateMachine: AnimationStateMachine;

  /** Track if character has been fully despawned */
  private _isDespawned = false;

  constructor(id: string, name: string, palette: CharacterPalette) {
    this.id = id;
    this.name = name;
    this.palette = palette;
    this.container = new Container();
    this.container.label = `character-${id}`;

    // Body
    this.bodyGraphics = new Graphics();
    this.drawBody();
    this.container.addChild(this.bodyGraphics);

    // Head
    this.headGraphics = new Graphics();
    this.drawHead();
    this.container.addChild(this.headGraphics);

    // Name text (above head)
    const nameStyle = new TextStyle({
      fontFamily: "monospace",
      fontSize: 11,
      fill: 0xffffff,
      stroke: { color: 0x000000, width: 3 },
      align: "center",
    });
    this.nameText = new Text({ text: name, style: nameStyle });
    this.nameText.anchor.set(0.5, 1);
    this.nameText.x = 0;
    this.nameText.y = -BODY_H - HEAD_RADIUS * 2 - 4;
    this.container.addChild(this.nameText);

    // Status icon (above name)
    const statusStyle = new TextStyle({
      fontFamily: "monospace",
      fontSize: 14,
      align: "center",
    });
    this.statusText = new Text({ text: "", style: statusStyle });
    this.statusText.anchor.set(0.5, 1);
    this.statusText.x = 0;
    this.statusText.y = -BODY_H - HEAD_RADIUS * 2 - 18;
    this.container.addChild(this.statusText);

    // Pivot at feet
    // The body is drawn centered at x, with bottom at y=0
    // So the character's anchor is at the feet

    // State machine
    this.stateMachine = new AnimationStateMachine("spawn");
    this.setupStateMachine();
  }

  get isDespawned(): boolean {
    return this._isDespawned;
  }

  get currentState(): AnimationState {
    return this.stateMachine.currentState;
  }

  private drawBody(): void {
    this.bodyGraphics.clear();
    // Body rect, centered horizontally, bottom at y=0
    this.bodyGraphics.rect(-BODY_W / 2, -BODY_H, BODY_W, BODY_H);
    this.bodyGraphics.fill(this.palette.body);
    // Small border
    this.bodyGraphics.rect(-BODY_W / 2, -BODY_H, BODY_W, BODY_H);
    this.bodyGraphics.stroke({ color: 0x000000, width: 1, alpha: 0.3 });
  }

  private drawHead(): void {
    this.headGraphics.clear();
    // Head circle on top of body
    this.headGraphics.circle(0, -BODY_H - HEAD_RADIUS, HEAD_RADIUS);
    this.headGraphics.fill(0xfce4b8); // skin tone
    this.headGraphics.circle(0, -BODY_H - HEAD_RADIUS, HEAD_RADIUS);
    this.headGraphics.stroke({ color: 0x000000, width: 1, alpha: 0.3 });

    // Hat (small rectangle on top)
    this.headGraphics.rect(-HEAD_RADIUS + 2, -BODY_H - HEAD_RADIUS * 2 - 2, HEAD_RADIUS * 2 - 4, 8);
    this.headGraphics.fill(this.palette.hat);
  }

  private setupStateMachine(): void {
    // Spawn: scale from 0 to 1
    this.stateMachine.registerState("spawn", {
      onEnter: () => {
        this.container.scale.set(0, 0);
        this.container.alpha = 1;
        this.statusText.text = "";
      },
      onUpdate: () => {
        const progress = Math.min(this.stateMachine.elapsed / SPAWN_DURATION, 1);
        // Elastic ease out
        const t = 1 - Math.pow(1 - progress, 3);
        const overshoot = progress < 1 ? 1 + Math.sin(progress * Math.PI) * 0.2 : 1;
        this.container.scale.set(t * overshoot, t * overshoot);

        if (progress >= 1) {
          this.container.scale.set(1, 1);
          this.stateMachine.transitionTo("idle");
        }
      },
    });

    // Idle: gentle floating up and down
    this.stateMachine.registerState("idle", {
      onEnter: () => {
        this.container.scale.set(1, 1);
        this.container.alpha = 1;
        this.statusText.text = STATUS_ICONS.idle;
        this.bodyGraphics.tint = 0xffffff;
      },
      onUpdate: () => {
        const float = Math.sin(this.stateMachine.elapsed * 0.05) * 3;
        this.bodyGraphics.y = float;
        this.headGraphics.y = float;
      },
      onExit: () => {
        this.bodyGraphics.y = 0;
        this.headGraphics.y = 0;
      },
    });

    // Working: fast left-right shake
    this.stateMachine.registerState("working", {
      onEnter: () => {
        this.container.alpha = 1;
        this.statusText.text = STATUS_ICONS.working;
        this.bodyGraphics.tint = 0xffffff;
      },
      onUpdate: () => {
        const shake = Math.sin(this.stateMachine.elapsed * 0.4) * 3;
        this.bodyGraphics.x = shake;
        this.headGraphics.x = shake;
      },
      onExit: () => {
        this.bodyGraphics.x = 0;
        this.headGraphics.x = 0;
      },
    });

    // Error: red flash
    this.stateMachine.registerState("error", {
      onEnter: () => {
        this.container.alpha = 1;
        this.statusText.text = STATUS_ICONS.error;
      },
      onUpdate: () => {
        // Flash between red tint and normal
        const flash = Math.sin(this.stateMachine.elapsed * 0.3) > 0;
        this.bodyGraphics.tint = flash ? 0xff4444 : 0xffffff;
      },
      onExit: () => {
        this.bodyGraphics.tint = 0xffffff;
      },
    });

    // Despawn: fade out
    this.stateMachine.registerState("despawn", {
      onEnter: () => {
        this.container.alpha = 1;
        this.statusText.text = "";
      },
      onUpdate: () => {
        const progress = Math.min(this.stateMachine.elapsed / DESPAWN_DURATION, 1);
        this.container.alpha = 1 - progress;
        this.container.scale.set(1 - progress * 0.5);

        if (progress >= 1) {
          this._isDespawned = true;
        }
      },
    });

    // Enter spawn state
    this.stateMachine.forceTransition("spawn");
  }

  /**
   * Set the desired animation state based on session status.
   */
  setStatus(status: "idle" | "working" | "error"): void {
    const current = this.stateMachine.currentState;
    if (current === "spawn" || current === "despawn") return; // Don't interrupt spawn/despawn

    if (status === "working" && current !== "working") {
      this.stateMachine.transitionTo("working");
    } else if (status === "idle" && current !== "idle") {
      this.stateMachine.transitionTo("idle");
    } else if (status === "error" && current !== "error") {
      this.stateMachine.transitionTo("error");
    }
  }

  /**
   * Trigger despawn animation.
   */
  despawn(): void {
    this.stateMachine.forceTransition("despawn");
  }

  /**
   * Update every tick.
   */
  update(dt: number): void {
    this.stateMachine.update(dt);
  }

  /**
   * Clean up.
   */
  destroy(): void {
    this.container.destroy({ children: true });
  }
}
