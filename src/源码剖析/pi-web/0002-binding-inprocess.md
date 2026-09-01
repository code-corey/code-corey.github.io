---
title: "0002 进程内集成：把 AgentSession 关进 Next.js"
sidebarGroup: "Pi Web 源码"
shortTitle: "0002 进程内集成"
order: 2
date: 2026-09-01
category: "源码剖析"
tag:
  - "Pi Web"
  - "源码"
  - "Agent"
  - "Next.js"
description: "Pi Web 源码系列第 2 篇：开篇先用大白话讲清'一个进程、两种通道'的结合点，再拆命令通道全解：startRpcSession 的并发锁、globalThis 注册表对抗热重载、10 分钟空闲回收、fork 的夺舍陷阱，以及 24 个命令协议的完整清单。"
---

# 0002 · 进程内集成：把 AgentSession 关进 Next.js

> **源码仓库解读 · Pi Web 系列第 2 篇**
> 主角：`lib/rpc-manager.ts`（2043 行）· `app/api/agent/[id]/route.ts` · `app/api/agent/new/route.ts`
> 上接：[0001 开箱全景](./0001-panorama.md)

## 先看懂结合点：一个进程，两种通道

不急着读源码，先用大白话把"结合"这件事说透。一句话版本：

> **pi 团队把"大脑"做成了 npm 包；pi-web 把这个包装进自己的服务器进程里。网页和 pi 之间的结合点不是网络，而是一次普通的函数调用。**

pi 这个项目分两层：上层是 TUI（终端皮肤，负责画框、显示颜色、响应键盘），下层是内核（agent 大脑，管会话、调模型、执行工具）。关键是：**内核作为库发布**——任何人 `import { createAgentSession } from "@earendil-works/pi-coding-agent"`，就等于在自己的程序里养了一个 pi。就像汽车厂除了卖整车（pi TUI），还卖发动机（SDK）；pi-web 拿发动机自己造了个车身（网页）。

于是 pi-web 的 Next.js 服务端进程长这样：

```
一个 Node 进程
┌──────────────────────────────────────┐
│  Next.js 服务器（负责 HTTP）          │
│                                      │
│  内存放着 N 个 pi 的 AgentSession 对象 │  ← pi 就"住"在这里
└──────────────────────────────────────┘
         ▲ HTTP                │ 函数调用
         │                     ▼
     你的浏览器            模型 API / 你的文件系统
```

跟着一条消息走一遍。你在网页输入"帮我写个函数"并回车：

```
浏览器                     Next.js 服务器                    pi 内核(同进程)
  │                              │                              │
  │ ① POST /api/agent/xxx        │                              │
  │    {type:"prompt",           │                              │
  │     message:"帮我写个函数"}   │                              │
  │ ────────────────────────────▶│                              │
  │                              │ ② wrapper.send(command)      │
  │                              │    → session.prompt("...")   │
  │                              │ ────────────────────────────▶│ （就是调个函数！）
  │                              │                              │ ③ 开始干活：
  │                              │                              │    调模型、跑工具…
  │                              │ ④ 每一步产生事件，             │
  │ ⑤ SSE 长连接持续推送           │    通过订阅回调流向服务器       │
  │    token/token/token…        │◀─────────────────────────────│
  │◀─────────────────────────────│                              │
  │ ⑥ React 把事件渲染成           │                              │
  │    聊天气泡 / 工具卡片          │                              │
```

- **①②③ 是"进"**：输入变成 HTTP 请求，服务器转手一个函数调用喂给内核——本篇的主角；
- **④⑤⑥ 是"出"**：内核干活的每一步都以事件形式经 SSE 实时推给浏览器——第 3 篇的主角。

还有一层看不见的结合：**双方共用 `~/.pi/agent/sessions/*.jsonl` 磁盘文件**，不另建数据库。所以终端里聊到一半的会话，打开网页能接着聊；网页里改的默认模型，回到终端也生效——两个播放器共用同一个曲库。

澄清两个最常见的误解：

| 误解 | 实际情况 |
|---|---|
| "pi-web 是不是偷偷启动了一个 pi 命令行程序？" | **不是**。没有子进程，pi 的代码是作为库被 import 进来的（源码第一行就是 `import { createAgentSession }`） |
| "浏览器是不是在远程控制一个终端？" | **不是**。浏览器收到的是结构化 JSON 事件（"这条消息新增了 5 个 token"），不是终端画面的文字截图 |

带着这张地图，下面正式进源码。

## 先回答"为什么不是子进程"

