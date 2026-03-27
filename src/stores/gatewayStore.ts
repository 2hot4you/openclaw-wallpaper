import { create } from "zustand";
import { GatewayClient } from "../gateway/GatewayClient";
import { mapSessionsToAgents } from "../gateway/SessionMapper";
import type {
  ConnectionStatus,
  SessionData,
  AgentData,
  GatewayHealth,
  MappedCharacter,
} from "../gateway/types";

// Re-export types so existing code importing from this module keeps working.
export type { SessionData, AgentData, ConnectionStatus, GatewayHealth, MappedCharacter };

// ─── Singleton client instance ───────────────────────────────

let client: GatewayClient | null = null;

/** Expose the singleton for direct use outside React (e.g. PixiJS). */
export function getGatewayClient(): GatewayClient | null {
  return client;
}

// ─── Store interface ─────────────────────────────────────────

interface GatewayState {
  /** WebSocket connection status */
  connectionStatus: ConnectionStatus;

  /** Raw session list from Gateway */
  sessions: SessionData[];

  /** Raw agent list from Gateway */
  agents: AgentData[];

  /** Derived: sessions mapped to wallpaper characters */
  characters: MappedCharacter[];

  /** Gateway health snapshot (from HTTP or WS) */
  gatewayHealth: GatewayHealth | null;

  /** Connect to the Gateway WebSocket */
  connect: (url: string, token?: string, deviceToken?: string) => Promise<void>;

  /** Disconnect from the Gateway WebSocket */
  disconnect: () => void;

  /** Fetch sessions from Gateway and update state */
  refreshSessions: () => Promise<void>;

  /** Fetch agents from Gateway and update state */
  refreshAgents: () => Promise<void>;
}

// ─── Store implementation ────────────────────────────────────

export const useGatewayStore = create<GatewayState>((set, get) => ({
  connectionStatus: "disconnected",
  sessions: [],
  agents: [],
  characters: [],
  gatewayHealth: null,

  // ── connect ────────────────────────────────────────

  connect: async (url: string, token?: string, deviceToken?: string) => {
    // Tear down previous connection if any
    if (client) {
      client.disconnect();
    }

    client = new GatewayClient();

    // --- Wire up status listener ---
    client.on("status", (status) => {
      set({ connectionStatus: status as ConnectionStatus });
    });

    // --- Wire up event listeners ---

    // chat event → may indicate session status change
    client.on("chat", (payload) => {
      const p = payload as {
        sessionKey?: string;
        status?: string;
      } | null;
      if (p?.sessionKey && p?.status) {
        // Optimistic update of a single session's status
        const sessions = get().sessions.map((s) =>
          s.key === p.sessionKey ? { ...s, status: p.status } : s,
        );
        const characters = mapSessionsToAgents(sessions, get().agents);
        set({ sessions, characters });
      }
      // For any chat event, trigger a full refresh to stay in sync
      get().refreshSessions().catch(() => {});
    });

    // health event
    client.on("health", (payload) => {
      const h = payload as GatewayHealth | null;
      if (h) set({ gatewayHealth: h });
    });

    // presence event — just trigger session refresh
    client.on("presence", () => {
      get().refreshSessions().catch(() => {});
    });

    // shutdown event
    client.on("shutdown", () => {
      set({
        connectionStatus: "disconnected",
        gatewayHealth: { ok: false, status: "shutdown" },
      });
    });

    // reconnecting event — no extra action needed (status listener covers it)

    // connected (re-connect) event — refresh data
    client.on("connected", () => {
      Promise.all([
        get().refreshSessions(),
        get().refreshAgents(),
      ]).catch(() => {});
    });

    // --- Initiate connection ---
    try {
      await client.connect(url, token, deviceToken);
      // Fetch initial data after handshake
      await Promise.all([get().refreshSessions(), get().refreshAgents()]);
    } catch {
      // Connection failed — reconnect loop is already running inside GatewayClient
    }
  },

  // ── disconnect ─────────────────────────────────────

  disconnect: () => {
    if (client) {
      client.disconnect();
      client = null;
    }
    set({
      connectionStatus: "disconnected",
      sessions: [],
      agents: [],
      characters: [],
      gatewayHealth: null,
    });
  },

  // ── refreshSessions ────────────────────────────────

  refreshSessions: async () => {
    if (!client || client.status !== "connected") return;

    try {
      const raw = await client.call<SessionData[]>("sessions.list");
      const sessions = Array.isArray(raw) ? raw : [];
      const characters = mapSessionsToAgents(sessions, get().agents);
      set({ sessions, characters });
    } catch (err) {
      console.warn("[gatewayStore] refreshSessions failed:", err);
    }
  },

  // ── refreshAgents ──────────────────────────────────

  refreshAgents: async () => {
    if (!client || client.status !== "connected") return;

    try {
      const raw = await client.call<AgentData[]>("agents.list");
      const agents = Array.isArray(raw) ? raw : [];
      // Re-derive characters with new agent data
      const characters = mapSessionsToAgents(get().sessions, agents);
      set({ agents, characters });
    } catch (err) {
      console.warn("[gatewayStore] refreshAgents failed:", err);
    }
  },
}));
