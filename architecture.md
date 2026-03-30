# OpenClaw Wallpaper — 技术架构设计

> 版本：v0.3  
> 作者：Architect  
> 日期：2026-03-27（实现变更记录：2026-03-31）  
> 状态：MVP + Sprint 2 完成  
> 依据：[PRD v0.2](./prd.md) · [可行性调研](./research/feasibility-report.md)

---

## 实际技术选型变更

> 以下记录开发过程中相对原始架构设计的关键技术变更。

### 核心变更：PixiJS → Phaser 3

| 项目 | 原始设计 | 实际实现 | 变更原因 |
|------|----------|----------|----------|
| **2D 渲染引擎** | PixiJS v8 | **Phaser 3.87** | Phaser 提供完整游戏开发框架：tilemap 加载与渲染、spritesheet 动画管理、tween 系统、场景生命周期、摄像机系统——减少手写基础设施代码量 |
| **Tilemap** | 自行实现分层渲染 | **Phaser Tilemap + Tiled JSON** | Phaser 原生支持 Tiled 格式，自动处理 tileset 映射、多层渲染、object layer 解析 |
| **角色动画** | AnimatedSprite + 自定义状态机 | **Phaser Sprite + Anims + Tween** | Phaser 内置动画系统（帧动画 + tween 插值），不需要手写 AnimationStateMachine 类 |
| **性能控制** | 自定义 PerformanceController | **Phaser Scale Manager + 默认帧率** | 暂未实现自适应帧率策略，使用 Phaser 默认行为 |

### 资源规格变更

| 项目 | 原始设计 | 实际实现 |
|------|----------|----------|
| Tile 尺寸 | 32×32 px | **48×48 px**（Agent Town 素材原生规格） |
| 角色尺寸 | 32×48 px | **48×96 px**（Agent Town 预制角色规格） |
| 颜色差异化 | 调色板交换（Palette Swap）+ shader | **7 套独立预制角色 spritesheet**（每套独立配色） |
| 素材来源 | 自行绘制或 AI 生成 | **Agent Town 素材包（MIT 授权）** |

### 架构层级变更

| 模块 | 原始设计 | 实际实现 |
|------|----------|----------|
| SceneManager | 自定义类管理 PixiJS Application | **GameManager** 管理 Phaser.Game 实例 |
| BaseScene + WorkshopScene | 自定义场景基类 + 分层 Layer 类 | **BootScene（预加载）+ OfficeScene（主场景）**，Phaser 原生 Scene 管理 |
| 渲染层级（6 层 Layer 类） | SkyLayer / BackgroundLayer / ... | **Tilemap 多图层 + setDepth()**，无独立 Layer 类 |
| AgentCharacterManager | 基于 Zustand subscribe 的响应式同步 | **AgentManager**，由 MainWindow useEffect 主动调用 `syncWithSessions()` |
| AgentCharacter | PixiJS Container + AnimatedSprite | **AgentSprite**，Phaser Sprite + Text + Emote Sprite |
| AnimationStateMachine | 独立类，枚举状态转换 | **内联在 AgentSprite 中**，通过 `playStatusAnim()` / `setStatus()` 管理 |
| PaletteSwap | ColorMatrixFilter | **已移除**，使用独立 spritesheet 天然配色 |
| 对话窗口 | 独立 Tauri 窗口 (WebviewWindowBuilder) | **ChatPanel 侧边栏**（同一窗口内的 React 组件） |
| 壁纸嵌入 | tauri-plugin-wallpaper 集成 | **未集成**，当前仅窗口模式 |

### Gateway 通信变更

| 项目 | 原始设计 | 实际实现 |
|------|----------|----------|
| 协议 | JSON-RPC 2.0（标准格式） | **OpenClaw Gateway 自定义帧格式**（`{type:"req"/"res"/"event", ...}`） |
| 认证 | 单 token | **Token + Device Token 双重认证**（从 openclaw.json + device-auth.json 读取） |
| 状态同步 | WebSocket 事件驱动 | **3 秒轮询 sessions.list + 事件推送 + Optimistic 更新** |
| 握手 | `connect` 方法 | `connect` 方法（协议 v3，含 client/role/scopes/auth/caps） |

### 新增模块（原始设计未包含）

| 模块 | 说明 |
|------|------|
| `BootScene` | Phaser 资源预加载场景，支持进度条 |
| `InfoBubble` | Phaser 原生世界坐标信息气泡（非 React） |
| `EmoteBubble` | Emote 动画气泡组件 |
| `StatusBar` | 底部状态栏（连接状态 + 文字） |
| `POIInteraction` | 场景 POI 点击交互区域 |
| `SettingsModal` | 控制面板（Gateway/Provider/Models/Config 四标签页） |
| `pixel-theme.ts` | 像素风 UI 主题系统 |
| `hidden_shell.rs` | **Sprint 2** 常驻隐藏 cmd.exe 管道（CREATE_NO_WINDOW），零弹窗命令执行 |
| `mouse_hook.rs` | **Sprint 2** WH_MOUSE_LL 全局鼠标 Hook，WorkerW 壁纸模式交互 |
| `wallpaper.rs` | **Sprint 2** 壁纸模式管理（WorkerW attach/detach + Hook 启停） |
| `PixelWindowControls.tsx` | **Sprint 2** 自定义窗口标题栏 + 像素风关闭确认弹框 |
| 每工位路线系统 | **Sprint 2** AgentManager 硬编码路线表 + Tiled waypoint 解析 |
| Gateway 直启 | **Sprint 2** 从 schtasks XML 提取 node.exe 命令直接启动（绕过 schtasks 弹窗） |

---

## 目录