给 TUI agent 做壳，最直觉的方案是 `spawn` 一个 CLI 子进程然后解析 stdout。pi-web 的第一个提交就否决了这条路——它直接：

```ts
import { createAgentSession } from "@mariozechner/pi-coding-agent";
// ……
const { session: inner } = await createAgentSession({ cwd, agentDir, sessionManager });
```

进程内集成意味着：

- **零协议**：调 pi 就是普通函数调用，没有 stdout 文本协议要维护；
- **事件是对象**：`session.subscribe(cb)` 拿到的是结构化事件，不用从终端渲染流里反推；
- **扩展免安装**：pi 的扩展加载机制原样工作，Web 端不需要"扩展代理"层；
- **代价**：AgentSession 对象活在 Next.js 的 Node 进程里，必须处理**热重载、并发请求、内存泄漏**这些 Web 服务器的老问题。

`rpc-manager.ts` 从首版的 276 行涨到今天的 2043 行，涨出来的全部是这一课的学费。

## AgentSessionWrapper：一层"命令协议"皮肤

pi 的 `AgentSession` 是一个面向 TUI 的富对象。pi-web 给它套了一层 `AgentSessionWrapper`，对外只暴露一个方法：

```ts
export class AgentSessionWrapper {
  async send(command: Record<string, unknown>): Promise<unknown>
}
```

HTTP POST 进来的 `{type: "prompt", message: "..."}`、`{type: "abort"}`、`{type: "fork", entryId}` 都进这一个 `send()` 的大 switch。这个设计的妙处：**浏览器侧只需要一个 fetch helper**（`lib/agent-client.ts` 才 53 行），协议版本管理、权限校验、审计都有了单一收口。

命令全集（v0.8.11，24 个）按职责分四组：

| 分组 | 命令 |
|---|---|
| 运行控制 | `prompt` `steer` `follow_up` `abort` `abort_compaction` `compact` `clear_queue` |
| 状态查询 | `get_state` `get_session_stats` `get_last_assistant_text` `get_tools` `get_commands` |
| 会话结构 | `fork` `clone` `navigate_tree` `set_session_name` |
| 配置切换 | `set_model` `set_thinking_level` `set_tools` `set_auto_compaction` `set_auto_retry` `reload` |
| 扩展交互 | `extension_ui_response` `extension_ui_input` `bash` `abort_bash` |

对比首版的 13 个命令，新增的几乎都是"防翻车"设施——这正是第 6 篇要讲的演进主线。

## globalThis 注册表：对抗 Next.js 热重载

第一个工程难题来自 Next.js 的 dev 模式：模块会随热重载被反复求值，普通的模块级 `Map` 一刷新就清空，正在运行的 AgentSession 引用直接丢失。pi-web 的解法是把注册表挂在 `globalThis` 上：

```ts
declare global {
  var __piSessions: Map<string, AgentSessionWrapper> | undefined;
  var __piStartLocks: Map<string, Promise<StartResult>> | undefined;
}

function getRegistry(): Map<string, AgentSessionWrapper> {
  if (!globalThis.__piSessions) {
    globalThis.__piSessions = new Map();
    process.once("exit", destroy);
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  }
  return globalThis.__piSessions;
}
```

`globalThis` 在模块重载间存活，注册表因此稳定。同一招还用在启动锁上：两个请求同时要打开同一个会话文件时，`__piStartLocks` 保证只有一次真实的 `createAgentSession`，第二个请求 await 同一个 Promise——**并发去重靠共享 Promise，而不是布尔标志**，这是 Node 里处理"single-flight"的标准姿势。

## 会话的一生：懒创建、忙保持、闲回收

AgentSession 不便宜（要加载扩展、扫 skills、建模型注册表），所以 pi-web 的生命周期策略是"**按需创建，用完即弃**"：

```
浏览器点开会话 ──▶ GET /api/agent/[id] ──▶ 注册表有活着的 wrapper？
                                            ├─ 有 → 复用
                                            └─ 没有 → 只返回 {running:false}，不创建
浏览器发消息   ──▶ POST /api/agent/[id] ──▶ 没有才真正 startRpcSession()
                                            └─ 创建 → 注册 → 10 分钟空闲计时
10 分钟无事件 ──▶ wrapper.shutdown() ──▶ emit session_shutdown → inner.dispose()
```

几个精确的细节：

