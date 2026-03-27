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
 */

import Phaser from "phaser";
import type { SessionData, AgentData } from "../../gateway/types";

// ── Layout ──────────────────────────────────────────

const BUBBLE_WIDTH = 180;
const BUBBLE_PADDING = 8;
const LINE_HEIGHT = 12;
const FONT_SIZE = "7px";
const TITLE_FONT_SIZE = "8px";
const BUBBLE_BG = 0xfef9e7;
const BUBBLE_BORDER = 0x222222;
const BUBBLE_BORDER_WIDTH = 2;
const BUBBLE_RADIUS = 6;
const TAIL_SIZE = 8;
const BUBBLE_OFFSET_X = 30; // right of character
const BUBBLE_OFFSET_Y = -80; // above character
const BUBBLE_DEPTH = 50;

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

export class InfoBubble {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];
  private _visible = false;
  private _dismissable = false;
  private _dismissTimer: ReturnType<typeof setTimeout> | null = null;
  private targetId: string | null = null;

  /** Callback when bubble is dismissed */
  onDismiss: (() => void) | null = null;

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

    // Clear old content
    for (const t of this.texts) t.destroy();
    this.texts = [];
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

    // Calculate bubble height
    const textHeight = lines.length * LINE_HEIGHT + BUBBLE_PADDING * 2;
    const bubbleHeight = textHeight + 4;

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
    if (this._dismissTimer) { clearTimeout(this._dismissTimer); this._dismissTimer = null; }
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
    for (const t of this.texts) t.destroy();
    this.bg.destroy();
    this.container.destroy();
  }
}
