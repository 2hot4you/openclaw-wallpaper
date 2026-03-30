# OpenClaw Gateway Provider/Model RPC 接口调研

> 调研日期: 2026-03-30
> 调研者: Analyst
> 目标: 为 OpenClaw Wallpaper 的 Provider 管理功能提供接口参考

---

## 一、所有 Provider/Model 相关的 RPC 方法

### 1. `models.list` — 获取可用模型列表

| 属性 | 值 |
|------|-----|
| **方法名** | `models.list` |
| **Scope** | `operator.read` |
| **请求参数** | `{}` (空对象) |
| **响应格式** | `{ models: ModelChoice[] }` |

```typescript
interface ModelChoice {
  id: string;          // e.g. "ixiaozu/claude-opus-4-6", "anthropic/claude-sonnet-4-6"
  name: string;        // e.g. "claude-opus-4-6 (Custom Provider)"
  provider: string;    // e.g. "ixiaozu", "anthropic", "openai"
  contextWindow?: number; // e.g. 1000000
  reasoning?: boolean; // 是否支持 reasoning/thinking
}
```

**说明:** 这个方法返回 Gateway 当前可用的所有模型列表。模型来源于：
- openclaw.json 中 `models.providers.*` 配置的自定义 provider
- 内置 provider（通过环境变量认证的，如 ANTHROPIC_API_KEY, OPENAI_API_KEY 等）
- `models.mode: "merge"` 时合并内置和自定义

**壁纸已在用:** ✅ 已有 `fetchModels()` 方法

---

### 2. `config.get` — 获取完整配置

| 属性 | 值 |
|------|-----|
| **方法名** | `config.get` |
| **Scope** | `operator.read` |
| **请求参数** | `{}` (空对象) |
| **响应格式** | 见下 |

```typescript
interface ConfigGetResponse {
  raw: string;         // openclaw.json 的原始文本
  config: object;      // 解析后的配置对象
  hash: string;        // 用于 optimistic locking 的哈希
  path?: string;       // 配置文件路径
  valid?: boolean;     // 配置是否有效
  issues?: string[];   // 验证问题
}
```

**关键配置路径 — Provider 相关：**

```json5
{
  // 模型 Provider 配置
  "models": {
    "mode": "merge",   // "merge" | "replace" — 是否合并内置 provider
    "providers": {
      "<provider-alias>": {
        "baseUrl": "https://...",
        "apiKey": "sk-...",          // API Key（明文或 secret ref）
        "api": "anthropic-messages", // API 类型
        "models": [
          {
            "id": "claude-opus-4-6",
            "name": "claude-opus-4-6 (Custom Provider)",
            "reasoning": false,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 1000000,
            "maxTokens": 32768
          }
        ]
      }
    }
  },

  // 默认模型设置
  "agents": {
    "defaults": {
      "model": {
        "primary": "ixiaozu/claude-opus-4-6"  // 默认模型 ID
      },
      "models": {
        "ixiaozu/claude-opus-4-6": {
          // per-model params (thinking, fastMode, etc.)
        }
      }
    }
  },

  // 环境变量（某些 provider 通过 env 认证）
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-...",
    "OPENAI_API_KEY": "sk-...",
    "GEMINI_API_KEY": "...",
    "STITCH_API_KEY": "..."
    // 等等
  }
}
```

**壁纸已在用:** ✅ 已有 `fetchConfig()` 方法（但当前读的是 `raw.parsed`，实际应该读 `raw.config`）

---

### 3. `config.set` — 保存配置

| 属性 | 值 |
|------|-----|
| **方法名** | `config.set` |
| **Scope** | `operator.admin` |
| **请求参数** | `{ raw: string, baseHash?: string }` |
| **响应格式** | 同 `config.get` 响应 |

**说明:** `raw` 是整个 openclaw.json 的文本。`baseHash` 用于冲突检测（乐观锁）。

**壁纸已在用:** ⚠️ 有 `setConfig(path, value)` 但参数结构不对。`config.set` 接收整个 JSON 字符串，不是路径+值。

---

### 4. `config.apply` — 保存并热重载配置

| 属性 | 值 |
|------|-----|
| **方法名** | `config.apply` |
| **Scope** | `operator.admin` |
| **请求参数** | `{ raw: string, baseHash?: string, sessionKey?: string, note?: string, restartDelayMs?: number }` |
| **响应格式** | 操作结果 |

**说明:** 与 `config.set` 类似但会触发 Gateway 热重载。适用于改完 provider 配置后立即生效。

