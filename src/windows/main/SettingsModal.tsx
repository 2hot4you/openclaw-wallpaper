/**
 * SettingsModal — Pixel-art control panel for OpenClaw management.
 *
 * Tabs:
 *   🔌 Gateway  — start/stop/restart, health, channel status
 *   🧠 Models   — view models, switch default
 *   ⚙️ Config   — gateway URL/port/token, config editor
 */

import React, { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../stores/appStore";
import {
  useGatewayStore,
  type GatewayHealthDetail,
  type ModelInfo,
} from "../../stores/gatewayStore";
import { PIXEL_FONT, COLORS, pixelBorder, pixelButton, pixelInput } from "../../styles/pixel-theme";
import {
  getGatewayUrl,
  getGatewayToken,
  startOpenClaw,
  stopOpenClaw,
  restartOpenClaw,
} from "../../utils/tauri-ipc";

type Tab = "gateway" | "models" | "config";

export const SettingsModal: React.FC = () => {
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const [activeTab, setActiveTab] = useState<Tab>("gateway");

  const handleClose = useCallback(() => setSettingsOpen(false), [setSettingsOpen]);

  if (!settingsOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        zIndex: 200,
      }}
      onClick={handleClose}
    >
      <div
        style={{
          width: 520,
          maxHeight: "85vh",
          background: COLORS.bg,
          ...pixelBorder(COLORS.accent),
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div style={{
          padding: "10px 14px",
          background: COLORS.accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: PIXEL_FONT, fontSize: "11px", color: COLORS.textBright }}>
            🦞 OpenClaw Control Panel
          </span>
          <button onClick={handleClose} style={{
            ...pixelButton, background: "transparent", border: "none",
            boxShadow: "none", padding: "2px 6px", fontSize: "12px",
          }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", borderBottom: `2px solid ${COLORS.borderDim}`,
          background: COLORS.bgLight, flexShrink: 0,
        }}>
          {([
            { id: "gateway", label: "🔌 Gateway" },
            { id: "models", label: "🧠 Models" },
            { id: "config", label: "⚙️ Config" },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                fontFamily: PIXEL_FONT, fontSize: "9px", padding: "8px 14px",
                background: activeTab === tab.id ? COLORS.bg : "transparent",
                color: activeTab === tab.id ? COLORS.textBright : COLORS.textDim,
                border: "none", borderBottom: activeTab === tab.id ? `2px solid ${COLORS.accent}` : "2px solid transparent",
                cursor: "pointer",
              }}
            >{tab.label}</button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>
          {activeTab === "gateway" && <GatewayTab />}
          {activeTab === "models" && <ModelsTab />}
          {activeTab === "config" && <ConfigTab />}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
//  Gateway Tab
// ═══════════════════════════════════════════════════════

const GatewayTab: React.FC = () => {
  const connectionStatus = useGatewayStore((s) => s.connectionStatus);
  const fetchHealth = useGatewayStore((s) => s.fetchHealth);
  const connect = useGatewayStore((s) => s.connect);
  const disconnect = useGatewayStore((s) => s.disconnect);

  const [health, setHealth] = useState<GatewayHealthDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    const h = await fetchHealth();
    setHealth(h);
    setLoading(false);
  }, [fetchHealth]);

  useEffect(() => {
    if (connectionStatus === "connected") loadHealth();
  }, [connectionStatus, loadHealth]);

  const doAction = useCallback(async (action: string, fn: () => Promise<unknown>) => {
    setActionMsg(`${action}...`);
    try {
      await fn();
      setActionMsg(`✅ ${action} done`);
      // Reconnect after restart/start
      if (action !== "Stop") {
        setTimeout(async () => {
          try {
            const url = await getGatewayUrl();
            const { gatewayToken, deviceToken } = await getGatewayToken();
            await connect(url, gatewayToken, deviceToken);
          } catch { /* ignore */ }
        }, 3000);
      }
    } catch (err) {
      setActionMsg(`❌ ${action} failed: ${err}`);
    }
    setTimeout(() => setActionMsg(null), 4000);
  }, [connect]);

  return (
    <>
      {/* Connection status */}
      <StatusBadge status={connectionStatus} />

      {/* Actions */}
      <SectionTitle>Actions</SectionTitle>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <ActionButton label="▶️ Start" onClick={() => doAction("Start", startOpenClaw)} />
        <ActionButton label="⏹️ Stop" onClick={() => doAction("Stop", async () => { await stopOpenClaw(); disconnect(); })} />
        <ActionButton label="🔄 Restart" onClick={() => doAction("Restart", restartOpenClaw)} />
        <ActionButton label="🩺 Health" onClick={loadHealth} />
      </div>

      {actionMsg && (
        <div style={{ fontFamily: PIXEL_FONT, fontSize: "9px", color: COLORS.warning, marginBottom: 10 }}>
          {actionMsg}
        </div>
      )}

      {/* Health details */}
      {loading && <Dimmed>Loading health...</Dimmed>}
      {health && !loading && (
        <>
          <SectionTitle>Health</SectionTitle>
          <InfoRow label="Status" value={health.ok ? "✅ OK" : "❌ Error"} />
          {health.durationMs != null && <InfoRow label="Probe Time" value={`${health.durationMs}ms`} />}

          <SectionTitle>Channels</SectionTitle>
          {Object.entries(health.channels).map(([name, ch]) => (
            <div key={name} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "4px 0", borderBottom: `1px solid ${COLORS.inputBorder}`,
            }}>
              <span style={{ fontFamily: PIXEL_FONT, fontSize: "9px", color: COLORS.text, flex: 1 }}>
                {name}
              </span>
              <span style={{
                fontFamily: PIXEL_FONT, fontSize: "8px",
                color: !ch.configured ? COLORS.textDim : ch.running ? COLORS.success : COLORS.warning,
              }}>
                {!ch.configured ? "⚪ N/A" : ch.running ? "🟢 Running" : "🟡 Stopped"}
              </span>
              {ch.lastError && (
                <span style={{ fontFamily: PIXEL_FONT, fontSize: "7px", color: COLORS.error }}>
                  ⚠ {ch.lastError.slice(0, 30)}
                </span>
              )}
            </div>
          ))}
        </>
      )}
    </>
  );
};

