---
title: "0003 SSE 事件流：让浏览器看到 agent 的每一次心跳"
sidebarGroup: "Pi Web 源码"
shortTitle: "0003 SSE 事件流"
order: 3
date: 2026-09-01
category: "AI"
tag:
  - "Pi Web"
  - "源码"
  - "Agent"
  - "Next.js"
description: "Pi Web 源码系列第 3 篇：事件通道全解。快照去重、事件缓冲、30 秒心跳、优雅关闭窗口、后台标签页对账，以及 useAgentSession 里 2000 行状态机的核心逻辑。"
---

# 0003 · SSE 事件流：让浏览器看到 agent 的每一次心跳

> **源码仓库解读 · Pi Web 系列第 3 篇**
> 主角：`lib/agent-event-stream.ts`（132 行）· `lib/agent-event-connection.ts` · `hooks/useAgentSession.ts`（2033 行）
> 上接：[0002 进程内集成](./0002-binding-inprocess.md)

## 为什么是 SSE

流式聊天要求服务端→浏览器的单向推送。备选项里，WebSocket 是全双工但需要独立端口/升级协议；pi-web 选了 **SSE（Server-Sent Events）**：纯 HTTP、浏览器原生 `EventSource`、自动重连、跟 Next.js 的 Route Handler 天然兼容。代价是单向——但命令本来就走 POST（第 2 篇的命令协议），单向事件流正好补齐另一半。

事件路由只有 39 行，职责清晰：

```ts
// GET /api/agent/[id]/events
const session = getRpcSession(id);                    // 快路径：活着的 wrapper
if (session?.isAlive()) {
  sessionPromise = Promise.resolve(session);
} else {
  // 冷路径：没活着的会话也要能连 SSE（比如刷新页面时 agent 正在跑）
  sessionPromise = startRpcSession(id, filePath).then(r => r.session);
}
const stream = createAgentEventStream(req, id, sessionPromise);
return new Response(stream, { headers: { "Content-Type": "text/event-stream", ... } });
```

注意**冷路径**的存在：SSE 连接本身可能就是"唤醒会话"的第一个请求——用户在另一个标签页发起的任务，刷新后靠这条路径重新挂上事件流。

## 服务端：快照先行，事件去重

`createAgentEventStream` 解决的是所有事件流都头疼的问题：**连接建立和事件产生之间的竞态**。它的顺序是精心安排的：

```ts
// 1) 先发一个空注释，立刻把响应头冲出去（浏览器才能进入 onopen）
enqueueText(":\n\n");
// 2) 等 session 就绪后，先装监听器，再把"此刻的流式消息快照"发给客户端
const snapshot = session.streamingMessage;
encode({ type: "connected", sessionId, isStreaming: session.isStreaming });
// 3) 装监听器之后、发快照之前产生的事件先缓冲，发快照时跳过快照已包含的事件
for (const event of bufferedEvents) forwardEvent(event, snapshot);
if (snapshot) encode({ type: "message_start", message: snapshot });
snapshotPublished = true;
```

三个值得学的细节：

1. **`connected` 是逻辑握手**。HTTP 200 只代表"路由活着"，客户端必须等到 `connected` 事件才知道 agent 真正可用——把传输层就绪和业务层就绪分开；
2. **快照去重**：`isEventIncludedInSnapshot()` 判断事件是否已经体现在快照里，避免刷新页面时先收到一份旧流式消息、又收到它的增量；

```ts
export function isEventIncludedInSnapshot(event, snapshot) {
  return snapshot !== undefined
    && (event.type === "message_start" || event.type === "message_update")
    && event.message === snapshot;   // 引用相等：就是同一条消息
}
```

3. **30 秒心跳**（`":\n\n"` 注释帧）防止代理/负载均衡掐断空闲连接，同时不污染客户端事件解析。

事件本身还要过一道 `toClientAgentEvent()` 的"窄化"：丢掉客户端不关心的 `turn_start/turn_end`，给 `toolcall_start/delta` 补上 `toolName` 元数据（客户端渲染工具卡要用），把 0.84 的 `message_update` 投影成轻量 delta——**服务端先把事件"瘦身"，浏览器才不用拉全量 partial**。

## 客户端：连接的"保鲜"策略

前端把 EventSource 封装成 `AgentEventConnection`（`lib/agent-event-connection.ts`），核心不是"连"，而是"**什么时候该连着**"：