1. **只读浏览不付创建成本**。历史会话浏览走的是纯文件读取（第 4 篇），只有真正发消息才创建 AgentSession；
2. **空闲计时器会被任何事件重置**（`resetIdleTimer()`），且正在运行（streaming/compacting/bash）时强制续期，绝不误杀；
3. **销毁讲究顺序**：先给扩展发 `session_shutdown` 事件（让 MCP 子进程有机会优雅退出），再 `inner.dispose()`，最后从注册表摘除。`destroy()` 和优雅的 `shutdown()` 分开，进程退出时走同步的 destroy 兜底。

## prompt 命令：两阶段确认 + 单飞序列化

24 个命令里最讲究的是 `prompt`。它解决了两个问题：**重复提交**和"到底接没接到"。

```ts
case "prompt": {
  // 1) 只串行化"准入"：前一发 prompt 通过或失败预检后，才放行下一发
  const releaseAdmission = await this.acquirePromptAdmission();
  try {
    // 2) SDK 的 preflightResult 回调 = pi 的同步校验 + 扩展预检已接受
    prompt = this.inner.prompt(msg, {
      source: "rpc",
      preflightResult: (success) => { if (success) acceptPreflight(); },
    });
    await preflight;          // 3) POST 响应等到"确认受理"才返回
  } finally { releaseAdmission(); }
}
```

要点拆开看：

- **准入队列**（`promptAdmissionTail`）是个 Promise 链，把并发的 prompt 提交排成串行准入——但只锁"进门"，不锁整个运行期，后续提交仍可借助 SDK 的流式队列变成 steer/followUp；
- **preflight 回调**是 pi SDK 的 RPC 约定：HTTP 响应只在"同步校验通过 + 扩展预检接受"后返回成功，否则立刻返回 `prompt_rejected`。用户按回车到看见"已受理"之间没有任何投机状态；
- **失败分类**：预检被拒 → POST 直接报错；受理后运行期崩溃 → 发异步 `prompt_error` 事件。两种路径的 UI 表现不同（一个是红 toast，一个是消息流里的错误），协议上必须分开。

## fork 的"夺舍"陷阱：一个值得裱起来的注释

`AGENTS.md` 里专门立了一条军规，源头是这个 API 的隐蔽行为：

> `AgentSession.fork()` **mutates the wrapper's inner state in-place** — after fork, `inner.sessionId` is the *new* session's id.

也就是说 fork 不是"给我一份新的"，而是"我现在就是新的了"。如果 wrapper 还挂在旧 id 下面，下一个请求会拿到一个**内部已经是另一个会话**的对象，再 fork 一次就产生损坏的 parentSession 链。pi-web 的解法：

```ts
case "fork": {
  // …… SessionManager.createBranchedSession() 造出新文件、算出 newSessionId
  await this.shutdownAfterSessionReplacement("fork");  // 旧 wrapper 立即销毁
  return { cancelled: false, newSessionId };
}
```

fork/clone 被统一成"会话替换"状态机：替换期间只允许 8 个只读命令通过（`COMMANDS_ALLOWED_DURING_SESSION_REPLACEMENT`），替换完成立刻销毁旧 wrapper，下次访问旧 id 时从原始 JSONL 重新加载一个干净的 AgentSession。**用"重建"换"一致"，比小心翼翼地修补状态便宜得多。**

## 新会话的创建参数：一次性 key 的巧思

`POST /api/agent/new` 创建新会话时有个有趣的细节——它不传真实 id，而是：

```ts
const tempKey = `__new__${randomUUID()}`;
const { session, realSessionId } = await startRpcSession(tempKey, "", cwd, {...});
```

因为 `startRpcSession` 会按 key 做并发合并，如果用 `Date.now()` 之类的低精度 key，同一毫秒的两个"新会话"请求会被错误地合并成一个。UUID key 保证每个新会话请求都独立，创建完再从 `inner.sessionId` 拿 pi 分配的真实 id。

## 本篇小结

| 机制 | 手段 | 防的坑 |
|---|---|---|
| 对象存活 | `globalThis.__piSessions` | 热重载丢引用 |
| 并发创建 | `__piStartLocks` 共享 Promise | 同会话双开 |
| 资源回收 | 10 分钟空闲计时 + 运行中续期 | 内存泄漏/误杀 |
| 提交语义 | preflight 两阶段 + 准入队列 | 重复提交/假成功 |
| fork/clone | 会话替换状态机 + 立即销毁 | inner 被夺舍 |
| 优雅退出 | session_shutdown → dispose | 扩展子进程残留 |

命令通道解决的是"指令怎么进去"。下一个问题是：**token 和事件怎么流出来？**这就是第 3 篇的主角——SSE 事件流。

> 下一篇：[0003 · SSE 事件流：让浏览器看到 agent 的每一次心跳](./0003-binding-sse.md)
