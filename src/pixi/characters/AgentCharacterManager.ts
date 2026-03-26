/**
 * AgentCharacterManager — Manages all agent characters in the scene.
 *
 * Syncs characters with session data:
 * - New sessions → spawn character
 * - Removed sessions → despawn character
 * - Changed status → update animation
 *
 * Positions characters: working agents near workshop, idle near rest area.
 */

import { Container } from "pixi.js";
import { AgentCharacter } from "./AgentCharacter";
import { getPalette } from "./PaletteSwap";
import type { SessionData } from "../../gateway/types";

/** Position zones (fractions of scene width) */
const WORKSHOP_X_START = 0.1;
const WORKSHOP_X_END = 0.35;
const REST_X_START = 0.65;
const REST_X_END = 0.9;
const CHARACTER_SPACING = 60;

export class AgentCharacterManager {
  public readonly container: Container;

  private characters: Map<string, AgentCharacter> = new Map();
  private nextIndex = 0;
  private sceneWidth = 800;
  private sceneHeight = 600;

  constructor() {
    this.container = new Container();
    this.container.label = "character-layer";
  }

  /**
   * Update scene dimensions for character positioning.
   */
  setSceneDimensions(w: number, h: number): void {
    this.sceneWidth = w;
    this.sceneHeight = h;
    this.repositionAll();
  }

  /**
   * Sync characters with current session list.
   */
  syncWithSessions(sessions: SessionData[]): void {
    const sessionKeys = new Set(sessions.map((s) => s.key));

    // Remove characters for sessions that no longer exist
    for (const [key, character] of this.characters) {
      if (!sessionKeys.has(key) && character.currentState !== "despawn") {
        character.despawn();
      }
    }

    // Add/update characters for current sessions
    for (const session of sessions) {
      let character = this.characters.get(session.key);

      if (!character) {
        // New character
        const palette = getPalette(this.nextIndex);
        character = new AgentCharacter(session.key, session.label ?? session.key, palette);
        this.nextIndex++;
        this.characters.set(session.key, character);
        this.container.addChild(character.container);
      }

      // Update status
      const status = this.mapSessionStatus(session.status);
      character.setStatus(status);
    }

    this.repositionAll();
  }

  /**
   * Map session status string to character animation state.
   */
  private mapSessionStatus(status: string | undefined): "idle" | "working" | "error" {
    switch (status) {
      case "active":
        return "working";
      case "error":
        return "error";
      case "idle":
      case "closed":
      default:
        return "idle";
    }
  }

  /**
   * Reposition all characters based on their current status.
   * Working → workshop area (left)
   * Idle/Error → rest area (right)
   */
  private repositionAll(): void {
    const groundY = this.sceneHeight * 0.78;

    const workingChars: AgentCharacter[] = [];
    const idleChars: AgentCharacter[] = [];

    for (const character of this.characters.values()) {
      if (character.isDespawned) continue;

      const state = character.currentState;
      if (state === "working") {
        workingChars.push(character);
      } else {
        idleChars.push(character);
      }
    }

    // Position working characters near workshop
    const workshopCenter = this.sceneWidth * (WORKSHOP_X_START + WORKSHOP_X_END) / 2;
    const workshopStartX = workshopCenter - ((workingChars.length - 1) * CHARACTER_SPACING) / 2;
    workingChars.forEach((char, i) => {
      char.container.x = workshopStartX + i * CHARACTER_SPACING;
      char.container.y = groundY;
    });

    // Position idle characters near rest area
    const restCenter = this.sceneWidth * (REST_X_START + REST_X_END) / 2;
    const restStartX = restCenter - ((idleChars.length - 1) * CHARACTER_SPACING) / 2;
    idleChars.forEach((char, i) => {
      char.container.x = restStartX + i * CHARACTER_SPACING;
      char.container.y = groundY;
    });
  }

  /**
   * Update all characters (call per tick).
   */
  update(dt: number): void {
    for (const [key, character] of this.characters) {
      character.update(dt);

      // Clean up fully despawned characters
      if (character.isDespawned) {
        character.destroy();
        this.characters.delete(key);
      }
    }
  }

  /**
   * Destroy all characters and clean up.
   */
  destroy(): void {
    for (const character of this.characters.values()) {
      character.destroy();
    }
    this.characters.clear();
    this.container.destroy({ children: true });
  }
}
