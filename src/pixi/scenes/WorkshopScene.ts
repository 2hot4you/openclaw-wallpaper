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
 * 7. OfflineOverlay — semi-transparent mask + offline text (on top of everything)
 */

import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
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

  // Offline overlay
  private offlineOverlay: Container;
  private offlineMask: Graphics;
  private offlineText: Text;
  private _isOnline = false;

  // Chimney smoke
  private smokeParticles: { g: Graphics; x: number; y: number; vx: number; vy: number; life: number; maxLife: number }[] = [];
  private smokeContainer: Container;
  private smokeTimer = 0;

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

    // Smoke container (above building, below characters)
    this.smokeContainer = new Container();
    this.smokeContainer.label = "smoke-layer";

    // Add in order (bottom to top)
    this.container.addChild(this.skyLayer.container);
    this.container.addChild(this.backgroundLayer.container);
    this.container.addChild(this.groundLayer.container);
    this.container.addChild(this.buildingLayer.container);
    this.container.addChild(this.smokeContainer);
    this.container.addChild(this.characterManager.container);
    this.container.addChild(this.uiOverlayLayer.container);

    // Offline overlay (on top of everything)
    this.offlineOverlay = new Container();
    this.offlineOverlay.label = "offline-overlay";
    this.offlineOverlay.visible = false;

    this.offlineMask = new Graphics();
    this.offlineOverlay.addChild(this.offlineMask);

    const offlineStyle = new TextStyle({
      fontFamily: "monospace",
      fontSize: 24,
      fill: 0xffffff,
      stroke: { color: 0x000000, width: 4 },
      align: "center",
      letterSpacing: 2,
    });
    this.offlineText = new Text({ text: "🔌 OpenClaw Offline", style: offlineStyle });
    this.offlineText.anchor.set(0.5, 0.5);
    this.offlineOverlay.addChild(this.offlineText);

    this.container.addChild(this.offlineOverlay);
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

    // Draw offline overlay sized to screen
    this.drawOfflineOverlay(w, h);

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
   * Get the UI overlay layer for status updates.
   */
  getUIOverlayLayer(): UIOverlayLayer {
    return this.uiOverlayLayer;
  }

  /**
   * Set online/offline visual mode.
   * - Offline: grey overlay + "OpenClaw Offline" text, no chimney smoke
   * - Online: no overlay, chimney smokes
   */
  setOnlineMode(online: boolean): void {
    this._isOnline = online;
    this.offlineOverlay.visible = !online;

    if (!online) {
      // Clear smoke when going offline
      for (const p of this.smokeParticles) {
        p.g.destroy();
      }
      this.smokeParticles = [];
    }
  }

  get isOnline(): boolean {
    return this._isOnline;
  }

  /**
   * Per-frame update.
   */
  private update(dt: number): void {
    this.skyLayer.update(dt);
    this.characterManager.update(dt);
    this.uiOverlayLayer.update(dt);

    // Update chimney smoke only when online
    if (this._isOnline) {
      this.updateSmoke(dt);
    }
  }

  // ─── Chimney Smoke ──────────────────────────────────

  private updateSmoke(dt: number): void {
    this.smokeTimer += dt;

    // Emit new smoke particle every ~8 frames
    if (this.smokeTimer >= 8) {
      this.smokeTimer = 0;
      this.emitSmoke();
    }

    // Update existing particles
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.g.x = p.x;
      p.g.y = p.y;

      const t = p.life / p.maxLife;
      p.g.alpha = Math.max(0, 1 - t) * 0.5;
      p.g.scale.set(0.5 + t * 1.5);

      if (p.life >= p.maxLife) {
        p.g.destroy();
        this.smokeParticles.splice(i, 1);
      }
    }
  }

  private emitSmoke(): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const groundY = h * 0.78;
    const wsX = w * 0.15;
    const wsW = 100;
    const wsH = 80;
    const wsY = groundY - wsH;

    // Chimney top position
    const chimneyX = wsX + wsW / 4 + 6;
    const chimneyY = wsY - 55;

    const g = new Graphics();
    g.circle(0, 0, 4 + Math.random() * 3);
    g.fill({ color: 0x888888, alpha: 0.5 });

    g.x = chimneyX + (Math.random() - 0.5) * 4;
    g.y = chimneyY;

    this.smokeContainer.addChild(g);
    this.smokeParticles.push({
      g,
      x: g.x,
      y: g.y,
      vx: (Math.random() - 0.3) * 0.3,
      vy: -0.4 - Math.random() * 0.3,
      life: 0,
      maxLife: 40 + Math.random() * 30,
    });
  }

  // ─── Offline Overlay ────────────────────────────────

  private drawOfflineOverlay(w: number, h: number): void {
    this.offlineMask.clear();
    this.offlineMask.rect(0, 0, w, h);
    this.offlineMask.fill({ color: 0x000000, alpha: 0.3 });

    this.offlineText.x = w / 2;
    this.offlineText.y = h / 2;
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
    this.drawOfflineOverlay(w, h);
  }

  /**
   * Clean up all layers.
   */
  destroy(): void {
    for (const p of this.smokeParticles) {
      p.g.destroy();
    }
    this.smokeParticles = [];
    this.characterManager.destroy();
    this.container.destroy({ children: true });
  }
}
