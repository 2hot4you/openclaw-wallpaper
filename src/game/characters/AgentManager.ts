/**
 * AgentManager — Manages all agent characters in the Phaser scene.
 *
 * Layout (based on NAF's annotated screenshot):
 * - Entrance: top-left door (~100, 180)
 * - Boss seat: seat-1 (418, 647) — center-bottom large desk
 * - Work seats: seat-2,3,4,5,6,7 — top-left workstation cluster
 * - Rest area: right side (~934-1153, 222-381)
 * - Bottom-right: empty, no characters
 *
 * Behavior:
 * - Main agent ("boss") always at boss seat, spawns with pop-in, never walks
 * - Subagents spawn at entrance, walk to assigned work seat
 * - Idle subagents walk from seat to rest area
 * - Working subagents walk from rest area back to seat
 * - Despawning subagents walk to entrance, then fade out
 * - Characters face the seat's facing direction when at work
 * - Characters face down when in rest area
 */

import { AgentSprite, type AgentStatus, type CharacterClickHandler } from "./AgentSprite";
import { CHARACTER_SPRITES } from "../config/animations";
import type { OfficeScene } from "../scenes/OfficeScene";
import type { SessionData } from "../../gateway/types";

// ── Layout constants ────────────────────────────────────────

/** Entrance/exit position — top-left door */
const ENTRANCE_POSITION = { x: 100, y: 180 };

/** Main agent session key */
const MAIN_AGENT_KEY = "agent:main:main";

/**
 * Work seat indices (from tilemap spawns array).
 * These correspond to the top-left workstation cluster.
 * Excludes seat-0 (bottom area) and seat-1 (boss seat).
 */
const WORK_SEAT_INDICES = [2, 3, 4, 5, 6, 7];

/** Boss seat index in the tilemap spawns array */
const BOSS_SEAT_INDEX = 1;

/** Rest area positions — scattered across the right side of the map */
const REST_POSITIONS: Array<{ x: number; y: number }> = [
  { x: 950, y: 250 },
  { x: 1050, y: 250 },
  { x: 1150, y: 250 },
  { x: 950, y: 380 },
  { x: 1050, y: 380 },
];

export class AgentManager {
  private scene: OfficeScene;
  private agents: Map<string, AgentSprite> = new Map();
  private seatAssignments: Map<string, number> = new Map(); // agentId → WORK_SEAT_INDICES index
  private usedWorkSeats: Set<number> = new Set(); // tracks which WORK_SEAT_INDICES slots are taken
  private restAssignments: Map<string, number> = new Map(); // agentId → REST_POSITIONS index
  private usedRestSlots: Set<number> = new Set();
  private nextSpriteIndex = 0;
  private clickHandler: CharacterClickHandler | null = null;