1. [项目目录结构](#1-项目目录结构)
2. [技术架构设计](#2-技术架构设计)
3. [Tauri 后端设计（Rust）](#3-tauri-后端设计rust)
4. [前端架构设计（React + PixiJS）](#4-前端架构设计react--pixijs)
5. [Gateway WebSocket 客户端封装](#5-gateway-websocket-客户端封装)
6. [多窗口设计](#6-多窗口设计)
7. [性能策略设计](#7-性能策略设计)
8. [开发与构建](#8-开发与构建)
9. [关键接口定义](#9-关键接口定义)

---

## 1. 项目目录结构

```
openclaw-wallpaper/
├── src-tauri/                          # Tauri Rust 后端
│   ├── Cargo.toml                      # Rust 依赖
│   ├── tauri.conf.json                 # Tauri 配置（窗口、权限、打包）
│   ├── capabilities/                   # Tauri v2 capability 权限声明
│   │   └── default.json
│   ├── icons/                          # 应用图标（系统托盘 + 安装包）
│   │   ├── icon.ico
│   │   ├── icon.png
│   │   └── tray-icon.png
│   ├── src/
│   │   ├── main.rs                     # 入口
│   │   ├── lib.rs                      # Tauri app builder & plugin 注册
│   │   ├── commands/                   # IPC 命令（#[tauri::command]）
│   │   │   ├── mod.rs
│   │   │   ├── wallpaper.rs            # 壁纸模式 attach/detach
│   │   │   ├── openclaw.rs             # OpenClaw 进程管理
│   │   │   └── window.rs              # 窗口管理（创建对话窗口等）
│   │   ├── tray.rs                     # 系统托盘逻辑
│   │   └── state.rs                    # 应用全局状态（Mutex<AppState>）
│   └── build.rs
│
├── src/                                # 前端源码（React + TypeScript）
│   ├── main.tsx                        # React 入口（挂载到 #root）
│   ├── App.tsx                         # 顶层 App 路由（按窗口 label 分流）
│   │
│   ├── windows/                        # 按窗口组织的页面入口
│   │   ├── main/                       # 主窗口（壁纸/独立窗口场景）
│   │   │   ├── MainWindow.tsx
│   │   │   └── index.ts
│   │   └── chat/                       # 对话窗口
│   │       ├── ChatWindow.tsx
│   │       └── index.ts
│   │
│   ├── pixi/                           # PixiJS 场景层（独立于 React DOM）
│   │   ├── engine/                     # 渲染引擎核心
│   │   │   ├── SceneManager.ts         # 场景管理器（初始化、生命周期、帧循环）
│   │   │   ├── PerformanceController.ts# 帧率控制、可见性检测
│   │   │   └── AssetLoader.ts          # 资源加载与缓存
│   │   ├── scenes/                     # 具体场景
│   │   │   ├── WorkshopScene.ts        # MVP 默认场景（AI 工作坊）
│   │   │   └── BaseScene.ts            # 场景基类
│   │   ├── characters/                 # 角色系统
│   │   │   ├── AgentCharacterManager.ts# 角色管理器（创建/销毁/状态映射）
│   │   │   ├── AgentCharacter.ts       # 单个角色实例（Sprite + 动画状态机）
│   │   │   ├── AnimationStateMachine.ts# 动画状态机
│   │   │   └── PaletteSwap.ts          # 调色板交换（颜色差异化）
│   │   ├── layers/                     # 渲染层
│   │   │   ├── SkyLayer.ts             # 天空背景
│   │   │   ├── BackgroundLayer.ts      # 远景 + 建筑
│   │   │   ├── GroundLayer.ts          # 地面装饰
│   │   │   ├── CharacterLayer.ts       # 角色层
│   │   │   ├── EffectLayer.ts          # 粒子特效
│   │   │   └── UIOverlayLayer.ts       # PixiJS 侧 UI（气泡、名称标签）
│   │   └── ui/                         # PixiJS 内 UI 组件
│   │       ├── ChatBubble.ts           # 对话气泡（P2）
│   │       ├── NameTag.ts              # 角色名称标签
│   │       └── StatusIndicator.ts      # 状态指示器
│   │
│   ├── components/                     # React UI 组件
│   │   ├── InfoPanel/                  # Agent 信息面板（HTML overlay）
│   │   │   ├── InfoPanel.tsx
│   │   │   └── InfoPanel.css
│   │   ├── ChatView/                   # 对话窗口 UI
│   │   │   ├── ChatView.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   └── ChatInput.tsx
│   │   └── Settings/                   # 设置面板（P2）
│   │       └── SettingsPanel.tsx
│   │
│   ├── gateway/                        # OpenClaw Gateway 通信层
│   │   ├── GatewayClient.ts            # WebSocket JSON-RPC 客户端
│   │   ├── GatewayTypes.ts             # RPC 请求/响应类型定义
│   │   ├── GatewayEvents.ts            # 广播事件类型 & EventEmitter
│   │   └── SessionMapper.ts            # Session → 角色数据映射
│   │
│   ├── stores/                         # Zustand 状态管理
│   │   ├── useGatewayStore.ts          # Gateway 连接状态、sessions、agents
│   │   ├── useSceneStore.ts            # 场景状态（当前场景、角色位置）
│   │   ├── useAppStore.ts              # 应用状态（模式、设置、OpenClaw 在线）
│   │   └── useChatStore.ts             # 对话状态（当前对话 session、消息列表）
│   │
│   ├── hooks/                          # React Hooks
│   │   ├── useGateway.ts               # Gateway 连接生命周期
│   │   ├── useTauriIPC.ts              # Tauri invoke/event 封装
│   │   └── useWindowLabel.ts           # 获取当前窗口 label
│   │
│   ├── ipc/                            # Tauri IPC 类型化封装
│   │   └── commands.ts                 # invoke 包装函数 + 类型
│   │
│   ├── utils/                          # 工具函数
│   │   ├── constants.ts                # 常量（端口、帧率、尺寸）
│   │   └── logger.ts                   # 前端日志
│   │
│   └── assets/                         # 静态资源
│       ├── sprites/                    # Spritesheet JSON + PNG
│       │   ├── characters/             # 角色动画帧
│       │   │   ├── agent-base.json     # TexturePacker 导出的 Spritesheet JSON
│       │   │   └── agent-base.png      # 合并的 Spritesheet 图片
│       │   └── scene/                  # 场景元素
│       │       ├── buildings.json
│       │       ├── buildings.png
│       │       ├── ground.json
│       │       ├── ground.png
│       │       ├── sky.png
│       │       └── effects.json
│       ├── palettes/                   # 调色板配置
│       │   ├── blue.json
│       │   ├── green.json
│       │   ├── red.json
│       │   └── purple.json
│       ├── fonts/                      # 像素字体
│       │   └── pixel-font.fnt
│       └── ui/                         # React UI 资源
│           └── pixel-border.png
│
├── index.html                          # Vite 入口 HTML
├── vite.config.ts                      # Vite 配置
├── tsconfig.json                       # TypeScript 配置
├── package.json
├── pnpm-lock.yaml
└── README.md
```

---

## 2. 技术架构设计

### 2.1 分层架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                        系统托盘 (Tray)                            │
│              模式切换 · OpenClaw 启停 · 退出                      │
└──────────┬───────────────────────────────────────────────────────┘
           │
┌──────────▼───────────────────────────────────────────────────────┐
│                   Tauri Rust 后端 (System Layer)                  │
│                                                                   │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │ Wallpaper       │  │ OpenClaw Process  │  │ Window         │  │
│  │ Controller      │  │ Manager           │  │ Manager        │  │
│  │                 │  │                   │  │                │  │
│  │ • attach()      │  │ • detect()        │  │ • create_chat()│  │
│  │ • detach()      │  │ • start()         │  │ • close_chat() │  │
│  │ • is_attached() │  │ • stop()          │  │ • toggle_mode()│  │
│  └─────────────────┘  │ • health_check()  │  └────────────────┘  │
│                        └──────────────────┘                       │
│  IPC Bridge ←──────── Tauri invoke / event ──────────→ Frontend  │
└──────────────────────────────────────────────────────────────────┘
                              │ WebView2
┌─────────────────────────────▼────────────────────────────────────┐
│                     Frontend (Presentation Layer)                 │
│                                                                   │
│  ┌─ PixiJS Scene (Canvas) ─────────────────────────────────────┐ │
│  │                                                              │ │
│  │   Sky → Background → Ground → Characters → Effects → UI     │ │
│  │                                                              │ │
│  │   SceneManager ← PerformanceController                      │ │
│  │   AgentCharacterManager ← AnimationStateMachine             │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─ React DOM (HTML overlay) ──────────────────────────────────┐ │
│  │                                                              │ │
│  │   InfoPanel (弹出式，点击角色时显示)                          │ │
│  │   SettingsPanel (P2)                                         │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─ State Layer (Zustand) ─────────────────────────────────────┐ │
│  │  GatewayStore · SceneStore · AppStore · ChatStore           │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────────┐
│                  Data Layer (Gateway Communication)               │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  GatewayClient (WebSocket JSON-RPC)                         │ │
│  │                                                              │ │
│  │  • connect 握手 (auth token, role, scopes)                  │ │
│  │  • RPC: sessions.list / sessions.get / agents.list / ...    │ │
│  │  • Events: chat / agent / presence / health / shutdown      │ │
│  │  • 自动重连 (指数退避)                                       │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  SessionMapper                                               │ │
│  │                                                              │ │
│  │  Session + Agent → CharacterData (动画状态、位置、颜色)      │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
                              │ ws://127.0.0.1:18789
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                              │
│            WebSocket JSON-RPC · HTTP health endpoints             │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 模块职责总表

| 层级 | 模块 | 职责 |
|------|------|------|
| **System** | Wallpaper Controller | 调用 tauri-plugin-wallpaper 管理壁纸模式 attach/detach |
| **System** | OpenClaw Process Manager | 检测/启动/停止 OpenClaw Gateway 进程 |
| **System** | Window Manager | 创建/关闭对话窗口，主窗口模式切换 |
| **System** | Tray | 系统托盘菜单、状态指示 |
| **Presentation** | SceneManager | PixiJS Application 生命周期、场景切换、帧循环 |
| **Presentation** | PerformanceController | 帧率调控、可见性检测、暂停/恢复渲染 |
| **Presentation** | AgentCharacterManager | 角色的创建/销毁/状态同步 |
| **Presentation** | Layers (Sky/BG/Ground/Char/Effect/UI) | 各渲染层的内容管理 |
| **Presentation** | React InfoPanel / ChatView | HTML overlay UI（信息面板、对话窗口） |
| **State** | Zustand Stores | 全局状态管理，连接 Data → Presentation |
| **Data** | GatewayClient | WebSocket JSON-RPC 封装、连接管理 |
| **Data** | SessionMapper | Session/Agent 原始数据 → 角色表现数据 |

### 2.3 数据流向

```
Gateway WS Event (chat / agent / presence)
  │
  ▼
GatewayClient.onEvent() — 解析 JSON-RPC notification
  │
  ▼
GatewayStore.updateSessions() — Zustand 状态更新
  │
  ▼
SessionMapper.map() — Session → CharacterData (状态、颜色、名称)
  │
  ▼
SceneStore.syncCharacters() — 场景角色列表更新
  │
  ├──→ AgentCharacterManager — PixiJS 角色 Sprite 创建/销毁/动画切换
  │
  └──→ React InfoPanel (re-render) — 如果面板正在显示该角色
```

---

## 3. Tauri 后端设计（Rust）

### 3.1 tauri-plugin-wallpaper 集成

**插件注册（`lib.rs`）：**

```rust
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_wallpaper::init())
        .invoke_handler(tauri::generate_handler![
            commands::wallpaper::attach_wallpaper,
            commands::wallpaper::detach_wallpaper,
            commands::wallpaper::is_wallpaper_attached,
            commands::openclaw::detect_openclaw,
            commands::openclaw::start_openclaw,
            commands::openclaw::stop_openclaw,
            commands::window::open_chat_window,
            commands::window::close_chat_window,
        ])
        .setup(|app| {
            // 初始化系统托盘
            tray::create_tray(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**壁纸命令（`commands/wallpaper.rs`）：**

```rust
use tauri::AppHandle;
use tauri_plugin_wallpaper::WallpaperExt;

#[tauri::command]
pub async fn attach_wallpaper(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main")
        .ok_or("Main window not found")?;
    // tauri-plugin-wallpaper v3: attach 将窗口嵌入 WorkerW 层
    window.wallpaper().attach().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn detach_wallpaper(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main")
        .ok_or("Main window not found")?;
    window.wallpaper().detach().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn is_wallpaper_attached(app: AppHandle) -> Result<bool, String> {
    let state = app.state::<crate::state::AppState>();
    Ok(state.wallpaper_attached.lock().unwrap().clone())
}
```

**平台条件编译**：壁纸嵌入只在 Windows 上生效，Mac 上 `attach` 是 no-op，始终以独立窗口模式运行。

```rust
#[tauri::command]
pub async fn attach_wallpaper(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let window = app.get_webview_window("main")
            .ok_or("Main window not found")?;
        window.wallpaper().attach().map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Mac/Linux: 壁纸模式不可用，保持窗口模式
        return Err("Wallpaper mode is only available on Windows".into());
    }
    Ok(())
}
```

### 3.2 OpenClaw 进程管理

**设计原则：** 不修改 OpenClaw 任何配置文件，只管理 Gateway 进程的生命周期。

**`commands/openclaw.rs`：**

```rust
use std::process::Command;

/// 检测 OpenClaw Gateway 是否在运行
/// 优先通过 HTTP 健康检查，fallback 到进程列表检查
#[tauri::command]
pub async fn detect_openclaw(port: Option<u16>) -> Result<OpenClawStatus, String> {
    let port = port.unwrap_or(18789);

    // 方式 1: HTTP 健康检查（最可靠）
    let url = format!("http://127.0.0.1:{}/health", port);
    match reqwest::get(&url).await {
        Ok(resp) if resp.status().is_success() => {
            return Ok(OpenClawStatus::Online { port });
        }
        _ => {}
    }

    // 方式 2: 检查进程
    // 通过 `openclaw gateway status` 命令
    match Command::new("openclaw").args(["gateway", "status"]).output() {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if stdout.contains("running") || stdout.contains("live") {
                return Ok(OpenClawStatus::Online { port });
            }
        }
        _ => {}
    }

    Ok(OpenClawStatus::Offline)
}

/// 启动 OpenClaw Gateway
#[tauri::command]
pub async fn start_openclaw() -> Result<(), String> {
    Command::new("openclaw")
        .args(["gateway", "start"])
        .spawn()
        .map_err(|e| format!("Failed to start OpenClaw: {}", e))?;
    Ok(())
}

/// 停止 OpenClaw Gateway
#[tauri::command]
pub async fn stop_openclaw() -> Result<(), String> {
    Command::new("openclaw")
        .args(["gateway", "stop"])
        .output()
        .map_err(|e| format!("Failed to stop OpenClaw: {}", e))?;
    Ok(())
}

#[derive(serde::Serialize)]
pub enum OpenClawStatus {
    Online { port: u16 },
    Offline,
}
```

### 3.3 系统托盘

**`tray.rs`：**

```rust
use tauri::{
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    menu::{MenuBuilder, MenuItemBuilder},
    App, Manager,
};

pub fn create_tray(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let toggle_mode = MenuItemBuilder::with_id("toggle_mode", "切换为窗口模式").build(app)?;
    let start_oc = MenuItemBuilder::with_id("start_openclaw", "启动 OpenClaw").build(app)?;
    let stop_oc = MenuItemBuilder::with_id("stop_openclaw", "停止 OpenClaw").build(app)?;
    let settings = MenuItemBuilder::with_id("settings", "设置").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&toggle_mode)
        .separator()
        .item(&start_oc)
        .item(&stop_oc)
        .separator()
        .item(&settings)
        .item(&quit)
        .build()?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(move |app, event| {
            match event.id().as_ref() {
                "toggle_mode" => {
                    // 通过 event 通知前端切换模式
                    app.emit("tray://toggle-mode", ()).ok();
                }
                "start_openclaw" => {
                    app.emit("tray://start-openclaw", ()).ok();
                }
                "stop_openclaw" => {
                    app.emit("tray://stop-openclaw", ()).ok();
                }
                "quit" => {
                    // 先 detach 壁纸，再退出
                    app.emit("tray://before-quit", ()).ok();
                    // 给前端 500ms 做清理，然后退出
                    std::thread::spawn({
                        let app = app.clone();
                        move || {
                            std::thread::sleep(std::time::Duration::from_millis(500));
                            app.exit(0);
                        }
                    });
                }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}
```

**托盘状态动态更新**：前端通过 Tauri event 通知 Rust 侧更新托盘菜单文字（如 "🟢 OpenClaw: Running" / "🔴 OpenClaw: Offline"）。

### 3.4 IPC 命令完整定义

| 命令 | 方向 | 参数 | 返回 | 说明 |
|------|------|------|------|------|
| `attach_wallpaper` | Frontend → Rust | — | `Result<(), String>` | 壁纸模式 attach |
| `detach_wallpaper` | Frontend → Rust | — | `Result<(), String>` | 壁纸模式 detach |
| `is_wallpaper_attached` | Frontend → Rust | — | `Result<bool, String>` | 查询当前壁纸状态 |
| `detect_openclaw` | Frontend → Rust | `port?: u16` | `Result<OpenClawStatus, String>` | 检测 Gateway |
| `start_openclaw` | Frontend → Rust | — | `Result<(), String>` | 启动 Gateway |
| `stop_openclaw` | Frontend → Rust | — | `Result<(), String>` | 停止 Gateway |
| `open_chat_window` | Frontend → Rust | `sessionKey: string` | `Result<(), String>` | 打开对话窗口 |
| `close_chat_window` | Frontend → Rust | — | `Result<(), String>` | 关闭对话窗口 |

| 事件 | 方向 | Payload | 说明 |
|------|------|---------|------|
| `tray://toggle-mode` | Rust → Frontend | — | 托盘点击切换模式 |
| `tray://start-openclaw` | Rust → Frontend | — | 托盘点击启动 OC |
| `tray://stop-openclaw` | Rust → Frontend | — | 托盘点击停止 OC |
| `tray://before-quit` | Rust → Frontend | — | 退出前通知（前端做 detach 清理） |
| `wallpaper://mode-changed` | Frontend → Rust | `{ attached: bool }` | 前端通知 Rust 模式已切换（更新托盘文字） |

### 3.5 全局状态

```rust
// state.rs
use std::sync::Mutex;

pub struct AppState {
    pub wallpaper_attached: Mutex<bool>,
    pub openclaw_online: Mutex<bool>,
    pub gateway_port: Mutex<u16>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            wallpaper_attached: Mutex::new(false),
            openclaw_online: Mutex::new(false),
            gateway_port: Mutex::new(18789),
        }
    }
}
```

---

## 4. 前端架构设计（React + PixiJS）

### 4.1 核心设计原则

**React 与 PixiJS 严格分层，不混合 DOM 和 Canvas。**

- **PixiJS Canvas** — 全屏铺底，渲染场景、角色、特效、名称标签
- **React DOM** — 覆盖在 Canvas 之上（`pointer-events: none` 基态），只在需要时显示 HTML UI
- 两层通过 **Zustand Store** 共享状态，互不直接引用

```
┌──── HTML 结构 ─────────────────────────────────┐
│ <div id="root">                                 │
│   <canvas id="pixi-canvas" />   ← PixiJS 渲染  │
│   <div id="react-overlay">      ← React UI     │
│     <InfoPanel />  (pointer-events: auto)       │
│   </div>                                        │
│ </div>                                          │
└─────────────────────────────────────────────────┘
```

### 4.2 状态管理（Zustand）

选择 Zustand 理由：轻量（<1KB）、无 Provider 包裹、支持 React 外访问（PixiJS 可直接 `getState()`）。

#### `useAppStore.ts` — 应用全局状态

```typescript
import { create } from 'zustand';

interface AppState {
  // 壁纸模式
  wallpaperAttached: boolean;
  setWallpaperAttached: (attached: boolean) => void;

  // OpenClaw 状态
  openclawOnline: boolean;
  setOpenclawOnline: (online: boolean) => void;

  // 当前选中的角色（用于 InfoPanel）
  selectedCharacterId: string | null;
  setSelectedCharacterId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  wallpaperAttached: false,
  setWallpaperAttached: (attached) => set({ wallpaperAttached: attached }),

  openclawOnline: false,
  setOpenclawOnline: (online) => set({ openclawOnline: online }),

  selectedCharacterId: null,
  setSelectedCharacterId: (id) => set({ selectedCharacterId: id }),
}));
```

#### `useGatewayStore.ts` — Gateway 数据

```typescript
import { create } from 'zustand';
import type { SessionData, AgentData } from '../gateway/GatewayTypes';

interface GatewayState {
  // 连接状态
  connected: boolean;
  setConnected: (c: boolean) => void;

  // Sessions
  sessions: Map<string, SessionData>;
  setSessions: (sessions: Map<string, SessionData>) => void;
  updateSession: (key: string, data: Partial<SessionData>) => void;
  removeSession: (key: string) => void;

  // Agents
  agents: Map<string, AgentData>;
  setAgents: (agents: Map<string, AgentData>) => void;
}

export const useGatewayStore = create<GatewayState>((set, get) => ({
  connected: false,
  setConnected: (c) => set({ connected: c }),

  sessions: new Map(),
  setSessions: (sessions) => set({ sessions }),
  updateSession: (key, data) => {
    const sessions = new Map(get().sessions);
    const existing = sessions.get(key);
    if (existing) {
      sessions.set(key, { ...existing, ...data });
    } else {
      sessions.set(key, data as SessionData);
    }
    set({ sessions });
  },
  removeSession: (key) => {
    const sessions = new Map(get().sessions);
    sessions.delete(key);
    set({ sessions });
  },

  agents: new Map(),
  setAgents: (agents) => set({ agents }),
}));
```

#### `useSceneStore.ts` — 场景状态

```typescript
import { create } from 'zustand';
import type { CharacterData } from '../pixi/characters/AgentCharacterManager';

interface SceneState {
  // 当前场景中的角色数据（从 SessionMapper 派生）
  characters: Map<string, CharacterData>;
  setCharacters: (chars: Map<string, CharacterData>) => void;

  // 场景是否暂停
  paused: boolean;
  setPaused: (p: boolean) => void;

  // 当前帧率
  currentFps: number;
  setCurrentFps: (fps: number) => void;
}

export const useSceneStore = create<SceneState>((set) => ({
  characters: new Map(),
  setCharacters: (chars) => set({ characters: chars }),

  paused: false,
  setPaused: (p) => set({ paused: p }),

  currentFps: 15,
  setCurrentFps: (fps) => set({ currentFps: fps }),
}));
```

#### `useChatStore.ts` — 对话状态

```typescript
import { create } from 'zustand';
import type { ChatMessage } from '../gateway/GatewayTypes';

interface ChatState {
  // 当前对话的 session key
  activeSessionKey: string | null;
  setActiveSessionKey: (key: string | null) => void;

  // 消息列表
  messages: ChatMessage[];
  setMessages: (msgs: ChatMessage[]) => void;
  appendMessage: (msg: ChatMessage) => void;

  // 流式回复的当前 buffer
  streamingContent: string;
  setStreamingContent: (content: string) => void;

  // 发送状态
  sending: boolean;
  setSending: (s: boolean) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  activeSessionKey: null,
  setActiveSessionKey: (key) => set({ activeSessionKey: key }),

  messages: [],
  setMessages: (msgs) => set({ messages: msgs }),
  appendMessage: (msg) => set({ messages: [...get().messages, msg] }),

  streamingContent: '',
  setStreamingContent: (content) => set({ streamingContent: content }),

  sending: false,
  setSending: (s) => set({ sending: s }),
}));
```

### 4.3 SceneManager 设计

SceneManager 是 PixiJS 的核心入口，负责整个 Canvas 的生命周期。

```typescript
// pixi/engine/SceneManager.ts
import { Application, Container } from 'pixi.js';
import { PerformanceController } from './PerformanceController';
import { AssetLoader } from './AssetLoader';
import { BaseScene } from '../scenes/BaseScene';
import { WorkshopScene } from '../scenes/WorkshopScene';

export class SceneManager {
  private app: Application;
  private performanceCtrl: PerformanceController;
  private assetLoader: AssetLoader;
  private currentScene: BaseScene | null = null;

  constructor() {
    this.app = new Application();
    this.performanceCtrl = new PerformanceController(this.app);
    this.assetLoader = new AssetLoader();
  }

  /**
   * 初始化 PixiJS Application 并挂载到指定 canvas 元素
   */
  async init(canvas: HTMLCanvasElement): Promise<void> {
    await this.app.init({
      canvas,
      resizeTo: window,
      backgroundAlpha: 0,       // 透明背景（壁纸模式需要）
      antialias: false,         // 像素风关闭抗锯齿
      resolution: 1,            // 像素风使用 1x 分辨率
      autoDensity: true,
      preference: 'webgl',      // WebView2 中优先 WebGL（WebGPU 支持待验证）
    });

    // 初始化性能控制器
    this.performanceCtrl.init();

    // 预加载所有资源
    await this.assetLoader.loadAll();

    // 加载默认场景
    await this.loadScene(new WorkshopScene(this.app, this.assetLoader));
  }

  /**
   * 切换场景
   */
  async loadScene(scene: BaseScene): Promise<void> {
    if (this.currentScene) {
      this.currentScene.destroy();
      this.app.stage.removeChildren();
    }
    this.currentScene = scene;
    await scene.init();
    this.app.stage.addChild(scene.container);
  }

  /**
   * 获取当前场景（供 AgentCharacterManager 使用）
   */
  getScene(): BaseScene | null {
    return this.currentScene;
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.performanceCtrl.destroy();
    this.currentScene?.destroy();
    this.app.destroy(true);
  }
}
```

**BaseScene 基类：**

```typescript
// pixi/scenes/BaseScene.ts
import { Container, Application } from 'pixi.js';
import { AssetLoader } from '../engine/AssetLoader';
import { SkyLayer } from '../layers/SkyLayer';
import { BackgroundLayer } from '../layers/BackgroundLayer';
import { GroundLayer } from '../layers/GroundLayer';
import { CharacterLayer } from '../layers/CharacterLayer';
import { EffectLayer } from '../layers/EffectLayer';
import { UIOverlayLayer } from '../layers/UIOverlayLayer';

export abstract class BaseScene {
  public container: Container;
  protected app: Application;
  protected assetLoader: AssetLoader;

  // 渲染层（按 z-order 从底到顶）
  protected skyLayer: SkyLayer;
  protected backgroundLayer: BackgroundLayer;
  protected groundLayer: GroundLayer;
  protected characterLayer: CharacterLayer;
  protected effectLayer: EffectLayer;
  protected uiOverlayLayer: UIOverlayLayer;

  constructor(app: Application, assetLoader: AssetLoader) {
    this.app = app;
    this.assetLoader = assetLoader;
    this.container = new Container();

    this.skyLayer = new SkyLayer();
    this.backgroundLayer = new BackgroundLayer();
    this.groundLayer = new GroundLayer();
    this.characterLayer = new CharacterLayer();
    this.effectLayer = new EffectLayer();
    this.uiOverlayLayer = new UIOverlayLayer();
  }

  async init(): Promise<void> {
    // 按顺序添加层（先添加的在底部）
    this.container.addChild(this.skyLayer.container);
    this.container.addChild(this.backgroundLayer.container);
    this.container.addChild(this.groundLayer.container);
    this.container.addChild(this.characterLayer.container);
    this.container.addChild(this.effectLayer.container);
    this.container.addChild(this.uiOverlayLayer.container);

    await this.setup();
  }

  /** 子类实现具体的场景元素布局 */
  protected abstract setup(): Promise<void>;

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
```

### 4.4 AgentCharacterManager 设计

AgentCharacterManager 是 Session/Agent 数据与 PixiJS 角色之间的桥梁。

```typescript
// pixi/characters/AgentCharacterManager.ts
import { Container } from 'pixi.js';
import { AgentCharacter } from './AgentCharacter';
import { useGatewayStore } from '../../stores/useGatewayStore';
import { useSceneStore } from '../../stores/useSceneStore';
import { SessionMapper } from '../../gateway/SessionMapper';

export interface CharacterData {
  id: string;              // session key 作为唯一标识
  name: string;            // 角色名称（session label 或 agent name）
  state: CharacterState;   // 动画状态
  paletteId: string;       // 调色板 ID（颜色差异化）
  position: { x: number; y: number }; // 场景内位置
  agentId?: string;        // 关联的 agent ID
}

export type CharacterState = 'spawn' | 'idle' | 'working' | 'error' | 'despawn';

export class AgentCharacterManager {
  private characters: Map<string, AgentCharacter> = new Map();
  private characterLayer: Container;
  private uiOverlayLayer: Container;
  private sessionMapper: SessionMapper;
  private unsubscribe: (() => void) | null = null;

  // 场景中预定义的角色位置（工作区、休息区）
  private workPositions: Array<{ x: number; y: number }>;
  private idlePositions: Array<{ x: number; y: number }>;

  constructor(
    characterLayer: Container,
    uiOverlayLayer: Container,
    workPositions: Array<{ x: number; y: number }>,
    idlePositions: Array<{ x: number; y: number }>,
  ) {
    this.characterLayer = characterLayer;
    this.uiOverlayLayer = uiOverlayLayer;
    this.workPositions = workPositions;
    this.idlePositions = idlePositions;
    this.sessionMapper = new SessionMapper();
  }

  /**
   * 启动：订阅 GatewayStore 变化，同步角色
   */
  start(): void {
    this.unsubscribe = useGatewayStore.subscribe(
      (state) => state.sessions,
      (sessions) => this.syncCharacters(sessions),
    );

    // 首次同步
    const sessions = useGatewayStore.getState().sessions;
    this.syncCharacters(sessions);
  }

  /**
   * 核心同步逻辑：Sessions → Characters
   */
  private syncCharacters(sessions: Map<string, any>): void {
    const targetChars = this.sessionMapper.mapAll(
      sessions,
      useGatewayStore.getState().agents,
      this.workPositions,
      this.idlePositions,
    );

    // 新增角色
    for (const [id, data] of targetChars) {
      if (!this.characters.has(id)) {
        this.spawnCharacter(data);
      } else {
        this.updateCharacter(id, data);
      }
    }

    // 移除角色
    for (const [id, char] of this.characters) {
      if (!targetChars.has(id)) {
        this.despawnCharacter(id);
      }
    }

    // 更新 SceneStore
    useSceneStore.getState().setCharacters(targetChars);
  }

  private spawnCharacter(data: CharacterData): void {
    const character = new AgentCharacter(data);
    character.playState('spawn', () => {
      // spawn 结束后切到实际状态
      character.playState(data.state);
    });
    this.characterLayer.addChild(character.sprite);
    this.uiOverlayLayer.addChild(character.nameTag);
    this.characters.set(data.id, character);
  }

  private updateCharacter(id: string, data: CharacterData): void {
    const character = this.characters.get(id)!;
    character.updateData(data);
  }

  private despawnCharacter(id: string): void {
    const character = this.characters.get(id);
    if (!character) return;
    character.playState('despawn', () => {
      this.characterLayer.removeChild(character.sprite);
      this.uiOverlayLayer.removeChild(character.nameTag);
      character.destroy();
      this.characters.delete(id);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    for (const [, char] of this.characters) {
      char.destroy();
    }
    this.characters.clear();
  }
}
```

### 4.5 AnimationStateMachine 设计

```typescript
// pixi/characters/AnimationStateMachine.ts
import { AnimatedSprite, Spritesheet } from 'pixi.js';
import type { CharacterState } from './AgentCharacterManager';

/** 动画状态定义 */
interface AnimStateConfig {
  /** Spritesheet 中的动画名称 */
  animationName: string;
  /** 动画速度 (frames per second) */
  fps: number;
  /** 是否循环 */
  loop: boolean;
  /** 播放完成后自动转移到的状态 (仅 loop=false 时) */
  onComplete?: CharacterState;
}

const STATE_CONFIG: Record<CharacterState, AnimStateConfig> = {
  spawn: {
    animationName: 'spawn',
    fps: 10,
    loop: false,
    onComplete: 'idle',  // spawn 结束后默认切 idle
  },
  idle: {
    animationName: 'idle',
    fps: 6,
    loop: true,
  },
  working: {
    animationName: 'working',
    fps: 8,
    loop: true,
  },
  error: {
    animationName: 'error',
    fps: 6,
    loop: true,
  },
  despawn: {
    animationName: 'despawn',
    fps: 10,
    loop: false,
  },
};

export class AnimationStateMachine {
  private sprite: AnimatedSprite | null = null;
  private spritesheet: Spritesheet;
  private currentState: CharacterState = 'idle';
  private onStateComplete?: (state: CharacterState) => void;

  constructor(spritesheet: Spritesheet) {
    this.spritesheet = spritesheet;
  }

  /**
   * 切换到目标状态
   * @param state 目标状态
   * @param onComplete 一次性动画播放完成后的回调
   */
  transitionTo(state: CharacterState, onComplete?: () => void): AnimatedSprite {
    if (this.currentState === state && this.sprite) {
      return this.sprite; // 已在目标状态
    }

    const config = STATE_CONFIG[state];
    const frames = this.spritesheet.animations[config.animationName];

    if (!frames || frames.length === 0) {
      console.warn(`Animation "${config.animationName}" not found in spritesheet`);
      return this.sprite!;
    }

    // 创建新的 AnimatedSprite
    const oldSprite = this.sprite;
    this.sprite = new AnimatedSprite(frames);
    this.sprite.animationSpeed = config.fps / 60; // PixiJS uses fraction of 60fps
    this.sprite.loop = config.loop;
    this.sprite.anchor.set(0.5, 1); // 底部中心锚点

    if (!config.loop) {
      this.sprite.onComplete = () => {
        onComplete?.();
        if (config.onComplete) {
          this.transitionTo(config.onComplete);
        }
      };
    }

    this.sprite.play();
    this.currentState = state;

    // 销毁旧 sprite
    oldSprite?.destroy();

    return this.sprite;
  }

  getCurrentState(): CharacterState {
    return this.currentState;
  }

  getSprite(): AnimatedSprite | null {
    return this.sprite;
  }

  destroy(): void {
    this.sprite?.destroy();
    this.sprite = null;
  }
}
```

### 4.6 PaletteSwap 调色板交换

```typescript
// pixi/characters/PaletteSwap.ts
import { ColorMatrixFilter } from 'pixi.js';

/**
 * 调色板配置
 * 将基础灰度 Spritesheet 映射为不同颜色
 */
export interface Palette {
  id: string;
  name: string;
  // 主色调 (HSL hue shift)
  hueShift: number;
  // 饱和度调整
  saturation: number;
  // 亮度调整
  brightness: number;
}

// 预定义调色板
export const PALETTES: Record<string, Palette> = {
  blue:   { id: 'blue',   name: 'Blue',   hueShift: 0,    saturation: 1.0, brightness: 1.0 },
  green:  { id: 'green',  name: 'Green',  hueShift: 90,   saturation: 1.0, brightness: 1.0 },
  red:    { id: 'red',    name: 'Red',    hueShift: -120, saturation: 1.0, brightness: 1.0 },
  purple: { id: 'purple', name: 'Purple', hueShift: 60,   saturation: 1.0, brightness: 1.0 },
  orange: { id: 'orange', name: 'Orange', hueShift: -60,  saturation: 1.2, brightness: 1.1 },
  teal:   { id: 'teal',   name: 'Teal',   hueShift: 150,  saturation: 0.8, brightness: 1.0 },
};

/**
 * 根据字符串 ID 确定性地选一个调色板
 */
export function getPaletteForId(id: string): Palette {
  const keys = Object.keys(PALETTES);
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % keys.length;
  return PALETTES[keys[index]];
}

/**
 * 创建调色板 Filter
 */
export function createPaletteFilter(palette: Palette): ColorMatrixFilter {
  const filter = new ColorMatrixFilter();
  filter.hue(palette.hueShift, false);
  filter.saturate(palette.saturation - 1, false);
  filter.brightness(palette.brightness, false);
  return filter;
}
```

### 4.7 React ↔ PixiJS 连接

React 组件中通过 `useRef` 持有 PixiJS canvas，PixiJS 通过 Zustand `getState()` 读数据。

```typescript
// windows/main/MainWindow.tsx
import React, { useEffect, useRef } from 'react';
import { SceneManager } from '../../pixi/engine/SceneManager';
import { AgentCharacterManager } from '../../pixi/characters/AgentCharacterManager';
import { useAppStore } from '../../stores/useAppStore';
import { useGateway } from '../../hooks/useGateway';
import { InfoPanel } from '../../components/InfoPanel/InfoPanel';

export const MainWindow: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const selectedCharacterId = useAppStore((s) => s.selectedCharacterId);

  // 建立 Gateway 连接
  useGateway();

  useEffect(() => {
    if (!canvasRef.current) return;

    const sm = new SceneManager();
    sceneManagerRef.current = sm;

    sm.init(canvasRef.current).catch(console.error);

    return () => {
      sm.destroy();
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* PixiJS Canvas — 全屏铺底 */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
      />

      {/* React DOM overlay — 浮动 UI */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        {selectedCharacterId && (
          <InfoPanel characterId={selectedCharacterId} />
        )}
      </div>
    </div>
  );
};
```

---

## 5. Gateway WebSocket 客户端封装

### 5.1 GatewayClient 核心

```typescript
// gateway/GatewayClient.ts
import { EventEmitter } from 'eventemitter3';
import type { RPCRequest, RPCResponse, GatewayEvent } from './GatewayTypes';

/**
 * OpenClaw Gateway WebSocket JSON-RPC 客户端
 *
 * 协议：
 * - 请求: { jsonrpc: "2.0", id: <number>, method: <string>, params?: <object> }
 * - 响应: { jsonrpc: "2.0", id: <number>, result?: <any>, error?: { code, message } }
 * - 通知(事件): { jsonrpc: "2.0", method: <string>, params?: <object> }  (无 id)
 */
export class GatewayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private authToken: string;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();

  // 重连配置
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;  // 30s
  private baseReconnectDelay = 1000;  // 1s
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;

  // 连接状态
  private _connected = false;

  constructor(url: string = 'ws://127.0.0.1:18789', authToken: string = '') {
    super();
    this.url = url;
    this.authToken = authToken;
  }

  get connected(): boolean {
    return this._connected;
  }

  /**
   * 建立连接 + 握手
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.shouldReconnect = true;
      this.ws = new WebSocket(this.url);

      this.ws.onopen = async () => {
        try {
          // 执行 connect 握手
          const hello = await this.rpc('connect', {
            auth: this.authToken,
            role: 'operator',
            scopes: ['operator.read', 'operator.write'],
            client: 'openclaw-wallpaper',
          });
          this._connected = true;
          this.reconnectAttempts = 0;
          this.emit('connected', hello);
          resolve();
        } catch (err) {
          reject(err);
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = (event) => {
        this._connected = false;
        this.emit('disconnected', { code: event.code, reason: event.reason });
        this.rejectAllPending('Connection closed');
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        this.emit('error', error);
        // onclose 会紧随其后触发
      };
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this._connected = false;
  }

  /**
   * 发送 JSON-RPC 请求，返回 Promise
   */
  async rpc<T = any>(method: string, params?: Record<string, any>): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const id = ++this.requestId;
    const request: RPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params ? { params } : {}),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, 30000); // 30s timeout

      this.pendingRequests.set(id, { resolve, reject, timeout });
      this.ws!.send(JSON.stringify(request));
    });
  }

  /**
   * 处理收到的消息
   */
  private handleMessage(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      console.warn('Invalid JSON from Gateway:', raw);
      return;
    }

    if ('id' in msg && msg.id != null) {
      // 这是 RPC 响应
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        this.pendingRequests.delete(msg.id);
        clearTimeout(pending.timeout);
        if (msg.error) {
          pending.reject(new Error(msg.error.message || 'RPC Error'));
        } else {
          pending.resolve(msg.result);
        }
      }
    } else if ('method' in msg) {
      // 这是服务端推送的事件通知（无 id）
      this.emit('event', { method: msg.method, params: msg.params } as GatewayEvent);
      // 也按具体事件名 emit
      this.emit(`event:${msg.method}`, msg.params);
    }
  }

  /**
   * 指数退避重连
   */
  private scheduleReconnect(): void {
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay,
    );
    this.reconnectAttempts++;
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch {
        // connect 失败会触发 onclose → 再次 scheduleReconnect
      }
    }, delay);
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }
}
```

### 5.2 事件订阅/分发

```typescript
// gateway/GatewayEvents.ts

/** Gateway 广播事件类型 */
export type GatewayEventType =
  | 'chat'       // 新消息 / session 状态变化
  | 'agent'      // agent 运行流式输出
  | 'presence'   // 在线状态变化
  | 'health'     // 健康状态变化
  | 'tick'       // 保活
  | 'shutdown';  // Gateway 关闭

/** chat 事件 payload（核心） */
export interface ChatEvent {
  sessionKey: string;
  type: 'message' | 'status-change';
  message?: {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
  };
  status?: string; // 'active' | 'idle' | 'error' | 'closed'
}

/** agent 事件 payload */
export interface AgentEvent {
  sessionKey: string;
  seq: number;
  type: 'start' | 'chunk' | 'complete' | 'error';
  content?: string;
}

/** shutdown 事件 payload */
export interface ShutdownEvent {
  reason: string;
  restartExpectedMs?: number;
}
```

### 5.3 数据映射：Session → Agent 角色

```typescript
// gateway/SessionMapper.ts
import type { SessionData, AgentData } from './GatewayTypes';
import type { CharacterData, CharacterState } from '../pixi/characters/AgentCharacterManager';
import { getPaletteForId } from '../pixi/characters/PaletteSwap';

export class SessionMapper {
  /**
   * 将 Sessions + Agents 映射为 CharacterData 列表
   */
  mapAll(
    sessions: Map<string, SessionData>,
    agents: Map<string, AgentData>,
    workPositions: Array<{ x: number; y: number }>,
    idlePositions: Array<{ x: number; y: number }>,
  ): Map<string, CharacterData> {
    const result = new Map<string, CharacterData>();
    let workIdx = 0;
    let idleIdx = 0;

    for (const [key, session] of sessions) {
      // 只显示活跃/空闲 session，忽略已关闭的
      if (session.status === 'closed') continue;

      const state = this.mapSessionStatus(session.status);
      const isWorking = state === 'working';

      // 分配位置：工作中 → 工作区，空闲 → 休息区
      const positions = isWorking ? workPositions : idlePositions;
      const idx = isWorking ? workIdx++ : idleIdx++;
      const pos = positions[idx % positions.length];

      // 确定名称：优先用 session label，fallback 到 agent name
      const agent = session.agentId ? agents.get(session.agentId) : undefined;
      const name = session.label || agent?.name || `Session ${key.slice(0, 6)}`;

      // 通过 session key 确定性地分配颜色
      const palette = getPaletteForId(key);

      result.set(key, {
        id: key,
        name,
        state,
        paletteId: palette.id,
        position: pos,
        agentId: session.agentId,
      });
    }

    return result;
  }

  /**
   * Session status → Character animation state
   */
  private mapSessionStatus(status: string): CharacterState {
    switch (status) {
      case 'active':
      case 'running':
      case 'busy':
        return 'working';
      case 'error':
      case 'failed':
        return 'error';
      case 'idle':
      case 'waiting':
      default:
        return 'idle';
    }
  }
}
```

### 5.4 useGateway Hook（连接生命周期管理）

```typescript
// hooks/useGateway.ts
import { useEffect, useRef } from 'react';
import { GatewayClient } from '../gateway/GatewayClient';
import { useGatewayStore } from '../stores/useGatewayStore';
import { useAppStore } from '../stores/useAppStore';
import type { ChatEvent, AgentEvent, ShutdownEvent } from '../gateway/GatewayEvents';
import { GATEWAY_URL } from '../utils/constants';

/** 单例 GatewayClient（跨组件共享） */
let clientInstance: GatewayClient | null = null;

export function getGatewayClient(): GatewayClient | null {
  return clientInstance;
}

export function useGateway() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const client = new GatewayClient(GATEWAY_URL);
    clientInstance = client;

    // 连接成功
    client.on('connected', async (hello: any) => {
      useGatewayStore.getState().setConnected(true);
      useAppStore.getState().setOpenclawOnline(true);

      // 拉取初始数据
      try {
        const [sessionsList, agentsList] = await Promise.all([
          client.rpc('sessions.list'),
          client.rpc('agents.list'),
        ]);

        const sessions = new Map<string, any>();
        for (const s of sessionsList) {
          sessions.set(s.key, s);
        }
        useGatewayStore.getState().setSessions(sessions);

        const agents = new Map<string, any>();
        for (const a of agentsList) {
          agents.set(a.agentId, a);
        }
        useGatewayStore.getState().setAgents(agents);
      } catch (err) {
        console.error('Failed to fetch initial data:', err);
      }
    });

    // 断开
    client.on('disconnected', () => {
      useGatewayStore.getState().setConnected(false);
      useAppStore.getState().setOpenclawOnline(false);
    });

    // 事件订阅
    client.on('event:chat', (payload: ChatEvent) => {
      const store = useGatewayStore.getState();
      if (payload.type === 'status-change' && payload.status) {
        store.updateSession(payload.sessionKey, { status: payload.status });
      }
      // 如果是消息且当前对话窗口打开了这个 session，追加消息
      if (payload.type === 'message' && payload.message) {
        // ChatStore 处理
      }
    });

    client.on('event:shutdown', (payload: ShutdownEvent) => {
      useAppStore.getState().setOpenclawOnline(false);
      // 如果有 restartExpectedMs，可以等待后重连
    });

    // 启动连接
    client.connect().catch(() => {
      // 首次连接失败，自动重连机制已启动
      useAppStore.getState().setOpenclawOnline(false);
    });

    return () => {
      client.disconnect();
      clientInstance = null;
    };
  }, []);
}
```

---

## 6. 多窗口设计

### 6.1 窗口定义

Tauri v2 支持在 `tauri.conf.json` 中预定义窗口，也可运行时动态创建。

**`tauri.conf.json` 窗口配置：**

```jsonc
{
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "OpenClaw Wallpaper",
        "width": 1920,
        "height": 1080,
        "resizable": true,
        "decorations": false,       // 无标题栏（壁纸模式不需要）
        "transparent": true,        // 透明背景（壁纸嵌入必须）
        "fullscreen": false,
        "skipTaskbar": true,        // 壁纸模式不显示在任务栏
        "alwaysOnBottom": false,    // 由 plugin-wallpaper 管理层级
        "visible": true
      }
    ]
  }
}
```

**对话窗口通过 Rust IPC 动态创建：**

```rust
// commands/window.rs
use tauri::{AppHandle, Manager, WebviewWindowBuilder, WebviewUrl};

#[tauri::command]
pub async fn open_chat_window(
    app: AppHandle,
    session_key: String,
) -> Result<(), String> {
    let label = format!("chat-{}", &session_key[..8.min(session_key.len())]);

    // 检查是否已存在
    if app.get_webview_window(&label).is_some() {
        // 已存在，聚焦
        app.get_webview_window(&label).unwrap().set_focus().ok();
        return Ok(());
    }

    // 创建新对话窗口
    let url = WebviewUrl::App(
        format!("index.html?window=chat&session={}", session_key).into()
    );

    WebviewWindowBuilder::new(&app, &label, url)
        .title("OpenClaw Chat")
        .inner_size(420.0, 620.0)
        .min_inner_size(320.0, 400.0)
        .resizable(true)
        .decorations(true)          // 对话窗口有标题栏
        .transparent(false)
        .skip_taskbar(false)        // 对话窗口显示在任务栏
        .center()
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn close_chat_window(app: AppHandle) -> Result<(), String> {
    // 关闭所有 chat- 开头的窗口
    for (label, window) in app.webview_windows() {
        if label.starts_with("chat-") {
            window.close().ok();
        }
    }
    Ok(())
}
```

### 6.2 前端路由（按窗口 label 分流）

```typescript
// App.tsx
import React from 'react';
import { MainWindow } from './windows/main/MainWindow';
import { ChatWindow } from './windows/chat/ChatWindow';
import { useWindowLabel } from './hooks/useWindowLabel';

const App: React.FC = () => {
  const { windowType, sessionKey } = useWindowLabel();

  switch (windowType) {
    case 'chat':
      return <ChatWindow sessionKey={sessionKey!} />;
    case 'main':
    default:
      return <MainWindow />;
  }
};

export default App;

// hooks/useWindowLabel.ts
import { useMemo } from 'react';

export function useWindowLabel() {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const windowType = params.get('window') || 'main';
    const sessionKey = params.get('session') || null;
    return { windowType, sessionKey };
  }, []);
}
```

### 6.3 模式切换流程

```
用户点击托盘 "切换为窗口模式"
  │
  ├─ Rust emit "tray://toggle-mode"
  │
  ├─ Frontend 收到事件
  │   ├─ 如果当前是壁纸模式:
  │   │   1. invoke("detach_wallpaper")   → Rust 调用 plugin detach
  │   │   2. 恢复窗口装饰（decorations=true）
  │   │   3. 设置窗口大小为 1280×720
  │   │   4. 显示在任务栏（skipTaskbar=false）
  │   │   5. AppStore.setWallpaperAttached(false)
  │   │
  │   └─ 如果当前是窗口模式:
  │       1. 隐藏窗口装饰（decorations=false）
  │       2. 全屏化窗口
  │       3. invoke("attach_wallpaper")   → Rust 调用 plugin attach
  │       4. 从任务栏隐藏（skipTaskbar=true）
  │       5. AppStore.setWallpaperAttached(true)
  │
  └─ 通知 Rust 更新托盘菜单文字
```

### 6.4 窗口间通信

**主窗口 → 对话窗口：** 通过 Tauri 的 `emit` / `listen` 事件机制（跨窗口广播）。

```typescript
// 主窗口：通知对话窗口 session 状态变化
import { emit } from '@tauri-apps/api/event';
await emit('session-update', { sessionKey, status: 'active' });

// 对话窗口：监听
import { listen } from '@tauri-apps/api/event';
const unlisten = await listen('session-update', (event) => {
  // 更新 UI
});
```

两个窗口共享同一个 GatewayClient 单例（因为在同一进程的不同 WebView 中 —— 实际上 Tauri v2 中每个窗口有独立的 WebView 进程）。

**修正**：对话窗口是独立 WebView 实例，不共享 JS 内存。因此对话窗口需要自己建立 Gateway 连接，或通过 Tauri IPC 中转。

**推荐方案：对话窗口直接连 Gateway WebSocket。**

原因：
- 对话窗口需要实时接收 agent 流式回复
- WebSocket 连接是轻量的
- 避免增加 Rust 中转层复杂度

```typescript
// windows/chat/ChatWindow.tsx
import React, { useEffect } from 'react';
import { GatewayClient } from '../../gateway/GatewayClient';
import { ChatView } from '../../components/ChatView/ChatView';
import { useChatStore } from '../../stores/useChatStore';

interface Props {
  sessionKey: string;
}

export const ChatWindow: React.FC<Props> = ({ sessionKey }) => {
  useEffect(() => {
    const client = new GatewayClient();
    useChatStore.getState().setActiveSessionKey(sessionKey);

    client.connect().then(async () => {
      // 拉取历史消息
      const session = await client.rpc('sessions.get', { sessionKey });
      if (session?.messages) {
        useChatStore.getState().setMessages(session.messages);
      }

      // 订阅 chat 事件（过滤当前 session）
      client.on('event:chat', (payload: any) => {
        if (payload.sessionKey === sessionKey && payload.message) {
          useChatStore.getState().appendMessage(payload.message);
        }
      });

      // 订阅 agent 流式输出
      client.on('event:agent', (payload: any) => {
        if (payload.sessionKey === sessionKey) {
          if (payload.type === 'chunk') {
            const current = useChatStore.getState().streamingContent;
            useChatStore.getState().setStreamingContent(current + payload.content);
          } else if (payload.type === 'complete') {
            // 流结束，将 streaming 内容固化为一条消息
            const content = useChatStore.getState().streamingContent;
            if (content) {
              useChatStore.getState().appendMessage({
                role: 'assistant',
                content,
                timestamp: new Date().toISOString(),
              });
              useChatStore.getState().setStreamingContent('');
            }
          }
        }
      });
    });

    return () => {
      client.disconnect();
    };
  }, [sessionKey]);

  return <ChatView sessionKey={sessionKey} />;
};
```

---

## 7. 性能策略设计

### 7.1 PerformanceController

```typescript
// pixi/engine/PerformanceController.ts
import { Application, Ticker } from 'pixi.js';
import { useSceneStore } from '../../stores/useSceneStore';

interface PerformanceConfig {
  /** 空闲帧率 (FPS) */
  idleFps: number;
  /** 交互帧率 (FPS) */
  activeFps: number;
  /** 遮挡时帧率 (FPS) */
  occludedFps: number;
  /** 无交互多少毫秒后进入空闲 */
  idleTimeoutMs: number;
}

const DEFAULT_CONFIG: PerformanceConfig = {
  idleFps: 12,
  activeFps: 30,
  occludedFps: 1,
  idleTimeoutMs: 30_000,
};

export class PerformanceController {
  private app: Application;
  private config: PerformanceConfig;
  private currentMode: 'active' | 'idle' | 'occluded' | 'paused' = 'idle';
  private lastInteractionTime = 0;
  private idleCheckInterval: ReturnType<typeof setInterval> | null = null;
  private visibilityHandler: (() => void) | null = null;
  private mouseHandler: (() => void) | null = null;

  constructor(app: Application, config?: Partial<PerformanceConfig>) {
    this.app = app;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  init(): void {
    // 初始设为空闲帧率
    this.setFps(this.config.idleFps);

    // 1) 页面可见性检测（前台窗口遮挡）
    this.visibilityHandler = () => {
      if (document.hidden) {
        this.setMode('occluded');
      } else {
        this.setMode('idle');
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);

    // 2) 鼠标交互检测
    this.mouseHandler = () => {
      this.lastInteractionTime = Date.now();
      if (this.currentMode !== 'active' && this.currentMode !== 'occluded') {
        this.setMode('active');
      }
    };
    document.addEventListener('mousemove', this.mouseHandler);
    document.addEventListener('mousedown', this.mouseHandler);

    // 3) 定期检查空闲超时
    this.idleCheckInterval = setInterval(() => {
      if (
        this.currentMode === 'active' &&
        Date.now() - this.lastInteractionTime > this.config.idleTimeoutMs
      ) {
        this.setMode('idle');
      }
    }, 5000);
  }

  private setMode(mode: 'active' | 'idle' | 'occluded' | 'paused'): void {
    if (this.currentMode === mode) return;
    this.currentMode = mode;

    switch (mode) {
      case 'active':
        this.setFps(this.config.activeFps);
        this.app.ticker.start();
        useSceneStore.getState().setPaused(false);
        break;
      case 'idle':
        this.setFps(this.config.idleFps);
        this.app.ticker.start();
        useSceneStore.getState().setPaused(false);
        break;
      case 'occluded':
        this.setFps(this.config.occludedFps);
        useSceneStore.getState().setPaused(false);
        break;
      case 'paused':
        this.app.ticker.stop();
        useSceneStore.getState().setPaused(true);
        break;
    }

    useSceneStore.getState().setCurrentFps(
      mode === 'paused' ? 0 : this.getFpsForMode(mode),
    );
  }

  private setFps(fps: number): void {
    this.app.ticker.maxFPS = fps;
  }

  private getFpsForMode(mode: string): number {
    switch (mode) {
      case 'active': return this.config.activeFps;
      case 'idle': return this.config.idleFps;
      case 'occluded': return this.config.occludedFps;
      default: return 0;
    }
  }

  destroy(): void {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    if (this.mouseHandler) {
      document.removeEventListener('mousemove', this.mouseHandler);
      document.removeEventListener('mousedown', this.mouseHandler);
    }
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
    }
  }
}
```

### 7.2 帧率控制策略

| 模式 | 触发条件 | 帧率 | 说明 |
|------|---------|------|------|
| **Active** | 鼠标在壁纸区域移动/点击 | 30 FPS | 交互模式，流畅响应 |
| **Idle** | 无交互 >30s | 12 FPS | 空闲模式，播放缓慢循环动画 |
| **Occluded** | `document.hidden = true`（页面不可见） | 1 FPS | 最低功耗，仅维持状态同步 |
| **Paused** | 手动暂停 / 电池模式 | 0 FPS | 完全停止渲染 |

### 7.3 资源管理

```typescript
// pixi/engine/AssetLoader.ts
import { Assets, Spritesheet } from 'pixi.js';

/** 资源清单 */
const MANIFEST = {
  characters: {
    spritesheet: 'sprites/characters/agent-base.json',
  },
  scene: {
    buildings: 'sprites/scene/buildings.json',
    ground: 'sprites/scene/ground.json',
    sky: 'sprites/scene/sky.png',
    effects: 'sprites/scene/effects.json',
  },
  fonts: {
    pixel: 'fonts/pixel-font.fnt',
  },
};

export class AssetLoader {
  private loaded = false;

  /**
   * 预加载所有 MVP 资源（一次性）
   */
  async loadAll(): Promise<void> {
    if (this.loaded) return;

    // 注册资源 bundle
    Assets.addBundle('characters', {
      'agent-base': MANIFEST.characters.spritesheet,
    });
    Assets.addBundle('scene', {
      buildings: MANIFEST.scene.buildings,
      ground: MANIFEST.scene.ground,
      sky: MANIFEST.scene.sky,
      effects: MANIFEST.scene.effects,
    });

    // 并行加载
    await Promise.all([
      Assets.loadBundle('characters'),
      Assets.loadBundle('scene'),
    ]);

    this.loaded = true;
  }

  /**
   * 获取角色 Spritesheet
   */
  getCharacterSpritesheet(): Spritesheet {
    return Assets.get('agent-base');
  }

  /**
   * 清理缓存（如果内存超限）
   */
  cleanup(): void {
    // PixiJS Assets 有内建缓存；如需手动清理:
    // Assets.unloadBundle('characters');
  }
}
```

### 7.4 内存预算

| 类别 | 预算 | 说明 |
|------|------|------|
| WebView2 基础开销 | ~60-80MB | 不可控，Chromium 固有 |
| PixiJS 渲染上下文 | ~20-30MB | WebGL context + 帧缓冲 |
| Spritesheet 纹理 | ~10-20MB | 角色 + 场景 Atlas（取决于分辨率） |
| Zustand 状态 | <1MB | JS 对象，极轻量 |
| WebSocket 缓冲 | <1MB | JSON 消息 |
| 对话历史缓存 | <5MB | 限制最近 50 条 |
| **总计** | ~100-140MB | ✅ 低于 200MB 目标 |

---

## 8. 开发与构建

### 8.1 Mac 开发流程

Mac 上 `tauri-plugin-wallpaper` 的壁纸嵌入不可用，但可以：

1. **独立窗口模式开发**：所有场景渲染、角色动画、Gateway 通信在窗口模式下功能一致
2. **PixiJS 场景调试**：可在浏览器中直接调试（`pnpm dev` 启动 Vite dev server）
3. **Tauri IPC 调试**：壁纸命令在 Mac 上返回错误信息（not available），其余命令正常工作

**开发命令：**

```bash
# 安装依赖
pnpm install

# 纯前端开发（浏览器调试 PixiJS，无 Tauri）
pnpm dev

# Tauri 开发模式（独立窗口，含 Rust 后端）
pnpm tauri dev

# 如果 Mac 上没有 OpenClaw Gateway 运行，前端会进入离线模式
# 可以用 mock 数据开发：
VITE_MOCK_GATEWAY=true pnpm tauri dev
```

**环境变量（`.env.development`）：**

```env
VITE_GATEWAY_URL=ws://127.0.0.1:18789
VITE_GATEWAY_AUTH_TOKEN=
VITE_MOCK_GATEWAY=false
VITE_LOG_LEVEL=debug
```

### 8.2 Windows 构建与打包

```bash
# 在 Windows 机器上 or 通过 CI (GitHub Actions)
pnpm tauri build

# 产出:
# src-tauri/target/release/bundle/nsis/openclaw-wallpaper_x.x.x_x64-setup.exe
```

**`tauri.conf.json` 打包配置：**

```jsonc
{
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/icon.ico"
    ],
    "windows": {
      "nsis": {
        "installMode": "currentUser",
        "displayLanguageSelector": false
      },
      "webviewInstallMode": {
        "type": "embedBootstrapper"   // 内嵌 WebView2 安装器
      }
    }
  }
}
```

### 8.3 平台适配编译标志

```rust
// 在 Rust 侧用 cfg 区分平台行为
#[cfg(target_os = "windows")]
fn platform_specific() {
    // 壁纸嵌入、WorkerW 相关逻辑
}

#[cfg(target_os = "macos")]
fn platform_specific() {
    // Mac 只支持窗口模式
}
```

```typescript
// 前端侧通过 Tauri API 检测平台
import { platform } from '@tauri-apps/plugin-os';

const os = await platform(); // 'windows' | 'macos' | 'linux'
const canAttachWallpaper = os === 'windows';
```

### 8.4 CI/CD 概要

```yaml
# .github/workflows/build.yml
name: Build

on:
  push:
    tags: ['v*']

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
      - run: pnpm install
      - run: pnpm tauri build
      - name: Upload Artifact
        uses: actions/upload-artifact@v4
        with:
          name: windows-installer
          path: src-tauri/target/release/bundle/nsis/*.exe
```

---

## 9. 关键接口定义

### 9.1 Gateway 数据模型

```typescript
// gateway/GatewayTypes.ts

/** JSON-RPC 请求 */
export interface RPCRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, any>;
}

/** JSON-RPC 响应 */
export interface RPCResponse {
  jsonrpc: '2.0';
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/** Gateway 广播事件 */
export interface GatewayEvent {
  method: string;
  params?: any;
}

/** Session 数据 (sessions.list 返回) */
export interface SessionData {
  key: string;
  label: string;
  status: 'active' | 'idle' | 'error' | 'closed' | string;
  model: string;
  agentId?: string;
  kind?: string;
  tokenUsage?: {
    input: number;
    output: number;
  };
  childSessions?: string[];
  createdAt?: string;
  updatedAt?: string;
}

/** Agent 数据 (agents.list 返回) */
export interface AgentData {
  agentId: string;
  name: string;
  isDefault: boolean;
  emoji?: string;
  avatar?: string;
}

/** Agent 身份 (agent.identity.get 返回) */
export interface AgentIdentity {
  name: string;
  avatar?: string;
  emoji?: string;
}

/** 对话消息 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

/** connect 握手响应 */
export interface ConnectResponse {
  type: 'hello-ok';
  presence: Array<{
    deviceId: string;
    name: string;
    online: boolean;
  }>;
  health: {
    status: string;
    uptime: number;
  };
  stateVersion: number;
}
```

### 9.2 IPC 命令接口（TypeScript 封装）

```typescript
// ipc/commands.ts
import { invoke } from '@tauri-apps/api/core';

// ─── 壁纸控制 ────────────────────────────────────────

export async function attachWallpaper(): Promise<void> {
  return invoke('attach_wallpaper');
}

export async function detachWallpaper(): Promise<void> {
  return invoke('detach_wallpaper');
}

export async function isWallpaperAttached(): Promise<boolean> {
  return invoke('is_wallpaper_attached');
}

// ─── OpenClaw 管理 ───────────────────────────────────

export interface OpenClawStatus {
  Online?: { port: number };
  Offline?: null;
}

export async function detectOpenClaw(port?: number): Promise<OpenClawStatus> {
  return invoke('detect_openclaw', { port });
}

export async function startOpenClaw(): Promise<void> {
  return invoke('start_openclaw');
}

export async function stopOpenClaw(): Promise<void> {
  return invoke('stop_openclaw');
}

// ─── 窗口管理 ─────────────────────────────────────────

export async function openChatWindow(sessionKey: string): Promise<void> {
  return invoke('open_chat_window', { sessionKey });
}

export async function closeChatWindow(): Promise<void> {
  return invoke('close_chat_window');
}
```

### 9.3 场景事件接口

```typescript
// pixi/scenes/SceneEvents.ts

/** 场景内部事件（PixiJS EventEmitter） */
export type SceneEventType =
  | 'character:click'        // 角色被点击
  | 'character:hover'        // 角色被悬停
  | 'character:hover-out'    // 角色悬停移出
  | 'scene:ready'            // 场景加载完成
  | 'scene:resize'           // 窗口尺寸变化
  | 'openclaw:online'        // OpenClaw 上线
  | 'openclaw:offline';      // OpenClaw 离线

export interface CharacterClickEvent {
  characterId: string;
  characterName: string;
  screenPosition: { x: number; y: number };  // 用于定位 InfoPanel
}

export interface CharacterHoverEvent {
  characterId: string;
  characterName: string;
  state: string;
}
```

### 9.4 角色点击 → InfoPanel 交互流程

```typescript
// pixi/characters/AgentCharacter.ts (关键交互部分)
import { AnimatedSprite, Container } from 'pixi.js';
import { useAppStore } from '../../stores/useAppStore';

export class AgentCharacter {
  public sprite: Container;
  public nameTag: Container;
  private data: CharacterData;

  constructor(data: CharacterData) {
    this.data = data;
    this.sprite = new Container();
    // ... 创建 AnimatedSprite、NameTag 等

    // 启用交互
    this.sprite.eventMode = 'static';
    this.sprite.cursor = 'pointer';

    // 点击事件 → 更新 Zustand Store → React InfoPanel 响应
    this.sprite.on('pointertap', (event) => {
      useAppStore.getState().setSelectedCharacterId(this.data.id);
    });

    // 悬停效果
    this.sprite.on('pointerover', () => {
      this.sprite.alpha = 0.85; // 微弱高亮
    });
    this.sprite.on('pointerout', () => {
      this.sprite.alpha = 1.0;
    });
  }

  updateData(data: CharacterData): void {
    if (data.state !== this.data.state) {
      // 状态变化 → 切换动画
      this.animStateMachine.transitionTo(data.state);
    }
    if (data.position.x !== this.data.position.x || data.position.y !== this.data.position.y) {
      // MVP: 直接瞬移到新位置（P2 再做行走动画）
      this.sprite.position.set(data.position.x, data.position.y);
      this.nameTag.position.set(data.position.x, data.position.y - 60);
    }
    this.data = data;
  }

  destroy(): void {
    this.sprite.destroy({ children: true });
    this.nameTag.destroy({ children: true });
  }
}
```

---

## 附录 A：技术选型确认清单

> ⚠️ 下表已更新为实际使用的技术栈（2026-03-29）。

| 选项 | 选择 | 版本 | 许可证 |
|------|------|------|--------|
| 桌面框架 | Tauri | v2.x | MIT/Apache-2.0 |
| 壁纸插件 | ~~tauri-plugin-wallpaper~~ | ~~v3.x~~ | 未集成（MVP 仅窗口模式） |
| 2D 游戏引擎 | **Phaser** (原计划 PixiJS) | **v3.87** | MIT |
| 角色动画 | Spritesheet (Phaser Anims + Tween) | Phaser 内置 | MIT |
| 前端框架 | React | 19.x | MIT |
| 状态管理 | Zustand | 5.x | MIT |
| 构建工具 | Vite | 7.x | MIT |
| 包管理 | pnpm | 9.x | MIT |
| HTTP 客户端 (Rust) | reqwest | 0.12.x | MIT/Apache-2.0 |
| 通信协议 | OpenClaw Gateway WebSocket (JSON-RPC v3) | — | — |
| 开机自启 | tauri-plugin-autostart | 2.x | MIT |
| Markdown 渲染 | react-markdown | 10.x | MIT |
| 像素素材 | Agent Town | 48×48 | MIT |

## 附录 B：MVP 不涉及但需预留扩展点

| 未来功能 | 扩展点 |
|---------|--------|
| Spine 骨骼动画 | `AgentCharacter` 可替换 `AnimatedSprite` 为 `Spine` 组件 |
| 多场景 | `SceneManager.loadScene()` 已支持场景切换 |
| 日夜/天气 | `SkyLayer` + `EffectLayer` 可添加时间/天气参数 |
| 换装系统 | `PaletteSwap` 可扩展为 Skin 系统 |
| 音效 | 通过 `Howler.js` 或 Tauri audio plugin 接入 |
| 商店系统 | 新增 `StoreClient` + `useStoreStore` |
| macOS 支持 | Rust 侧条件编译已预留 |

## 附录 C：风险缓解方案

| 风险 | 缓解 |
|------|------|
| tauri-plugin-wallpaper 不稳定 | MIT 许可证可 fork；WorkerW 核心代码 ~200 行 |
| WebView2 内存偏高 | 控制 DOM 复杂度；PixiJS Canvas 为主渲染面，DOM 仅用于弹出面板 |
| 壁纸模式鼠标事件不可靠 | 独立窗口模式作为 fallback；Mac 开发始终在窗口模式 |
| Gateway API 变化 | `GatewayClient` 封装层隔离；类型定义集中管理 |
