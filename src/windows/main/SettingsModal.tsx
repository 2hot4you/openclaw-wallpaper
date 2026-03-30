/**
 * SettingsModal — Pixel-art control panel for OpenClaw management.
 *
 * Tabs:
 *   🔌 Gateway   — start/stop/restart, health, channel status
 *   🧠 Models    — view models, switch default
 *   🔑 Providers — manage custom providers + env API keys
 *   ⚙️ Config    — gateway URL/port/token, config editor
 */

import React, { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../stores/appStore";
import {
  useGatewayStore,
  type GatewayHealthDetail,
  type ModelInfo,
  type ProviderDef,
  type ProviderModelDef,
} from "../../stores/gatewayStore";
import { PIXEL_FONT, COLORS, pixelBorder, pixelButton, pixelInput } from "../../styles/pixel-theme";
import {
  getGatewayUrl,
  getGatewayToken,
  startOpenClaw,
  stopOpenClaw,
  restartOpenClaw,
} from "../../utils/tauri-ipc";

type Tab = "gateway" | "models" | "providers" | "config";

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
          width: 640,
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
          padding: "12px 16px",
          background: COLORS.accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: PIXEL_FONT, fontSize: "14px", color: COLORS.textBright }}>
            🦞 OpenClaw Control Panel
          </span>
          <button onClick={handleClose} style={{
            ...pixelButton, background: "transparent", border: "none",
            boxShadow: "none", padding: "2px 8px", fontSize: "14px",
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
            { id: "providers", label: "🔑 Providers" },
            { id: "config", label: "⚙️ Config" },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                fontFamily: PIXEL_FONT, fontSize: "12px", padding: "10px 16px",
                background: activeTab === tab.id ? COLORS.bg : "transparent",
                color: activeTab === tab.id ? COLORS.textBright : COLORS.textDim,
                border: "none", borderBottom: activeTab === tab.id ? `2px solid ${COLORS.accent}` : "2px solid transparent",
                cursor: "pointer",
              }}
            >{tab.label}</button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {activeTab === "gateway" && <GatewayTab />}
          {activeTab === "models" && <ModelsTab />}
          {activeTab === "providers" && <ProvidersTab />}
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
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <ActionButton label="▶️ Start" onClick={() => doAction("Start", startOpenClaw)} />
        <ActionButton label="⏹️ Stop" onClick={() => doAction("Stop", async () => { useAppStore.getState().setStopPending(true); disconnect(); await stopOpenClaw(); setTimeout(() => useAppStore.getState().setStopPending(false), 15000); })} />
        <ActionButton label="🔄 Restart" onClick={() => doAction("Restart", async () => { useAppStore.getState().setStopPending(true); disconnect(); await restartOpenClaw(); setTimeout(() => useAppStore.getState().setStopPending(false), 15000); })} />
        <ActionButton label="🩺 Health" onClick={loadHealth} />
      </div>

      {actionMsg && (
        <div style={{ fontFamily: PIXEL_FONT, fontSize: "12px", color: COLORS.warning, marginBottom: 12 }}>
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
              padding: "5px 0", borderBottom: `1px solid ${COLORS.inputBorder}`,
            }}>
              <span style={{ fontFamily: PIXEL_FONT, fontSize: "12px", color: COLORS.text, flex: 1 }}>
                {name}
              </span>
              <span style={{
                fontFamily: PIXEL_FONT, fontSize: "11px",
                color: !ch.configured ? COLORS.textDim : ch.running ? COLORS.success : COLORS.warning,
              }}>
                {!ch.configured ? "⚪ N/A" : ch.running ? "🟢 Running" : "🟡 Stopped"}
              </span>
              {ch.lastError && (
                <span style={{ fontFamily: PIXEL_FONT, fontSize: "10px", color: COLORS.error }}>
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
  const fetchConfigFull = useGatewayStore((s) => s.fetchConfigFull);
  const setDefaultModel = useGatewayStore((s) => s.setDefaultModel);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [currentModel, setCurrentModel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (connectionStatus !== "connected") return;
    setLoading(true);

    Promise.all([fetchModels(), fetchConfigFull()]).then(([m, full]) => {
      setModels(m);
      if (full) {
        const agents = full.config.agents as Record<string, unknown> | undefined;
        const defaults = agents?.defaults as Record<string, unknown> | undefined;
        const model = defaults?.model as Record<string, unknown> | undefined;
        setCurrentModel((model?.primary as string) ?? "");
      }
      setLoading(false);
    });
  }, [connectionStatus, fetchModels, fetchConfigFull]);

  const handleSetDefault = useCallback(async (modelId: string) => {
    setSaving(true);
    const ok = await setDefaultModel(modelId);
    if (ok) {
      setCurrentModel(modelId);
    }
    setSaving(false);
  }, [setDefaultModel]);

  if (loading) return <Dimmed>Loading models...</Dimmed>;

  // Group models by provider
  const grouped = new Map<string, ModelInfo[]>();
  for (const m of models) {
    const group = grouped.get(m.provider) ?? [];
    group.push(m);
    grouped.set(m.provider, group);
  }

  return (
    <>
      <SectionTitle>Default Model</SectionTitle>
      <div style={{
        fontFamily: PIXEL_FONT, fontSize: "13px", color: COLORS.accent,
        padding: "8px 10px", background: "rgba(255,255,255,0.05)",
        border: `1px solid ${COLORS.inputBorder}`, marginBottom: 14,
      }}>
        🧠 {currentModel || "Not set"}
      </div>

      <SectionTitle>Available Models</SectionTitle>
      {models.length === 0 && <Dimmed>No models found</Dimmed>}
      {Array.from(grouped.entries()).map(([provider, providerModels]) => (
        <div key={provider} style={{ marginBottom: 14 }}>
          <div style={{
            fontFamily: PIXEL_FONT, fontSize: "11px", color: COLORS.textDim,
            marginBottom: 6, textTransform: "uppercase",
          }}>
            ▸ {provider}
          </div>
          {providerModels.map((m) => {
            const fullId = `${m.provider}/${m.id}`;
            const isCurrent = fullId === currentModel;
            return (
              <div key={fullId} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", marginBottom: 6,
                background: isCurrent ? "rgba(233,69,96,0.1)" : "transparent",
                border: `1px solid ${isCurrent ? COLORS.accent : COLORS.inputBorder}`,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: PIXEL_FONT, fontSize: "12px", color: COLORS.text }}>
                    {m.name || m.id}
                  </div>
                  <div style={{ fontFamily: PIXEL_FONT, fontSize: "10px", color: COLORS.textDim, marginTop: 2 }}>
                    {m.contextWindow ? `${(m.contextWindow / 1000).toFixed(0)}K ctx` : ""}
                    {m.reasoning ? " · reasoning" : ""}
                  </div>
                </div>
                {isCurrent ? (
                  <span style={{ fontFamily: PIXEL_FONT, fontSize: "11px", color: COLORS.success }}>✓ Active</span>
                ) : (
                  <button
                    onClick={() => handleSetDefault(fullId)}
                    disabled={saving}
                    style={{ ...pixelButton, fontSize: "11px", padding: "5px 10px" }}
                  >
                    Use
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
};

// ═══════════════════════════════════════════════════════
//  Providers Tab
// ═══════════════════════════════════════════════════════

/** Known built-in provider env var mappings */
const BUILTIN_PROVIDERS: Array<{ name: string; envKey: string }> = [
  { name: "Anthropic", envKey: "ANTHROPIC_API_KEY" },
  { name: "OpenAI", envKey: "OPENAI_API_KEY" },
  { name: "Google (Gemini)", envKey: "GOOGLE_AI_API_KEY" },
  { name: "DeepSeek", envKey: "DEEPSEEK_API_KEY" },
  { name: "Groq", envKey: "GROQ_API_KEY" },
  { name: "xAI", envKey: "XAI_API_KEY" },
  { name: "Mistral", envKey: "MISTRAL_API_KEY" },
  { name: "OpenRouter", envKey: "OPENROUTER_API_KEY" },
  { name: "Together AI", envKey: "TOGETHER_API_KEY" },
];

/** Mask an API key: show first 4 + last 4 chars */
function maskApiKey(key: string | undefined | null): string {
  if (!key || typeof key !== "string") return "—";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}${"••••••"}${key.slice(-4)}`;
}

/** Empty model template */
function emptyModelDef(): ProviderModelDef {
  return { id: "", name: "", contextWindow: 128000 };
}

const ProvidersTab: React.FC = () => {
  const connectionStatus = useGatewayStore((s) => s.connectionStatus);
  const fetchConfigFull = useGatewayStore((s) => s.fetchConfigFull);
  const addProviderFn = useGatewayStore((s) => s.addProvider);
  const removeProviderFn = useGatewayStore((s) => s.removeProvider);
  const updateProviderApiKeyFn = useGatewayStore((s) => s.updateProviderApiKey);

  const [customProviders, setCustomProviders] = useState<Record<string, ProviderDef>>({});
  const [envKeys, setEnvKeys] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [restarting, setRestarting] = useState(false);

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [formAlias, setFormAlias] = useState("");
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [formApiType, setFormApiType] = useState("openai-chat");
  const [formModels, setFormModels] = useState<ProviderModelDef[]>([emptyModelDef()]);
  const [formSaving, setFormSaving] = useState(false);

  // Edit API key state
  const [editingAlias, setEditingAlias] = useState<string | null>(null);
  const [editApiKeyValue, setEditApiKeyValue] = useState("");

  const loadProviders = useCallback(async () => {
    setLoading(true);
    const full = await fetchConfigFull();
    if (full) {
      const models = full.config.models as Record<string, unknown> | undefined;
      const providers = (models?.providers ?? {}) as Record<string, ProviderDef>;
      setCustomProviders(providers);
      const env = (full.config.env ?? {}) as Record<string, string>;
      setEnvKeys(env);
    }
    setLoading(false);
  }, [fetchConfigFull]);

  useEffect(() => {
    if (connectionStatus === "connected") loadProviders();
  }, [connectionStatus, loadProviders]);

  const showMsg = useCallback((msg: string) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(null), 4000);
  }, []);

  // ── Silent Restart (via Tauri hidden shell) ───────
  const connect = useGatewayStore((s) => s.connect);
  const disconnect = useGatewayStore((s) => s.disconnect);

  const handleRestart = useCallback(async () => {
    setRestarting(true);
    showMsg("🔄 Restarting Gateway...");
    disconnect();
    try {
      await restartOpenClaw();
      // Wait for Gateway to come back up, then reconnect
      setTimeout(async () => {
        try {
          const url = await getGatewayUrl();
          const { gatewayToken, deviceToken } = await getGatewayToken();
          await connect(url, gatewayToken, deviceToken);
          setNeedsRestart(false);
          showMsg("✅ Gateway restarted");
        } catch { /* ignore, auto-reconnect will handle */ }
        setRestarting(false);
      }, 4000);
    } catch (err) {
      showMsg(`❌ Restart failed: ${err}`);
      setRestarting(false);
    }
  }, [connect, disconnect, showMsg]);

  // ── Add Provider ──────────────────────────────────
  const handleAddProvider = useCallback(async () => {
    if (!formAlias.trim()) { showMsg("❌ Alias is required"); return; }
    if (!formBaseUrl.trim()) { showMsg("❌ Base URL is required"); return; }

    setFormSaving(true);
    const provider: ProviderDef = {
      baseUrl: formBaseUrl.trim(),
      apiKey: formApiKey.trim() || undefined,
      api: formApiType,
      models: formModels.filter((m) => m.id.trim()),
    };
    const ok = await addProviderFn(formAlias.trim(), provider);
    if (ok) {
      showMsg("✅ Provider added — restart to apply");
      setNeedsRestart(true);
      setShowAddForm(false);
      setFormAlias("");
      setFormBaseUrl("");
      setFormApiKey("");
      setFormApiType("openai-chat");
      setFormModels([emptyModelDef()]);
      await loadProviders();
    } else {
      showMsg("❌ Failed to add provider");
    }
    setFormSaving(false);
  }, [formAlias, formBaseUrl, formApiKey, formApiType, formModels, addProviderFn, loadProviders, showMsg]);

  // ── Remove Provider ───────────────────────────────
  const handleRemoveProvider = useCallback(async (alias: string) => {
    const ok = await removeProviderFn(alias);
    if (ok) {
      showMsg(`✅ Removed "${alias}" — restart to apply`);
      setNeedsRestart(true);
      await loadProviders();
    } else {
      showMsg(`❌ Failed to remove "${alias}"`);
    }
  }, [removeProviderFn, loadProviders, showMsg]);

  // ── Update API Key ────────────────────────────────
  const handleUpdateApiKey = useCallback(async (alias: string) => {
    if (!editApiKeyValue.trim()) { showMsg("❌ API Key is required"); return; }
    const ok = await updateProviderApiKeyFn(alias, editApiKeyValue.trim());
    if (ok) {
      showMsg(`✅ API Key updated for "${alias}" — restart to apply`);
      setNeedsRestart(true);
      setEditingAlias(null);
      setEditApiKeyValue("");
      await loadProviders();
    } else {
      showMsg(`❌ Failed to update API Key`);
    }
  }, [editApiKeyValue, updateProviderApiKeyFn, loadProviders, showMsg]);

  // ── Form model management ─────────────────────────
  const updateFormModel = useCallback((index: number, field: keyof ProviderModelDef, value: string | number) => {
    setFormModels((prev) => prev.map((m, i) => i === index ? { ...m, [field]: value } : m));
  }, []);

  const addFormModel = useCallback(() => {
    setFormModels((prev) => [...prev, emptyModelDef()]);
  }, []);

  const removeFormModel = useCallback((index: number) => {
    setFormModels((prev) => prev.filter((_, i) => i !== index));
  }, []);

  if (loading) return <Dimmed>Loading providers...</Dimmed>;

  const providerEntries = Object.entries(customProviders);

  return (
    <>
      {/* Restart banner */}
      {needsRestart && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", marginBottom: 12,
          background: "rgba(255,204,68,0.1)",
          border: `2px solid ${COLORS.warning}`,
          fontFamily: PIXEL_FONT, fontSize: "11px", color: COLORS.warning,
        }}>
          <span>⚠️ Config saved — restart Gateway to apply</span>
          <button
            onClick={handleRestart}
            disabled={restarting}
            style={{ ...pixelButton, fontSize: "11px", padding: "5px 12px", background: COLORS.warning, color: COLORS.bg }}
          >
            {restarting ? "Restarting..." : "🔄 Restart"}
          </button>
        </div>
      )}

      {actionMsg && (
        <div style={{
          fontFamily: PIXEL_FONT, fontSize: "12px",
          color: actionMsg.startsWith("✅") ? COLORS.success : COLORS.error,
          marginBottom: 12, padding: "6px 10px",
          background: "rgba(255,255,255,0.05)",
          border: `1px solid ${COLORS.inputBorder}`,
        }}>
          {actionMsg}
        </div>
      )}

      {/* ═══ Custom Providers ═══ */}
      <SectionTitle>Custom Providers</SectionTitle>

      {providerEntries.length === 0 && !showAddForm && (
        <Dimmed>No custom providers configured</Dimmed>
      )}

      {providerEntries.map(([alias, prov]) => {
        const apiKeyStr = typeof prov.apiKey === "string" ? prov.apiKey : undefined;
        const modelCount = prov.models?.length ?? 0;
        const hasApiKey = !!apiKeyStr;
        const isEditing = editingAlias === alias;

        return (
          <div key={alias} style={{
            marginBottom: 12,
            padding: "12px 14px",
            background: "rgba(255,255,255,0.03)",
            ...pixelBorder(COLORS.borderDim),
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontFamily: PIXEL_FONT, fontSize: "13px", color: COLORS.textBright }}>
                {alias}
              </span>
              <span style={{
                fontFamily: PIXEL_FONT, fontSize: "10px",
                color: hasApiKey ? COLORS.success : COLORS.warning,
              }}>
                {hasApiKey ? "✅ Configured" : "⚠️ No API Key"}
              </span>
            </div>

            {/* Details */}
            {prov.baseUrl && (
              <InfoRow label="Base URL" value={prov.baseUrl} />
            )}
            <InfoRow label="API Key" value={maskApiKey(apiKeyStr)} />
            {prov.api && (
              <InfoRow label="API Type" value={prov.api} />
            )}
            <InfoRow label="Models" value={`${modelCount} model${modelCount !== 1 ? "s" : ""}`} />

            {/* Model details */}
            {prov.models && prov.models.length > 0 && (
              <div style={{ marginTop: 6, paddingLeft: 10, borderLeft: `2px solid ${COLORS.borderDim}` }}>
                {prov.models.map((m) => (
                  <div key={m.id} style={{
                    fontFamily: PIXEL_FONT, fontSize: "10px", color: COLORS.textDim,
                    padding: "3px 0",
                  }}>
                    {m.name || m.id}
                    {m.contextWindow ? ` · ${(m.contextWindow / 1000).toFixed(0)}K` : ""}
                    {m.reasoning ? " · reasoning" : ""}
                  </div>
                ))}
              </div>
            )}

            {/* Edit API Key inline */}
            {isEditing && (
              <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="password"
                  value={editApiKeyValue}
                  onChange={(e) => setEditApiKeyValue(e.target.value)}
                  placeholder="New API Key"
                  style={{ ...pixelInput, flex: 1 }}
                />
                <button
                  onClick={() => handleUpdateApiKey(alias)}
                  style={{ ...pixelButton, fontSize: "11px", padding: "6px 10px" }}
                >
                  💾
                </button>
                <button
                  onClick={() => { setEditingAlias(null); setEditApiKeyValue(""); }}
                  style={{ ...pixelButton, fontSize: "11px", padding: "6px 10px", background: COLORS.bgPanel }}
                >
                  ✕
                </button>
              </div>
            )}

            {/* Actions */}
            {!isEditing && (
              <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={() => { setEditingAlias(alias); setEditApiKeyValue(""); }}
                  style={{ ...pixelButton, fontSize: "11px", padding: "6px 12px", background: COLORS.bgPanel }}
                >
                  ✏️ Edit Key
                </button>
                <button
                  onClick={() => handleRemoveProvider(alias)}
                  style={{ ...pixelButton, fontSize: "11px", padding: "6px 12px", background: COLORS.error }}
                >
                  🗑️ Delete
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* ═══ Add Provider Form ═══ */}
      {!showAddForm ? (
        <div style={{ marginTop: 10, marginBottom: 18 }}>
          <button
            onClick={() => setShowAddForm(true)}
            style={{ ...pixelButton, fontSize: "12px", padding: "8px 16px" }}
          >
            + Add Provider
          </button>
        </div>
      ) : (
        <div style={{
          marginTop: 10, marginBottom: 18,
          padding: "14px",
          background: "rgba(255,255,255,0.03)",
          ...pixelBorder(COLORS.accent),
        }}>
          <div style={{
            fontFamily: PIXEL_FONT, fontSize: "12px", color: COLORS.accent,
            marginBottom: 12,
          }}>
            New Provider
          </div>

          <SettingsField label="Provider Alias">
            <input
              type="text"
              value={formAlias}
              onChange={(e) => setFormAlias(e.target.value)}
              placeholder="my-provider"
              style={pixelInput}
            />
          </SettingsField>

          <SettingsField label="Base URL">
            <input
              type="text"
              value={formBaseUrl}
              onChange={(e) => setFormBaseUrl(e.target.value)}
              placeholder="https://api.example.com"
              style={pixelInput}
            />
          </SettingsField>

          <SettingsField label="API Key">
            <input
              type="password"
              value={formApiKey}
              onChange={(e) => setFormApiKey(e.target.value)}
              placeholder="sk-..."
              style={pixelInput}
            />
          </SettingsField>

          <SettingsField label="API Type">
            <select
              value={formApiType}
              onChange={(e) => setFormApiType(e.target.value)}
              style={{ ...pixelInput, cursor: "pointer" }}
            >
              <option value="openai-chat">openai-chat</option>
              <option value="anthropic-messages">anthropic-messages</option>
              <option value="other">other</option>
            </select>
          </SettingsField>

          {/* Models */}
          <div style={{
            fontFamily: PIXEL_FONT, fontSize: "12px", color: COLORS.textDim,
            marginTop: 12, marginBottom: 8,
          }}>
            Models
          </div>
          {formModels.map((m, i) => (
            <div key={i} style={{
              display: "flex", gap: 8, marginBottom: 8, alignItems: "center",
            }}>
              <input
                type="text"
                value={m.id}
                onChange={(e) => updateFormModel(i, "id", e.target.value)}
                placeholder="model-id"
                style={{ ...pixelInput, flex: 2, fontSize: "12px" }}
              />
              <input
                type="text"
                value={m.name ?? ""}
                onChange={(e) => updateFormModel(i, "name", e.target.value)}
                placeholder="Display Name"
                style={{ ...pixelInput, flex: 2, fontSize: "12px" }}
              />
              <input
                type="number"
                value={m.contextWindow ?? ""}
                onChange={(e) => updateFormModel(i, "contextWindow", parseInt(e.target.value, 10) || 0)}
                placeholder="ctx"
                style={{ ...pixelInput, flex: 1, fontSize: "12px" }}
              />
              {formModels.length > 1 && (
                <button
                  onClick={() => removeFormModel(i)}
                  style={{ ...pixelButton, fontSize: "11px", padding: "4px 8px", background: COLORS.error }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addFormModel}
            style={{ ...pixelButton, fontSize: "11px", padding: "5px 12px", background: COLORS.bgPanel, marginBottom: 12 }}
          >
            + Model
          </button>

          {/* Form actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 10 }}>
            <button
              onClick={() => { setShowAddForm(false); setFormAlias(""); setFormBaseUrl(""); setFormApiKey(""); setFormApiType("openai-chat"); setFormModels([emptyModelDef()]); }}
              style={{ ...pixelButton, fontSize: "12px", padding: "8px 14px", background: COLORS.bgPanel }}
            >
              Cancel
            </button>
            <button
              onClick={handleAddProvider}
              disabled={formSaving}
              style={{ ...pixelButton, fontSize: "12px", padding: "8px 14px" }}
            >
              {formSaving ? "Saving..." : "💾 Save Provider"}
            </button>
          </div>
        </div>
      )}

      {/* ═══ Built-in Provider Env Keys ═══ */}
      <SectionTitle>Built-in Provider Status</SectionTitle>
      {BUILTIN_PROVIDERS.map(({ name, envKey }) => {
        const value = envKeys[envKey];
        const configured = !!value;
        return (
          <div key={envKey} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "6px 0", borderBottom: `1px solid ${COLORS.inputBorder}`,
          }}>
            <span style={{ fontFamily: PIXEL_FONT, fontSize: "12px", color: COLORS.text, flex: 1 }}>
              {name}
            </span>
            <span style={{
              fontFamily: PIXEL_FONT, fontSize: "10px", color: COLORS.textDim,
            }}>
              {envKey}
            </span>
            <span style={{
              fontFamily: PIXEL_FONT, fontSize: "11px",
              color: configured ? COLORS.success : COLORS.textDim,
            }}>
              {configured ? `✅ ${maskApiKey(value)}` : "⚪ Not set"}
            </span>
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
          placeholder="18789" style={{ ...pixelInput, width: 140 }} />
      </SettingsField>

      <SettingsField label="Auth Token">
        <input type="password" value={gwToken} onChange={(e) => setGwToken(e.target.value)}
          placeholder="(optional)" style={pixelInput} />
      </SettingsField>

      <div style={{ marginTop: 16, display: "flex", gap: 10, justifyContent: "flex-end" }}>
        {saved && <span style={{ fontFamily: PIXEL_FONT, fontSize: "12px", color: COLORS.success, alignSelf: "center" }}>✅ Saved & Applied</span>}
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
    fontFamily: PIXEL_FONT, fontSize: "12px", color: COLORS.accent,
    marginTop: 16, marginBottom: 8, borderBottom: `1px solid ${COLORS.borderDim}`,
    paddingBottom: 4,
  }}>{children}</div>
);

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
    <span style={{ fontFamily: PIXEL_FONT, fontSize: "12px", color: COLORS.textDim }}>{label}</span>
    <span style={{
      fontFamily: PIXEL_FONT, fontSize: "12px", color: COLORS.text,
      maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    }}>{value}</span>
  </div>
);

const Dimmed: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontFamily: PIXEL_FONT, fontSize: "13px", color: COLORS.textDim, textAlign: "center", padding: 24 }}>
    {children}
  </div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <div style={{
    fontFamily: PIXEL_FONT, fontSize: "13px",
    color: status === "connected" ? COLORS.success : COLORS.error,
    padding: "8px 10px", background: "rgba(255,255,255,0.05)",
    border: `1px solid ${COLORS.inputBorder}`, marginBottom: 12,
  }}>
    {status === "connected" ? "🟢 Connected" : "🔴 Disconnected"}
  </div>
);

const ActionButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button onClick={onClick} style={{ ...pixelButton, fontSize: "12px", padding: "8px 14px" }}>
    {label}
  </button>
);

const SettingsField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontFamily: PIXEL_FONT, fontSize: "12px", color: COLORS.textDim, marginBottom: 4 }}>
      {label}
    </div>
    {children}
  </div>
);
