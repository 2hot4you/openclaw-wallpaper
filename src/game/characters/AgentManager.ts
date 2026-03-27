/**
 * AgentManager — Manages all agent characters in the Phaser scene.
 *
 * Responsibilities:
 * - Syncs characters with Gateway session data
 * - Assigns seat positions from the tilemap
 * - Handles character spawn/despawn lifecycle
 * - Routes click events to the React layer
 *
 * Behavior model:
 * - Main agent ("boss") sits at a fixed seat (largest Y), never walks
 * - Subagents spawn at the entrance, walk to their assigned seat
 * - All agents stay at their seat regardless of status (working/idle/error)
 * - Subagents walk back to the entrance before despawning
 */

import { AgentSprite, type AgentStatus, type CharacterClickHandler } from "./AgentSprite";
import { CHARACTER_SPRITES } from "../config/animations";
import type { OfficeScene } from "../scenes/OfficeScene";
import type { SessionData } from "../../gateway/types";

// ── Layout constants ────────────────────────────────────────

/** Entrance/exit position — left side of the map, near the door */
const ENTRANCE_X = 50;
const ENTRANCE_Y_FRAC = 0.7; // fraction of mapHeight

/** Main agent session key */
const MAIN_AGENT_KEY = "agent:main:main";

export class AgentManager {
  private scene: OfficeScene;
  private agents: Map<string, AgentSprite> = new Map();
  private seatAssignments: Map<string, number> = new Map(); // sessionKey → seat index
  private usedSeats: Set<number> = new Set();
  private nextSpriteIndex = 0;
  private clickHandler: CharacterClickHandler | null = null;

  /** Resolved positions (set after scene is ready) */
  private bossPosition: { x: number; y: number } = { x: 684, y: 753 };
  private entrancePosition: { x: number; y: number } = { x: ENTRANCE_X, y: 672 };

  /** Boss seat index — excluded from subagent assignment */
  private bossSeatIndex: number | null = null;

  constructor(scene: OfficeScene) {
    this.scene = scene;
    this.resolvePositions();
  }

  // ── Public API ────────────────────────────────────

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

    // ── Handle agents whose session disappeared ──
    for (const [key, agent] of this.agents) {
      if (!sessionKeys.has(key) && !agent.isDespawned && !agent.isDespawning) {
        this.releaseAgent(key);

        if (this.isSubagent(key)) {
          // Subagent: walk to exit, then despawn
          agent.walkThenDespawn(this.entrancePosition.x, this.entrancePosition.y);
        } else {
          // Main agent or unknown: immediate despawn
          agent.despawn();
        }
      }
    }

    // ── Clean up fully despawned agents ──
    for (const [key, agent] of this.agents) {
      if (agent.isDespawned) {
        this.agents.delete(key);
      }
    }

    // ── Add / update characters for current sessions ──
    for (const session of sessions) {
      const existing = this.agents.get(session.key);

      // Skip agents that are walking to exit
      if (existing?.isDespawning) continue;

      const status = this.mapSessionStatus(session.status);
      console.log(
        "[AgentManager] Session:", session.key.substring(0, 40),
        "label:", session.label,
        "rawStatus:", session.status, "→", status,
        "existing:", !!existing,
        "type:", this.isMainAgent(session.key) ? "boss" : "subagent",
      );

      let agent: AgentSprite;
      if (!existing) {
        // Spawn new agent
        const spawned = this.spawnAgent(session);
        if (!spawned) {
          console.warn("[AgentManager] Failed to spawn for", session.key);
          continue;
        }
        agent = spawned;

        // New agent: assign seat and walk there
        this.positionAgent(session.key, agent);
      } else {
        agent = existing;
      }

      // Update status — triggers emote + animation change
      agent.setStatus(status);
    }

    console.log(
      "[AgentManager] After sync — total agents:", this.agents.size,
      "seats used:", this.usedSeats.size,
    );
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

  // ── Agent type identification ─────────────────────

  private isMainAgent(sessionKey: string): boolean {
    return sessionKey === MAIN_AGENT_KEY;
  }

  private isSubagent(sessionKey: string): boolean {
    return sessionKey.includes("subagent:");
  }

  // ── Position resolution ───────────────────────────

