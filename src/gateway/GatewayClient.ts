import type {
  RpcRequest,
  RpcResponse,
  RpcEvent,
  RpcFrame,
  ConnectionStatus,
  ConnectParams,
  ConnectSnapshot,
  EventHandler,
} from "./types";

/**
 * OpenClaw Gateway WebSocket JSON-RPC client.
 *
 * Protocol overview:
 *   Request:  { type:"req",   id, method, params }
 *   Response: { type:"res",   id, ok, payload|error }
 *   Event:    { type:"event", event, payload, seq?, stateVersion? }
 *
 * Features:
 *   - connect handshake (protocol v3)
 *   - RPC call with timeout (default 10 s)
 *   - auto-incremented request IDs
 *   - event subscription (on / off)
 *   - exponential-backoff reconnection (1 s → 30 s max)
 *   - connection status management
 *   - tick events treated as keep-alive
 */
export class GatewayClient {
  // ─── Connection ──────────────────────────────────────

  private ws: WebSocket | null = null;
  private _url = "";
  private _token = "";
  private _deviceToken = "";
  private _status: ConnectionStatus = "disconnected";

  // ─── RPC bookkeeping ─────────────────────────────────

  private nextId = 1;
  private pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason: unknown) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private defaultTimeout = 10_000; // 10 s

  // ─── Reconnection ────────────────────────────────────

  private shouldReconnect = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly BASE_DELAY = 1_000;
  private static readonly MAX_DELAY = 30_000;

  // ─── Events ──────────────────────────────────────────

  private listeners = new Map<string, Set<EventHandler>>();

  // ─── Keep-alive ──────────────────────────────────────

  /** Timestamp of last received message (for external health monitoring). */
  public lastActivity = 0;

  // ─── Public getters ──────────────────────────────────

  get status(): ConnectionStatus {
    return this._status;
  }

  // ────────────────────────────────────────────────────
  //  Connection lifecycle
  // ────────────────────────────────────────────────────

  /**
   * Open a WebSocket to `url`, then send the connect handshake.
   * Resolves with the snapshot from the `hello-ok` response.
   */
  async connect(
    url: string,
    token?: string,
    deviceToken?: string,
  ): Promise<ConnectSnapshot | undefined> {
    this._url = url;
    this._token = token ?? "";
    this._deviceToken = deviceToken ?? "";
    this.shouldReconnect = true;
    this.setStatus("connecting");

    return this.doConnect();
  }

  /** Close the connection and stop reconnection. */
  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.closeWs();
    this.rejectAllPending("Client disconnected");
    this.setStatus("disconnected");
  }

  // ────────────────────────────────────────────────────
  //  RPC
  // ────────────────────────────────────────────────────

  /**
   * Send an RPC request and wait for the response.
   * @returns The `payload` field of a successful response.
   * @throws On timeout, connection error, or server error.
   */
  call<T = unknown>(
    method: string,
    params?: unknown,
    timeout?: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket not connected"));
        return;
      }

      const id = String(this.nextId++);
      const req: RpcRequest = { type: "req", id, method };
      if (params !== undefined) {
        req.params = params;
      }

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout: ${method} (id=${id})`));
      }, timeout ?? this.defaultTimeout);

      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      this.ws.send(JSON.stringify(req));
    });
  }

  // ────────────────────────────────────────────────────
  //  Event subscription
  // ────────────────────────────────────────────────────

  /** Subscribe to a Gateway event (e.g. "chat", "agent", "health"). */
  on(event: string, handler: EventHandler): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
  }

  /** Unsubscribe from a Gateway event. */
  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler);
  }

  // ────────────────────────────────────────────────────
  //  Internal: connect flow
  // ────────────────────────────────────────────────────

  private doConnect(): Promise<ConnectSnapshot | undefined> {
    return new Promise((resolve, reject) => {
      try {
        console.log("[GatewayClient] Connecting to:", this._url);
        const ws = new WebSocket(this._url);
        this.ws = ws;

        ws.onopen = () => {
          console.log("[GatewayClient] WebSocket opened, sending handshake...");
          this.lastActivity = Date.now();
          // Send the connect handshake
          this.sendHandshake()
            .then((snapshot) => {
              console.log("[GatewayClient] Handshake success, snapshot:", snapshot);
              this.reconnectAttempts = 0;
              this.setStatus("connected");
              this.emit("connected", snapshot);
              resolve(snapshot);
            })
            .catch((err) => {
              console.error("[GatewayClient] Handshake failed:", err);
              this.closeWs();
              reject(err);
            });
        };

        ws.onmessage = (ev: MessageEvent) => {
          this.lastActivity = Date.now();
          this.handleMessage(ev.data as string);
        };

        ws.onclose = (ev) => {
          console.log("[GatewayClient] WebSocket closed, code:", ev.code, "reason:", ev.reason);
          const wasConnected = this._status === "connected";
          this.rejectAllPending("Connection closed");

          if (this.shouldReconnect) {
            this.setStatus("reconnecting");
            this.scheduleReconnect();
          } else {
            this.setStatus("disconnected");
          }

          if (wasConnected) {
            this.emit("disconnected", undefined);
          }
        };

        ws.onerror = (ev) => {
          console.error("[GatewayClient] WebSocket error:", ev);
          // onclose fires right after — actual handling happens there.
          // Reject only if we haven't resolved yet (initial connect).
          if (this._status === "connecting") {
            reject(new Error(`WebSocket error connecting to ${this._url}`));
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  private async sendHandshake(): Promise<ConnectSnapshot | undefined> {
    const params: ConnectParams = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: "openclaw-control-ui",
        version: "0.1.0",
        platform: this.detectPlatform(),
        mode: "ui",
      },
      role: "operator",
      scopes: ["operator.read", "operator.write", "operator.admin"],
      caps: [],
      commands: [],
      permissions: {},
      auth: {
        token: this._token || undefined,
        deviceToken: this._deviceToken || undefined,
      },
      locale: "zh-CN",
    };

    const res = await this.call<{
      type?: string;
      snapshot?: ConnectSnapshot;
    }>("connect", params, 15_000);

    return (res as { snapshot?: ConnectSnapshot })?.snapshot;
  }

  private detectPlatform(): string {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("win")) return "windows";
    if (ua.includes("mac")) return "macos";
    if (ua.includes("linux")) return "linux";
    return "unknown";
  }

  // ────────────────────────────────────────────────────
  //  Message handling
  // ────────────────────────────────────────────────────

  private handleMessage(raw: string): void {
    let frame: RpcFrame;
    try {
      frame = JSON.parse(raw) as RpcFrame;
    } catch {
      console.warn("[GatewayClient] invalid JSON:", raw.slice(0, 200));
      return;
    }

    switch (frame.type) {
      case "res":
        this.handleResponse(frame as RpcResponse);
        break;
      case "event":
        this.handleEvent(frame as RpcEvent);
        break;
      default:
        // Ignore unknown frame types (e.g. "req" from server — shouldn't happen)
        break;
    }
  }

  private handleResponse(res: RpcResponse): void {
    const entry = this.pending.get(res.id);
    if (!entry) return;

    this.pending.delete(res.id);
    clearTimeout(entry.timer);

    if (res.ok) {
      entry.resolve(res.payload);
    } else {
      const errMsg = res.error
        ? `${res.error.code}: ${res.error.message}`
        : "Unknown RPC error";
      entry.reject(new Error(errMsg));
    }
  }

  private handleEvent(ev: RpcEvent): void {
    // tick = keep-alive, no need to propagate by default
    if (ev.event === "tick") {
      return;
    }

    // Emit to specific event listeners
    this.emit(ev.event, ev.payload);

    // Also emit a catch-all "event" event
    this.emit("*", { event: ev.event, payload: ev.payload, seq: ev.seq });
  }

  // ────────────────────────────────────────────────────
  //  Reconnection
  // ────────────────────────────────────────────────────

  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    const delay = Math.min(
      GatewayClient.BASE_DELAY * Math.pow(2, this.reconnectAttempts),
      GatewayClient.MAX_DELAY,
    );
    this.reconnectAttempts++;

    this.emit("reconnecting", { attempt: this.reconnectAttempts, delay });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect().catch(() => {
        // doConnect failure triggers onclose → scheduleReconnect again
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ────────────────────────────────────────────────────
  //  Helpers
  // ────────────────────────────────────────────────────

  private closeWs(): void {
    if (this.ws) {
      // Remove handlers to avoid triggering reconnect
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error(reason));
    }
    this.pending.clear();
  }

  private setStatus(s: ConnectionStatus): void {
    if (this._status === s) return;
    this._status = s;
    this.emit("status", s);
  }

  private emit(event: string, payload: unknown): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const fn of handlers) {
      try {
        fn(payload);
      } catch (e) {
        console.error(`[GatewayClient] event handler error (${event}):`, e);
      }
    }
  }
}
