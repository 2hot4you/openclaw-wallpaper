# Session/Agent 管理功能方案

> OpenClaw Wallpaper — PM 设计文档
> 日期: 2026-03-31

---

## 一、现状分析

### 当前问题

| # | 问题 | 影响 | 根因 |
|---|------|------|------|
| 1 | Subagent 不会过期 | 已完成的角色永远留在工位上，场景越来越拥挤 | `SessionMapper` 过滤了 `closed`/`archived` 和 7 天不活跃的 session，但 `done` 状态不在排除列表 |
| 2 | 显示 UUID | label 为空时 fallback 到 `Session ${key.slice(0,8)}`，用户看到一堆乱码 | 名称解析逻辑太简单，未充分利用 `agentId`/`kind`/`parentKey` 等字段 |
| 3 | 无法关闭 session | 只能看不能管，已完成的 session 积累越来越多 | 缺少管理交互入口 |
| 4 | 无法添加 agent | 没有创建新 session 的入口 | 缺少 agent 列表浏览和 session 创建流程 |

### 现有交互链路

```
点击角色 → InfoBubble (Phaser 世界内气泡)
         → AgentInfoPanel (React DOM，已有但未完全启用)
         → ChatPanel (右侧面板，支持聊天)
```

现有入口：
- **InfoBubble**: 显示名称、状态、model、tokens、时间、座位 — **只读**
- **ChatPanel**: 支持发消息、切模型 — **有交互但无管理**
- **SettingsModal**: 5 个 tab (Gateway/Models/Providers/Channels/Config) — **可扩展**

---

## 二、功能需求清单

### P0 — 必须做（核心体验修复）

| ID | 功能 | 描述 |
|----|------|------|
| P0-1 | **Done session 自动退场** | `done` 状态的 session 延迟 60s 后角色走向门口退场，从场景中移除 |
| P0-2 | **智能名称解析** | 优先级：`label` → `agent.name` → 从 `kind` 推断 → 从 `agentId` 提取可读部分 → `Session XXXX`（短 hash） |
| P0-3 | **关闭/删除 session** | 在 InfoBubble 中增加操作按钮，支持关闭角色 |
| P0-4 | **中止运行中的 session** | 在 InfoBubble 中对 working 状态的 session 显示中止按钮 |

### P1 — 应该做（管理能力完善）

| ID | 功能 | 描述 |
|----|------|------|
| P1-1 | **Session 列表面板** | SettingsModal 新增 "🤖 Agents" tab，列出所有 session 的详细信息和操作按钮 |
| P1-2 | **批量清理** | Session 列表中支持一键清理所有 done/error 状态的 session |
| P1-3 | **Session 状态映射优化** | 增加 `done` → "完成" 显示状态，`error` 角色头顶显示错误气泡 |
| P1-4 | **创建新 session** | 从 Agent 列表中选择 agent → 输入任务 → 创建 session → 角色从门口入场 |

### P2 — 可以做（体验增强）

| ID | 功能 | 描述 |
|----|------|------|
| P2-1 | **Agent 注册管理** | 查看/创建/删除已注册的 agent（`agents.*` RPC） |
| P2-2 | **Session 重置/压缩** | 支持 `sessions.reset` 和 `sessions.compact` |
| P2-3 | **退场动画增强** | done 的角色先播放"伸懒腰"emote，再走向门口；error 的角色头顶冒烟 |
| P2-4 | **快捷对话入口** | 双击角色直接打开 ChatPanel |
| P2-5 | **右键菜单** | 右键角色弹出像素风上下文菜单（Chat / Abort / Delete / Info） |

---

## 三、UI/交互方案

### 3.1 InfoBubble 增强（P0-3, P0-4）

在现有 InfoBubble 底部增加操作按钮行。按钮为像素风格小图标。

```
╭──────────────────────╮
│ 🤖 PM - 需求分析      │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
│ ⚡ Working             │
│ 🧠 claude-opus-4      │
│ 📊 12,345 tokens      │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
│ 🕐 2m ago             │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
│ [💬 Chat] [⏹ Stop]   │  ← 新增按钮行
│ [🗑 Delete]           │  ← idle/done/error 时显示
╰──▽───────────────────╯
```

**按钮逻辑：**

| 状态 | 可用按钮 |
|------|---------|
| working / running / busy | 💬 Chat, ⏹ Stop |
| idle | 💬 Chat, 🗑 Delete |
| done | 💬 Chat, 🗑 Delete |
| error | 💬 Chat, 🔄 Reset, 🗑 Delete |

**确认机制：**
- `Stop` 和 `Delete` 需要二次确认（按钮变为 "Sure?" 红色闪烁，2s 内再点一次执行）
- 这避免了弹出额外 modal，保持壁纸场景的沉浸感

