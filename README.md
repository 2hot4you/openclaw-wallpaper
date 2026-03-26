# 🦞 OpenClaw Wallpaper

Stardew Valley 风格的 Windows 动态桌面壁纸，用于管理和监控 [OpenClaw](https://github.com/nicepkg/openclaw) AI Agents。

![Status](https://img.shields.io/badge/status-MVP%20开发中-yellow)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## 概述

OpenClaw Wallpaper 将 OpenClaw 的 Agent 管理界面以**像素风 2D 场景**呈现在桌面壁纸上。你可以在桌面上直观看到 Agent 的工作状态、与 Agent 对话、管理 OpenClaw 服务。

### 特性（MVP）
- 🎨 **星露谷物语风格场景** — 像素风工作坊、角色、动画
- 🤖 **实时 Agent 可视化** — 角色状态对应 Agent 工作状态（空闲/工作中/错误）
- 💬 **对话功能** — 在桌面上直接与 Agent 对话
- 🔧 **OpenClaw 管理** — 检测/启停 Gateway 服务
- ⚡ **低功耗** — 自适应帧率，前台有窗口时自动降帧

## 技术栈

| 组件 | 技术 |
|------|------|
| 桌面壳 | [Tauri v2](https://v2.tauri.app/) (Rust) |
| 壁纸嵌入 | [tauri-plugin-wallpaper](https://github.com/meslzy/tauri-plugin-wallpaper) |
| 2D 渲染 | [PixiJS v8](https://pixijs.com/) |
| 前端框架 | React 19 + TypeScript |
| 状态管理 | Zustand |
| 通信 | OpenClaw Gateway WebSocket JSON-RPC |
| 构建 | Vite + pnpm |

## 开发

### 前提条件
- Node.js 18+
- pnpm
- Rust (stable)
- [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)

### 启动开发

```bash
# 安装依赖
pnpm install

# 启动开发模式（独立窗口）
pnpm tauri dev
```

### 构建

```bash
# 构建 Windows 安装包
pnpm tauri build
```

## 项目结构

```
src/                          # 前端 (React + TypeScript)
├── gateway/                  # Gateway WebSocket 客户端
├── pixi/                     # PixiJS 场景引擎
│   ├── characters/           # 角色系统 + 动画状态机
│   ├── engine/               # SceneManager + 性能控制
│   └── scenes/               # 场景 + 渲染层
├── stores/                   # Zustand 状态管理
├── utils/                    # 工具函数
└── windows/                  # 窗口页面

src-tauri/                    # Tauri 后端 (Rust)
├── src/
│   ├── commands/             # IPC 命令 (OpenClaw 进程管理)
│   ├── tray.rs               # 系统托盘
│   └── lib.rs                # 入口
```

## 文档

- [PRD (产品需求)](./prd.md)
- [技术架构](./architecture.md)
- [可行性调研](./research/feasibility-report.md)

## License

MIT