  /**
   * Resolve special positions from the tilemap data.
   */
  private resolvePositions(): void {
    // Entrance position — left side, 70% down the map
    this.entrancePosition = {
      x: ENTRANCE_X,
      y: this.scene.mapHeight ? this.scene.mapHeight * ENTRANCE_Y_FRAC : 672,
    };

    // Boss position — seat with the largest Y (closest to bottom of map)
    if (this.scene.seatPositions.length > 0) {
      let maxY = -1;
      let bossIdx = 0;
      for (let i = 0; i < this.scene.seatPositions.length; i++) {
        if (this.scene.seatPositions[i].y > maxY) {
          maxY = this.scene.seatPositions[i].y;
          bossIdx = i;
        }
      }
      const bossSeat = this.scene.seatPositions[bossIdx];
      this.bossPosition = { x: bossSeat.x, y: bossSeat.y };
      this.bossSeatIndex = bossIdx;
      // Reserve boss seat
      this.usedSeats.add(bossIdx);
    }

    console.log(
      "[AgentManager] Resolved positions — boss:", this.bossPosition,
      "bossSeatIdx:", this.bossSeatIndex,
      "entrance:", this.entrancePosition,
      "totalSeats:", this.scene.seatPositions.length,
    );
  }

  // ── Status mapping ────────────────────────────────

  private mapSessionStatus(status: string | undefined): AgentStatus {
    switch (status) {
      case "active":
      case "running":
      case "busy":
        return "working";
      case "error":
      case "failed":
        return "error";
      case "idle":
      case "closed":
      case "done":
      default:
        return "idle";
    }
  }

  // ── Spawn ─────────────────────────────────────────

  /**
   * Spawn a new agent character.
   * - Main agent → spawns at boss seat with pop-in animation
   * - Subagent → spawns at entrance (visible), will walk to seat
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

    const isMain = this.isMainAgent(session.key);

    let spawnX: number;
    let spawnY: number;
    let spawnVisible: boolean;

    if (isMain) {
      // Boss: spawn directly at boss seat with pop-in
      spawnX = this.bossPosition.x;
      spawnY = this.bossPosition.y;
      spawnVisible = false;
    } else {
      // Subagent: spawn at entrance, will walk to seat
      spawnX = this.entrancePosition.x;
      spawnY = this.entrancePosition.y;
      spawnVisible = true;
    }

    console.log(
      "[AgentManager] Spawning", displayName,
      "at", spawnX.toFixed(0), spawnY.toFixed(0),
      "sprite:", spriteConfig.key,
      "type:", isMain ? "boss" : "subagent",
    );

    const agent = new AgentSprite(
      this.scene,
      session.key,
      displayName,
      spriteConfig.key,
      spawnX,
      spawnY,
      spawnVisible,
    );

    agent.setClickHandler(this.clickHandler);
    this.agents.set(session.key, agent);

    return agent;
  }

  // ── Positioning ───────────────────────────────────

  /**
   * Position an agent at their assigned seat.
   * All agents sit at seats — boss at boss seat, subagents at assigned seats.
   * Agents do NOT move between seats based on status changes.
   */
  private positionAgent(sessionKey: string, agent: AgentSprite): void {
    if (this.isMainAgent(sessionKey)) {
      // Boss is already at boss position (spawned there), no movement needed
      return;
    }

    // Subagent: assign a seat and walk there from entrance
    const seatIdx = this.assignSeat(sessionKey);
    if (seatIdx !== null && seatIdx < this.scene.seatPositions.length) {
      const seat = this.scene.seatPositions[seatIdx];
      agent.moveTo(seat.x, seat.y);
    }
  }

  // ── Seat management ───────────────────────────────

  /**
   * Assign a seat to a subagent. Returns seat index.
   * Skips the boss seat.
   */
  private assignSeat(sessionKey: string): number | null {
    // Already assigned?
    const existing = this.seatAssignments.get(sessionKey);
    if (existing !== undefined) return existing;

    // Find first free seat (skip boss seat)
    for (let i = 0; i < this.scene.seatPositions.length; i++) {
      if (i === this.bossSeatIndex) continue;
      if (!this.usedSeats.has(i)) {
        this.seatAssignments.set(sessionKey, i);
        this.usedSeats.add(i);
        console.log("[AgentManager] Assigned seat", i, "to", sessionKey.substring(0, 30));
        return i;
      }
    }

    // No free seats — share the last non-boss seat
    for (let i = this.scene.seatPositions.length - 1; i >= 0; i--) {
      if (i !== this.bossSeatIndex) return i;
    }
    return null;
  }

  /**
   * Release a seat when agent despawns.
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
}