### 3.2 Done Session 自动退场（P0-1）

```
Session status → "done"
       │
       ▼ (等待 60s)
角色头顶冒出 💤 emote
       │
       ▼ (等待 3s)
角色沿反向路线走向门口
       │
       ▼ (到达门口)
Sprite 销毁，释放工位

                        ┌─────────────┐
壁纸不调用 delete       │  Gateway 侧  │  session 依然存在于 sessions.list
SessionMapper 只需      │  保留 session │  但 wallpaper 不再显示
标记为 "退场中"          └─────────────┘
```

**实现要点：**
- `SessionMapper` 增加 `done` 到 `"departing"` 的状态映射（60s 延迟）
- `AgentManager.syncWithSessions()` 检测 `departing` 状态 → 触发退场动画
- 退场后从 `agents` Map 中移除，下次 sync 不再匹配
- **不自动调用 `sessions.delete`** — 仅从视觉上移除，session 记录由用户手动管理

### 3.3 智能名称解析（P0-2）

改进 `SessionMapper.mapSessionsToAgents()` 中的名称解析：

```typescript
function resolveDisplayName(session: SessionData, agent?: AgentData): string {
  // 1. 优先使用 label
  if (session.label) {
    // 去掉常见前缀 "PM - ", "Frontend - " 等，保留简短名
    return session.label;
  }

  // 2. 使用 agent 的注册名
  if (agent?.name) return agent.name;

  // 3. 从 kind 推断
  if (session.kind === "subagent") return "Subagent";
  if (session.kind === "acp") return "Coder";

  // 4. 从 agentId 提取可读部分
  if (session.agentId) {
    // "agent:orchestrator:subagent:uuid" → "subagent"
    const parts = session.agentId.split(":");
    const readable = parts.find(p =>
      !p.match(/^[0-9a-f]{8}-/) && p !== "agent" && p.length > 2
    );
    if (readable) return capitalize(readable);
  }

  // 5. 从 session key 提取
  // "agent:orchestrator:discord:channel:123" → "discord"
  const keyParts = session.key.split(":");
  const meaningful = keyParts.find(p =>
    !p.match(/^[0-9a-f]{8}-/) && !p.match(/^\d+$/) && p !== "agent" && p.length > 2
  );
  if (meaningful) return capitalize(meaningful);

  // 6. 最终 fallback: 短 hash
  return `Agent ${session.key.slice(-6)}`;
}
```

### 3.4 Session 列表面板 — SettingsModal 新 Tab（P1-1）

在 SettingsModal 中增加 "🤖 Sessions" tab：

```
┌──────────────────────────────────────────────────┐
│ 🦞 OpenClaw Control Panel                    [✕] │
├──────────────────────────────────────────────────┤
│ 🔌Gateway │ 🧠Models │ 🔑Providers │ 📡Channels │
│ ⚙️Config  │ 🤖Sessions │                         │
├──────────────────────────────────────────────────┤
│                                                  │
│  Actions                                         │
│  [🧹 Clean Done] [🗑 Clean All Inactive]         │
│                                                  │
│  ─── Active (3) ─────────────────────────────    │
│  ┌────────────────────────────────────────┐      │
│  │ ⚡ PM - 需求分析                        │      │
│  │    🧠 claude-opus-4 · 📊 12K tokens    │      │
│  │    🕐 2m ago                            │      │
│  │              [💬 Chat] [⏹ Stop]        │      │
│  └────────────────────────────────────────┘      │
│  ┌────────────────────────────────────────┐      │
│  │ ⚡ Frontend - UI 开发                   │      │
│  │    🧠 claude-sonnet · 📊 8K tokens     │      │
│  │    🕐 5m ago                            │      │
│  │              [💬 Chat] [⏹ Stop]        │      │
│  └────────────────────────────────────────┘      │
│                                                  │
│  ─── Idle (2) ───────────────────────────────    │
│  ┌────────────────────────────────────────┐      │
│  │ 💤 Orchestrator                         │      │
│  │    🧠 claude-opus-4 · 📊 45K tokens    │      │
│  │    🕐 1h ago                            │      │
│  │              [💬 Chat] [🗑 Delete]      │      │
│  └────────────────────────────────────────┘      │
│                                                  │
│  ─── Done (5) ───────────────────────────────    │
│  ┌────────────────────────────────────────┐      │
│  │ ✅ QA - 测试用例    ⚠️ 已退场           │      │
│  │    🕐 2h ago                            │      │
│  │                             [🗑 Delete] │      │
│  └────────────────────────────────────────┘      │
│  ... (可折叠)                                    │
│                                                  │
│  ─── + New Session ──────────────────────────    │
│  [选择 Agent ▼] [输入任务...        ] [▶ Run]   │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 3.5 新建 Session 流程（P1-4）

```
用户点击 "+ New Session"
       │
       ▼
