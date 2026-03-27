/**
 * AgentManager — Manages all agent characters in the Phaser scene.
 *
 * Responsibilities:
 * - Syncs characters with Gateway session data
 * - Assigns seat positions (working area) and rest positions (idle area)
 * - Handles character spawn/despawn lifecycle
 * - Routes click events to the React layer
 *
 * Behavior model:
 * - Main agent ("boss") sits at a fixed position, never walks
 * - Subagents spawn at the entrance, walk to their seat, go to rest area when idle,
 *   and walk back to the entrance before despawning
 */

import { AgentSprite, type AgentStatus, type CharacterClickHandler } from "./AgentSprite";
import { CHARACTER_SPRITES } from "../config/animations";
import type { OfficeScene } from "../scenes/OfficeScene";
import type { SessionData } from "../../gateway/types";

// ── Layout constants ────────────────────────────────────────

/** Spacing between idle characters in the rest area */
const REST_SPACING = 60;

/** Entrance/exit position — left side of the map, near the door */
const ENTRANCE_POSITION = { x: 50, y: 0 }; // y set dynamically from mapHeight

/** Boss position fallback if no suitable seat found */
const BOSS_POSITION_FALLBACK = { x: 684, y: 753 };

/** Rest area positions — subagents go here when idle */
const REST_AREA_BASE = { x: 900, y: 300 };

/** Main agent session key */
const MAIN_AGENT_KEY = "agent:main:main";

export class AgentManager {
  private scene: OfficeScene;
  private agents: Map<string, AgentSprite> = new Map();
  private seatAssignments: Map<string, number> = new Map(); // agentId → seat index
  private usedSeats: Set<number> = new Set();
  private nextSpriteIndex = 0;
  private clickHandler: CharacterClickHandler | null = null;

  /** Resolved positions (set after scene is ready) */
  private bossPosition: { x: number; y: number } = { ...BOSS_POSITION_FALLBACK };
  private entrancePosition: { x: number; y: number } = { ...ENTRANCE_POSITION };
  private restAreaPositions: Array<{ x: number; y: number }> = [];

  /** Boss seat index to exclude from subagent assignment */
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

    // Handle agents that should be removed (session gone)
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

    // Clean up fully despawned agents
    for (const [key, agent] of this.agents) {
      if (agent.isDespawned) {
        this.agents.delete(key);
      }
    }

    // Add / update characters for current sessions
    for (const session of sessions) {
      const existing = this.agents.get(session.key);

      // Skip agents that are in the process of despawning
      if (existing?.isDespawning) continue;

      const status = this.mapSessionStatus(session.status);
      console.log(
        "[AgentManager] Session:", session.key.substring(0, 30),
        "label:", session.label,
        "rawStatus:", session.status, "→", status,
        "existing:", !!existing,
        "type:", this.isMainAgent(session.key) ? "boss" : "subagent",
      );

      let agent: AgentSprite;
      if (!existing) {
        // Spawn new agent
        const spawned = this.spawnAgent(session, status);
        if (!spawned) {
          console.warn("[AgentManager] Failed to spawn for", session.key);
          continue;
        }
        agent = spawned;
      } else {
        agent = existing;
      }

      // Update status — triggers emote + animation change
      const prevStatus = agent.status;
      agent.setStatus(status);

      // Reposition if status changed (walk to new zone) or just spawned
      if (prevStatus !== status || !existing) {
        console.log("[AgentManager] Repositioning", session.label, prevStatus, "→", status);
        this.positionAgent(session.key, agent, status);
      }
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

  /**
   * Check if a session key belongs to the main agent (boss).
   */
  private isMainAgent(sessionKey: string): boolean {
    return sessionKey === MAIN_AGENT_KEY;
  }

  /**
   * Check if a session key belongs to a subagent (employee).
   */
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
      x: ENTRANCE_POSITION.x,
      y: this.scene.mapHeight ? this.scene.mapHeight * 0.7 : 672,
    };