  /** Resolved positions (set after scene is ready) */
  private bossPosition: { x: number; y: number } = { x: 418, y: 647 };
  private bossFacing: string = "right";

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
          // Subagent: walk to entrance, then despawn
          agent.walkThenDespawn(ENTRANCE_POSITION.x, ENTRANCE_POSITION.y);
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
      "work seats used:", this.usedWorkSeats.size,
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
    this.usedWorkSeats.clear();
    this.restAssignments.clear();
    this.usedRestSlots.clear();
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
   * Resolve boss position from tilemap seat data.
   */
  private resolvePositions(): void {
    // Boss position from seat-1
    if (this.scene.seatPositions.length > BOSS_SEAT_INDEX) {
      const bossSeat = this.scene.seatPositions[BOSS_SEAT_INDEX];
      this.bossPosition = { x: bossSeat.x, y: bossSeat.y };
      this.bossFacing = bossSeat.facing || "right";
    }

    console.log(
      "[AgentManager] Resolved positions — boss:", this.bossPosition,
      "bossFacing:", this.bossFacing,
      "entrance:", ENTRANCE_POSITION,
      "workSeats:", WORK_SEAT_INDICES.length,
      "restPositions:", REST_POSITIONS.length,
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
   * - Main agent → spawns at boss position with pop-in, never walks
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
      spawnX = ENTRANCE_POSITION.x;
      spawnY = ENTRANCE_POSITION.y;
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

    // Boss should face the seat's facing direction immediately
    if (isMain) {
      agent.setFacing(this.bossFacing as "up" | "down" | "left" | "right");
    }

    agent.setClickHandler(this.clickHandler);
    this.agents.set(session.key, agent);

    return agent;
  }

  // ── Positioning ───────────────────────────────────

  /**
   * Position an agent based on type and status:
   * - Main agent → always at boss position, never moves
   * - Subagent working → walk to assigned work seat, face seat direction
   * - Subagent idle → walk to rest area, face down
   */
  private positionAgent(
    sessionKey: string,
    agent: AgentSprite,
    status: AgentStatus,
  ): void {
    if (this.isMainAgent(sessionKey)) {
      // Boss never moves — already at boss position
      agent.setFacing(this.bossFacing as "up" | "down" | "left" | "right");
      return;
    }

    // Subagent behavior
    if (status === "working" || status === "error") {
      // Release rest slot if had one
      this.releaseRestSlot(sessionKey);
      // Assign to a work seat and walk there
      const seatIdx = this.assignWorkSeat(sessionKey);
      if (seatIdx !== null) {
        const tilemapIdx = WORK_SEAT_INDICES[seatIdx];
        if (tilemapIdx < this.scene.seatPositions.length) {
          const seat = this.scene.seatPositions[tilemapIdx];
          const facing = seat.facing as "up" | "down" | "left" | "right";
          agent.moveTo(seat.x, seat.y, () => {
            // After arriving at work seat, face the seat's direction
            agent.setFacing(facing);
          });
        }
      }
    } else {
      // idle: release work seat and walk to rest area
      this.releaseWorkSeat(sessionKey);
      const restIdx = this.assignRestSlot(sessionKey);
      const restPos = REST_POSITIONS[restIdx % REST_POSITIONS.length];
      agent.moveTo(restPos.x, restPos.y, () => {
        // In rest area, face down (toward viewer)
        agent.setFacing("down");
      });
    }
  }

  // ── Work seat management ──────────────────────────

  /**
   * Assign a work seat to a subagent. Returns index into WORK_SEAT_INDICES.
   */
  private assignWorkSeat(sessionKey: string): number | null {
    // Already assigned?
    const existing = this.seatAssignments.get(sessionKey);
    if (existing !== undefined) return existing;

    // Find first free work seat
    for (let i = 0; i < WORK_SEAT_INDICES.length; i++) {
      if (!this.usedWorkSeats.has(i)) {
        this.seatAssignments.set(sessionKey, i);
        this.usedWorkSeats.add(i);
        return i;
      }
    }

    // All seats taken — overflow: use last seat (will stack, but rare)
    const overflow = WORK_SEAT_INDICES.length - 1;
    this.seatAssignments.set(sessionKey, overflow);
    return overflow;
  }

  /**
   * Release a work seat.
   */
  private releaseWorkSeat(sessionKey: string): void {
    const idx = this.seatAssignments.get(sessionKey);
    if (idx !== undefined) {
      this.usedWorkSeats.delete(idx);
      this.seatAssignments.delete(sessionKey);
    }
  }

  // ── Rest slot management ──────────────────────────

  /**
   * Assign a rest position to an idle subagent.
   */
  private assignRestSlot(sessionKey: string): number {
    const existing = this.restAssignments.get(sessionKey);
    if (existing !== undefined) return existing;

    // Find first free rest slot
    for (let i = 0; i < REST_POSITIONS.length; i++) {
      if (!this.usedRestSlots.has(i)) {
        this.restAssignments.set(sessionKey, i);
        this.usedRestSlots.add(i);
        return i;
      }
    }

    // Overflow: cycle through positions with offset
    const overflow = this.restAssignments.size % REST_POSITIONS.length;
    this.restAssignments.set(sessionKey, overflow);
    return overflow;
  }

  /**
   * Release a rest slot.
   */
  private releaseRestSlot(sessionKey: string): void {
    const idx = this.restAssignments.get(sessionKey);
    if (idx !== undefined) {
      this.usedRestSlots.delete(idx);
      this.restAssignments.delete(sessionKey);
    }
  }

  // ── Cleanup ───────────────────────────────────────

  /**
   * Release all resources for a removed agent.
   */
  private releaseAgent(sessionKey: string): void {
    this.releaseWorkSeat(sessionKey);
    this.releaseRestSlot(sessionKey);
  }
}
