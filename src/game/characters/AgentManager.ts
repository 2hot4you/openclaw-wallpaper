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
 * - Main agent ("boss"):
 *   - Working → sits at "Main_work_right" (facing right)
 *   - Idle → sits at "Main_rest_face" (facing down, on sofa)
 * - Subagents:
 *   - Spawn at entrance, walk to assigned seat
 *   - Stay at seat regardless of status
 *   - Walk to entrance before despawning
 *   - "subagent_face#N" seats face down, "subagent_back#N" seats face up
 */

import { AgentSprite, type AgentStatus, type CharacterClickHandler } from "./AgentSprite";
import { CHARACTER_SPRITES } from "../config/animations";
import type { Direction } from "../config/animations";
import type { OfficeScene } from "../scenes/OfficeScene";
import type { SessionData, AgentData } from "../../gateway/types";
import { InfoBubble } from "../ui/InfoBubble";

// ── Layout constants ────────────────────────────────────────

/** Entrance/exit position — left side of the map, near the door */
const ENTRANCE_X = 50;
const ENTRANCE_Y_FRAC = 0.7; // fraction of mapHeight

/** Main agent session key */
const MAIN_AGENT_KEY = "agent:main:main";

/**
 * Y offset applied to seat positions so the character sprite
 * overlaps the chair and looks like they are sitting.
 * Positive = move sprite downward.
 */
const SEAT_Y_OFFSET = 16;

// ── Types ───────────────────────────────────────────────────

interface SeatInfo {
  name: string;
  x: number;
  y: number;
  facing: string;
  originalIndex: number;
}

export class AgentManager {
  private scene: OfficeScene;
  private agents: Map<string, AgentSprite> = new Map();
  private seatAssignments: Map<string, number> = new Map(); // sessionKey → subagentSeats index
  private usedSeats: Set<number> = new Set();
  private nextSpriteIndex = 0;
  /** The actual handler set on sprites (wraps external + bubble logic) */
  private _internalClickHandler: CharacterClickHandler | null = null;

  /** Info bubble (Phaser-native, world space) */
  private infoBubble: InfoBubble;

  /** Last synced session + agent data (for bubble display) */
  private lastSessions: SessionData[] = [];
  private lastAgents: AgentData[] = [];

  /** Boss positions resolved from tilemap */
  private bossWorkSeat: SeatInfo | null = null;  // Main_work_right
  private bossRestSeat: SeatInfo | null = null;   // Main_rest_face (from POIs)

  /** Subagent seats (filtered from spawns, excludes boss seats) */
  private subagentSeats: SeatInfo[] = [];

  /** Entrance position */
  private entrancePosition: { x: number; y: number } = { x: ENTRANCE_X, y: 672 };

  constructor(scene: OfficeScene) {
    this.scene = scene;
    this.infoBubble = new InfoBubble(scene);
    this.resolvePositions();
  }

  // ── Public API ────────────────────────────────────

  /**
   * Register a click handler for all characters.
   * Also sets up internal Phaser info bubble on click.
   */
  onCharacterClick(handler: CharacterClickHandler | null): void {

    // Internal handler that shows the Phaser info bubble
    const internalHandler: CharacterClickHandler = (id, _sx, _sy, worldX, worldY) => {
      // Find session + agent data for this character
      const session = this.lastSessions.find((s) => s.key === id);
      if (!session) return;

      const agent = session.agentId
        ? this.lastAgents.find((a) => a.agentId === session.agentId)
        : undefined;

      const seatName = this.getSeatIndex(id);

      // Toggle: if clicking the same character, hide
      if (this.infoBubble.visible && this.infoBubble.currentTargetId === id) {
        this.infoBubble.hide();
        return;
      }

      this.infoBubble.show(worldX, worldY, session, agent, seatName);

      // Also call external handler if set
      handler?.(id, _sx, _sy, worldX, worldY);
    };

    this._internalClickHandler = internalHandler;

    for (const agent of this.agents.values()) {
      agent.setClickHandler(internalHandler);
    }
  }

