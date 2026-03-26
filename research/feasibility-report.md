# OpenClaw Wallpaper — 技术可行性调研报告

> 调研日期：2026-03-27  
> 调研人：Analyst  
> 项目：OpenClaw Wallpaper — Windows 桌面动态壁纸应用

---

## 目录

1. [Windows 动态壁纸技术原理](#1-windows-动态壁纸技术原理)
2. [技术路线对比](#2-技术路线对比)
3. [2D/2.5D 场景实现](#3-2d25d-场景实现)
4. [OpenClaw 集成方案](#4-openclaw-集成方案)
5. [商业化可行性](#5-商业化可行性)
6. [风险评估](#6-风险评估)
7. [推荐方案及架构](#7-推荐方案及架构)
8. [参考资料](#8-参考资料)

---

## 1. Windows 动态壁纸技术原理

### 1.1 核心机制：WorkerW 窗口嵌入

Windows **没有**官方 API 支持交互式桌面壁纸。所有动态壁纸方案（包括 Wallpaper Engine、Lively Wallpaper）都依赖同一个**非官方但稳定的 hack**：

```
1. 找到 Progman（桌面图标管理器）窗口
2. 向 Progman 发送消息 SendMessage(progman, 0x052C, 0, 0)
3. 该消息触发 Progman 在桌面图标层（SHELLDLL_DefView）下方创建一个 WorkerW 子窗口
4. 使用 SetParent() 将自定义窗口设为 WorkerW 的子窗口
5. 自定义窗口就会渲染在桌面图标之下，成为"壁纸"
```

**关键特性：**
- ✅ Win10/Win11 均支持（含 24H2，但有过短暂兼容问题）
- ✅ 支持任何类型的窗口内容（OpenGL、DirectX、WebView、视频等）
- ⚠️ 属于 undocumented API，每次 Windows 大版本更新都有 break 风险
- ⚠️ Win11 24H2 曾短暂出现兼容问题，Microsoft 后续修复并与 Wallpaper Engine 协作确认兼容

### 1.2 鼠标交互

**这是本项目的关键挑战。** 壁纸窗口位于桌面图标之下：

| 交互方式 | 可行性 | 说明 |
|----------|--------|------|
| 桌面已聚焦时点击 | ✅ 可行 | 用户点击桌面空白处后，后续点击可传递到壁纸窗口 |
| 前台有其他窗口时点击 | ❌ 不可行 | 点击会被前台窗口拦截 |
| 双击桌面切换交互模式 | ✅ 变通方案 | Wallpaper Engine 和 Lively 都采用此方式 |
| 全局热键激活交互 | ✅ 变通方案 | 按热键最小化所有窗口，聚焦桌面 |
| 桌面 Widget 覆盖层 | ✅ 推荐 | 使用置顶的透明交互窗口，点击后激活壁纸交互 |

**Lively Wallpaper 的做法：** 只在桌面被聚焦时（没有前台窗口覆盖）转发鼠标事件给壁纸；否则暂停交互。这是目前最成熟的方案。

### 1.3 性能参考

| 指标 | Lively (Web 壁纸) | Wallpaper Engine (Scene) | 壁纸引擎空载 |
|------|-------------------|-------------------------|-------------|
| CPU | 2-8% | 1-5% | <1% |
| GPU | 5-15% | 3-10% | <1% |
| 内存 | 150-400MB | 100-300MB | 50-80MB |
| 前台有窗口时 | 自动暂停/降帧 | 自动暂停/降帧 | N/A |

> 注：Web 壁纸由于跑 Chromium/CEF 渲染，内存和 CPU 开销高于原生渲染。

---

## 2. 技术路线对比

### 2.1 方案对比总表

| 维度 | 方案 A: Tauri + 壁纸嵌入 | 方案 B: Lively 二次开发 | 方案 C: 自研原生引擎 | 方案 D: Web + 壁纸容器 | 方案 E: Tauri + tauri-plugin-wallpaper |
|------|------------------------|----------------------|--------------------|--------------------|--------------------------------------|
| **开发语言** | Rust + Web (TS/JS) | C# + WinUI 3 | C++/C# + DirectX | HTML/CSS/JS | Rust + Web (TS/JS) |
| **渲染技术** | WebView2 (Chromium) | WebView2 / mpv / CEF | DirectX/OpenGL | Canvas/WebGL | WebView2 (Chromium) |
| **壁纸嵌入** | 需自行实现 WorkerW | ✅ 已实现 | 需自行实现 | 需搭配容器 | ✅ 插件已实现 |
| **鼠标交互** | 需自行实现 | ✅ 已实现 | 需自行实现 | 依赖容器 | 部分支持 |
| **跨平台潜力** | ✅ 高 (macOS/Linux) | ❌ Windows only | ❌ Windows only | ✅ 高 | ✅ 高 (macOS/Linux) |
| **包体大小** | ~10-20MB | ~50-80MB | ~5-10MB | 需容器 | ~10-20MB |
| **开发效率** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **UI 开发效率** | ⭐⭐⭐⭐⭐ (Web 生态) | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **性能上限** | 中 | 中 | 高 | 中 | 中 |
| **维护成本** | 中 | 高（需跟进上游） | 极高 | 低 | 低-中 |
| **社区/生态** | Tauri 社区活跃 | Lively 开源社区 | 无 | Web 生态丰富 | Tauri + 插件维护者 |
| **许可证风险** | MIT | GPL v3 ⚠️ | 无 | 无 | MIT |
| **OpenClaw 亲和度** | ⭐⭐⭐⭐⭐ (都是 JS/TS) | ⭐⭐ (C# 生态) | ⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

### 2.2 各方案详细分析

#### 方案 A: Tauri 应用 + 自行实现 WorkerW 嵌入

- **优点：** Tauri 是 Rust 后端 + WebView 前端，包体小、性能好；Web 前端可复用大量 JS 生态；与 OpenClaw (Node.js) 天然亲和
- **缺点：** 需要自行用 Rust FFI 调用 Windows API 实现 WorkerW 嵌入和鼠标事件转发
- **评估：** 工作量中等，但技术路线清晰

#### 方案 B: 基于 Lively Wallpaper 二次开发

- **优点：** 壁纸引擎已完善（WorkerW 嵌入、多监视器支持、暂停策略、Web 壁纸 API）；开源且有大量用户验证
- **缺点：** **GPL v3 许可证** — 如果 OpenClaw Wallpaper 要做商业化闭源产品，GPL 传染性是致命问题；C# + WinUI 3 技术栈与 OpenClaw (Node.js) 生态割裂；深度定制需要理解整个 Lively 代码库
- **评估：** 如果开源发布可以考虑，商业化场景不推荐

#### 方案 C: 自研原生引擎

- **优点：** 性能最优，完全可控
- **缺点：** 开发周期极长（6-12 个月仅壁纸引擎部分）；需要 C++/DirectX 专家；维护成本极高
- **评估：** 除非团队有原生图形开发经验且有充足时间，否则不推荐

#### 方案 D: Web 技术渲染 + 第三方壁纸容器

- **优点：** 纯 Web 开发，效率极高；可先在浏览器中开发调试
- **缺点：** 依赖第三方壁纸容器（Lively / Wallpaper Engine），不可控；无法独立分发
- **评估：** 适合作为原型验证，不适合作为最终产品

#### ⭐ 方案 E（推荐）: Tauri + tauri-plugin-wallpaper

- **优点：**
  - `tauri-plugin-wallpaper` 已封装 WorkerW 嵌入逻辑（attach/detach），MIT 许可证
  - Tauri v2 生态成熟，Rust 后端处理系统级操作（进程管理、IPC），WebView 前端做 UI
  - 包体小（~15MB vs Electron ~100MB+）
  - 前端可用 PixiJS/Three.js 做 2D/2.5D 场景
  - 与 OpenClaw 同为 JS/TS 生态，通信层天然匹配
  - Tauri sidecar 功能可内嵌 OpenClaw (Node.js) 进程
  - 跨平台潜力（macOS/Linux 后续扩展）
- **缺点：**
  - `tauri-plugin-wallpaper` 相对较新，鼠标交互的完整性需要验证/补充
  - 需要 Rust 开发能力（但可控在 plugin 层面）
- **评估：** 综合最优解，平衡了开发效率、性能、商业化灵活性和技术栈亲和度

---

## 3. 2D/2.5D 场景实现

### 3.1 渲染引擎选型

| 引擎 | 类型 | 场景适配 | 性能 | 生态 | 推荐度 |
|------|------|---------|------|------|--------|
| **PixiJS v8** | 2D WebGPU/WebGL | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **⭐⭐⭐⭐⭐ 首选** |
| Three.js | 3D WebGL/WebGPU | ⭐⭐⭐⭐ (2.5D) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ 备选 |
| Phaser 3 | 2D 游戏引擎 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ 过重 |
| Unity WebGL | 2D/3D | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ (WebGL 输出重) | ⭐⭐⭐⭐⭐ | ⭐⭐ 太重 |

**推荐：PixiJS v8**

理由：
1. **轻量高效** — 纯 2D 渲染库，不含游戏引擎多余部分，适合壁纸场景的长时间低功耗运行
2. **WebGPU 支持** — v8 已支持 WebGPU 后端，未来性能提升空间大
3. **Spine 官方 Runtime** — `@esotericsoftware/spine-pixi` 官方维护，支持 Spine 4.2 物理动画
4. **PixiJS 在 Wallpaper Engine 的 Web 壁纸中已被广泛使用**，验证了在壁纸场景的可行性
5. **事件系统完善** — 支持点击、拖拽等交互事件

如果后续需要 2.5D（等距视角、透视场景），可引入 Three.js 做背景层，PixiJS 做 UI 和角色层，两者可以共存。

### 3.2 角色动画方案

| 方案 | 动画质量 | 性能 | 工具链 | 许可/成本 | 推荐度 |
|------|---------|------|--------|----------|--------|
| **Spine** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | $69-$339/seat | **⭐⭐⭐⭐⭐ 首选** |
| DragonBones | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | 免费 | ⭐⭐⭐ 免费替代 |
| Lottie | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 免费 | ⭐⭐⭐ 适合 UI 动画 |
| CSS Animation | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 免费 | ⭐⭐ 太简单 |

**推荐组合：**
- **角色骨骼动画：Spine** — 最成熟的 2D 骨骼动画方案，PixiJS 官方 Runtime，支持换装（Skins）、物理、IK
- **UI 微动画：Lottie** — 按钮反馈、加载动画、状态指示等轻量动画
- **特效：PixiJS 粒子系统** — 背景粒子、工作状态光效等

### 3.3 Spine 换装系统（核心需求匹配）

Spine 原生支持 **Skins（皮肤）** 系统：
- 一个角色可以有多套皮肤（服装、配饰、表情）
- 运行时动态切换/混合皮肤
- 皮肤资源独立管理，天然适配商店系统的"换装"需求
- 支持运行时皮肤叠加（如：基础身体 + 上衣皮肤 + 帽子皮肤）

这与项目需求中"服装店更换 agents 皮肤/衣服"完美匹配。

### 3.4 性能策略（长时间桌面运行）

| 策略 | 说明 |
|------|------|
| **前台暂停** | 检测到其他窗口全屏/聚焦时，降帧到 1-5 FPS 或完全暂停 |
| **电池模式** | 笔记本电池供电时自动降低到最低帧率 |
| **自适应帧率** | 空闲时 15 FPS，有交互时升到 30 FPS，动画高潮 60 FPS |
| **可见性检测** | 桌面完全被遮挡时停止渲染 |
| **资源懒加载** | 只加载可见区域的角色和动画 |
| **GPU 休眠** | 无动画更新时跳过渲染帧 |

目标：**空闲时 CPU < 2%，GPU < 5%，内存 < 200MB**

---

## 4. OpenClaw 集成方案

### 4.1 通信架构

```
┌─────────────────────────────────────────────┐
│            Tauri Wallpaper App               │
│  ┌───────────────────┐  ┌────────────────┐  │
│  │   WebView (前端)   │  │  Rust Backend  │  │
│  │  PixiJS + Spine   │  │  (Tauri Core)  │  │
│  │  UI Components    │◄─┤  IPC Bridge    │  │
│  └────────┬──────────┘  └───────┬────────┘  │
│           │ Tauri IPC            │            │
│           └──────────────────────┘            │
│                      │                        │
│              Rust ─► spawn/manage             │
│                      │                        │
│         ┌────────────▼─────────────┐          │
│         │  OpenClaw (Node.js)      │          │
│         │  (Tauri Sidecar 或       │          │
│         │   独立进程)               │          │
│         └────────────┬─────────────┘          │
│                      │                        │
└──────────────────────┼────────────────────────┘
                       │
          ┌────────────▼─────────────┐
          │  OpenClaw Gateway API     │
          │  HTTP REST + WebSocket    │
          │  localhost:3000           │
          └──────────────────────────┘
```

### 4.2 通信方式

| 层级 | 方式 | 用途 |
|------|------|------|
| **前端 ↔ Rust Backend** | Tauri IPC (invoke/events) | 系统级操作、进程管理 |
| **Rust Backend ↔ OpenClaw** | 进程管理 (spawn/kill) | 安装/启停 OpenClaw |
| **前端 ↔ OpenClaw Gateway** | HTTP REST API | 查询 agents、sessions 信息 |
| **前端 ↔ OpenClaw Gateway** | WebSocket | 实时推送 agent 状态变化、消息流 |

### 4.3 Agents/Spawn 状态监控

OpenClaw Gateway 已提供 API 能力：

```typescript
// 查询活跃 sessions
GET /api/sessions?activeMinutes=60

// 查询 session 历史消息
GET /api/sessions/:key/history?limit=20

// WebSocket 订阅实时事件
WS /ws
// → agent 开始工作、agent 完成、新消息等事件推送
```

壁纸前端通过 WebSocket 订阅：
1. **Agent 启动** → 角色走到"工作区"，播放工作动画
2. **Agent 完成** → 角色回到"休息区"，播放空闲动画
3. **新消息** → 角色头顶冒气泡
4. **错误** → 角色播放困惑/报错动画

### 4.4 壁纸内对话功能

两种模式：

**模式 1：内嵌对话 UI**
- 在壁纸中绘制对话框 UI（PixiJS HTML overlay 或 DOM 覆盖层）
- 点击 Agent 角色 → 弹出对话窗口
- 输入文字 → 通过 OpenClaw API 发送到对应 session
- 回复通过 WebSocket 实时推送显示

**模式 2：唤起独立对话窗口**
- 点击 Agent → Tauri 创建新的系统窗口（非壁纸层，正常 Z-order）
- 在独立窗口中进行对话
- 对话窗口支持完整的鼠标键盘交互（不受壁纸层限制）

**推荐：两者结合。** 简单操作（查看状态、快捷回复）在壁纸层完成；深度对话唤起独立窗口。

### 4.5 安装/卸载集成

**安装流程：**
```
Tauri 安装程序 (NSIS/WiX)
  ├─ 安装 Tauri 壁纸应用本体
  ├─ 检测 OpenClaw 是否已安装
  │   ├─ 已安装 → 检查版本，提示更新
  │   └─ 未安装 → 下载并运行 OpenClaw 安装程序
  └─ 配置开机自启动
```

**卸载流程：**
```
Tauri 卸载程序
  ├─ 停止壁纸应用
  ├─ 提示用户：是否同时卸载 OpenClaw？
  │   ├─ 是 → 运行 OpenClaw 卸载程序（保留 ~/.openclaw 用户数据）
  │   └─ 否 → 仅卸载壁纸应用
  └─ 清理壁纸相关文件
```

Tauri v2 支持 NSIS 和 WiX 两种 Windows 安装器，可通过自定义安装脚本实现上述逻辑。

---

## 5. 商业化可行性

### 5.1 商店系统技术方案

| 模块 | 技术方案 | 说明 |
|------|---------|------|
| **用户账户** | OAuth2 / 自建账户系统 | 可接入 GitHub/Discord 登录 |
| **积分系统** | 后端数据库 + API | 用户余额、交易记录 |
| **支付** | 微信/支付宝 (国内) + Stripe (海外) | 积分充值 |
| **虚拟商品** | JSON 描述 + 资源文件 | 皮肤、背景、动画包 |
| **商品分发** | CDN + 增量更新 | 下载皮肤资源包 |
| **版权/防盗** | 签名验证 + 在线校验 | 防止资源被提取复用 |

### 5.2 皮肤/背景更换技术

| 类型 | 技术实现 | 难度 |
|------|---------|------|
| **Agent 服装** | Spine Skins 系统，运行时切换 | ⭐⭐ 低 |
| **Agent 外观** | Spine 骨骼 + 多套纹理 Atlas | ⭐⭐ 低 |
| **背景场景** | PixiJS 图层替换 + 视差滚动 | ⭐⭐ 低 |
| **动画效果** | 粒子系统参数 + Shader | ⭐⭐⭐ 中 |
| **完整主题包** | 背景 + 音乐 + 角色皮肤打包 | ⭐⭐⭐ 中 |

Spine 的 Skin 系统天然支持换装，这是 2D 游戏换装的工业标准方案，技术成熟度高。

### 5.3 竞品参考

| 产品 | 商业模式 | 参考点 |
|------|---------|--------|
| **Wallpaper Engine** | 一次性购买 ($3.99) + Steam Workshop 免费社区 | Workshop UGC 生态 |
| **Lively Wallpaper** | 完全免费开源 | 开源运营策略 |
| **Steam Workshop** | 创作者分成（已取消付费 Workshop） | 社区运营经验 |
| **原神/崩铁** | 角色皮肤 + 战斗通行证 | 虚拟商品定价策略 |

**建议的商业模式：**
1. 壁纸应用**免费**分发（获取用户量，同时推广 OpenClaw）
2. **基础皮肤/场景免费**，高级皮肤/场景用积分购买
3. 积分可通过**使用 OpenClaw 赚取**（日活奖励）或**充值购买**
4. AI 接口 Token 充值作为**核心收入来源**
5. 社区 UGC（用户自制皮肤/场景）+ 创作者分成

### 5.4 AI Token 商业化

壁纸可以成为 OpenClaw AI Token 购买的**最自然入口**：
- 用户在壁纸中与 Agent 对话 → 消耗 Token
- Token 不足时壁纸中直接弹出充值界面
- 积分可同时兑换皮肤和 AI Token
- 形成 **壁纸（获客）→ Agent（粘性）→ Token（变现）** 的闭环

---

## 6. 风险评估

### 6.1 风险清单

| # | 风险 | 严重度 | 可能性 | 应对策略 |
|---|------|--------|--------|---------|
| R1 | Windows 更新破坏 WorkerW 机制 | 🔴 高 | 🟡 中 | Win11 24H2 已验证；跟踪 Insider Preview；准备 fallback 方案（普通窗口模式） |
| R2 | 壁纸层鼠标交互体验不佳 | 🟡 中 | 🟡 中 | 支持双模式：壁纸交互 + 独立窗口；热键快速切换 |
| R3 | 长时间运行导致内存泄漏 | 🟡 中 | 🟡 中 | 定期 GC 监控；WebView 内存限制；自动重启机制 |
| R4 | GPU/CPU 占用影响用户体验 | 🟡 中 | 🟡 中 | 自适应帧率；前台暂停；电池模式；用户可调节 |
| R5 | Spine 许可证成本 | 🟢 低 | 🟢 低 | 团队只需 1-2 个 Spine Professional 授权（$339/seat） |
| R6 | tauri-plugin-wallpaper 维护停滞 | 🟡 中 | 🟡 中 | MIT 许可证可 fork；壁纸嵌入核心代码不复杂，可自行维护 |
| R7 | OpenClaw API 变更 | 🟢 低 | 🟡 中 | 壁纸客户端与 OpenClaw 版本对齐；API 版本化 |
| R8 | 杀毒软件误报 | 🟡 中 | 🟡 中 | 代码签名证书；白名单申请；透明的安装过程 |
| R9 | Win10 用户兼容性 | 🟢 低 | 🟡 中 | Tauri 支持 Win10 1803+；WebView2 可嵌入安装包 |
| R10 | 商店支付安全 | 🟡 中 | 🟢 低 | 使用成熟支付 SDK；服务端处理交易逻辑 |

### 6.2 维护成本评估

| 模块 | 预计月维护工时 | 说明 |
|------|--------------|------|
| 壁纸引擎 | 8-16h | Windows 更新适配、Bug 修复 |
| 场景/动画 | 16-32h | 新场景/皮肤制作 |
| OpenClaw 集成 | 8-16h | API 更新同步 |
| 商店系统 | 8-16h | 支付维护、商品管理 |
| **总计** | **40-80h/月** | 约 0.5-1 个全职开发 |

---

## 7. 推荐方案及架构

### 7.1 推荐方案：Tauri + tauri-plugin-wallpaper + PixiJS + Spine

**选择理由：**
1. **技术栈统一** — Rust + TypeScript/JavaScript，与 OpenClaw 生态无缝对接
2. **最低耦合** — 不依赖第三方壁纸引擎的 GPL 代码
3. **商业化友好** — 全 MIT/Apache 许可证，无传染性风险
4. **性能优秀** — Tauri 比 Electron 轻 5-10 倍，PixiJS WebGL 渲染效率高
5. **开发效率** — Web 前端开发速度快，PixiJS + Spine 工具链成熟
6. **跨平台潜力** — Tauri 天然跨平台，未来可扩展 macOS/Linux

### 7.2 技术架构图

```
┌──────────────────────── OpenClaw Wallpaper ────────────────────────┐
│                                                                     │
│  ┌─── Tauri Shell (Rust) ───────────────────────────────────────┐  │
│  │                                                               │  │
│  │  ┌─ tauri-plugin-wallpaper ─┐  ┌─ Process Manager ────────┐ │  │
│  │  │  WorkerW attach/detach   │  │  OpenClaw sidecar         │ │  │
│  │  │  Desktop interaction     │  │  Auto-install/update      │ │  │
│  │  └─────────────────────────┘  │  Health monitoring         │ │  │
│  │                                └───────────────────────────┘ │  │
│  │  ┌─ System Tray ───────────┐  ┌─ IPC Bridge ──────────────┐ │  │
│  │  │  Settings / Quit        │  │  Tauri invoke/events       │ │  │
│  │  │  Mode toggle            │  │  WebSocket proxy           │ │  │
│  │  └─────────────────────────┘  └───────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │ WebView2                             │
│  ┌─── Frontend (TypeScript) ────────────────────────────────────┐  │
│  │                                                               │  │
│  │  ┌─ Scene Layer (PixiJS v8) ──────────────────────────────┐  │  │
│  │  │                                                         │  │  │
│  │  │  ┌── Background ──┐  ┌── Agents (Spine) ───────────┐  │  │  │
│  │  │  │  Parallax BG   │  │  Idle / Working / Error     │  │  │  │
│  │  │  │  Day/Night      │  │  Spine Skins (服装)         │  │  │  │
│  │  │  │  Weather FX     │  │  Click → Info / Chat        │  │  │  │
│  │  │  └────────────────┘  └─────────────────────────────┘  │  │  │
│  │  │                                                         │  │  │
│  │  │  ┌── Effects ─────┐  ┌── UI Overlay ──────────────┐   │  │  │
│  │  │  │  Particles     │  │  Agent status badges        │  │  │  │
│  │  │  │  Glow/Shadow   │  │  Chat bubbles               │  │  │  │
│  │  │  └────────────────┘  │  Mini notifications          │  │  │  │
│  │  │                       └─────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  │                                                               │  │
│  │  ┌─ UI Layer (HTML/CSS/React) ────────────────────────────┐  │  │
│  │  │  Chat Window │ Store │ Settings │ Agent Details        │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  │                                                               │  │
│  │  ┌─ Data Layer ───────────────────────────────────────────┐  │  │
│  │  │  OpenClaw API Client (HTTP + WebSocket)                │  │  │
│  │  │  Store API Client │ Asset Manager │ Cache              │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─── OpenClaw ───────┐     ┌─── Cloud Services ──────┐
│  Gateway API       │     │  User Auth               │
│  Agent Sessions    │     │  Store Backend           │
│  WebSocket Events  │     │  Payment (微信/支付宝)    │
│  Node.js Runtime   │     │  Asset CDN               │
└────────────────────┘     └──────────────────────────┘
```

### 7.3 开发里程碑建议

| 阶段 | 内容 | 预计周期 | 产出 |
|------|------|---------|------|
| **P0: 原型验证** | Tauri + wallpaper plugin + PixiJS 基础场景 | 2-3 周 | 可展示的壁纸 Demo |
| **P1: 核心功能** | OpenClaw 集成 + Agent 状态可视化 + 基础交互 | 4-6 周 | Alpha 版 |
| **P2: 动画系统** | Spine 角色 + 工作/空闲/对话动画 + 换装 | 4-6 周 | Beta 版 |
| **P3: 对话功能** | 壁纸内对话 + 独立窗口对话 | 2-3 周 | 功能完整版 |
| **P4: 商店系统** | 用户系统 + 积分 + 皮肤商店 + 支付 | 4-6 周 | 商业化版 |
| **P5: 安装体系** | OpenClaw 捆绑安装/卸载 + 自动更新 | 2-3 周 | 发布版 |
| **总计** | | **18-27 周 (4.5-7 个月)** | |

### 7.4 技术栈总结

| 层级 | 技术 | 版本 |
|------|------|------|
| 桌面壳 | Tauri v2 | 2.x |
| 壁纸嵌入 | tauri-plugin-wallpaper | v3 |
| 前端框架 | React / Vue 3 / Solid | latest |
| 2D 渲染 | PixiJS | v8 |
| 骨骼动画 | Spine + spine-pixi | 4.2 |
| UI 动画 | Lottie (lottie-web) | latest |
| 通信 | OpenClaw Gateway API (HTTP + WS) | - |
| 后端语言 | Rust (Tauri) + TypeScript | - |
| 安装器 | NSIS (Tauri 内置) | - |
| 包管理 | pnpm | latest |

---

## 8. 参考资料

### 壁纸技术
- [Lively Wallpaper - GitHub](https://github.com/rocksdanister/lively) — GPL v3 开源动态壁纸，WinUI 3 + C#
- [tauri-plugin-wallpaper - GitHub](https://github.com/meslzy/tauri-plugin-wallpaper) — MIT，Tauri v2 壁纸插件
- [DynamicWallpaper Docs - WorkerW 原理](https://dynamicwallpaper.readthedocs.io/en/docs/dev/make-wallpaper.html)
- [Wallpaper Engine Documentation](https://docs.wallpaperengine.io/) — Scene/Web/Video 壁纸开发文档
- [Win11 24H2 壁纸兼容性问题 - Lively Issue #2074](https://github.com/rocksdanister/lively/issues/2074)

### 渲染与动画
- [PixiJS v8 官网](https://pixijs.com/) — 2D WebGPU/WebGL 渲染引擎
- [Spine - Esoteric Software](https://esotericsoftware.com/) — 2D 骨骼动画工具
- [spine-pixi Runtime](https://esotericsoftware.com/spine-pixi) — PixiJS 官方 Spine Runtime
- [Three.js](https://threejs.org/) — 3D WebGL/WebGPU 渲染（2.5D 备选）

### 框架
- [Tauri v2 官方文档](https://v2.tauri.app/) — Rust + WebView 桌面应用框架
- [Tauri Sidecar](https://v2.tauri.app/develop/sidecar/) — 嵌入外部进程
- [Tauri NSIS 安装器](https://v2.tauri.app/distribute/windows-installer/) — Windows 安装/卸载定制

### 商业化参考
- [Steam Workshop Revenue Tools](https://store.steampowered.com/oldnews/15614) — 创作者分成机制
- [Wallpaper Engine Steam Workshop](https://steamcommunity.com/app/431960/workshop/) — UGC 生态参考

---

## 结论

**项目技术可行性：✅ 可行**

核心判断依据：
1. Windows 动态壁纸的 WorkerW 机制已被 Wallpaper Engine（3500 万+用户）和 Lively Wallpaper（数百万用户）充分验证
2. Tauri + tauri-plugin-wallpaper 提供了现成的壁纸嵌入能力，MIT 许可证商业友好
3. PixiJS + Spine 是 2D 交互场景 + 骨骼动画的工业标准方案，性能和工具链均成熟
4. OpenClaw 作为 Node.js 程序可通过 Tauri Sidecar 管理，Gateway API 提供完整的数据接口
5. 鼠标交互是最大技术限制，但通过"桌面聚焦交互 + 独立窗口深度操作"的双模式可以有效缓解

**主要风险点：** Windows 更新对 WorkerW 机制的潜在影响（中等风险，可通过跟踪 Insider Preview 和准备 fallback 方案应对）。

**预计开发周期：4.5-7 个月**（含商店系统和安装体系）。如果只做 MVP（壁纸 + Agent 可视化 + 基础交互），可压缩到 **6-8 周**。