选择 Agent (dropdown, 来自 agents.list)
  ├─ 已有 agent → 直接选择
  └─ 使用默认 agent (default)
       │
       ▼
输入任务描述 (textarea)
       │
       ▼
点击 "▶ Run"
       │
       ▼
RPC: sessions.create → 获取 session key
RPC: sessions.send  → 发送任务消息
       │
       ▼
新 session 出现在 sessions.list
AgentManager 检测到新 session → 角色从门口入场
```

**内联 UI（嵌入 Sessions tab 底部）：**

```
┌─────────────────────────────────────────────┐
│  + New Session                              │
│                                             │
│  Agent:  [orchestrator        ▼]            │
│  Task:   [                          ]       │
│          [                          ]       │
│          [                          ]       │
│                                             │
│                          [Cancel] [▶ Run]   │
└─────────────────────────────────────────────┘
```

### 3.6 交互设计总结

| 功能 | 入口位置 | 理由 |
|------|---------|------|
| 查看 session 信息 | 点击角色 → InfoBubble | 已有，直觉 |
| 快捷操作 (Stop/Delete) | InfoBubble 底部按钮 | 就近操作，不打断场景 |
| 打开聊天 | InfoBubble "Chat" 按钮 | 已有流程，扩展入口 |
| Session 列表 + 批量管理 | SettingsModal → Sessions tab | 全局视图，适合批量操作 |
| 创建新 session | SettingsModal → Sessions tab 底部 | 需要选 agent + 输入任务，需要表单空间 |
| Agent 注册管理 | SettingsModal → Sessions tab 顶部 | P2，低频操作 |

**为什么不用右键菜单？**
- 壁纸模式下右键可能被系统拦截
- 像素风格的右键菜单实现成本高
- InfoBubble 已经承担了"选中后操作"的角色
- P2 可以考虑作为增强

---

## 四、需要调用的 RPC 列表

| RPC 方法 | 用途 | 优先级 | 调用时机 |
|----------|------|--------|---------|
| `sessions.list` | 获取所有 session | P0 | 已有，轮询 |
| `sessions.delete` | 删除 session | P0 | 用户点击 Delete |
| `sessions.abort` | 中止运行中的 session | P0 | 用户点击 Stop |
| `agents.list` | 获取已注册 agent 列表 | P1 | Sessions tab 打开时、创建 session 时 |
| `sessions.create` | 创建新 session | P1 | 用户提交新任务 |
| `sessions.send` | 发送消息到 session | P1 | 创建后发送初始任务（或已有 `chat.send`） |
| `sessions.reset` | 重置 session 历史 | P2 | 用户点击 Reset |
| `sessions.compact` | 压缩 session 历史 | P2 | 用户点击 Compact |
| `agents.create` | 创建 agent | P2 | Agent 管理 |
| `agents.delete` | 删除 agent | P2 | Agent 管理 |
| `agents.update` | 更新 agent 配置 | P2 | Agent 管理 |

---

## 五、实现步骤

### Phase 1: P0 — 核心修复（预计 2-3 天）

#### Step 1.1: Done Session 自动退场
- **文件**: `SessionMapper.ts`, `AgentManager.ts`
- **改动**:
  1. `SessionMapper` 新增 `"departing"` 状态：`done` 且 `updatedAt` 超过 60s → 不再映射为 character
  2. `AgentManager.syncWithSessions()` 中检测 session 消失 → 调用现有 `despawn()` 退场逻辑（已实现）
  3. 实际上现有代码已经对消失的 session 做了退场 (`releaseAgent` + `agent.despawn()`)，只需要 **SessionMapper 开始过滤 done 的 session** 即可

```typescript
// SessionMapper.ts — 新增过滤规则
const DONE_DEPARTURE_MS = 60_000; // 60s after done → filter out

