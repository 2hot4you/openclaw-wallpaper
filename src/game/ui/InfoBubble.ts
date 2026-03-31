/**
 * InfoBubble — Pixel-art speech bubble rendered in Phaser (world space).
 *
 * Positioned relative to a character sprite, shares the same camera transform.
 * No DOM ↔ Phaser coordinate conversion — eliminates drift on resize.
 *
 * Content:
 *   - Agent name + emoji
 *   - Status (working/idle/error)
 *   - Model name
 *   - Token count
 *   - Last updated time
 *   - Debug: seat name
 *   - Action buttons (Chat, Stop, Delete) with confirmation
 */

import Phaser from "phaser";
import type { SessionData, AgentData } from "../../gateway/types";

// ── Layout ──────────────────────────────────────────

const BUBBLE_WIDTH = 220;
const BUBBLE_PADDING = 10;
const LINE_HEIGHT = 16;
const FONT_SIZE = "10px";
const TITLE_FONT_SIZE = "11px";
const BUTTON_FONT_SIZE = "9px";
const BUBBLE_BG = 0xfef9e7;
const BUBBLE_BORDER = 0x222222;
const BUBBLE_BORDER_WIDTH = 2;
const BUBBLE_RADIUS = 6;
const TAIL_SIZE = 8;
const BUBBLE_OFFSET_X = 30; // right of character
const BUBBLE_OFFSET_Y = -80; // above character
const BUBBLE_DEPTH = 50;
const BUTTON_HEIGHT = 18;
const BUTTON_PADDING = 4;
const BUTTON_GAP = 6;

/** Action types that can be triggered from the bubble */
export type BubbleAction = "chat" | "abort" | "delete";

/** Callback type for bubble actions */
export type BubbleActionHandler = (sessionKey: string, action: BubbleAction) => void;

