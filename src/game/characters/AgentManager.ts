/**
 * AgentManager — Manages all agent characters in the Phaser scene.
 *
 * Responsibilities:
 * - Syncs characters with Gateway session data
 * - Assigns seat positions from the tilemap
 * - Handles character spawn/despawn lifecycle
 * - Routes characters along per-seat waypoint paths
 * - Routes click events to the React layer
 *
 * Behavior model:
 * - Main agent ("boss"):
 *   - Working → walks to "Main_work_right"
 *   - Idle → walks to "Main_rest_face"
 * - Subagents:
 *   - Spawn at door, walk along seat-specific route to assigned seat
 *   - Stay at seat regardless of status
 *   - Walk reverse route back to door before despawning
 */

import { AgentSprite, type AgentStatus, type CharacterClickHandler } from "./AgentSprite";
import { CHARACTER_SPRITES } from "../config/animations";
import type { Direction } from "../config/animations";
import type { OfficeScene } from "../scenes/OfficeScene";
import type { SessionData, AgentData } from "../../gateway/types";
import { InfoBubble } from "../ui/InfoBubble";

// ── Constants ───────────────────────────────────────────────

const MAIN_AGENT_KEY = "agent:main:main";
const SEAT_Y_OFFSET = 16;

// ── Types ───────────────────────────────────────────────────

interface SeatInfo {
  name: string;
  x: number;
  y: number;
  facing: string;
  originalIndex: number;
}

interface WaypointInfo {
  name: string;
  x: number;
  y: number;
  inFacing?: string;   // facing direction when entering (walking IN)
  outFacing?: string;  // facing direction when exiting (walking OUT)
}

/** Route definition: ordered waypoint names from door to seat */
// (reserved for future tilemap-based route definitions)

export class AgentManager {
  private scene: OfficeScene;
  private agents: Map<string, AgentSprite> = new Map();
  private seatAssignments: Map<string, number> = new Map();
  private usedSeats: Set<number> = new Set();
  private nextSpriteIndex = 0;
  private _internalClickHandler: CharacterClickHandler | null = null;

  private infoBubble: InfoBubble;
  private lastSessions: SessionData[] = [];
  private lastAgents: AgentData[] = [];

  // Tilemap-resolved positions
  private bossWorkSeat: SeatInfo | null = null;
  private bossRestSeat: SeatInfo | null = null;
  private subagentSeats: SeatInfo[] = [];
  private doorPosition: { x: number; y: number } = { x: 98, y: 393 };

  // All waypoints by name (for route lookup)
  private waypointMap: Map<string, WaypointInfo> = new Map();

  // Per-seat routes: seat name → entry path (waypoint names, door to seat)
  private seatRoutes: Map<string, string[]> = new Map();

  // Boss routes
  private bossWorkRoute: string[] = [];
  private bossRestRoute: string[] = [];

  constructor(scene: OfficeScene) {
    this.scene = scene;
    this.infoBubble = new InfoBubble(scene);
    this.resolvePositions();
    this.buildRoutes();
  }

  // ── Route definitions ─────────────────────────────

  private buildRoutes(): void {
    // Subagent seat routes (entry: door → waypoints → seat)
    this.seatRoutes.set("subagent_face#1", [
      "subagent_waypoint_#1", "subagent_waypoint_#3", "subagent_waypoint_#4",
    ]);
    this.seatRoutes.set("subagent_face#2", [
      "subagent_waypoint_#1", "subagent_waypoint_#3", "subagent_waypoint_#5",
    ]);
    this.seatRoutes.set("subagent_face#3", [
      "subagent_waypoint_#1", "subagent_waypoint_#3", "subagent_waypoint_#6",
    ]);
    this.seatRoutes.set("subagent_back#1", [
      "subagent_waypoint_#2", "subagent_waypoint_#7", "subagent_waypoint_#8",
    ]);
    this.seatRoutes.set("subagent_back#2", [
      "subagent_waypoint_#2", "subagent_waypoint_#7", "subagent_waypoint_#9",
    ]);
    this.seatRoutes.set("subagent_back#3", [
      "subagent_waypoint_#2", "subagent_waypoint_#7", "subagent_waypoint_#10",
    ]);

    // Boss routes
    this.bossWorkRoute = [
      "subagent_waypoint_#2", "subagent_waypoint_#7", "subagent_waypoint_#10",
      "subagent_waypoint_#11", "subagent_waypoint_#12",
      "subagent_waypoint_#13", "subagent_waypoint_#14",
    ];
    this.bossRestRoute = [
      "subagent_waypoint_#2", "subagent_waypoint_#7", "subagent_waypoint_#10",
      "subagent_waypoint_#11", "subagent_waypoint_#12",
      "subagent_waypoint_#15", "subagent_waypoint_#16",
    ];

    console.log("[AgentManager] Routes built:", this.seatRoutes.size, "seat routes + 2 boss routes");
  }

