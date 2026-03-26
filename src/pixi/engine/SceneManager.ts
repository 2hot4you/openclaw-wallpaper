import { Application } from "pixi.js";
import { WorkshopScene } from "../scenes/WorkshopScene";
import { PerformanceController, PerformanceMode } from "./PerformanceController";
import { AgentCharacterManager } from "../characters/AgentCharacterManager";
import type { CharacterClickHandler } from "../characters/AgentCharacter";

export class SceneManager {
  private app: Application | null = null;
  private scene: WorkshopScene | null = null;
  private performanceController: PerformanceController | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private container: HTMLElement | null = null;

  constructor() {}

  /**
   * Initialize the PixiJS Application and mount it to the given container.
   */
  async init(container: HTMLElement): Promise<void> {
    this.container = container;

    this.app = new Application();

    await this.app.init({
      resizeTo: container,
      antialias: false, // pixel art — no antialiasing
      resolution: 1,
      autoDensity: true,
      backgroundAlpha: 1,
      backgroundColor: 0x5b9bd5, // sky blue fallback
      preference: "webgl", // force WebGL — macOS WebView may not support WebGPU
    });

    // Append the canvas to the container
    container.appendChild(this.app.canvas as HTMLCanvasElement);

    // Load Workshop scene
    this.scene = new WorkshopScene(this.app);
    await this.scene.init();
    this.app.stage.addChild(this.scene.container);

    // Enable stage-level interactivity for click events to propagate
    this.app.stage.eventMode = "passive";

    // Initialize performance controller
    this.performanceController = new PerformanceController(this.app.ticker);

    // Track user interactions for idle detection
    const interactionEvents = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"];
    for (const evt of interactionEvents) {
      container.addEventListener(evt, () => {
        this.performanceController?.recordInteraction();
      }, { passive: true });
    }

    // Handle resize
    this.resizeObserver = new ResizeObserver(() => {
      this.onResize();
    });
    this.resizeObserver.observe(container);
  }

  private onResize(): void {
    if (!this.app || !this.container) return;
    this.app.renderer.resize(
      this.container.clientWidth,
      this.container.clientHeight,
    );
    this.scene?.onResize(
      this.container.clientWidth,
      this.container.clientHeight,
    );
  }

  /**
   * Get the character manager for driving characters from React layer.
   */
  getCharacterManager(): AgentCharacterManager | null {
    return this.scene?.getCharacterManager() ?? null;
  }

  /**
   * Get the underlying WorkshopScene for direct control (offline mode, etc).
   */
  getScene(): WorkshopScene | null {
    return this.scene;
  }

  /**
   * Register a callback for character click events.
   * The callback receives (characterId, globalX, globalY).
   */
  onCharacterClick(handler: CharacterClickHandler | null): void {
    this.scene?.getCharacterManager().onCharacterClick(handler);
  }

  /**
   * Set online/offline mode on the scene.
   */
  setOnlineMode(online: boolean): void {
    this.scene?.setOnlineMode(online);
  }

  /**
   * Update the status text in the UI overlay.
   */
  setStatusText(text: string): void {
    this.scene?.getUIOverlayLayer().setStatus(text);
  }

  /**
   * Get current performance mode.
   */
  getPerformanceMode(): PerformanceMode | null {
    return this.performanceController?.mode ?? null;
  }

  /**
   * Set performance mode manually.
   */
  setPerformanceMode(mode: PerformanceMode): void {
    this.performanceController?.setMode(mode);
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.performanceController?.destroy();
    this.scene?.destroy();
    if (this.app) {
      this.app.destroy(true, { children: true });
      this.app = null;
    }
  }
}