/** Format relative time */
function formatRelativeTime(timestamp: number | undefined): string {
  if (!timestamp) return "未知";
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Map status to display info */
function getStatusDisplay(status: string | undefined): { emoji: string; label: string; color: string } {
  switch (status) {
    case "active":
    case "running":
    case "busy":
    case "working":
      return { emoji: "⚡", label: "Working", color: "#c8860a" };
    case "error":
    case "failed":
      return { emoji: "💥", label: "Error", color: "#cc3333" };
    default:
      return { emoji: "💤", label: "Idle", color: "#4a7c59" };
  }
}

/** Check if a session status is considered "active" (running) */
function isActiveStatus(status: string | undefined): boolean {
  return status === "active" || status === "running" || status === "busy" || status === "working";
}

export class InfoBubble {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];
  private buttons: Phaser.GameObjects.Text[] = [];
  private buttonBgs: Phaser.GameObjects.Graphics[] = [];
  private _visible = false;
  private _dismissable = false;
  private _dismissTimer: ReturnType<typeof setTimeout> | null = null;
  private targetId: string | null = null;

  /** Confirmation state: which button is awaiting 2nd click */
  private _confirmingAction: BubbleAction | null = null;
  private _confirmTimer: ReturnType<typeof setTimeout> | null = null;

  /** Callback when bubble is dismissed */
  onDismiss: (() => void) | null = null;

  /** Callback when an action button is clicked */
  onAction: BubbleActionHandler | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0).setDepth(BUBBLE_DEPTH).setVisible(false);
    this.bg = scene.add.graphics();
    this.container.add(this.bg);

    // Click anywhere else to dismiss (with guard to prevent same-frame close)
    scene.input.on("pointerdown", (_pointer: Phaser.Input.Pointer, gameObjects: Phaser.GameObjects.GameObject[]) => {
      if (!this._visible || !this._dismissable) return;
      // If clicked on the bubble container's children, don't dismiss
      const clickedBubble = gameObjects.some((obj) => this.container.getAll().includes(obj));
      if (!clickedBubble) {
        this.hide();
      }
    });
  }

  get visible(): boolean {
    return this._visible;
  }

  get currentTargetId(): string | null {
    return this.targetId;
  }

  /**
   * Show the info bubble for a character at world position.
   */
  show(
    worldX: number,
    worldY: number,
    session: SessionData,
    agent?: AgentData,
    seatName?: string | null,
  ): void {
    this.targetId = session.key;
    this._confirmingAction = null;
    if (this._confirmTimer) { clearTimeout(this._confirmTimer); this._confirmTimer = null; }

    // Clear old content
    for (const t of this.texts) t.destroy();
    this.texts = [];
    for (const b of this.buttons) b.destroy();
    this.buttons = [];
    for (const bg of this.buttonBgs) bg.destroy();
    this.buttonBgs = [];
    this.bg.clear();

    // Build text lines
    const displayName = session.label ?? agent?.name ?? `Agent ${session.key.slice(0, 8)}`;
    const statusInfo = getStatusDisplay(session.status);
    const emoji = agent?.emoji ?? "🤖";

    const lines: Array<{ text: string; color: string; bold?: boolean; size?: string }> = [];

    // Title
    lines.push({ text: `${emoji} ${displayName}`, color: "#1a1a2e", bold: true, size: TITLE_FONT_SIZE });

    // Status
    lines.push({ text: `${statusInfo.emoji} ${statusInfo.label}`, color: statusInfo.color });

    // Model
    if (session.model) {
      lines.push({ text: `🧠 ${session.model}`, color: "#666666" });
    }

    // Tokens
    if (session.totalTokens != null && session.totalTokens > 0) {
      lines.push({ text: `📊 ${session.totalTokens.toLocaleString()} tokens`, color: "#666666" });
    }

    // Updated
    lines.push({ text: `🕐 ${formatRelativeTime(session.updatedAt)}`, color: "#999999" });

    // Debug: seat
    if (seatName) {
      lines.push({ text: `💺 ${seatName}`, color: "#b07030" });
    }

    // Determine which buttons to show
    const active = isActiveStatus(session.status);
    const buttonDefs: Array<{ label: string; action: BubbleAction; color: string; hoverColor: string }> = [];

    buttonDefs.push({ label: "💬 Chat", action: "chat", color: "#4a7c59", hoverColor: "#3a6c49" });

    if (active) {
      buttonDefs.push({ label: "⏹ Stop", action: "abort", color: "#c8860a", hoverColor: "#a87000" });
    }

    buttonDefs.push({ label: "🗑 Delete", action: "delete", color: "#888888", hoverColor: "#cc3333" });

    // Calculate bubble height: text lines + separator + button row
    const textHeight = lines.length * LINE_HEIGHT + BUBBLE_PADDING * 2;
    const buttonRowHeight = BUTTON_HEIGHT + BUTTON_PADDING * 2 + 4; // extra for separator
    const bubbleHeight = textHeight + buttonRowHeight + 4;

    // Position bubble relative to character (upper-right)
    const bx = worldX + BUBBLE_OFFSET_X;
    const by = worldY + BUBBLE_OFFSET_Y - bubbleHeight;
    this.container.setPosition(bx, by);

    // Draw bubble background
    this.bg.fillStyle(BUBBLE_BG, 1);
    this.bg.lineStyle(BUBBLE_BORDER_WIDTH, BUBBLE_BORDER, 1);
    this.bg.fillRoundedRect(0, 0, BUBBLE_WIDTH, bubbleHeight, BUBBLE_RADIUS);
    this.bg.strokeRoundedRect(0, 0, BUBBLE_WIDTH, bubbleHeight, BUBBLE_RADIUS);

    // Draw tail (triangle pointing down-left toward character)
    this.bg.fillStyle(BUBBLE_BG, 1);
    this.bg.fillTriangle(
      4, bubbleHeight,
      4 + TAIL_SIZE * 2, bubbleHeight,
      0, bubbleHeight + TAIL_SIZE,
    );
    // Tail border
    this.bg.lineStyle(BUBBLE_BORDER_WIDTH, BUBBLE_BORDER, 1);
    this.bg.lineBetween(4, bubbleHeight, 0, bubbleHeight + TAIL_SIZE);
    this.bg.lineBetween(0, bubbleHeight + TAIL_SIZE, 4 + TAIL_SIZE * 2, bubbleHeight);

    // Render text lines
    let ty = BUBBLE_PADDING;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Add separator line after title
      if (i === 1) {
        this.bg.lineStyle(1, 0xd4c89a, 1);
        this.bg.lineBetween(BUBBLE_PADDING, ty - 2, BUBBLE_WIDTH - BUBBLE_PADDING, ty - 2);
      }

      // Add separator before timestamp
      if (lines[i].text.startsWith("🕐")) {
        this.bg.lineStyle(1, 0xd4c89a, 1);
        this.bg.lineBetween(BUBBLE_PADDING, ty - 2, BUBBLE_WIDTH - BUBBLE_PADDING, ty - 2);
      }

      const txt = this.scene.add.text(BUBBLE_PADDING, ty, line.text, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: line.size ?? FONT_SIZE,
        color: line.color,
        wordWrap: { width: BUBBLE_WIDTH - BUBBLE_PADDING * 2 },
      });
      this.container.add(txt);
      this.texts.push(txt);
      ty += LINE_HEIGHT;
    }

    // ── Action buttons ──────────────────────────────

    // Separator before buttons
    ty += 2;
    this.bg.lineStyle(1, 0xd4c89a, 1);
    this.bg.lineBetween(BUBBLE_PADDING, ty, BUBBLE_WIDTH - BUBBLE_PADDING, ty);
    ty += BUTTON_PADDING + 2;

    // Calculate button widths to fit evenly
    const totalGap = BUTTON_GAP * (buttonDefs.length - 1);
    const availableWidth = BUBBLE_WIDTH - BUBBLE_PADDING * 2 - totalGap;
    const btnWidth = Math.floor(availableWidth / buttonDefs.length);
    let bx2 = BUBBLE_PADDING;

    for (const def of buttonDefs) {
      // Button background (rounded rect via Graphics)
      const btnBg = this.scene.add.graphics();
      btnBg.fillStyle(0xe8e0c8, 1);
      btnBg.lineStyle(1, 0xaaaaaa, 1);
      btnBg.fillRoundedRect(bx2, ty, btnWidth, BUTTON_HEIGHT, 3);
      btnBg.strokeRoundedRect(bx2, ty, btnWidth, BUTTON_HEIGHT, 3);
      this.container.add(btnBg);
      this.buttonBgs.push(btnBg);

      // Button text (centered in the rect)
      const btnText = this.scene.add.text(bx2 + btnWidth / 2, ty + BUTTON_HEIGHT / 2, def.label, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: BUTTON_FONT_SIZE,
        color: def.color,
        align: "center",
      }).setOrigin(0.5, 0.5);

      // Make button interactive
      btnText.setInteractive(
        new Phaser.Geom.Rectangle(-(btnWidth / 2), -(BUTTON_HEIGHT / 2), btnWidth, BUTTON_HEIGHT),
        Phaser.Geom.Rectangle.Contains,
      );

      btnText.on("pointerover", () => {
        btnText.setColor(def.hoverColor);
        btnBg.clear();
        btnBg.fillStyle(0xd4c89a, 1);
        btnBg.lineStyle(1, 0x888888, 1);
        btnBg.fillRoundedRect(bx2, ty, btnWidth, BUTTON_HEIGHT, 3);
        btnBg.strokeRoundedRect(bx2, ty, btnWidth, BUTTON_HEIGHT, 3);
      });

      btnText.on("pointerout", () => {
        // Reset unless this button is in confirmation state
        if (this._confirmingAction !== def.action) {
          btnText.setColor(def.color);
          btnBg.clear();
          btnBg.fillStyle(0xe8e0c8, 1);
          btnBg.lineStyle(1, 0xaaaaaa, 1);
          btnBg.fillRoundedRect(bx2, ty, btnWidth, BUTTON_HEIGHT, 3);
          btnBg.strokeRoundedRect(bx2, ty, btnWidth, BUTTON_HEIGHT, 3);
        }
      });

      // Capture bx2 and ty in closure for hover reset
      const capturedBx = bx2;
      const capturedTy = ty;

      btnText.on("pointerdown", () => {
        if (!this.targetId) return;

        // Chat doesn't need confirmation
        if (def.action === "chat") {
          this.onAction?.(this.targetId, "chat");
          return;
        }

        // Destructive actions need confirmation
        if (this._confirmingAction === def.action) {
          // Second click → execute
          this.onAction?.(this.targetId, def.action);
          this._confirmingAction = null;
          if (this._confirmTimer) { clearTimeout(this._confirmTimer); this._confirmTimer = null; }
          this.hide();
          return;
        }

        // First click → enter confirmation state
        this._confirmingAction = def.action;
        btnText.setText("Sure?");
        btnText.setColor("#cc3333");
        btnBg.clear();
        btnBg.fillStyle(0xffdddd, 1);
        btnBg.lineStyle(1, 0xcc3333, 1);
        btnBg.fillRoundedRect(capturedBx, capturedTy, btnWidth, BUTTON_HEIGHT, 3);
        btnBg.strokeRoundedRect(capturedBx, capturedTy, btnWidth, BUTTON_HEIGHT, 3);

        // Reset after 2s if not confirmed
        if (this._confirmTimer) clearTimeout(this._confirmTimer);
        this._confirmTimer = setTimeout(() => {
          this._confirmingAction = null;
          btnText.setText(def.label);
          btnText.setColor(def.color);
          btnBg.clear();
          btnBg.fillStyle(0xe8e0c8, 1);
          btnBg.lineStyle(1, 0xaaaaaa, 1);
          btnBg.fillRoundedRect(capturedBx, capturedTy, btnWidth, BUTTON_HEIGHT, 3);
          btnBg.strokeRoundedRect(capturedBx, capturedTy, btnWidth, BUTTON_HEIGHT, 3);
        }, 2000);
      });

      this.container.add(btnText);
      this.buttons.push(btnText);
      bx2 += btnWidth + BUTTON_GAP;
    }

    this._visible = true;
    this._dismissable = false;
    if (this._dismissTimer) clearTimeout(this._dismissTimer);
    this._dismissTimer = setTimeout(() => { this._dismissable = true; }, 200);
    this.container.setVisible(true);

    // Pop-in animation
    this.container.setScale(0.8);
    this.container.setAlpha(0);
    this.scene.tweens.add({
      targets: this.container,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 150,
      ease: "Back.easeOut",
    });
  }

  /**
   * Hide the bubble.
   */
  hide(): void {
    if (!this._visible) return;
    this._visible = false;
    this._dismissable = false;
    this._confirmingAction = null;
    if (this._dismissTimer) { clearTimeout(this._dismissTimer); this._dismissTimer = null; }
    if (this._confirmTimer) { clearTimeout(this._confirmTimer); this._confirmTimer = null; }
    this.targetId = null;

    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      scaleX: 0.8,
      scaleY: 0.8,
      duration: 100,
      ease: "Power2",
      onComplete: () => {
        this.container.setVisible(false);
      },
    });

    this.onDismiss?.();
  }

  /**
   * Update content if the same session is still shown (e.g. status change).
   */
  updateIfShowing(
    worldX: number,
    worldY: number,
    session: SessionData,
    agent?: AgentData,
    seatName?: string | null,
  ): void {
    if (this._visible && this.targetId === session.key) {
      this.show(worldX, worldY, session, agent, seatName);
    }
  }

  destroy(): void {
    if (this._confirmTimer) clearTimeout(this._confirmTimer);
    if (this._dismissTimer) clearTimeout(this._dismissTimer);
    for (const t of this.texts) t.destroy();
    for (const b of this.buttons) b.destroy();
    for (const bg of this.buttonBgs) bg.destroy();
    this.bg.destroy();
    this.container.destroy();
  }
}