    // Boss position — find the seat with the largest Y (closest to bottom),
    // which is typically seat-0 near (684, 753)
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
      // Mark boss seat as used so no subagent gets it
      this.usedSeats.add(bossIdx);
    }

    // Rest area positions — use POIs like Bookshelf, Water dispenser
    // Fall back to a default area in the upper-right if not found
    const restPOIs = this.scene.poiPositions.filter((p) => {
      const name = p.name.toLowerCase();
      return (
        name.includes("bookshelf") ||
        name.includes("water") ||
        name.includes("dispenser")
      );
    });

    if (restPOIs.length > 0) {
      this.restAreaPositions = restPOIs.map((p) => ({ x: p.x, y: p.y }));
    } else {
      // Fallback: generate positions in the upper-right area
      this.restAreaPositions = [
        { x: REST_AREA_BASE.x, y: REST_AREA_BASE.y },
        { x: REST_AREA_BASE.x + REST_SPACING, y: REST_AREA_BASE.y },
        { x: REST_AREA_BASE.x, y: REST_AREA_BASE.y + REST_SPACING },
        { x: REST_AREA_BASE.x + REST_SPACING, y: REST_AREA_BASE.y + REST_SPACING },
      ];
    }

    console.log(
      "[AgentManager] Resolved positions — boss:", this.bossPosition,
      "entrance:", this.entrancePosition,
      "restAreas:", this.restAreaPositions.length,
      "bossSeatIdx:", this.bossSeatIndex,
    );
  }

  // ── Status mapping ────────────────────────────────

  /**
   * Map session status string → AgentSprite status.
   */
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
   * - Main agent → spawns at boss position with pop-in animation
   * - Subagent → spawns at entrance (visible) and walks to seat
   */
  private spawnAgent(session: SessionData, _status: AgentStatus): AgentSprite | null {
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

    // Determine spawn position and animation mode
    let spawnX: number;
    let spawnY: number;
    let spawnVisible: boolean;

    if (isMain) {
      // Boss: spawn directly at boss position with pop-in
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
   * Position an agent based on type and status:
   * - Main agent → always at boss position, never moves
   * - Subagent working → walk to assigned seat
   * - Subagent idle → walk to rest area
   */
  private positionAgent(
    sessionKey: string,
    agent: AgentSprite,
    status: AgentStatus,
  ): void {
    if (this.isMainAgent(sessionKey)) {
      // Boss never moves — always at boss position
      // (already spawned there, just ensure correct position)
      agent.moveTo(this.bossPosition.x, this.bossPosition.y);
      return;
    }

    // Subagent behavior
    if (status === "working") {
      // Assign to a seat and walk there
      const seatIdx = this.assignSeat(sessionKey);
      if (seatIdx !== null && seatIdx < this.scene.seatPositions.length) {
        const seat = this.scene.seatPositions[seatIdx];
        agent.moveTo(seat.x, seat.y);
      }
    } else {
      // Release seat and walk to rest area
      this.releaseSeat(sessionKey);
      const restPos = this.getRestPosition(sessionKey);
      agent.moveTo(restPos.x, restPos.y);
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
      if (i === this.bossSeatIndex) continue; // Reserved for boss
      if (!this.usedSeats.has(i)) {
        this.seatAssignments.set(sessionKey, i);
        this.usedSeats.add(i);
        return i;
      }
    }

    // No free seats — use the last non-boss seat or fallback
    for (let i = this.scene.seatPositions.length - 1; i >= 0; i--) {
      if (i !== this.bossSeatIndex) return i;
    }
    return null;
  }

  /**
   * Release a seat when agent goes idle or despawns.
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

  // ── Rest area positioning ─────────────────────────

  /**
   * Calculate rest area position for an idle subagent.
   * Distributes agents across available rest POI positions.
   */
  private getRestPosition(sessionKey: string): { x: number; y: number } {
    // Count idle agents to determine offset
    let idleIndex = 0;
    for (const [key, agent] of this.agents) {
      if (key === sessionKey) break;
      if (agent.status !== "working" && !agent.isDespawned && !agent.isDespawning) {
        idleIndex++;
      }
    }

    if (this.restAreaPositions.length > 0) {
      // Distribute across rest area POIs
      const basePos = this.restAreaPositions[idleIndex % this.restAreaPositions.length];
      const extraOffset = Math.floor(idleIndex / this.restAreaPositions.length);

      return {
        x: basePos.x + (extraOffset % 3) * REST_SPACING,
        y: basePos.y + Math.floor(extraOffset / 3) * REST_SPACING,
      };
    }

    // Fallback: spread in upper-right area
    const cols = 4;
    const col = idleIndex % cols;
    const row = Math.floor(idleIndex / cols);

    return {
      x: REST_AREA_BASE.x + (col - cols / 2) * REST_SPACING,
      y: REST_AREA_BASE.y + row * REST_SPACING,
    };
  }
}
