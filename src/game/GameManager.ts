/**
 * GameManager — Replaces the old PixiJS SceneManager.
 *
 * Creates and manages the Phaser.Game instance.
 * Provides the same public API as the old SceneManager so MainWindow.tsx
 * can swap with minimal changes:
 *
 * - init(container) — mount game canvas
 * - destroy() — tear down game
 * - getCharacterManager() — returns AgentManager for sync
 * - onCharacterClick(handler) — register click callback
 * - setOnlineMode(online) — toggle offline overlay
 * - setStatusText(text) — update status bar
 * - getScene() → OfficeScene (for direct access)
 */

import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { OfficeScene } from "./scenes/OfficeScene";
import { AgentManager } from "./characters/AgentManager";
import { StatusBar } from "./ui/StatusBar";
import type { ConnectionStatus } from "../gateway/types";
import type { CharacterClickHandler } from "./characters/AgentSprite";

export class GameManager {
  private game: Phaser.Game | null = null;
  private officeScene: OfficeScene | null = null;
  private agentManager: AgentManager | null = null;
  private statusBar: StatusBar | null = null;
  private _onlineMode = false;

  // Deferred handlers (set before scene is ready)
  private _pendingClickHandler: CharacterClickHandler | null = null;
  private _pendingStatusText: string = "🦞 OpenClaw Wallpaper";
  private _pendingConnectionStatus: ConnectionStatus = "disconnected";

  // Offline overlay elements (created in OfficeScene)
  private offlineOverlay: Phaser.GameObjects.Rectangle | null = null;
  private offlineText: Phaser.GameObjects.Text | null = null;

  constructor() {}

  /**
   * Initialize Phaser game and mount to container.
   */
  async init(container: HTMLElement): Promise<void> {

    return new Promise<void>((resolve) => {
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        parent: container,
        width: container.clientWidth,
        height: container.clientHeight,
        pixelArt: true,
        antialias: false,
        roundPixels: true,
        transparent: false,
        backgroundColor: "#2a2a3d",
        scene: [BootScene, OfficeScene],
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.NO_CENTER,
          width: container.clientWidth,
          height: container.clientHeight,
        },
        // No physics needed for wallpaper mode
        render: {
          pixelArt: true,
        },
      };

      this.game = new Phaser.Game(config);

      // Wait for OfficeScene to be ready
      this.game.events.on("step", () => {
        if (this.officeScene) return; // Already initialized

        const scene = this.game?.scene.getScene("OfficeScene") as
          | OfficeScene
          | undefined;
        if (scene && scene.mapWidth > 0) {
          this.officeScene = scene;
          this.setupScene(scene);
          resolve();
        }
      });

      // Fallback: resolve after timeout even if scene isn't ready
      setTimeout(() => resolve(), 5000);
    });
  }

  /**
   * Set up scene systems once OfficeScene is ready.
   */
  private setupScene(scene: OfficeScene): void {
    // Create AgentManager
    this.agentManager = new AgentManager(scene);

    // Create StatusBar
    this.statusBar = new StatusBar(scene);

    // Create offline overlay
    this.offlineOverlay = scene.add
      .rectangle(
        scene.mapWidth / 2,
        scene.mapHeight / 2,
        scene.mapWidth,
        scene.mapHeight,
        0x000000,
        0.3,
      )
      .setDepth(50)
      .setScrollFactor(0);
    // Scale overlay to fill viewport regardless of camera zoom
    scene.scale.on("resize", () => this.resizeOfflineOverlay());
    this.resizeOfflineOverlay();

    this.offlineText = scene.add
      .text(0, 0, "🔌 OpenClaw Offline", {
        fontFamily: "monospace",
        fontSize: "24px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
        align: "center",
      })
      .setOrigin(0.5, 0.5)
      .setDepth(51)
      .setScrollFactor(0);
    this.positionOfflineText();
    scene.scale.on("resize", () => this.positionOfflineText());

    // Apply pending state
    this.setOnlineMode(this._onlineMode);

    if (this._pendingClickHandler) {
      this.agentManager.onCharacterClick(this._pendingClickHandler);
    }

    if (this.statusBar) {
      this.statusBar.setStatusText(this._pendingStatusText);
      this.statusBar.setConnectionStatus(this._pendingConnectionStatus);
    }
  }

  private resizeOfflineOverlay(): void {
    if (!this.offlineOverlay || !this.game) return;
    const w = this.game.scale.width;
    const h = this.game.scale.height;
    this.offlineOverlay.setSize(w * 2, h * 2);
    this.offlineOverlay.setPosition(w / 2, h / 2);
  }

  private positionOfflineText(): void {
    if (!this.offlineText || !this.game) return;
    const w = this.game.scale.width;
    const h = this.game.scale.height;
    this.offlineText.setPosition(w / 2, h / 2);
  }

  /**
   * Get the AgentManager (replaces getCharacterManager).
   */
  getCharacterManager(): AgentManager | null {
    return this.agentManager;
  }

  /**
   * Get seat index for a given session key (debug helper).
   */
  getSeatIndex(sessionKey: string): number | null {
    return this.agentManager?.getSeatIndex(sessionKey) ?? null;
  }

  /**
   * Get the OfficeScene.
   */
  getScene(): OfficeScene | null {
    return this.officeScene;
  }

  /**
   * Register click handler for character interactions.
   */
  onCharacterClick(handler: CharacterClickHandler | null): void {
    this._pendingClickHandler = handler;
    this.agentManager?.onCharacterClick(handler);
  }

  /**
   * Set online/offline mode.
   */
  setOnlineMode(online: boolean): void {
    this._onlineMode = online;

    if (this.offlineOverlay) {
      this.offlineOverlay.setVisible(!online);
    }
    if (this.offlineText) {
      this.offlineText.setVisible(!online);
    }
  }

  /**
   * Update the status bar text.
   */
  setStatusText(text: string): void {
    this._pendingStatusText = text;
    this.statusBar?.setStatusText(text);
  }

  /**
   * Update connection status in the status bar.
   */
  setConnectionStatus(status: ConnectionStatus): void {
    this._pendingConnectionStatus = status;
    this.statusBar?.setConnectionStatus(status);
  }

  /**
   * Destroy everything.
   */
  destroy(): void {
    this.agentManager?.destroy();
    this.statusBar?.destroy();
    this.offlineOverlay?.destroy();
    this.offlineText?.destroy();

    if (this.game) {
      this.game.destroy(true);
      this.game = null;
    }

    this.officeScene = null;
    this.agentManager = null;
    this.statusBar = null;
    this.offlineOverlay = null;
    this.offlineText = null;
  }
}