**壁纸已在用:** ⚠️ 有 `applyConfig()` 但参数结构不对（空参数调用）。

---

### 5. `config.patch` — 增量修改配置

| 属性 | 值 |
|------|-----|
| **方法名** | `config.patch` |
| **Scope** | `operator.admin` |
| **请求参数** | `{ raw: string, baseHash?: string, sessionKey?: string, note?: string, restartDelayMs?: number }` |
| **响应格式** | 操作结果 |

**说明:** 与 `config.apply` 参数相同。`raw` 是一个 JSON patch 或者部分配置。用于增量修改。

---

### 6. `config.schema` — 获取配置 JSON Schema

| 属性 | 值 |
|------|-----|
| **方法名** | `config.schema` |
| **Scope** | `operator.admin` (属于 config.* 前缀) |
| **请求参数** | `{}` |
| **响应格式** | `{ schema: object, uiHints: Record<string, UiHint>, version: string, generatedAt: string }` |

```typescript
interface ConfigUiHint {
  label?: string;
  help?: string;
  tags?: string[];
  group?: string;
  order?: number;
  advanced?: boolean;
  sensitive?: boolean;    // 标记为敏感字段（如 apiKey）
  placeholder?: string;
  itemTemplate?: unknown;
}
```

**说明:** 返回完整的配置 schema 和 UI hint，可以用来动态生成配置表单。`sensitive: true` 标记了需要隐藏的字段（如 API Key）。

---

### 7. `config.schema.lookup` — 查询特定配置路径的 Schema

| 属性 | 值 |
|------|-----|
| **方法名** | `config.schema.lookup` |
| **Scope** | `operator.read` |
| **请求参数** | `{ path: string }` (e.g. `"models.providers"`) |
| **响应格式** | 见下 |

```typescript
interface ConfigSchemaLookupResult {
  path: string;
  schema: object;       // 该路径的 JSON Schema
  hint?: ConfigUiHint;
  hintPath?: string;
  children: Array<{
    key: string;
    path: string;
    type?: string | string[];
    required: boolean;
    hasChildren: boolean;
    hint?: ConfigUiHint;
    hintPath?: string;
  }>;
}
```

**说明:** 用于逐层浏览配置结构。例如查 `models.providers` 可以得到所有已配置 provider 的子项。

---

### 8. `secrets.resolve` — 解析 Secret 引用

| 属性 | 值 |
|------|-----|
| **方法名** | `secrets.resolve` |
| **Scope** | `operator.admin` |
| **请求参数** | `{ commandName: string, targetIds: string[] }` |
| **响应格式** | `{ ok?: boolean, assignments?: Array<{ path?: string, pathSegments: string[], value: unknown }>, diagnostics?: string[], inactiveRefPaths?: string[] }` |

**说明:** 用于解析环境变量引用（如 `${ANTHROPIC_API_KEY}`）。Provider 配置可以用 secret ref 代替明文 API key。

---

### 9. `secrets.reload` — 重新加载 Secrets

| 属性 | 值 |
|------|-----|
| **方法名** | `secrets.reload` |
| **Scope** | `operator.admin` |

---

### 10. `skills.status` — 获取 Skills 状态（含 API Key 信息）

| 属性 | 值 |
|------|-----|
| **方法名** | `skills.status` |
| **Scope** | `operator.read` |
| **请求参数** | `{ agentId?: string }` |
| **响应格式** | Skills 状态报告（包含各 skill 的 apiKey 配置状态） |

---

### 11. `skills.update` — 更新 Skill 配置（含 API Key）

| 属性 | 值 |
|------|-----|
| **方法名** | `skills.update` |
| **Scope** | `operator.admin` |
| **请求参数** | `{ skillKey: string, enabled?: boolean, apiKey?: string, env?: Record<string, string> }` |

---

### 12. `health` — 获取 Gateway 健康状态（含 Provider 信息）

| 属性 | 值 |
|------|-----|
| **方法名** | `health` |
| **Scope** | `operator.read` |
| **请求参数** | `{}` |
| **响应格式** | 包含 agents、channels、默认模型等信息 |

---

### 13. 其他相关方法

| 方法名 | Scope | 说明 |
|--------|-------|------|
| `usage.status` | `operator.read` | Token 使用统计 |
| `usage.cost` | `operator.read` | 费用统计 |
| `sessions.usage` | `operator.read` | 按 session 统计使用量 |
| `tts.status` | `operator.read` | TTS Provider 状态 |
| `tts.providers` | `operator.read` | TTS Provider 列表 |
| `tts.setProvider` | `operator.write` | 设置 TTS Provider |
| `agents.update` | `operator.admin` | 更新 Agent（含 model 字段） |