  /** Resolve waypoint names to coordinates */
  private resolveRoute(waypointNames: string[]): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];
    for (const name of waypointNames) {
      const wp = this.waypointMap.get(name);
      if (wp) {
        points.push({ x: wp.x, y: wp.y });
      } else {
        console.warn("[AgentManager] Waypoint not found:", name);
      }
    }
    return points;
  }

  // ── Public API ────────────────────────────────────

  onCharacterClick(handler: CharacterClickHandler | null): void {
    const internalHandler: CharacterClickHandler = (id, _sx, _sy, worldX, worldY) => {
      const session = this.lastSessions.find((s) => s.key === id);
      if (!session) return;
      const agent = session.agentId
        ? this.lastAgents.find((a) => a.agentId === session.agentId)
        : undefined;
      const seatName = this.getSeatIndex(id);

      if (this.infoBubble.visible && this.infoBubble.currentTargetId === id) {
        this.infoBubble.hide();
        return;
      }
      this.infoBubble.show(worldX, worldY, session, agent, seatName);
      handler?.(id, _sx, _sy, worldX, worldY);
    };
    this._internalClickHandler = internalHandler;
    for (const agent of this.agents.values()) {
      agent.setClickHandler(internalHandler);
    }
  }

  getSeatIndex(sessionKey: string): string | null {
    if (this.isMainAgent(sessionKey)) {
      const agent = this.agents.get(sessionKey);
      if (agent?.status === "working" && this.bossWorkSeat) return this.bossWorkSeat.name;
      return this.bossRestSeat?.name ?? this.bossWorkSeat?.name ?? null;
    }
    const idx = this.seatAssignments.get(sessionKey);
    if (idx !== undefined && idx < this.subagentSeats.length) return this.subagentSeats[idx].name;
    return null;
  }

  syncWithSessions(sessions: SessionData[], agents?: AgentData[]): void {
    this.lastSessions = sessions;
    if (agents) this.lastAgents = agents;
    const sessionKeys = new Set(sessions.map((s) => s.key));

    // Handle disappeared sessions → despawn via reverse route
    for (const [key, agent] of this.agents) {
      if (!sessionKeys.has(key) && !agent.isDespawned && !agent.isDespawning) {
        this.releaseAgent(key);
        agent.despawn();
      }
    }

    // Clean up fully despawned
    for (const [key, agent] of this.agents) {
      if (agent.isDespawned) this.agents.delete(key);
    }

    // Add/update characters
    for (const session of sessions) {
      const existing = this.agents.get(session.key);
      if (existing?.isDespawning) continue;

      const status = this.mapSessionStatus(session.status, session.updatedAt);

      let agent: AgentSprite;
      if (!existing) {
        const spawned = this.spawnAgent(session);
        if (!spawned) continue;
        agent = spawned;
      } else {
        agent = existing;
      }

      const prevStatus = agent.status;
      agent.setStatus(status);

      if (!existing) {
        this.positionAgent(session.key, agent, status);
      } else if (this.isMainAgent(session.key) && prevStatus !== status) {
        this.positionBoss(agent, status, prevStatus);
      }
    }
  }

  destroy(): void {
    this.infoBubble.destroy();
    for (const agent of this.agents.values()) agent.destroy();
    this.agents.clear();
    this.seatAssignments.clear();
    this.usedSeats.clear();
  }

  // ── Agent type identification ─────────────────────

  private isMainAgent(sessionKey: string): boolean {
    return sessionKey === MAIN_AGENT_KEY;
  }

  // @ts-ignore reserved for future use
  private isSubagent(sessionKey: string): boolean {
    return sessionKey.includes("subagent:");
  }

  // ── Position resolution ───────────────────────────

  private resolvePositions(): void {
    // Parse spawns
    for (let i = 0; i < this.scene.seatPositions.length; i++) {
      const seat = this.scene.seatPositions[i];
      const nameLower = seat.seatId.toLowerCase();

      if (nameLower.startsWith("main_work")) {
        this.bossWorkSeat = { name: seat.seatId, x: seat.x, y: seat.y, facing: seat.facing, originalIndex: i };
      } else if (nameLower.startsWith("subagent_waypoint")) {
        const props = this.getSpawnProperties(i);
        this.waypointMap.set(seat.seatId, {
          name: seat.seatId,
          x: seat.x,
          y: seat.y,
          inFacing: props.in,
          outFacing: props.out,
        });
      } else if (nameLower === "door" || nameLower === "entrance") {
        this.doorPosition = { x: seat.x, y: seat.y };
        console.log("[AgentManager] Door position:", this.doorPosition);
      } else if (nameLower.startsWith("subagent_") && !nameLower.includes("disconnect")) {
        this.subagentSeats.push({ name: seat.seatId, x: seat.x, y: seat.y, facing: seat.facing, originalIndex: i });
      }
    }

    // Parse POIs
    for (const poi of this.scene.poiPositions) {
      const nameLower = poi.name.toLowerCase();
      if (nameLower.startsWith("main_rest")) {
        this.bossRestSeat = { name: poi.name, x: poi.x, y: poi.y, facing: "down", originalIndex: -1 };
      }
    }

    console.log(
      "[AgentManager] Positions —",
      "door:", this.doorPosition,
      "bossWork:", this.bossWorkSeat?.name,
      "bossRest:", this.bossRestSeat?.name,
      "seats:", this.subagentSeats.map(s => s.name),
      "waypoints:", [...this.waypointMap.keys()],
    );
  }

  /** Get custom properties from a spawn point by index */
  private getSpawnProperties(index: number): Record<string, string> {
    // Access the raw tilemap data to get properties
    const spawnsLayer = (this.scene as any).cache?.tilemap?.get("office")?.data?.layers
      ?.find((l: any) => l.name === "spawns");
    if (!spawnsLayer?.objects?.[index]) return {};
    const obj = spawnsLayer.objects[index];
    const props: Record<string, string> = {};
    for (const p of obj.properties || []) {
      props[p.name] = String(p.value);
    }
    return props;
  }

  // ── Status mapping ────────────────────────────────

  private static readonly ACTIVE_THRESHOLD_MS = 15_000;

  private mapSessionStatus(status: string | undefined, updatedAt?: number): AgentStatus {
    switch (status) {
      case "active": case "running": case "busy": return "working";
      case "error": case "failed": return "error";
    }
    if (status === "done" && updatedAt) {
      if (Date.now() - updatedAt < AgentManager.ACTIVE_THRESHOLD_MS) return "working";
    }
    return "idle";
  }

  // ── Spawn ─────────────────────────────────────────

  private spawnAgent(session: SessionData): AgentSprite | null {
    const displayName = session.label ?? session.agentId ?? session.key.split(":").pop() ?? "agent";
    // Spawn at door
    const spriteConfig = CHARACTER_SPRITES[this.nextSpriteIndex % CHARACTER_SPRITES.length];
    this.nextSpriteIndex++;

    // All agents spawn at the door
    const spawnX = this.doorPosition.x;
    const spawnY = this.doorPosition.y;

    const agent = new AgentSprite(
      this.scene, session.key, displayName, spriteConfig.key,
      spawnX, spawnY,
      true, // all agents spawn visible at door and walk in
    );

    agent.setClickHandler(this._internalClickHandler);
    this.agents.set(session.key, agent);
    return agent;
  }

  // ── Positioning ───────────────────────────────────

  private positionAgent(sessionKey: string, agent: AgentSprite, status: AgentStatus): void {
    if (this.isMainAgent(sessionKey)) {
      this.positionBoss(agent, status, undefined);
      return;
    }

    // Subagent: walk along route to seat
    const seatIdx = this.assignSeat(sessionKey);
    if (seatIdx !== null && seatIdx < this.subagentSeats.length) {
      const seat = this.subagentSeats[seatIdx];
      const routeNames = this.seatRoutes.get(seat.name);
      if (routeNames) {
        const entryPath = this.resolveRoute(routeNames);
        agent.moveAlongPath(entryPath, seat.x, seat.y + SEAT_Y_OFFSET, undefined, seat.facing as Direction);
      } else {
        agent.moveTo(seat.x, seat.y + SEAT_Y_OFFSET, undefined, seat.facing as Direction);
      }
    }
  }

  private positionBoss(agent: AgentSprite, status: AgentStatus, prevStatus: AgentStatus | undefined): void {
    if (status === "working" && this.bossWorkSeat) {
      const path = this.resolveRoute(
        prevStatus === "idle" ? this.getTransitionRoute(this.bossRestRoute, this.bossWorkRoute) : this.bossWorkRoute,
      );
      agent.moveAlongPath(path, this.bossWorkSeat.x, this.bossWorkSeat.y + SEAT_Y_OFFSET, undefined, this.bossWorkSeat.facing as Direction);
    } else if (this.bossRestSeat) {
      const path = this.resolveRoute(
        prevStatus === "working" ? this.getTransitionRoute(this.bossWorkRoute, this.bossRestRoute) : this.bossRestRoute,
      );
      agent.moveAlongPath(path, this.bossRestSeat.x, this.bossRestSeat.y + SEAT_Y_OFFSET, undefined, "down" as Direction);
    }
  }

  /** Get transition route: reverse shared prefix of old route, then forward new route's unique suffix */
  private getTransitionRoute(fromRoute: string[], toRoute: string[]): string[] {
    // Find common prefix length
    let commonLen = 0;
    for (let i = 0; i < Math.min(fromRoute.length, toRoute.length); i++) {
      if (fromRoute[i] === toRoute[i]) commonLen = i + 1;
      else break;
    }

    // Reverse from current position back to the fork point
    const backtrack = fromRoute.slice(commonLen).reverse();
    // Then forward along the new route from the fork
    const forward = toRoute.slice(commonLen);

    return [...backtrack, ...forward];
  }

  // ── Seat management ───────────────────────────────

  private assignSeat(sessionKey: string): number | null {
    const existing = this.seatAssignments.get(sessionKey);
    if (existing !== undefined) return existing;
    for (let i = 0; i < this.subagentSeats.length; i++) {
      if (!this.usedSeats.has(i)) {
        this.seatAssignments.set(sessionKey, i);
        this.usedSeats.add(i);
        return i;
      }
    }
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