```ts
new AgentEventConnection({
  createSource: (sid) => new EventSource(`/api/agent/${sid}/events`),
  shouldMaintain: (sid) =>
    sessionHookMountedRef.current
    && sessionIdRef.current === sid
    && (agentRunningRef.current                    // 正在运行
        || eventStreamGraceActiveRef.current       // 或处于 30 秒优雅期
        || (sessionPropIdRef.current === sid && sessionRunningRef.current)),
  readinessTimeoutMs: EVENT_STREAM_READY_TIMEOUT_MS,
  reconnectDelayMs: EVENT_STREAM_RECONNECT_DELAY_MS,
})
```

三条保鲜规则对应三种场景：

- **运行中保持**：agent 在跑，流必须开着；
- **优雅期**：`prompt_done` 之后流不立刻关，留 30 秒窗口被下一次 prompt 复用——省掉连续对话时反复建连的延迟。`agent_start` 会取消关闭计时器；`agent_settled`（扩展注入的运行结束时）重新开窗；
- **归属校验**：当前会话切换走了，旧流立刻降级关闭。

为什么不"永远保持一条流"？因为每个会话一条流、每个标签页可能开多个会话，全保持的话服务端挂着一堆空闲连接；优雅期是个折中。

## 事件→状态机：handleAgentEvent 的规矩

`useAgentSession.ts` 里 200 多行的 `handleAgentEvent` 是把事件翻译成 UI 状态的核心。它有三条铁律：

**铁律一：一个逻辑 prompt 可能产生多个 `agent_end`。**重试、自动压缩、扩展排队的消息都会让 agent 继续跑。所以：

```ts
case "agent_end":
  // 不要在这里关流、不要立刻宣布完成——等 prompt_done / agent_settled
  if (!agentRunningRef.current) break;
  dispatch({ type: "end" });
  loadSession(sessionIdRef.current);   // 落盘内容重新加载
  break;
```

真正"尘埃落定"的信号是 `agent_settled`（SDK 层面彻底空闲）或 `prompt_done`（本条 RPC 完成）。

**铁律二：单调 run id 过滤迟到事件。**每次提交 prompt，`promptRunIdRef.current` 自增；所有 SSE 回调和轮询响应都带着 run id，**旧 run 的迟到事件直接丢弃**——否则被冻结的后台标签页缓冲的一批旧事件，会在恢复前台时"复活"一个幽灵流式气泡。

**铁律三：不信任单通道，定期对账。**SSE 是主通道，但后台标签页会被浏览器节流、连接可能半开。所以运行期间还周期性 `GET /api/agent/[id]` 拉权威状态，并在 `visibilitychange` / `online` 时立即对账一次。侧栏的"运行中"标记则靠每 2.5 秒轮询 `/api/agent/running`（后台标签页暂停轮询）。

## 一次完整的回合，时间线长这样

```
用户输入 ──▶ POST /api/agent/[id] {type:"prompt"}      （等 preflight 受疑）
              │ 200 OK（受理）                          ← UI 进入"等待模型"
浏览器 ──────▶ GET /api/agent/[id]/events （prompt 前已开好流）
服务端事件流：
  connected        → 同步 isStreaming 基线
  agent_start      → agentRunning=true，phase=waiting_model
  message_update   → assistantMessageEvent delta 逐 token 渲染
  toolcall_start   → 工具卡出现（参数还在流）
  tool_execution_update → 工具进度条
  message_start/update  → 消息树增量更新
  agent_end        → loadSession() 拉落盘全量，校正流式期间的大致渲染
  prompt_done      → 完成通知 + 30s 优雅期开始
  （下次 prompt 复用同一条流，或优雅期后自动关闭）
```

`agent_end` 时用**落盘文件**重新加载一遍会话，是最后一道保险：流式期间的增量渲染允许"近似"，回合结束后必须和 JSONL 权威数据对齐。

## 本篇小结

| 问题 | pi-web 的答案 |
|---|---|
| 推送通道 | SSE（原生 EventSource，命令走 POST 分离） |
| 连接竞态 | 先冲头、再握手、快照+缓冲去重 |
| 连接生命周期 | 运行保持 + 30s 优雅复用 + 归属校验 |
| 事件乱序/迟到 | 单调 run id + 幽灵气泡防御 |
| 通道不可靠 | 定期轮询 + visibilitychange 对账 + 落盘校正 |

命令进（0002）、事件出（0003），pi 和 web 的血管接通了。但还有一层隐秘的契约没拆：**磁盘上那份 JSONL 会话文件到底长什么样？pi-web 又是怎么在"只读浏览"和"进程内运行"两条路径之间共享它的？**这是第 4 篇的主题。

> 下一篇：[0004 · 会话文件：一份 JSONL，两种读法](./0004-session-format.md)