---

## 二、Provider 配置在 openclaw.json 中的完整结构

```json5
{
  // ============ 模型 Provider 配置 ============
  "models": {
    "mode": "merge",    // "merge": 内置 + 自定义; "replace": 仅自定义
    "providers": {
      // 每个 key 是 provider alias（任意名称）
      "<alias>": {
        "baseUrl": "https://api.example.com",
        "apiKey": "sk-...",              // 明文 API Key
        // 或使用 Secret Ref:
        // "apiKey": { "source": "env", "provider": "alias", "id": "MY_API_KEY" }
        // "apiKey": { "source": "file", "provider": "alias", "id": "/path/to/key" }
        // "apiKey": { "source": "exec", "provider": "alias", "id": "command args" }
        "api": "openai-chat" | "anthropic-messages" | "...",
        "models": [
          {
            "id": "model-id",
            "name": "Display Name",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": {
              "input": 0,
              "output": 0,
              "cacheRead": 0,
              "cacheWrite": 0
            },
            "contextWindow": 128000,
            "maxTokens": 8192
          }
        ]
      }
    }
  },

  // ============ 默认模型与 Per-Model 参数 ============
  "agents": {
    "defaults": {
      "model": {
        "primary": "provider/model-id"     // 默认模型
      },
      "models": {
        "provider/model-id": {
          "params": {
            "thinking": "adaptive",
            "fastMode": true
          }
        }
      }
    }
  },

  // ============ 环境变量（内置 Provider 认证） ============
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-...",
    "OPENAI_API_KEY": "sk-...",
    "GEMINI_API_KEY": "...",
    "OPENROUTER_API_KEY": "...",
    // ...
  }
}
```

### 内置 Provider 的认证方式

| Provider | 环境变量 | 说明 |
|----------|----------|------|
| anthropic | `ANTHROPIC_API_KEY` | 或 setup-token / OAuth |
| openai | `OPENAI_API_KEY` | 或 Codex OAuth |
| google | `GEMINI_API_KEY` / `GOOGLE_API_KEY` | 或 OAuth |
| openrouter | `OPENROUTER_API_KEY` | |
| deepseek | `DEEPSEEK_API_KEY` | |
| groq | `GROQ_API_KEY` | |
| mistral | `MISTRAL_API_KEY` | |
| xai | `XAI_API_KEY` | |
| openai-codex | OAuth 认证 | ChatGPT subscription |
| google-gemini-cli | OAuth 认证 | Gemini CLI OAuth |

---

## 三、Secret Ref 体系

OpenClaw 支持三种 secret 引用方式，可以替代明文 API key：

```typescript
// 1. 环境变量引用
{ source: "env", provider: "alias", id: "VARIABLE_NAME" }

// 2. 文件引用
{ source: "file", provider: "alias", id: "/path/to/key/file" }

// 3. 命令执行引用
{ source: "exec", provider: "alias", id: "command to get key" }
```

---

## 四、壁纸 Scope 适配分析

当前壁纸连接使用的 scopes: `["operator.read", "operator.write"]`

| 操作 | 需要的 Scope | 当前是否满足 |
|------|-------------|-------------|
| 读取模型列表 | `operator.read` | ✅ |
| 读取配置 | `operator.read` | ✅ |
| 读取 config schema | `operator.admin` | ❌ 需要升级 |
| 修改配置 (config.set) | `operator.admin` | ❌ 需要升级 |
| 热重载配置 (config.apply) | `operator.admin` | ❌ 需要升级 |
| Skills 管理 | `operator.admin` | ❌ 需要升级 |

**结论:** Settings Modal 需要 `operator.admin` scope。需要在 `sendHandshake()` 中添加 `"operator.admin"` 到 scopes 数组。

---

## 五、Wallpaper Settings "Providers" Tab 实现方案

### 5.1 功能设计

**"Providers" Tab 展示内容：**

1. **当前默认模型** — 来自 `agents.defaults.model.primary`
2. **可用模型列表** — 来自 `models.list` RPC
3. **已配置的 Provider 列表** — 来自 `config.get` → `models.providers`
4. **环境变量 API Key 状态** — 来自 `config.get` → `env`

### 5.2 需要调用的 RPC

