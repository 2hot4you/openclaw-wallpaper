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
 *   - Exclude "done" sessions older than 60s (auto-departure)
 *
 * State mapping:
 *   - "active" / "running" / "busy" / "working"  → "working"
 *   - "error"  / "failed"                         → "error"
 *   - everything else                              → "idle"
 */

/** 7 days in milliseconds */
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/** Done sessions older than 60s are filtered out (triggers despawn) */
const DONE_DEPARTURE_MS = 60_000;

const EXCLUDED_STATUSES = new Set(["closed", "archived"]);
const EXCLUDED_KINDS = new Set(["system"]);

/**
 * Resolve a human-readable display name from session & agent data.
 *
 * Priority:
 *   1. session.label (if short enough and not a raw UUID-like string)
 *   2. agent.name (from agents.list registration)
 *   3. session.agentId (extract readable part)
 *   4. Infer from session.key structure
 *   5. Fallback: "Agent" + short hash
 */
export function resolveDisplayName(session: SessionData, agent?: AgentData): string {
  // 1. Prefer label if it looks readable (not a long UUID-ish string)
  if (session.label) {
    const label = session.label.trim();
    // If label is short and readable, use it directly
    if (label.length > 0 && label.length < 40) return label;
  }

  // 2. Use agent registered name
  if (agent?.name) return agent.name;

  // 3. Use agentId — extract readable portion
  if (session.agentId) {
    const id = session.agentId;
    // Short agentId like "orchestrator" → use directly
    if (id.length < 20 && !id.match(/^[0-9a-f]{8}-/)) return capitalize(id);
  }

  // 4. Infer from session key structure
  // Common formats:
  //   "agent:main:main" → "Boss"
  //   "agent:main:subagent:uuid" → "Worker xxxx"
  //   "agent:orchestrator:discord:channel:123" → "orchestrator"
  const keyParts = session.key.split(":");
  if (keyParts.length >= 3) {
    const role = keyParts[2];
    if (role === "main" && keyParts[1] === "main") return "Boss";
    if (role === "subagent") {
      const shortId = keyParts[3]?.substring(0, 4) ?? "";
      return `Worker ${shortId}`.trim();
    }
    // Use the second segment if it's readable
    const segment = keyParts[1];
    if (segment && segment.length < 20 && !segment.match(/^[0-9a-f]{8}-/) && !segment.match(/^\d+$/)) {
      return capitalize(segment);
    }
  }

  // 5. Fallback: short hash
  return `Agent ${session.key.slice(-6)}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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

    // ── filter out done sessions after departure delay ──
    if (session.status === "done") {
      const age = now - (session.updatedAt ?? 0);
      if (age > DONE_DEPARTURE_MS) continue;
    }

    // ── filter out stale sessions ──
    if (session.updatedAt && now - session.updatedAt > STALE_THRESHOLD_MS) {
      continue;
    }

    // ── resolve display name ──
    const agent = session.agentId ? agentMap.get(session.agentId) : undefined;
    const name = resolveDisplayName(session, agent);

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
