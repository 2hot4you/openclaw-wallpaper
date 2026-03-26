/**
 * WorkshopScene — The main Stardew Valley-style scene for OpenClaw Wallpaper.
 *
 * Six-layer rendering structure (bottom to top):
 * 1. SkyLayer — gradient sky + scrolling clouds
 * 2. BackgroundLayer — distant hills
 * 3. BuildingLayer — workshop, dispatch station, rest area
 * 4. GroundLayer — green ground + stone path
 * 5. CharacterLayer — agent characters (via AgentCharacterManager)
 * 6. UIOverlayLayer — status text, FPS
 */

import { Application, Container } from "pixi.js";
import { SkyLayer } from "./layers/SkyLayer";
import { BackgroundLayer } from "./layers/BackgroundLayer";
import { BuildingLayer } from "./layers/BuildingLayer";
import { GroundLayer } from "./layers/GroundLayer";
import { UIOverlayLayer } from "./layers/UIOverlayLayer";
import { AgentCharacterManager } from "../characters/AgentCharacterManager";

export class WorkshopScene {
  public readonly container: Container;
  private app: Application;

  private skyLayer: SkyLayer;
  private backgroundLayer: BackgroundLayer;
  private buildingLayer: BuildingLayer;
  private groundLayer: GroundLayer;
  private characterManager: AgentCharacterManager;
  private uiOverlayLayer: UIOverlayLayer;

  constructor(app: Application) {
    this.app = app;
    this.container = new Container();
    this.container.label = "workshop-scene";

    // Create layers
    this.skyLayer = new SkyLayer();
    this.backgroundLayer = new BackgroundLayer();
    this.buildingLayer = new BuildingLayer();
    this.groundLayer = new GroundLayer();
    this.characterManager = new AgentCharacterManager();
    this.uiOverlayLayer = new UIOverlayLayer();

    // Add in order (bottom to top)
    this.container.addChild(this.skyLayer.container);
    this.container.addChild(this.backgroundLayer.container);
    this.container.addChild(this.groundLayer.container);
    this.container.addChild(this.buildingLayer.container);
    this.container.addChild(this.characterManager.container);
    this.container.addChild(this.uiOverlayLayer.container);
  }

  async init(): Promise<void> {
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    this.skyLayer.init(w, h);
    this.backgroundLayer.init(w, h);
    this.buildingLayer.init(w, h);
    this.groundLayer.init(w, h);
    this.characterManager.setSceneDimensions(w, h);
    this.uiOverlayLayer.init(w, h);

    // Register ticker for updates
    this.app.ticker.add((ticker) => {
      this.update(ticker.deltaTime);
    });
  }

  /**
   * Get the character manager for external control (e.g., from React).
   */
  getCharacterManager(): AgentCharacterManager {
    return this.characterManager;
  }

  /**
   * Per-frame update.
   */
  private update(dt: number): void {
    this.skyLayer.update(dt);
    this.characterManager.update(dt);
    this.uiOverlayLayer.update(dt);
  }

  /**
   * Handle window resize.
   */
  onResize(w: number, h: number): void {
    this.skyLayer.onResize(w, h);
    this.backgroundLayer.onResize(w, h);
    this.buildingLayer.onResize(w, h);
    this.groundLayer.onResize(w, h);
    this.characterManager.setSceneDimensions(w, h);
    this.uiOverlayLayer.onResize(w, h);
  }

  /**
   * Clean up all layers.
   */
  destroy(): void {
    this.characterManager.destroy();
    this.container.destroy({ children: true });
  }
}