  /**
   * Get the seat name assigned to an agent (for debug display).
   */
  getSeatIndex(sessionKey: string): string | null {
    if (this.isMainAgent(sessionKey)) {
      const agent = this.agents.get(sessionKey);
      if (agent?.status === "working" && this.bossWorkSeat) {
        return this.bossWorkSeat.name;
      }
      return this.bossRestSeat?.name ?? this.bossWorkSeat?.name ?? null;
    }
    const idx = this.seatAssignments.get(sessionKey);
    if (idx !== undefined && idx < this.subagentSeats.length) {
      return this.subagentSeats[idx].name;
    }
    return null;
  }

  /**
   * Sync agents with current session list from Gateway.
   */
  syncWithSessions(sessions: SessionData[], agents?: AgentData[]): void {
    // Store for bubble display
    this.lastSessions = sessions;
    if (agents) this.lastAgents = agents;
    const sessionKeys = new Set(sessions.map((s) => s.key));

    // ── Handle agents whose session disappeared ──
    for (const [key, agent] of this.agents) {
      if (!sessionKeys.has(key) && !agent.isDespawned && !agent.isDespawning) {
        this.releaseAgent(key);

        if (this.isSubagent(key)) {
          agent.walkThenDespawn(this.entrancePosition.x, this.entrancePosition.y);
        } else {
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
      if (existing?.isDespawning) continue;

      const status = this.mapSessionStatus(session.status, session.updatedAt);
      console.log(
        "[AgentManager] Session:", session.key.substring(0, 40),
        "label:", session.label,
        "rawStatus:", session.status, "→", status,
        "existing:", !!existing,
        "type:", this.isMainAgent(session.key) ? "boss" : "subagent",
      );

      let agent: AgentSprite;
      if (!existing) {
        const spawned = this.spawnAgent(session);
        if (!spawned) {
          console.warn("[AgentManager] Failed to spawn for", session.key);
          continue;
        }
        agent = spawned;
      } else {
        agent = existing;
      }

      // Update status
      const prevStatus = agent.status;
      agent.setStatus(status);

      // Position: subagents only move on spawn; boss moves on status change
      if (!existing) {
        this.positionAgent(session.key, agent, status);
      } else if (this.isMainAgent(session.key) && prevStatus !== status) {
        // Boss switches between work seat and rest seat
        this.positionAgent(session.key, agent, status);
      }
    }

    console.log(
      "[AgentManager] After sync — total agents:", this.agents.size,
      "subagent seats used:", this.usedSeats.size,
    );
  }

  /**
   * Destroy all agents and clean up.
   */
  destroy(): void {
    this.infoBubble.destroy();
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

  private resolvePositions(): void {
    this.entrancePosition = {
      x: ENTRANCE_X,
      y: this.scene.mapHeight ? this.scene.mapHeight * ENTRANCE_Y_FRAC : 672,
    };

    // Parse spawns by name
    for (let i = 0; i < this.scene.seatPositions.length; i++) {
      const seat = this.scene.seatPositions[i];
      const info: SeatInfo = {
        name: seat.seatId,
        x: seat.x,
        y: seat.y,
        facing: seat.facing,
        originalIndex: i,
      };

      const nameLower = seat.seatId.toLowerCase();

      if (nameLower.startsWith("main_work")) {
        this.bossWorkSeat = info;
      } else if (nameLower.startsWith("subagent_")) {
        this.subagentSeats.push(info);
      }
      // Unknown names are ignored
    }

    // Parse POIs for boss rest seat
    for (const poi of this.scene.poiPositions) {
      const nameLower = poi.name.toLowerCase();
      if (nameLower.startsWith("main_rest")) {
        this.bossRestSeat = {
          name: poi.name,
          x: poi.x,
          y: poi.y,
          facing: "down", // Main_rest_face → facing the screen
          originalIndex: -1,
        };
      }
    }

    console.log(
      "[AgentManager] Resolved —",
      "bossWork:", this.bossWorkSeat?.name, `(${this.bossWorkSeat?.x.toFixed(0)}, ${this.bossWorkSeat?.y.toFixed(0)})`,
      "bossRest:", this.bossRestSeat?.name, `(${this.bossRestSeat?.x.toFixed(0)}, ${this.bossRestSeat?.y.toFixed(0)})`,
      "subagentSeats:", this.subagentSeats.map(s => s.name),
      "entrance:", this.entrancePosition,
    );
  }

  // ── Status mapping ────────────────────────────────

  /**
   * Map session status → AgentSprite status.
   *
   * Heuristic: if the session's `updatedAt` is very recent (within ACTIVE_THRESHOLD_MS)
   * and the raw status is "done", we treat it as "working". This catches subagent
   * sessions that complete between polls — Gateway returns "done" but the agent
   * was clearly just active.
   */
  private static readonly ACTIVE_THRESHOLD_MS = 15_000;

  private mapSessionStatus(status: string | undefined, updatedAt?: number): AgentStatus {
    // Explicit active states
    switch (status) {
      case "active":
      case "running":
      case "busy":
        return "working";
      case "error":
      case "failed":
        return "error";
    }

    // Heuristic: "done" with very recent updatedAt → treat as working
    if (status === "done" && updatedAt) {
      const age = Date.now() - updatedAt;
      if (age < AgentManager.ACTIVE_THRESHOLD_MS) {
        return "working";
      }
    }

    return "idle";
  }

  // ── Spawn ─────────────────────────────────────────

  private spawnAgent(session: SessionData): AgentSprite | null {
    const displayName =
      session.label ??
      session.agentId ??
      session.key.split(":").pop() ??
      "agent";

    const spriteConfig =
      CHARACTER_SPRITES[this.nextSpriteIndex % CHARACTER_SPRITES.length];
    this.nextSpriteIndex++;

    const isMain = this.isMainAgent(session.key);
    let spawnX: number;
    let spawnY: number;
    let spawnVisible: boolean;

    if (isMain) {
      // Boss: spawn at rest seat (default idle position) with pop-in
      const seat = this.bossRestSeat ?? this.bossWorkSeat;
      spawnX = seat ? seat.x : 415;
      spawnY = seat ? seat.y + SEAT_Y_OFFSET : 673 + SEAT_Y_OFFSET;
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

    // Set initial facing for boss (spawns in place, doesn't walk)
    if (isMain) {
      const seat = this.bossRestSeat ?? this.bossWorkSeat;
      if (seat?.facing) {
        agent.setFacing(seat.facing as Direction);
      }
    }

    agent.setClickHandler(this._internalClickHandler);
    this.agents.set(session.key, agent);

    return agent;
  }

  // ── Positioning ───────────────────────────────────

  private positionAgent(
    sessionKey: string,
    agent: AgentSprite,
    status: AgentStatus,
  ): void {
    if (this.isMainAgent(sessionKey)) {
      // Boss: switch between work and rest seats based on status
      if (status === "working" && this.bossWorkSeat) {
        agent.moveTo(
          this.bossWorkSeat.x,
          this.bossWorkSeat.y + SEAT_Y_OFFSET,
          undefined,
          this.bossWorkSeat.facing as Direction,
        );
      } else if (this.bossRestSeat) {
        agent.moveTo(
          this.bossRestSeat.x,
          this.bossRestSeat.y + SEAT_Y_OFFSET,
          undefined,
          this.bossRestSeat.facing as Direction,
        );
      }
      return;
    }

    // Subagent: assign a seat and walk there from entrance
    const seatIdx = this.assignSeat(sessionKey);
    if (seatIdx !== null && seatIdx < this.subagentSeats.length) {
      const seat = this.subagentSeats[seatIdx];
      agent.moveTo(
        seat.x,
        seat.y + SEAT_Y_OFFSET,
        undefined,
        seat.facing as Direction,
      );
    }
  }

  // ── Seat management ───────────────────────────────

  private assignSeat(sessionKey: string): number | null {
    const existing = this.seatAssignments.get(sessionKey);
    if (existing !== undefined) return existing;

    for (let i = 0; i < this.subagentSeats.length; i++) {
      if (!this.usedSeats.has(i)) {
        this.seatAssignments.set(sessionKey, i);
        this.usedSeats.add(i);
        console.log(
          "[AgentManager] Assigned seat", this.subagentSeats[i].name,
          "(idx", i, ") to", sessionKey.substring(0, 30),
        );
        return i;
      }
    }

    // No free seats — share the last one
    return this.subagentSeats.length > 0 ? this.subagentSeats.length - 1 : null;
  }

  private releaseSeat(sessionKey: string): void {
    const idx = this.seatAssignments.get(sessionKey);
    if (idx !== undefined) {
      this.usedSeats.delete(idx);
      this.seatAssignments.delete(sessionKey);
    }
  }

  private releaseAgent(sessionKey: string): void {
    this.releaseSeat(sessionKey);
  }
}
