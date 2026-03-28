# 🦞 OpenClaw Wallpaper

像素风 RPG 办公室场景的桌面应用，实时可视化和管理 [OpenClaw](https://github.com/nicepkg/openclaw) AI Agents。

![Status](https://img.shields.io/badge/status-MVP-brightgreen)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20(dev)-blue)
![License](https://img.shields.io/badge/license-MIT-green)

> Agent 们在像素办公室里忙碌工作——你在桌面上就能看到。

## ✨ 功能特性

### 🎮 像素 RPG 办公室场景
- **Phaser 3 + Tiled tilemap** 渲染，48×48 像素网格
- Agent Town 像素素材（MIT 授权），包含办公桌、沙发、白板等场景元素
- 多层 tilemap 渲染（floor → walls → ground → furniture → objects → props → overhead）
- 摄像机自动缩放适配屏幕分辨率

### 🤖 Agent 角色系统
- **7 套预制角色** spritesheet（48×96 像素，每方向 6 帧）
- 四方向行走动画 + 空闲动画
- **Main Agent（老板）** 固定在专属工位，工作时坐工位，空闲时去沙发休息
- **Subagent** 从入口走进场景，分配到空闲工位，离开时走回入口并消失
- Pop-in 出现动画 / 淡出消失动画
- 工作状态：快速输入动画 + 微小上下浮动
- 错误状态：红色闪烁提示

### 💬 交互系统
- **漫画对话气泡信息面板** — 点击角色弹出像素风气泡，显示名称、状态、模型、token 用量
- **聊天面板** — 右侧滑出面板，支持 Markdown 渲染（代码块、表格、列表等），与 Agent 实时对话
- **状态 Emote 气泡** — 角色头顶显示状态图标（⚡工作中 / 💤空闲 / ❌错误）
- **POI 交互** — 点击白板打开控制面板

### 🔌 Gateway 集成
- **WebSocket JSON-RPC** 连接 OpenClaw Gateway（协议 v3）
- **Token + Device Token 双重认证**（自动从 `~/.openclaw/` 读取）
- **实时 Session 状态同步**（3 秒轮询 + 事件推送）
- 自动重连（指数退避 1s → 30s）
- 离线模式：暗色遮罩 + "OpenClaw Offline" 提示

### 🔧 系统管理
- **系统托盘** — 启动/停止/重启 Gateway、刷新状态、开机自启
- **自动启动 Gateway** — 应用启动时检测 Gateway 状态，未运行则自动启动（Windows 使用 VBS 隐藏执行）
- **控制面板** — Gateway 健康检查、通道状态、模型列表、配置管理

## 🚀 快速开始

### 前置条件

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/) (stable)
- [Tauri v2 系统依赖](https://v2.tauri.app/start/prerequisites/)
- [OpenClaw](https://github.com/nicepkg/openclaw) 已安装并配置

### 安装

```bash
git clone https://github.com/2hot4you/openclaw-wallpaper.git
cd openclaw-wallpaper
pnpm install
```

### 开发运行

```bash
# 启动 Tauri 开发模式（独立窗口）
pnpm tauri dev
```

应用启动后会自动检测并连接本地 OpenClaw Gateway（`ws://127.0.0.1:18789`）。

### 构建

```bash
pnpm tauri build
```

## 🛠️ 技术栈

| 组件 | 技术 |
|------|------|
| 桌面壳 | [Tauri v2](https://v2.tauri.app/) (Rust) |
| 2D 游戏引擎 | [Phaser 3](https://phaser.io/) |
| 前端框架 | React 19 + TypeScript |
| 状态管理 | [Zustand](https://github.com/pmndrs/zustand) 5 |
| 通信协议 | OpenClaw Gateway WebSocket JSON-RPC v3 |
| 地图编辑 | [Tiled](https://www.mapeditor.org/) tilemap（JSON 格式） |
| 像素素材 | [Agent Town](https://limezu.itch.io/) (MIT) |
| Markdown | react-markdown |
| 构建工具 | Vite 7 + pnpm |

## 📁 项目结构

```
src/                              # 前端（React + TypeScript）
├── main.tsx                      # React 入口
├── App.tsx                       # 应用路由（按窗口 label 分流）
├── game/                         # Phaser 3 游戏层
│   ├── GameManager.ts            # 游戏引擎入口（初始化、生命周期管理）
│   ├── scenes/
│   │   ├── BootScene.ts          # 资源预加载（tilemap、spritesheet、emote）
│   │   └── OfficeScene.ts        # 办公室主场景（tilemap 渲染、摄像机、spawn 点解析）
│   ├── characters/
│   │   ├── AgentManager.ts       # 角色管理器（session→角色同步、工位分配、boss/subagent 逻辑）
│   │   └── AgentSprite.ts        # 单个角色（sprite 动画、移动、emote、点击交互）
│   ├── config/
│   │   ├── animations.ts         # spritesheet 帧配置（48×96，行走/空闲动画）
│   │   └── emotes.ts             # emote 气泡配置（状态→动画映射）
│   └── ui/
│       ├── InfoBubble.ts         # Phaser 原生信息气泡（世界坐标）
│       ├── EmoteBubble.ts        # emote 气泡组件
│       ├── StatusBar.ts          # 底部状态栏
│       └── POIInteraction.ts     # POI 点击交互区域
├── windows/
│   └── main/
│       ├── MainWindow.tsx        # 主窗口（Phaser 容器 + Gateway 连接 + 事件同步）
│       ├── ChatPanel.tsx         # 聊天侧边栏（Markdown 渲染、消息收发）
│       ├── AgentInfoPanel.tsx    # 漫画气泡信息面板（React overlay）
│       └── SettingsModal.tsx     # 控制面板（Gateway 管理、模型、配置）
├── gateway/
│   ├── GatewayClient.ts          # WebSocket JSON-RPC 客户端
│   ├── SessionMapper.ts          # Session→角色数据映射（过滤 + 状态转换）
│   ├── types.ts                  # 类型定义
│   └── index.ts
├── stores/
│   ├── gatewayStore.ts           # Gateway 状态（连接、sessions、agents、聊天、配置）
│   └── appStore.ts               # 应用状态（选中角色、聊天面板、设置面板）
├── styles/
│   └── pixel-theme.ts            # 像素风 UI 主题（颜色、字体、组件样式）
├── hooks/
│   └── useWindowLabel.ts         # 窗口类型检测
└── utils/
    ├── constants.ts              # 常量
    └── tauri-ipc.ts              # Tauri IPC 命令封装

src-tauri/                        # Tauri 后端（Rust）
├── src/
│   ├── main.rs                   # 入口
│   ├── lib.rs                    # App builder（插件注册、自动启动 Gateway）
│   ├── tray.rs                   # 系统托盘（状态显示、启停控制、开机自启）
│   └── commands/
│       ├── mod.rs
│       └── openclaw.rs           # IPC 命令（健康检查、启停 Gateway、读取 token、VBS 隐藏执行）
├── Cargo.toml
└── tauri.conf.json

public/                           # 静态资源
├── maps/
│   └── office2.json              # Tiled tilemap（办公室场景）
├── characters/
│   └── Premade_Character_48x48_*.png  # 7 套角色 spritesheet
├── sprites/
│   └── emotes_48x48.png          # emote 气泡 spritesheet
└── tilesets/
    └── *.png                     # Agent Town tileset 图片
```

## ⚙️ 配置说明

### OpenClaw Gateway 连接

应用自动连接本地 Gateway（`ws://127.0.0.1:18789`）。认证 token 从以下路径自动读取：

| Token | 路径 |
|-------|------|
| Gateway Token | `~/.openclaw/openclaw.json` → `gateway.auth.token` |
| Device Token | `~/.openclaw/identity/device-auth.json` → `tokens.operator.token` |

如果 Gateway 未运行，应用启动时会自动尝试启动（`openclaw gateway start`）。

### Tilemap 配置

地图文件位于 `public/maps/office2.json`，使用 [Tiled](https://www.mapeditor.org/) 编辑。

**关键层：**
- `floor` / `walls` / `ground` / `furniture` / `objects` — Tile 层
- `props` / `props-over` — Tile Object 层
- `overhead` — 覆盖在角色上方的层
- `spawns` — 角色工位坐标（Object 层，支持 `facing` 属性）
- `pois` — POI 交互点（Object 层）

**Spawn 点命名规则：**
- `Main_work_right` — 老板工位（facing right）
- `Main_rest_face` — 老板休息位（POI 层，facing down）
- `subagent_face#N` / `subagent_back#N` — Subagent 工位

## 🎨 开发指南

### 修改场景

1. 用 Tiled 打开 `public/maps/office2.json`
2. 编辑 tile 层或添加新的 tileset
3. 在 `spawns` 层添加新的工位点（设置 `facing` 属性为 `up`/`down`/`left`/`right`）
4. 保存为 JSON 格式

### 添加角色

1. 将 48×96 的 spritesheet PNG 放入 `public/characters/`
2. 在 `src/game/config/animations.ts` 的 `CHARACTER_SPRITES` 数组中添加条目
3. Spritesheet 布局要求：Row 1 = idle（每方向 6 帧），Row 2 = walk（每方向 6 帧）

### 添加 Emote

1. emote spritesheet 位于 `public/sprites/emotes_48x48.png`（48×48 网格）
2. 在 `src/game/config/emotes.ts` 中添加 `EmoteDef` 和 `STATUS_EMOTE_MAP` 映射

### 架构要点

- **Phaser 与 React 分层**：Phaser Canvas 全屏铺底，React DOM 覆盖其上（`pointer-events: none` 基态）
- **Zustand 桥接**：Phaser 通过 `getState()` 直接读取 store，React 通过 hooks 响应式更新
- **Gateway 事件驱动**：WebSocket 事件 → Zustand store 更新 → AgentManager 同步角色

## 📝 文档

- [产品需求文档 (PRD)](./prd.md)
- [技术架构设计](./architecture.md)
- [可行性调研报告](./research/feasibility-report.md)

## 🙏 致谢

- **[Agent Town](https://limezu.itch.io/)** — 像素办公室素材（MIT 授权），提供了完整的 48×48 tileset 和角色 spritesheet
- **[Phaser 3](https://phaser.io/)** — 强大的 2D 游戏引擎
- **[Tauri](https://tauri.app/)** — 轻量级桌面应用框架
- **[OpenClaw](https://github.com/nicepkg/openclaw)** — AI Agent 编排平台

## License

MIT