// ═══════════════════════════════════════════════════════
//  Models Tab
// ═══════════════════════════════════════════════════════

const ModelsTab: React.FC = () => {
  const connectionStatus = useGatewayStore((s) => s.connectionStatus);
  const fetchModels = useGatewayStore((s) => s.fetchModels);
  const fetchConfig = useGatewayStore((s) => s.fetchConfig);
  const setConfig = useGatewayStore((s) => s.setConfig);
  const applyConfig = useGatewayStore((s) => s.applyConfig);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [currentModel, setCurrentModel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (connectionStatus !== "connected") return;
    setLoading(true);

    Promise.all([fetchModels(), fetchConfig()]).then(([m, config]) => {
      setModels(m);
      const primary = (config as Record<string, unknown>)?.agents as Record<string, unknown>;
      const defaults = primary?.defaults as Record<string, unknown>;
      const model = defaults?.model as Record<string, unknown>;
      setCurrentModel((model?.primary as string) ?? "");
      setLoading(false);
    });
  }, [connectionStatus, fetchModels, fetchConfig]);

  const handleSetDefault = useCallback(async (modelId: string) => {
    setSaving(true);
    const ok = await setConfig("agents.defaults.model.primary", modelId);
    if (ok) {
      await applyConfig();
      setCurrentModel(modelId);
    }
    setSaving(false);
  }, [setConfig, applyConfig]);

  if (loading) return <Dimmed>Loading models...</Dimmed>;

  return (
    <>
      <SectionTitle>Default Model</SectionTitle>
      <div style={{
        fontFamily: PIXEL_FONT, fontSize: "10px", color: COLORS.accent,
        padding: "6px 8px", background: "rgba(255,255,255,0.05)",
        border: `1px solid ${COLORS.inputBorder}`, marginBottom: 12,
      }}>
        🧠 {currentModel || "Not set"}
      </div>

      <SectionTitle>Available Models</SectionTitle>
      {models.length === 0 && <Dimmed>No models found</Dimmed>}
      {models.map((m) => {
        const fullId = `${m.provider}/${m.id}`;
        const isCurrent = fullId === currentModel;
        return (
          <div key={fullId} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 8px", marginBottom: 4,
            background: isCurrent ? "rgba(233,69,96,0.1)" : "transparent",
            border: `1px solid ${isCurrent ? COLORS.accent : COLORS.inputBorder}`,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: PIXEL_FONT, fontSize: "9px", color: COLORS.text }}>
                {m.name || m.id}
              </div>
              <div style={{ fontFamily: PIXEL_FONT, fontSize: "7px", color: COLORS.textDim }}>
                {m.provider} · {m.contextWindow ? `${(m.contextWindow / 1000).toFixed(0)}K ctx` : ""}
                {m.reasoning ? " · reasoning" : ""}
              </div>
            </div>
            {isCurrent ? (
              <span style={{ fontFamily: PIXEL_FONT, fontSize: "8px", color: COLORS.success }}>✓ Active</span>
            ) : (
              <button
                onClick={() => handleSetDefault(fullId)}
                disabled={saving}
                style={{ ...pixelButton, fontSize: "8px", padding: "3px 8px" }}
              >
                Use
              </button>
            )}
          </div>
        );
      })}
    </>
  );
};