| 步骤 | RPC | 说明 |
|------|-----|------|
| 加载 Provider 数据 | `config.get` | 获取完整配置（含 providers、env、默认模型） |
| 加载可用模型 | `models.list` | 获取 Gateway 当前解析出的所有可用模型 |
| 修改默认模型 | `config.apply` | 修改 `agents.defaults.model.primary` |
| 修改 Provider API Key | `config.apply` | 修改 `models.providers.<alias>.apiKey` 或 `env.*` |
| 添加新 Provider | `config.apply` | 在 `models.providers` 中添加新项 |
| 删除 Provider | `config.apply` | 从 `models.providers` 中删除 |

### 5.3 配置读写流程

```
┌─────────────────────────────────────────────────┐
│ 1. 加载阶段                                      │
│                                                   │
│   config.get → 获取 { raw, config, hash }         │
│   models.list → 获取可用模型列表                    │
│                                                   │
│   从 config 中提取:                                │
│   - config.models.providers (自定义 provider 列表) │
│   - config.agents.defaults.model.primary (默认模型)│
│   - config.env (环境变量 API keys)                 │
├─────────────────────────────────────────────────┤
│ 2. 展示阶段                                      │
│                                                   │
│   Provider 列表:                                   │
│   ┌────────────────────────────────────────┐      │
│   │ ixiaozu (Custom)                       │      │
│   │ ├─ Base URL: https://model.ixiaozu.cn  │      │
│   │ ├─ API Key: sk-Pv••••••b              │      │
│   │ ├─ API: anthropic-messages             │      │
│   │ └─ Models: claude-opus-4-6             │      │
│   ├────────────────────────────────────────┤      │
│   │ anthropic (env: ANTHROPIC_API_KEY)     │      │
│   │ └─ Status: ✅ configured / ❌ missing  │      │
│   └────────────────────────────────────────┘      │
│                                                   │
│   默认模型下拉框:                                   │
│   [ixiaozu/claude-opus-4-6 ▼]                     │
├─────────────────────────────────────────────────┤
│ 3. 修改阶段                                      │
│                                                   │
│   用户修改 → 构造完整 JSON →                        │
│   config.apply({ raw, baseHash })                 │
│   → Gateway 热重载 → 刷新 UI                      │
└─────────────────────────────────────────────────┘
```

### 5.4 配置修改的正确方式

**重要:** `config.set` 和 `config.apply` 都接收 **完整的 JSON 字符串**，不是路径+值。修改流程是：

```typescript
// 1. 获取当前配置
const res = await client.call('config.get', {});
const config = res.config;    // 解析后的对象
const hash = res.hash;        // 用于冲突检测

// 2. 修改配置对象
config.agents.defaults.model.primary = 'anthropic/claude-sonnet-4-6';
// 或修改 provider:
config.models.providers.myProvider = {
  baseUrl: 'https://api.example.com',
  apiKey: 'sk-xxx',
  api: 'openai-chat',
  models: [{ id: 'gpt-4', name: 'GPT-4', contextWindow: 128000 }]
};

// 3. 序列化回 JSON 并保存+热重载
const raw = JSON.stringify(config, null, 2) + '\n';
await client.call('config.apply', { raw, baseHash: hash });

// 4. 刷新模型列表
const models = await client.call('models.list', {});
```

### 5.5 壁纸 GatewayClient 需要的改动

1. **升级 connect scopes:** 在 `sendHandshake()` 中将 scopes 改为 `["operator.read", "operator.write", "operator.admin"]`
2. **修复 `setConfig`:** 当前实现传的参数不对，需要改为整个 raw JSON
3. **修复 `applyConfig`:** 同上
4. **新增方法建议:**

```typescript
// gatewayStore 中需要新增的方法:

/** 获取完整配置（含 hash 和 raw） */
fetchConfigFull: async () => {
  const res = await client.call('config.get', {});
  return {
    config: res.config,
    raw: res.raw,
    hash: res.hash,
  };
},

/** 保存并热重载配置 */
applyConfigRaw: async (raw: string, baseHash: string) => {
  await client.call('config.apply', { raw, baseHash });
},

/** 修改默认模型 */
setDefaultModel: async (modelId: string) => {
  const { config, hash } = await fetchConfigFull();
  config.agents ??= {};
  config.agents.defaults ??= {};
  config.agents.defaults.model ??= {};
  config.agents.defaults.model.primary = modelId;
  const raw = JSON.stringify(config, null, 2) + '\n';
  await client.call('config.apply', { raw, baseHash: hash });
},

/** 获取 Provider 列表（从配置中提取） */
getProviders: async () => {
  const { config } = await fetchConfigFull();
  return {
    customProviders: config.models?.providers ?? {},
    envKeys: config.env ?? {},
    defaultModel: config.agents?.defaults?.model?.primary ?? '',
  };
},
```

