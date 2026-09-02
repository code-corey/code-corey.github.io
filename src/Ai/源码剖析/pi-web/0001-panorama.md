---
title: "0001 开箱全景：pi-web 是什么，pi 和 web 凭什么能结合"
sidebarGroup: "Pi Web 源码"
shortTitle: "0001 开箱全景"
order: 1
date: 2026-09-01
category: "AI"
tag:
  - "Pi Web"
  - "源码"
  - "Agent"
  - "Next.js"
description: "Pi Web 源码系列第 1 篇：仓库地形、与 pi 的亲缘关系、整体架构一张图，以及这个仓库最特别的气质——一份写给 AI 协作者的开发手册。"
---

# 0001 · 开箱全景：pi-web 是什么，pi 和 web 凭什么能结合

> **源码仓库解读 · Pi Web 系列第 1 篇**
> 仓库：[agegr/pi-web](https://github.com/agegr/pi-web) · 版本：v0.8.11（2026-08-26）
> 上游：[earendil-works/pi](https://github.com/earendil-works/pi) v0.84.3 · 本地克隆逐行核对

## 为什么读

终端里的编码智能体（Claude Code、Pi、dsh……）都有一个共同的尴尬：**能力在终端，用户在浏览器**。给 agent 做一个 Web 界面，是 2026 年最常见的需求之一，但做法天差地别：

- 有的把 agent 当黑盒，用 PTY 模拟终端屏幕，截屏解析；
- 有的重写一遍 agent 协议，自己维护一套 RPC；
- 而 pi-web 选了第四条路——**把 pi 的 SDK 直接 import 进 Web 服务端进程，进程内持有 AgentSession 对象**。

这条路的好处是零协议成本、事件零延迟、扩展生态全部复用；代价是必须驯服 Next.js 的热重载、适配 TUI 的种种假设。它是怎么做到的？这就是本系列要拆解的核心。

## 它和 pi 是什么关系

先厘清三个名字：

| 名字 | 是什么 | 仓库 / 包名 |
|---|---|---|
| **pi** | 终端编码智能体本体（TUI） | `earendil-works/pi` |
| **pi SDK** | pi 的可编程内核，四个包 | `@earendil-works/pi-agent-core` / `pi-ai` / `pi-coding-agent` / `pi-tui` |
| **pi-web** | 社区官方生态的 Web UI，作者是 Alex Yang | `agegr/pi-web` → npm `@agegr/pi-web` |

pi-web 的 `package.json` 依赖写得直白：

```json
"dependencies": {
  "@earendil-works/pi-agent-core": "0.84.3",
  "@earendil-works/pi-ai": "0.84.3",
  "@earendil-works/pi-coding-agent": "0.84.3",
  "@earendil-works/pi-tui": "0.84.3",
  "next": "16.3.1",
  "react": "^19.2.4"
}
```

四个 pi 包**精确锁版**到 0.84.3。pi 每次0.01 的版本跳动，pi-web 都要发一次适配提交——本系列 [0006 演进史](./0006-evolution.md)会统计，5 个月里这样的"跟随升级"发生了 15+ 次。这是"寄生式 UI"的宿命：**上游动一动，你就得跟一步**。反过来说，pi 的所有能力（会话管理、模型注册、OAuth、扩展系统、skills）都天然继承，一行不用写。

**共享的数据契约**是另一层绑定：pi-web 不建自己的数据库，直接读写 pi 的家目录：

```
~/.pi/agent/
  sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl   ← 会话文件（双方共读共写）
  settings.json / models.json / auth.json           ← 模型与凭据（双向同步）
  agents/settings.json                              ← 内置子代理开关
```

在 pi TUI 里聊到一半的会话，打开浏览器就能接着聊；反过来在网页里改了默认模型，回到终端也生效。README 里那句 "uses the same local configuration and session files as pi" 不是口号，是架构本身。

## 整体架构一张图

仓库自带的 `AGENTS.md` 里有一张 ASCII 架构图，可以说是全项目的"一句话说明书"：

```
Browser                Next.js Server              AgentSession (in-process)
  │                        │                               │
  ├─ GET /api/sessions ────▶ reads ~/.pi/agent/sessions/   │
  ├─ GET /api/sessions/[id] reads .jsonl file directly     │
  ├─ GET /api/agent/running ───────▶ running id snapshot   │
  │                        │                               │
  ├─ send message ─────────▶ POST /api/agent/[id]          │
  │                        │   startRpcSession() ─────────▶│ createAgentSession()
  │                        │   session.send(cmd) ─────────▶│ session.prompt()
  │                        │                               │
  ├─ SSE connect ──────────▶ GET /api/agent/[id]/events    │
  │                        │   session.onEvent() ◀─────────│ session.subscribe()
  │◀── data: {...} ─────────│                               │
```

三个分区，三条通道：

1. **只读通道**：浏览历史会话时**不创建** AgentSession，服务端直接读 `.jsonl` 文件（`lib/session-reader.ts`），带 TTL 缓存和有界读取；
2. **命令通道**：发消息/中止/ fork 时才通过 `startRpcSession()` 在进程内实例化 AgentSession，浏览器发的是 `{type: "prompt" | "abort" | "fork" | ...}` 这样的命令 JSON；
3. **事件通道**：AgentSession 的所有事件经 `session.subscribe()` 转成 **SSE** 推给浏览器，流式 token、工具调用进度全靠它。

本系列第 2、3 篇分别拆命令通道和事件通道。

## 源码地图

```
pi-web/                          约 4.4 万行 TS/TSX，144 个 *.test.mjs
  bin/pi-web.js            132   CLI 入口：spawn node next start，Ready 后开浏览器
  app/api/                 40+   Next.js Route Handlers（本次剖析的主战场）
    agent/[id]/events/           ★ SSE 事件流
    agent/new · agent/[id]/      ★ 命令通道（进程内 RPC）
    sessions/*                   会话浏览/分叉/导出/自动命名
    files/* · git/* · cwd/*      文件查看器与 Git 集成
    auth/* · models-config/*     OAuth/API key/模型管理
    skills/* · plugins/* · subagents/*   资源与子代理
  lib/                     90+   服务端/共享逻辑
    rpc-manager.ts        2043  ★ AgentSessionWrapper + 注册表（系列第 2 篇）
    agent-event-stream.ts  132  ★ SSE 流的生成（第 3 篇）
    session-reader.ts      652  ★ JSONL 读取/缓存/上下文组装（第 4 篇）
    custom-ui-terminal.ts   32  ★ 92 列"虚拟终端"（第 5 篇）
  components/              30+   React 前端（ChatWindow/FileExplorer/ModelsConfig...）
  hooks/useAgentSession.ts 2033  ★ 前端状态机：SSE 消费 + 对账（第 3 篇）
  AGENTS.md                234   写给 AI 协作者的开发手册（见下文）
  docs/adr/                 3 份 架构决策记录
```

## 这个仓库最特别的气质：写给 AI 看的开发手册

翻开源码第一眼不是代码，是 `AGENTS.md`——一份 234 行的**开发纪律文档**，明确写给 AI 编码助手（以及人类新人）。它不介绍功能，全是"陷阱与规矩"：

> **Fork must destroy the wrapper immediately.** `AgentSession.fork()` mutates the wrapper's inner state in-place — after fork, `inner.sessionId` is the *new* session's id...

每一条都是真实的坑：fork 后必须立刻销毁 wrapper，否则注册表里躺着的是已被"夺舍"的旧对象；Windows 路径比较永远用 `samePath()` 而不是 `===`；`enabledModels` 的 glob 语义必须委托给 SDK 的 `resolveModelScopeWithDiagnostics()`，不然 TUI 和网页看到的模型列表会不一致……

配合 `CONTEXT.md`（术语表：什么必须叫 "Host Runtime Environment"，什么必须叫 "Project Command Environment"）和 `docs/adr/`（3 份正式 ADR），这个仓库展示了一种成熟的 **AI 协作开发方法论**：把架构决策和踩坑记录固化成机器可读的规约，让每一次 AI 提交都有章可循。第 6 篇我们会结合提交历史展开。

## 三个数字看生长速度

- **第 1 个提交就是完整 MVP**：2026-03-18，45 个文件，SSE、进程内 RPC、会话/文件浏览、分支导航全部就位——之后 5 个月都是在它上面"添肉"；
- **rpc-manager.ts 从 276 行长到 2043 行**：命令协议从 13 个指令扩展到 24 个，新增的全是"运营一个长期存活的会话"所需的生命周期管理；
- **发布节奏**：7 月之前手动 bump 版本，7 月起进入 `Release v0.7.x → v0.8.x` 的流水线节奏，v0.8.11 时已支持 `npx @agegr/pi-web@latest` 一键起服务。

## 本系列怎么读

| 篇 | 主题 | 回答的问题 |
|---|---|---|
| 0002 | 进程内集成 | pi 的 AgentSession 怎么"住"进 Next.js？命令怎么发？对象怎么活？ |
| 0003 | SSE 事件流 | token 怎么流到浏览器？断线重连和状态对账怎么做？ |
| 0004 | 会话文件 | JSONL 里有什么？两种分叉是什么？pi-web 如何给 pi 的格式"私有扩展"？ |
| 0005 | TUI 桥接 | 给终端写的扩展，凭什么能在浏览器里弹窗、画 widget？ |
| 0006 | 演进史 | 608 个提交如何一步步长成 v0.8.11？ |
| 0007 | 安全边界 | 一个能执行命令的网页，怎么把自己关进笼子？ |
| 0008 | 总结 | 给 agent 换皮的三条路线，borrow vs build 清单 |

> 下一篇：[0002 · 进程内集成：把 AgentSession 关进 Next.js](./0002-binding-inprocess.md)
