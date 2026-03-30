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
- **每工位独立路线系统** — 角色从门口沿 Tiled 中预设的 waypoint 路径走到各自工位
- **Main Agent（老板）** 从门口走到专属工位，工作时坐工位，空闲时走到沙发休息
- **Subagent** 从门口沿路线走到分配的工位，Gateway 关闭时播放消失动画
- 工作状态：快速输入动画 + 微小上下浮动 + ⚡ emote
- 空闲状态：💤 emote
- 错误状态：红色闪烁 + ❌ emote

### 🖥️ 桌面壁纸模式（Windows）
- **WorkerW 嵌入** — 窗口嵌入桌面图标下方，桌面图标完整可见
- **全局鼠标 Hook** — WH_MOUSE_LL 捕获鼠标事件并转发到壁纸窗口（Lively Wallpaper 技术）
- 桌面聚焦时可交互（点击角色、聊天面板等）
- 托盘一键切换壁纸模式 ↔ 窗口模式

### 💬 交互系统
- **漫画对话气泡** — 点击角色弹出气泡，显示名称、状态、模型、token 用量
- **聊天面板** — 右侧浮动面板（不压缩场景），Markdown 渲染，与 Agent 实时对话
- **模型切换** — 聊天面板内可切换 AI 模型
- **状态 Emote 气泡** — 角色头顶状态图标
- **POI 交互** — 点击白板打开控制面板

### 🔌 Gateway 集成
- **WebSocket JSON-RPC v3** 连接 OpenClaw Gateway
- **Token + Device Token 双重认证**（自动从 `~/.openclaw/` 读取）
- **实时 Session 状态同步**（3 秒轮询 + 事件推送）
- **隐藏 Shell** — 内置常驻 cmd.exe 管道（Windows），所有命令零 CMD 弹窗
- **Gateway 自动启动** — 应用启动时自动检测并启动 Gateway
- **Stop 防重连** — 关闭 Gateway 时立即断开 WebSocket + 15 秒防重连保护
- 自动重连（指数退避 1s → 30s）
- 离线模式：暗色遮罩 + "OpenClaw Offline" 提示

### 🔧 系统管理
- **自定义窗口标题栏** — 无原生边框，像素风半透明标题栏（hover 显示）
- **窗口控制** — 最小化 / 全屏 / 关闭，关闭时弹出确认框（同步关闭 Gateway）
- **系统托盘** — 启动/停止/重启 Gateway、壁纸模式切换、开机自启
- **控制面板** — Gateway 健康检查、Provider 管理、模型切换、配置编辑
- **Provider 管理** — 添加/删除 AI Provider，管理 API Key 和模型列表

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
| 壁纸嵌入 | [tauri-plugin-wallpaper](https://github.com/meslzy/tauri-plugin-wallpaper) v3（Windows） |
| 2D 游戏引擎 | [Phaser 3](https://phaser.io/) |
| 前端框架 | React 19 + TypeScript |
| 状态管理 | [Zustand](https://github.com/pmndrs/zustand) 5 |
| 通信协议 | OpenClaw Gateway WebSocket JSON-RPC v3 |
| 地图编辑 | [Tiled](https://www.mapeditor.org/) tilemap（JSON 格式） |
| 像素素材 | [Agent Town](https://limezu.itch.io/) (MIT) |
| Markdown | react-markdown |
| Win32 API | [windows](https://crates.io/crates/windows) crate（鼠标 Hook、进程管理） |
| 构建工具 | Vite 7 + pnpm |

## 📁 项目结构

```
src/                              # 前端（React + TypeScript）
├── main.tsx                      # React 入口
├── App.tsx                       # 应用路由
├── game/                         # Phaser 3 游戏层
│   ├── GameManager.ts            # 游戏引擎入口
│   ├── scenes/
│   │   ├── BootScene.ts          # 资源预加载
│   │   └── OfficeScene.ts        # 办公室主场景
│   ├── characters/
│   │   ├── AgentManager.ts       # 角色管理（每工位路线、spawn/despawn）
│   │   └── AgentSprite.ts        # 角色实体（动画、移动、交互）
│   ├── config/
│   │   ├── animations.ts         # spritesheet 帧配置
│   │   └── emotes.ts             # emote 气泡配置
│   └── ui/                       # Phaser UI 组件
├── windows/main/
│   ├── MainWindow.tsx            # 主窗口
│   ├── ChatPanel.tsx             # 聊天面板（浮动 overlay）
│   ├── AgentInfoPanel.tsx        # 角色信息气泡
│   ├── SettingsModal.tsx         # 控制面板（Gateway/Provider/Config）
│   └── PixelWindowControls.tsx   # 自定义窗口标题栏 + 关闭确认
├── gateway/                      # Gateway 通信层
├── stores/                       # Zustand 状态管理
├── styles/pixel-theme.ts         # 像素风 UI 主题
└── utils/tauri-ipc.ts            # Tauri IPC 封装

src-tauri/                        # Tauri 后端（Rust）
├── src/
│   ├── lib.rs                    # App builder + Gateway 自动启动
│   ├── tray.rs                   # 系统托盘（含壁纸模式切换）
│   ├── hidden_shell.rs           # 常驻隐藏 cmd.exe（零弹窗命令执行）
│   ├── mouse_hook.rs             # 全局鼠标 Hook（壁纸模式交互）
│   └── commands/
│       ├── openclaw.rs           # Gateway 管理（schtasks 直启 + 隐藏 Shell）
│       └── wallpaper.rs          # 壁纸模式（WorkerW attach + 鼠标 Hook）
├── Cargo.toml
└── tauri.conf.json

public/maps/office2.json          # Tiled 地图（含工位、waypoints、POI）
```

## 🗺️ Tilemap 路线系统

角色进出办公室沿预设的 waypoint 路径行走，在 Tiled 的 `spawns` 层配置：

### Spawn 点命名规则

| 名称 | 用途 |
|------|------|
| `door` | 角色进出门口位置 |
| `Main_work_right` | Boss 工位 |
| `Main_rest_face` | Boss 休息位（pois 层） |
| `subagent_face#N` | Subagent 朝下工位 |
| `subagent_back#N` | Subagent 朝上工位 |
| `subagent_waypoint_#N` | 路径点（按编号排序） |

### 路线表

```
上层工位:
  face#1: door → #1 → #3 → #4 → seat
  face#2: door → #1 → #3 → #5 → seat
  face#3: door → #1 → #3 → #6 → seat

下层工位:
  back#1: door → #2 → #7 → #8 → seat
  back#2: door → #2 → #7 → #9 → seat
  back#3: door → #2 → #7 → #10 → seat

Boss:
  work: door → #2 → #7 → #10 → #11 → #12 → #13 → #14 → seat
  rest: door → #2 → #7 → #10 → #11 → #12 → #15 → #16 → sofa
```

## 📝 文档

- [产品需求文档 (PRD)](./prd.md)
- [技术架构设计](./architecture.md)
- [可行性调研报告](./research/feasibility-report.md)

## 🙏 致谢

- **[Agent Town](https://limezu.itch.io/)** — 像素办公室素材（MIT 授权）
- **[Phaser 3](https://phaser.io/)** — 2D 游戏引擎
- **[Tauri](https://tauri.app/)** — 桌面应用框架
- **[OpenClaw](https://github.com/nicepkg/openclaw)** — AI Agent 编排平台
- **[ClawX](https://github.com/ValueCell-ai/ClawX)** — 参考其 windowsHide 进程管理方案

## License

MIT