// ═══════════════════════════════════════════════════════
//  Config Tab
// ═══════════════════════════════════════════════════════

const ConfigTab: React.FC = () => {
  const connectionStatus = useGatewayStore((s) => s.connectionStatus);
  const fetchConfig = useGatewayStore((s) => s.fetchConfig);
  const setConfigVal = useGatewayStore((s) => s.setConfig);
  const applyConfig = useGatewayStore((s) => s.applyConfig);

  const [gwUrl, setGwUrl] = useState("");
  const [gwToken, setGwToken] = useState("");
  const [port, setPort] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (connectionStatus !== "connected") {
      // Fallback: load from Tauri IPC
      Promise.all([
        getGatewayUrl().catch(() => "ws://127.0.0.1:18789"),
        getGatewayToken().catch(() => ({ gatewayToken: "" })),
      ]).then(([url, tokens]) => {
        setGwUrl(url);
        setGwToken(tokens.gatewayToken ?? "");
        const match = url.match(/:(\d+)/);
        setPort(match?.[1] ?? "18789");
        setLoading(false);
      });
      return;
    }

    setLoading(true);
    Promise.all([
      fetchConfig(),
      getGatewayUrl().catch(() => "ws://127.0.0.1:18789"),
      getGatewayToken().catch(() => ({ gatewayToken: "" })),
    ]).then(([config, url, tokens]) => {
      setGwUrl(url);
      setGwToken(tokens.gatewayToken ?? "");
      const gw = (config as Record<string, unknown>)?.gateway as Record<string, unknown>;
      setPort(String(gw?.port ?? "18789"));
      setLoading(false);
    });
  }, [connectionStatus, fetchConfig]);

  const handleSave = useCallback(async () => {
    const portNum = parseInt(port, 10);
    if (portNum && connectionStatus === "connected") {
      await setConfigVal("gateway.port", portNum);
      await applyConfig();
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }, [port, connectionStatus, setConfigVal, applyConfig]);

  if (loading) return <Dimmed>Loading config...</Dimmed>;

  return (
    <>
      {/* Connection */}
      <StatusBadge status={connectionStatus} />

      <SectionTitle>Gateway Connection</SectionTitle>
      <SettingsField label="WebSocket URL">
        <input type="text" value={gwUrl} onChange={(e) => setGwUrl(e.target.value)}
          placeholder="ws://127.0.0.1:18789" style={pixelInput} />
      </SettingsField>

      <SettingsField label="Port">
        <input type="text" value={port} onChange={(e) => setPort(e.target.value)}
          placeholder="18789" style={{ ...pixelInput, width: 120 }} />
      </SettingsField>

      <SettingsField label="Auth Token">
        <input type="password" value={gwToken} onChange={(e) => setGwToken(e.target.value)}
          placeholder="(optional)" style={pixelInput} />
      </SettingsField>

      <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {saved && <span style={{ fontFamily: PIXEL_FONT, fontSize: "9px", color: COLORS.success, alignSelf: "center" }}>✅ Saved & Applied</span>}
        <button onClick={handleSave} style={pixelButton}>💾 Save</button>
      </div>
    </>
  );
};

// ═══════════════════════════════════════════════════════
//  Shared UI Components
// ═══════════════════════════════════════════════════════

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    fontFamily: PIXEL_FONT, fontSize: "9px", color: COLORS.accent,
    marginTop: 14, marginBottom: 6, borderBottom: `1px solid ${COLORS.borderDim}`,
    paddingBottom: 3,
  }}>{children}</div>
);

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
    <span style={{ fontFamily: PIXEL_FONT, fontSize: "9px", color: COLORS.textDim }}>{label}</span>
    <span style={{ fontFamily: PIXEL_FONT, fontSize: "9px", color: COLORS.text }}>{value}</span>
  </div>
);

const Dimmed: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontFamily: PIXEL_FONT, fontSize: "10px", color: COLORS.textDim, textAlign: "center", padding: 20 }}>
    {children}
  </div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <div style={{
    fontFamily: PIXEL_FONT, fontSize: "10px",
    color: status === "connected" ? COLORS.success : COLORS.error,
    padding: "6px 8px", background: "rgba(255,255,255,0.05)",
    border: `1px solid ${COLORS.inputBorder}`, marginBottom: 10,
  }}>
    {status === "connected" ? "🟢 Connected" : "🔴 Disconnected"}
  </div>
);

const ActionButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button onClick={onClick} style={{ ...pixelButton, fontSize: "9px", padding: "6px 12px" }}>
    {label}
  </button>
);

const SettingsField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ fontFamily: PIXEL_FONT, fontSize: "9px", color: COLORS.textDim, marginBottom: 3 }}>
      {label}
    </div>
    {children}
  </div>
);