// 在 filter 逻辑中加入:
if (session.status === "done" && session.updatedAt) {
  const age = Date.now() - session.updatedAt;
  if (age > DONE_DEPARTURE_MS) continue; // 过滤掉，触发退场
}
```

#### Step 1.2: 智能名称解析
- **文件**: `SessionMapper.ts`
- **改动**: 替换 `name` 解析逻辑为 `resolveDisplayName()` 函数（见 3.3 节）

#### Step 1.3: InfoBubble 操作按钮
- **文件**: `InfoBubble.ts`, `AgentManager.ts`
- **改动**:
  1. `InfoBubble` 底部增加可点击的文字按钮（Phaser Text + setInteractive）
  2. 增加 `onAction` 回调：`(sessionKey: string, action: "chat" | "stop" | "delete") => void`
  3. `AgentManager` 连接 `onAction`，调用 `GatewayClient.call()` 执行 RPC
  4. 二次确认逻辑：按钮文字变 "Sure?"，500ms 后恢复

#### Step 1.4: GatewayStore 新增 RPC 方法
- **文件**: `gatewayStore.ts`
- **改动**:
  ```typescript
  // 新增方法
  deleteSession: async (sessionKey: string) => Promise<boolean>
  abortSession: async (sessionKey: string) => Promise<boolean>
  ```
- **实现**: 调用 `client.call("sessions.delete", { key: sessionKey })` 等

### Phase 2: P1 — Sessions Tab（预计 3-4 天）

#### Step 2.1: Sessions Tab 组件
- **文件**: 新建 `SettingsModal.tsx` 内 `SessionsTab` 组件（或拆分文件）
- **改动**:
  1. SettingsModal tabs 数组增加 `{ id: "sessions", label: "🤖 Sessions" }`
  2. 实现 `SessionsTab` 组件：
     - 分组显示 (Active / Idle / Done / Error)
     - 每个 session 卡片显示名称、状态、model、tokens、时间
     - 操作按钮 (Chat / Stop / Delete)
  3. 批量清理按钮 (Clean Done / Clean All Inactive)

#### Step 2.2: 创建 Session 表单
- **文件**: `SettingsModal.tsx` 内 SessionsTab
- **改动**:
  1. 打开 tab 时调用 `agents.list` 获取可用 agent
  2. Agent dropdown + 任务输入框 + Run 按钮
  3. 点击 Run → 调用 `sessions.create` + `sessions.send`
  4. 成功后刷新 session 列表

#### Step 2.3: GatewayStore 扩展
- **文件**: `gatewayStore.ts`
- **改动**:
  ```typescript
  // 新增
  createSession: async (agentId: string, task: string) => Promise<string | null>
  fetchAgentsList: async () => Promise<AgentData[]>  // 已有 refreshAgents，可复用
  batchDeleteSessions: async (keys: string[]) => Promise<number>
  ```

#### Step 2.4: 状态映射优化
- **文件**: `SessionMapper.ts`, `AgentSprite.ts`
- **改动**:
  1. `CharacterAnimState` 增加 `"done"` 状态
  2. `done` 角色切换到 idle 动画 + 头顶显示 ✅ emote
  3. `error` 角色头顶显示 ❌ emote

### Phase 3: P2 — 增强（按需）

- Step 3.1: Agent 注册管理 UI
- Step 3.2: sessions.reset / sessions.compact 按钮
- Step 3.3: 退场动画增强（emote → walk out）
- Step 3.4: 双击打开 ChatPanel
- Step 3.5: 右键上下文菜单

---

## 六、数据流变更

### 变更前

```
sessions.list → SessionMapper (filter+map) → MappedCharacter[]
                                                    │
                                     AgentManager.syncWithSessions()
                                                    │
                                          AgentSprite 增删改
```

### 变更后

```
sessions.list → SessionMapper (filter+map+智能名称+done退场)
                         │
                         ▼
                  MappedCharacter[] (增加 departing 状态)
                         │
          AgentManager.syncWithSessions()
                         │
                 AgentSprite 增删改 + 退场动画
                         │
InfoBubble ← 点击        │
  │ onAction ─────────→ GatewayStore
  │                        │
  │                  sessions.delete / sessions.abort
  │                        │
  └─────────────────→ 刷新 sessions.list
```

---

## 七、风险与注意事项

| 风险 | 缓解方案 |
|------|---------|
| `sessions.delete` RPC 可能需要特定参数格式 | 先用 GatewayClient 手动测试 RPC 格式 |
| InfoBubble 中的 Phaser 交互按钮可能不稳定 | 备选方案：用 DOM overlay（React）代替 Phaser 文字按钮 |
| 批量删除可能触发 Gateway 限流 | 串行执行，每次间隔 200ms |
| `sessions.create` 的参数格式未知 | 需要从 Gateway 源码确认 `create` 的 params schema |
| 壁纸模式下 SettingsModal 可能无法使用 | 已有 SettingsModal 在壁纸模式下通过 StatusBar 齿轮图标打开，可行 |

---

## 八、验收标准

### P0 验收
- [ ] Done 状态的 session 在 60s 后角色自动走向门口退场
- [ ] 所有 session 显示可读名称，无 UUID 显示
- [ ] 点击角色 → InfoBubble 底部出现 Chat/Stop/Delete 按钮
- [ ] Stop 按钮可中止 working 状态的 session
- [ ] Delete 按钮可删除 session，角色退场

### P1 验收
- [ ] SettingsModal 出现 Sessions tab
- [ ] Sessions tab 正确分组显示所有 session
- [ ] 批量清理功能可用
- [ ] 可以选择 agent、输入任务、创建新 session
- [ ] 新 session 创建后角色从门口入场
