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

// ─── Chat Message Type ───────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
  model?: string;
  provider?: string;
}

/** Detailed health info from Gateway */
export interface GatewayHealthDetail {
  ok: boolean;
  ts: number;
  uptime?: number;
  durationMs?: number;
  channels: Record<string, {
    configured: boolean;
    running: boolean;
    lastError: string | null;
  }>;
  version?: string;
}

/** Model info from models.list */
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  reasoning?: boolean;
}

/** Provider model definition inside config */
export interface ProviderModelDef {
  id: string;
  name?: string;
  reasoning?: boolean;
  input?: string[];
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
  contextWindow?: number;
  maxTokens?: number;
}

/** Provider definition inside config.models.providers */
export interface ProviderDef {
  baseUrl?: string;
  apiKey?: string | Record<string, unknown>;
  api?: string;
  models?: ProviderModelDef[];
}

/** Full config response from config.get */
export interface ConfigFull {
  config: Record<string, unknown>;
  raw: string;
  hash: string;
}

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

  /** Fetch chat history for a session */
  fetchChatHistory: (sessionKey: string, limit?: number) => Promise<ChatMessage[]>;

  /** Send a message to a session */
  sendMessage: (sessionKey: string, message: string) => Promise<void>;

  /** Fetch Gateway health info */
  fetchHealth: () => Promise<GatewayHealthDetail | null>;

  /** Fetch full config */
  fetchConfig: () => Promise<Record<string, unknown> | null>;

  /** Set a config value by path */
  setConfig: (path: string, value: unknown) => Promise<boolean>;

  /** Apply config (hot reload) */
  applyConfig: () => Promise<boolean>;

  /** Fetch available models */
  fetchModels: () => Promise<ModelInfo[]>;

  /** Fetch full config (raw + config object + hash) */
  fetchConfigFull: () => Promise<ConfigFull | null>;

  /** Apply raw config JSON with hot-reload */
  applyConfigRaw: (raw: string, baseHash: string) => Promise<boolean>;

  /** Set the default model (read → modify → write → refresh) */
  setDefaultModel: (modelId: string) => Promise<boolean>;

  /** Add a custom provider */
  addProvider: (alias: string, provider: ProviderDef) => Promise<boolean>;

  /** Remove a custom provider */
  removeProvider: (alias: string) => Promise<boolean>;

  /** Update a provider's API key */
  updateProviderApiKey: (alias: string, apiKey: string) => Promise<boolean>;
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
        // Optimistic update of a single session's status.
        // Mark active statuses with an expiry so poll doesn't immediately override.
        const isActive = p.status === "active" || p.status === "running" || p.status === "busy";
        const sessions = get().sessions.map((s) =>
          s.key === p.sessionKey
            ? {
                ...s,
                status: p.status,
                _optimisticUntil: isActive ? Date.now() + 10_000 : undefined,
              }
            : s,
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

    // agent event — catches subagent status changes (run accepted/done)
    client.on("agent", (payload) => {
      const p = payload as {
        sessionKey?: string;
        status?: string;
        runId?: string;
      } | null;
      console.log("[gatewayStore] agent event:", p?.sessionKey?.substring(0, 40), "status:", p?.status);
      if (p?.sessionKey && p?.status) {
        const isActive = p.status === "accepted" || p.status === "running";
        const mappedStatus = isActive ? "running" : p.status;
        const sessions = get().sessions.map((s) =>
          s.key === p.sessionKey
            ? {
                ...s,
                status: mappedStatus,
                updatedAt: Date.now(),
                _optimisticUntil: isActive ? Date.now() + 15_000 : undefined,
              }
            : s,
        );
        const characters = mapSessionsToAgents(sessions, get().agents);
        set({ sessions, characters });
      }
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
      const raw = await client.call<unknown>("sessions.list");
      console.log("[gatewayStore] sessions.list raw response:", JSON.stringify(raw)?.substring(0, 500));
      let sessions = Array.isArray(raw) ? raw : (raw as Record<string, unknown>)?.sessions as SessionData[] ?? [];
      console.log("[gatewayStore] Parsed sessions count:", sessions.length);

      // Preserve optimistic "running/active" status for sessions that were
      // recently updated via chat events — the poll may lag behind real-time.
      const now = Date.now();
      const currentSessions = get().sessions;
      const optimisticMap = new Map<string, SessionData>();
      for (const s of currentSessions) {
        if (
          (s.status === "active" || s.status === "running" || s.status === "busy") &&
          s._optimisticUntil && now < s._optimisticUntil
        ) {
          optimisticMap.set(s.key, s);
        }
      }

      if (optimisticMap.size > 0) {
        sessions = sessions.map((s: SessionData) => {
          const opt = optimisticMap.get(s.key);
          if (opt) {
            // Keep the optimistic active status, but update other fields
            return { ...s, status: opt.status, _optimisticUntil: opt._optimisticUntil };
          }
          return s;
        });
      }

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

  // ── fetchChatHistory ───────────────────────────────

  fetchChatHistory: async (sessionKey: string, limit = 50): Promise<ChatMessage[]> => {
    if (!client || client.status !== "connected") return [];

    try {
      const raw = await client.call<{
        messages?: Array<{
          role: string;
          content: unknown;
          timestamp?: number;
          model?: string;
          provider?: string;
        }>;
      }>("chat.history", { sessionKey, limit });

      const messages = raw?.messages ?? [];
      return messages.map((m) => {
        // Content can be string or array of {type, text}
        let text = "";
        if (typeof m.content === "string") {
          text = m.content;
        } else if (Array.isArray(m.content)) {
          text = m.content
            .filter((c: { type?: string; text?: string }) => c.type === "text")
            .map((c: { text?: string }) => c.text ?? "")
            .join("\n");
        }
        return {
          role: m.role as ChatMessage["role"],
          content: text,
          timestamp: m.timestamp,
          model: m.model,
          provider: m.provider,
        };
      });
    } catch (err) {
      console.warn("[gatewayStore] fetchChatHistory failed:", err);
      return [];
    }
  },

  // ── sendMessage ────────────────────────────────────

  sendMessage: async (sessionKey: string, message: string): Promise<void> => {
    if (!client || client.status !== "connected") return;

    try {
      const idempotencyKey = `wallpaper-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await client.call("chat.send", { sessionKey, message, idempotencyKey }, 30_000);
    } catch (err) {
      console.warn("[gatewayStore] sendMessage failed:", err);
      throw err;
    }
  },

  // ── fetchHealth ────────────────────────────────────

  fetchHealth: async (): Promise<GatewayHealthDetail | null> => {
    if (!client || client.status !== "connected") return null;

    try {
      const raw = await client.call<GatewayHealthDetail>("health", {}, 15_000);
      return raw ?? null;
    } catch (err) {
      console.warn("[gatewayStore] fetchHealth failed:", err);
      return null;
    }
  },

  // ── fetchConfig ────────────────────────────────────

  fetchConfig: async (): Promise<Record<string, unknown> | null> => {
    if (!client || client.status !== "connected") return null;

    try {
      const raw = await client.call<{ config?: Record<string, unknown>; parsed?: Record<string, unknown> }>("config.get", {});
      return raw?.config ?? raw?.parsed ?? null;
    } catch (err) {
      console.warn("[gatewayStore] fetchConfig failed:", err);
      return null;
    }
  },

  // ── setConfig ──────────────────────────────────────
  // Legacy path-based setter. Now uses read→modify→write via config.set
  // to avoid config.apply which triggers CMD popups on Windows.

  setConfig: async (path: string, value: unknown): Promise<boolean> => {
    if (!client || client.status !== "connected") return false;

    try {
      // Read current config
      const res = await client.call<{ config?: Record<string, unknown>; raw?: string; hash?: string }>(
        "config.get",
        {},
      );
      if (!res?.config || !res?.raw || !res?.hash) return false;

      // Set the value at the given dot-path
      const parts = path.split(".");
      let obj: Record<string, unknown> = res.config;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]] || typeof obj[parts[i]] !== "object") {
          obj[parts[i]] = {};
        }
        obj = obj[parts[i]] as Record<string, unknown>;
      }
      obj[parts[parts.length - 1]] = value;

      const raw = JSON.stringify(res.config, null, 2) + "\n";
      await client.call("config.set", { raw, baseHash: res.hash }, 30_000);
      return true;
    } catch (err) {
      console.warn("[gatewayStore] setConfig failed:", err);
      return false;
    }
  },

  // ── applyConfig ────────────────────────────────────
  // Now a no-op. Config changes are saved via config.set and take effect
  // on Gateway restart (use Tauri hidden-shell restart to avoid CMD popup).

  applyConfig: async (): Promise<boolean> => {
    // No-op: config.set already saved the file.
    // Gateway will pick up changes on restart.
    return true;
  },

  // ── fetchModels ────────────────────────────────────

  fetchModels: async (): Promise<ModelInfo[]> => {
    if (!client || client.status !== "connected") return [];

    try {
      const raw = await client.call<{ models?: ModelInfo[] }>("models.list", {});
      return raw?.models ?? [];
    } catch (err) {
      console.warn("[gatewayStore] fetchModels failed:", err);
      return [];
    }
  },

  // ── fetchConfigFull ────────────────────────────────

  fetchConfigFull: async (): Promise<ConfigFull | null> => {
    if (!client || client.status !== "connected") return null;

    try {
      const res = await client.call<{ config?: Record<string, unknown>; raw?: string; hash?: string }>(
        "config.get",
        {},
      );
      if (!res?.config || !res?.raw || !res?.hash) return null;
      return { config: res.config, raw: res.raw, hash: res.hash };
    } catch (err) {
      console.warn("[gatewayStore] fetchConfigFull failed:", err);
      return null;
    }
  },

  // ── applyConfigRaw ─────────────────────────────────
  // Uses config.set (save only, no process restart) to avoid CMD window
  // popups on Windows. The Gateway picks up config changes on next
  // request or can be restarted manually via the hidden-shell restart.

  applyConfigRaw: async (raw: string, baseHash: string): Promise<boolean> => {
    if (!client || client.status !== "connected") return false;

    try {
      await client.call("config.set", { raw, baseHash }, 30_000);
      return true;
    } catch (err) {
      console.warn("[gatewayStore] applyConfigRaw failed:", err);
      return false;
    }
  },

  // ── setDefaultModel ────────────────────────────────

  setDefaultModel: async (modelId: string): Promise<boolean> => {
    const store = get();
    const full = await store.fetchConfigFull();
    if (!full) return false;

    try {
      const config = full.config;
      // Ensure nested path exists
      if (!config.agents) config.agents = {};
      const agents = config.agents as Record<string, unknown>;
      if (!agents.defaults) agents.defaults = {};
      const defaults = agents.defaults as Record<string, unknown>;
      if (!defaults.model) defaults.model = {};
      const model = defaults.model as Record<string, unknown>;
      model.primary = modelId;

      const raw = JSON.stringify(config, null, 2) + "\n";
      return await store.applyConfigRaw(raw, full.hash);
    } catch (err) {
      console.warn("[gatewayStore] setDefaultModel failed:", err);
      return false;
    }
  },

  // ── addProvider ────────────────────────────────────

  addProvider: async (alias: string, provider: ProviderDef): Promise<boolean> => {
    const store = get();
    const full = await store.fetchConfigFull();
    if (!full) return false;

    try {
      const config = full.config;
      if (!config.models) config.models = {};
      const models = config.models as Record<string, unknown>;
      if (!models.providers) models.providers = {};
      const providers = models.providers as Record<string, unknown>;
      providers[alias] = provider;

      const raw = JSON.stringify(config, null, 2) + "\n";
      return await store.applyConfigRaw(raw, full.hash);
    } catch (err) {
      console.warn("[gatewayStore] addProvider failed:", err);
      return false;
    }
  },

  // ── removeProvider ─────────────────────────────────

  removeProvider: async (alias: string): Promise<boolean> => {
    const store = get();
    const full = await store.fetchConfigFull();
    if (!full) return false;

    try {
      const config = full.config;
      const models = config.models as Record<string, unknown> | undefined;
      const providers = models?.providers as Record<string, unknown> | undefined;
      if (!providers || !(alias in providers)) return false;
      delete providers[alias];

      const raw = JSON.stringify(config, null, 2) + "\n";
      return await store.applyConfigRaw(raw, full.hash);
    } catch (err) {
      console.warn("[gatewayStore] removeProvider failed:", err);
      return false;
    }
  },

  // ── updateProviderApiKey ───────────────────────────

  updateProviderApiKey: async (alias: string, apiKey: string): Promise<boolean> => {
    const store = get();
    const full = await store.fetchConfigFull();
    if (!full) return false;

    try {
      const config = full.config;
      const models = config.models as Record<string, unknown> | undefined;
      const providers = models?.providers as Record<string, unknown> | undefined;
      if (!providers || !(alias in providers)) return false;
      const provider = providers[alias] as Record<string, unknown>;
      provider.apiKey = apiKey;

      const raw = JSON.stringify(config, null, 2) + "\n";
      return await store.applyConfigRaw(raw, full.hash);
    } catch (err) {
      console.warn("[gatewayStore] updateProviderApiKey failed:", err);
      return false;
    }
  },
}));
