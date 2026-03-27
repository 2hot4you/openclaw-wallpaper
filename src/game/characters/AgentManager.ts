/**
 * AgentManager — Manages all agent characters in the Phaser scene.
 *
 * Responsibilities:
 * - Syncs characters with Gateway session data
 * - Assigns seat positions (working area) and rest positions (idle area)
 * - Handles character spawn/despawn lifecycle
 * - Routes click events to the React layer
 *
 * Seat assignment:
 * - Working agents get assigned to seats parsed from the tilemap
 * - Idle agents gather in the POI "rest" area, or fallback to a default position
 * - When status changes, characters walk to the appropriate zone
 */

import { AgentSprite, type AgentStatus, type CharacterClickHandler } from "./AgentSprite";
import { CHARACTER_SPRITES } from "../config/animations";
import type { OfficeScene } from "../scenes/OfficeScene";
import type { SessionData } from "../../gateway/types";

/** Spacing between idle characters in the rest area */
const REST_SPACING = 40;

/** Default rest area (fraction of map size) if no POI named "rest" found */
const DEFAULT_REST_X_FRAC = 0.75;
const DEFAULT_REST_Y_FRAC = 0.6;

export class AgentManager {
  private scene: OfficeScene;
  private agents: Map<string, AgentSprite> = new Map();
  private seatAssignments: Map<string, number> = new Map(); // agentId → seat index
  private usedSeats: Set<number> = new Set();
  private nextSpriteIndex = 0;
  private clickHandler: CharacterClickHandler | null = null;

  constructor(scene: OfficeScene) {
    this.scene = scene;
  }

  /**
   * Register a click handler for all characters.
   */
  onCharacterClick(handler: CharacterClickHandler | null): void {
    this.clickHandler = handler;
    for (const agent of this.agents.values()) {
      agent.setClickHandler(handler);
    }
  }

  /**
   * Sync agents with current session list from Gateway.
   */
  syncWithSessions(sessions: SessionData[]): void {
    const sessionKeys = new Set(sessions.map((s) => s.key));

    // Remove characters for sessions that no longer exist
    for (const [key, agent] of this.agents) {
      if (!sessionKeys.has(key) && !agent.isDespawned) {
        this.releaseAgent(key);
        agent.despawn();
      }
    }

    // Clean up despawned agents
    for (const [key, agent] of this.agents) {
      if (agent.isDespawned) {
        this.agents.delete(key);
      }
    }

    // Add / update characters for current sessions
    for (const session of sessions) {
      const existing = this.agents.get(session.key);
      const status = this.mapSessionStatus(session.status);

      let agent: AgentSprite;
      if (!existing) {
        // Spawn new agent
        const spawned = this.spawnAgent(session);
        if (!spawned) continue;
        agent = spawned;
      } else {
        agent = existing;
      }

      // Update status — triggers emote + animation change
      const prevStatus = agent.status;
      agent.setStatus(status);

      // Reposition if status changed (walk to new zone) or just spawned
      if (prevStatus !== status || !existing) {
        this.positionAgent(session.key, agent, status);
      }
    }
  }

  /**
   * Map session status string → AgentSprite status.
   */
  private mapSessionStatus(status: string | undefined): AgentStatus {
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
   * Spawn a new agent character at a default position.
   */
  private spawnAgent(session: SessionData): AgentSprite | null {
    const displayName =
      session.label ??
      session.agentId ??
      session.key.split(":").pop() ??
      "agent";

    // Pick a sprite sheet (cycle through available)
    const spriteConfig =
      CHARACTER_SPRITES[this.nextSpriteIndex % CHARACTER_SPRITES.length];
    this.nextSpriteIndex++;

    // Default spawn position (center of map)
    const spawnX = this.scene.mapWidth / 2;
    const spawnY = this.scene.mapHeight / 2;

    const agent = new AgentSprite(
      this.scene,
      session.key,
      displayName,
      spriteConfig.key,
      spawnX,
      spawnY,
    );

    agent.setClickHandler(this.clickHandler);
    this.agents.set(session.key, agent);

    return agent;
  }

  /**
   * Position an agent based on status:
   * - working → assigned seat (desk)
   * - idle/error → rest area
   */
  private positionAgent(
    sessionKey: string,
    agent: AgentSprite,
    status: AgentStatus,
  ): void {
    if (status === "working") {
      // Assign to a seat if not already
      const seatIdx = this.assignSeat(sessionKey);
      if (seatIdx !== null && seatIdx < this.scene.seatPositions.length) {
        const seat = this.scene.seatPositions[seatIdx];
        agent.moveTo(seat.x, seat.y);
      }
    } else {
      // Release seat and move to rest area
      this.releaseSeat(sessionKey);
      const restPos = this.getRestPosition(sessionKey);
      agent.moveTo(restPos.x, restPos.y);
    }
  }

  /**
   * Assign a seat to an agent. Returns seat index.
   */
  private assignSeat(sessionKey: string): number | null {
    // Already assigned?
    const existing = this.seatAssignments.get(sessionKey);
    if (existing !== undefined) return existing;

    // Find first free seat
    for (let i = 0; i < this.scene.seatPositions.length; i++) {
      if (!this.usedSeats.has(i)) {
        this.seatAssignments.set(sessionKey, i);
        this.usedSeats.add(i);
        return i;
      }
    }

    // No free seats — use the last seat position or fallback
    return this.scene.seatPositions.length > 0
      ? this.scene.seatPositions.length - 1
      : null;
  }

  /**
   * Release a seat when agent goes idle.
   */
  private releaseSeat(sessionKey: string): void {
    const idx = this.seatAssignments.get(sessionKey);
    if (idx !== undefined) {
      this.usedSeats.delete(idx);
      this.seatAssignments.delete(sessionKey);
    }
  }

  /**
   * Release all resources for a removed agent.
   */
  private releaseAgent(sessionKey: string): void {
    this.releaseSeat(sessionKey);
  }

  /**
   * Calculate rest area position for an idle agent.
   * Agents line up in the POI "rest" area, spaced apart.
   */
  private getRestPosition(sessionKey: string): { x: number; y: number } {
    // Find rest POI
    const restPOI = this.scene.poiPositions.find(
      (p) => p.name.toLowerCase().includes("rest") || p.name.toLowerCase().includes("lounge"),
    );

    const baseX = restPOI?.x ?? this.scene.mapWidth * DEFAULT_REST_X_FRAC;
    const baseY = restPOI?.y ?? this.scene.mapHeight * DEFAULT_REST_Y_FRAC;

    // Count idle agents to offset position
    let idleIndex = 0;
    for (const [key, agent] of this.agents) {
      if (agent.status !== "working" && !agent.isDespawned) {
        if (key === sessionKey) break;
        idleIndex++;
      }
    }

    // Spread idle agents horizontally
    const cols = 4;
    const col = idleIndex % cols;
    const row = Math.floor(idleIndex / cols);

    return {
      x: baseX + (col - cols / 2) * REST_SPACING,
      y: baseY + row * REST_SPACING,
    };
  }

  /**
   * Destroy all agents and clean up.
   */
  destroy(): void {
    for (const agent of this.agents.values()) {
      agent.destroy();
    }
    this.agents.clear();
    this.seatAssignments.clear();
    this.usedSeats.clear();
  }
}
