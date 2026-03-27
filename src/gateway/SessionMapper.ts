import type {
  SessionData,
  AgentData,
  MappedCharacter,
  CharacterAnimState,
} from "./types";

/**
 * Maps raw Gateway session/agent data into the simplified character
 * representation consumed by the wallpaper scene layer.
 *
 * Filtering rules:
 *   - Exclude sessions with kind === "system" (internal bookkeeping)
 *   - Exclude sessions not updated in the last 7 days (stale)
 *   - Exclude sessions with status "closed" or "archived"
 *
 * State mapping:
 *   - "active" / "running" / "busy" / "working"  → "working"
 *   - "error"  / "failed"                         → "error"
 *   - everything else                              → "idle"
 */

/** 7 days in milliseconds */
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

const EXCLUDED_STATUSES = new Set(["closed", "archived"]);
const EXCLUDED_KINDS = new Set(["system"]);

export function mapSessionsToAgents(
  sessions: SessionData[],
  agents: AgentData[],
): MappedCharacter[] {
  const agentMap = new Map<string, AgentData>();
  for (const a of agents) {
    agentMap.set(a.agentId, a);
  }

  const now = Date.now();
  const result: MappedCharacter[] = [];

  for (const session of sessions) {
    // ── filter out excluded kinds ──
    if (session.kind && EXCLUDED_KINDS.has(session.kind)) continue;

    // ── filter out excluded statuses ──
    if (session.status && EXCLUDED_STATUSES.has(session.status)) continue;

    // ── filter out stale sessions ──
    if (session.updatedAt && now - session.updatedAt > STALE_THRESHOLD_MS) {
      continue;
    }

    // ── resolve display name ──
    const agent = session.agentId ? agentMap.get(session.agentId) : undefined;
    const name =
      session.label ??
      agent?.name ??
      `Session ${session.key.slice(0, 8)}`;

    // ── map animation state ──
    const animState = mapStatus(session.status, session.updatedAt);

    result.push({
      id: session.key,
      name,
      animState,
      agentId: session.agentId,
      emoji: agent?.emoji,
      model: session.model,
      updatedAt: session.updatedAt,
    });
  }

  return result;
}

/** Threshold: if updatedAt is within this many ms, treat "done" as "working" */
const ACTIVE_THRESHOLD_MS = 15_000;

function mapStatus(status?: string, updatedAt?: number): CharacterAnimState {
  switch (status) {
    case "active":
    case "running":
    case "busy":
    case "working":
      return "working";
    case "error":
    case "failed":
      return "error";
  }

  // Heuristic: "done" with very recent updatedAt → working
  if (status === "done" && updatedAt) {
    const age = Date.now() - updatedAt;
    if (age < ACTIVE_THRESHOLD_MS) {
      return "working";
    }
  }

  return "idle";
}