### 5.6 UI 交互设计建议

```
┌─────── Settings ─────────────────────────────────┐
│ [General] [Providers] [Appearance]                │
│                                                   │
│ ═══ Default Model ═══════════════════════════     │
│ [ ixiaozu/claude-opus-4-6              ▼ ]       │
│                                                   │
│ ═══ Custom Providers ════════════════════════     │
│                                                   │
│ ┌─ ixiaozu ────────────────────────────────┐     │
│ │ Base URL: [https://model.ixiaozu.cn    ] │     │
│ │ API Key:  [••••••••••••••••   👁  ]      │     │
│ │ API Type: [anthropic-messages       ▼ ]  │     │
│ │ Models:   claude-opus-4-6                │     │
│ │                        [Edit] [Delete]   │     │
│ └──────────────────────────────────────────┘     │
│                                                   │
│ [+ Add Provider]                                  │
│                                                   │
│ ═══ Environment Keys ════════════════════════     │
│ STITCH_API_KEY: ••••••••   [Edit]                │
│                                                   │
│ [+ Add Environment Variable]                      │
│                                                   │
│                          [Cancel]  [Save & Apply] │
└───────────────────────────────────────────────────┘
```

### 5.7 注意事项

1. **API Key 安全:** 配置中的 apiKey 是明文存储的。UI 应该默认隐藏，只显示前4+后4字符。
2. **baseHash 乐观锁:** 每次修改必须传 baseHash，防止并发修改冲突。
3. **config.apply vs config.set:** 改完 provider 配置后用 `config.apply`（触发热重载），这样新 provider 的模型会立即出现在 `models.list` 中。
4. **Secret Ref:** 高级功能，壁纸 V1 可以只支持明文 apiKey 和 env 变量，暂不支持 file/exec ref。
5. **Scope 升级:** 壁纸需要 `operator.admin` scope 来修改配置。这需要 Gateway 的 token 有对应权限。

---

## 六、完整 RPC 方法 Scope 映射表（供参考）

### operator.read（只读）
```
health, doctor.memory.status, logs.tail, channels.status, status,
usage.status, usage.cost, tts.status, tts.providers,
models.list, tools.catalog,
agents.list, agent.identity.get, skills.status,
sessions.list, sessions.get, sessions.preview, sessions.resolve,
sessions.subscribe, sessions.unsubscribe,
sessions.messages.subscribe, sessions.messages.unsubscribe,
sessions.usage, sessions.usage.timeseries, sessions.usage.logs,
cron.list, cron.status, cron.runs,
gateway.identity.get, system-presence, last-heartbeat,
node.list, node.describe,
chat.history, config.get, config.schema.lookup,
talk.config, agents.files.list, agents.files.get
```

### operator.write（读写）
```
send, poll, agent, agent.wait, wake,
talk.mode, talk.speak, tts.enable, tts.disable, tts.convert, tts.setProvider,
voicewake.set, node.invoke,
chat.send, chat.abort,
sessions.create, sessions.send, sessions.steer, sessions.abort,
browser.request, push.test, node.pending.enqueue
```

### operator.admin（管理）
```
channels.logout,
agents.create, agents.update, agents.delete,
skills.install, skills.update, secrets.reload, secrets.resolve,
cron.add, cron.update, cron.remove, cron.run,
sessions.patch, sessions.reset, sessions.delete, sessions.compact,
connect, chat.inject,
web.login.start, web.login.wait,
set-heartbeats, system-event, agents.files.set

// 以及所有以下前缀的方法:
exec.approvals.*, config.*, wizard.*, update.*
```

---

## 七、实现优先级建议

| 优先级 | 功能 | 涉及 RPC | 复杂度 |
|--------|------|---------|--------|
| P0 | 显示当前默认模型 + 模型列表 | `config.get`, `models.list` | 低 |
| P0 | 切换默认模型 | `config.apply` | 中 |
| P1 | 显示已配置 Provider 列表 | `config.get` | 低 |
| P1 | 修改 Provider API Key | `config.apply` | 中 |
| P2 | 添加/删除自定义 Provider | `config.apply` | 中 |
| P2 | 管理环境变量 API Key | `config.apply` | 中 |
| P3 | Config Schema 动态表单 | `config.schema`, `config.schema.lookup` | 高 |
