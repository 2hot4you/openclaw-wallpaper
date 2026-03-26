// ─── RPC Frame Types ─────────────────────────────────────────

/** JSON-RPC style request frame sent to Gateway */
export interface RpcRequest {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
}

/** JSON-RPC style response frame received from Gateway */
export interface RpcResponse {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: RpcError;
}

/** Server-push event frame from Gateway */
export interface RpcEvent {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: number;
}

/** Union of all frame types */
export type RpcFrame = RpcRequest | RpcResponse | RpcEvent;

// ─── Error ───────────────────────────────────────────────────

export interface RpcError {
  code: string;
  message: string;
  retryable?: boolean;
}

// ─── Session Data ────────────────────────────────────────────

/** Session data as returned by sessions.list */
export interface SessionData {
  key: string;
  label?: string;
  kind?: string;
  status?: string;
  agentId?: string;
  sessionId?: string;
  updatedAt?: number;
  model?: string;
  totalTokens?: number;
  createdAt?: number;
  parentKey?: string;
}

// ─── Agent Data ──────────────────────────────────────────────

/** Agent data as returned by agents.list */
export interface AgentData {
  agentId: string;
  name?: string;
  isDefault?: boolean;
  emoji?: string;
}

// ─── Connection State ────────────────────────────────────────

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

// ─── Connect Handshake ───────────────────────────────────────

export interface ConnectParams {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: string;
    version: string;
    platform: string;
    mode: string;
  };
  role: string;
  scopes: string[];
  caps: string[];
  commands: string[];
  permissions: Record<string, unknown>;
  auth: { token: string };
  locale: string;
}

/** Snapshot returned on successful connect handshake */
export interface ConnectSnapshot {
  presence?: unknown[];
  health?: { status: string; uptime?: number };
  stateVersion?: number;
}

// ─── Gateway Health ──────────────────────────────────────────

export interface GatewayHealth {
  ok: boolean;
  status: string;
}

// ─── Event Handler Types ─────────────────────────────────────

export type EventHandler = (payload: unknown) => void;

// ─── Character State (for SessionMapper) ─────────────────────

export type CharacterAnimState = "idle" | "working" | "error";

export interface MappedCharacter {
  id: string;
  name: string;
  animState: CharacterAnimState;
  agentId?: string;
  emoji?: string;
  model?: string;
  updatedAt?: number;
}
