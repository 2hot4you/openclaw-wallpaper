/**
 * PerformanceController — Dynamic FPS management for power efficiency.
 *
 * Four modes:
 * - Active (30fps) — user is interacting
 * - Idle (12fps) — no interaction for 30s
 * - Occluded (1fps) — window is hidden/minimized
 * - Paused (0fps) — completely stopped
 *
 * Integrates with PixiJS Ticker via SceneManager.
 */

import { Ticker } from "pixi.js";
import { FPS, IDLE_TIMEOUT_MS } from "../../utils/constants";

export type PerformanceMode = "active" | "idle" | "occluded" | "paused";

const MODE_FPS: Record<PerformanceMode, number> = {
  active: FPS.ACTIVE,
  idle: FPS.IDLE,
  occluded: FPS.OCCLUDED,
  paused: 0,
};

export class PerformanceController {
  private _mode: PerformanceMode = "active";
  private ticker: Ticker;
  private lastInteractionTime = Date.now();
  private idleCheckInterval: ReturnType<typeof setInterval> | null = null;
  private onModeChange?: (mode: PerformanceMode) => void;

  constructor(ticker: Ticker, onModeChange?: (mode: PerformanceMode) => void) {
    this.ticker = ticker;
    this.onModeChange = onModeChange;
    this.applyMode("active");
    this.startIdleDetection();
    this.setupVisibilityListener();
  }

  get mode(): PerformanceMode {
    return this._mode;
  }

  /**
   * Manually set the performance mode.
   */
  setMode(mode: PerformanceMode): void {
    if (this._mode === mode) return;
    this.applyMode(mode);
  }

  /**
   * Record user interaction (resets idle timer).
   */
  recordInteraction(): void {
    this.lastInteractionTime = Date.now();
    if (this._mode === "idle") {
      this.applyMode("active");
    }
  }

  private applyMode(mode: PerformanceMode): void {
    this._mode = mode;
    const targetFps = MODE_FPS[mode];

    if (targetFps === 0) {
      this.ticker.stop();
    } else {
      this.ticker.maxFPS = targetFps;
      if (!this.ticker.started) {
        this.ticker.start();
      }
    }

    this.onModeChange?.(mode);
  }

  private startIdleDetection(): void {
    this.idleCheckInterval = setInterval(() => {
      if (this._mode === "paused" || this._mode === "occluded") return;

      const elapsed = Date.now() - this.lastInteractionTime;
      if (elapsed >= IDLE_TIMEOUT_MS && this._mode === "active") {
        this.applyMode("idle");
      }
    }, 5000);
  }

  private setupVisibilityListener(): void {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.applyMode("occluded");
      } else {
        this.lastInteractionTime = Date.now();
        this.applyMode("active");
      }
    });
  }

  /**
   * Clean up timers and listeners.
   */
  destroy(): void {
    if (this.idleCheckInterval !== null) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
  }
}
