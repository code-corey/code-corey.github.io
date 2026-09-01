---
title: "0004 会话即事实：只追加的 SessionEvent 日志"
sidebarGroup: "DeepSeek Harness"
shortTitle: "0004 会话即事实"
order: 4
date: 2026-08-31
category: "源码剖析"
tag:
  - "DeepSeek Harness"
  - "源码"
  - "Agent"
description: "第 4 篇：12 种事件词汇表、投影规则、不变量执行器与崩溃恢复，模型可见即已记录。"
---

# 0004 · 会话即事实：只追加的 SessionEvent 日志

> **源码仓库解读 · DeepSeek Harness 系列第 4 篇**
> 剖析对象：`packages/core/session/`（11 个源文件，3063 行）
> 上篇：[0003 装配的艺术](./0003-assembly.md)

## 为什么读

任何一个 agent harness 都绕不开同一个问题：**模型的上下文从哪来？**

主流答案是"消息数组"——代码里维护一个 `messages: Message[]`，每轮 push/pop。它直观，但很快会遭遇经典困境：压缩（compaction）时改历史、fork 时复制历史、崩溃后历史不完整、UI 展示的历史和模型收到的不一致……每个功能都在消息数组上打补丁。

dsh 给出的答案完全不同：**维护一个只追加的事件日志，模型上下文只是日志的一个投影（projection）**。配套一条被运行时强制执行的不变量：

> **模型可见即已记录**（what the model sees is what's logged）——任何抵达模型的输入，都必须能从日志重建。

这一篇我们看这个设计如何落实到 3063 行代码里：事件词汇表、投影机制、不变量执行器、崩溃恢复。

## 源码地图

```
packages/core/session/src/
  index.ts      1156 行  SessionStore 服务 + Session 对象 + deriveMessages
  types.ts       430 行  SessionEventMap 词汇表 + SessionEvent 信封
  surface.ts     460 行  表面：消息节点序列 + 投影规则 deriveEventMessage
  chunk-rows.ts  370 行  持久化记录打包（供存储后端用）
  invariant.ts   249 行  ★ 关系不变量执行器（本篇高潮）
  repair.ts      134 行  崩溃恢复：合成缺失的边界事件
  request-header.ts / seq-ranges.ts / preparation.ts / known-event-types.ts
```

## 逐段剖析

### 1. 词汇表：12 种事件，三种角色

`types.ts` 的 `SessionEventMap` 是整个会话系统的宪法。事件不多，一共 12 种：

| 类型 | data | 角色 |
|---|---|---|
| `turn/start` / `turn/end` | 轮次号（end 带 reason） | 边界 |
| `step/start` / `step/end` | 轮次号 + 步骤号 | 边界 |
| `user/message` | UserMessage | 消息（可上表面） |
| `assistant/chunk` | 流式片段 | 追踪（回放/UI 保真） |
| `assistant/message` | 完整消息 + usage + interrupted? | 消息（可上表面） |
| `tool/call` | callId + name + arguments | 追踪 + 调用登记 |
| `tool/result` | 结果消息 + error? | 消息（可上表面） |
| `request/header` / `request/context` | 模型请求元数据 | 模型可见的请求事实 |
| `session/end-seed` | 空对象 | 生命周期标记 |

注意 `assistant/chunk` 的定位：它**不参与**模型历史推导（消息会由 `assistant/message` 事件记录），它存在纯粹为了"回放和 UI 保真"——你能在界面上看到打字机效果逐字重现，靠的是这些 chunk。**边界、消息、追踪三种角色分开建模，是词汇表设计的第一个看点。**

### 2. 信封设计：一个 `ignorable` 字段管住词汇演进

每个事件的信封（`types.ts:391`）是精心设计过的判别联合：

```ts
export type SessionEvent<T> = {
  [K in SessionEventType]: {
    type: K
    seq: number          // 会话内严格单调递增
    time: number         // Unix 毫秒
    data: SessionEventMap[K]
    ignorable?: true     // ★ 读者不认识此类型时可安全跳过
  } & (K extends SurfaceEventType ? {
    sourceEventSeqs?: number[]   // 引用的早期事件 seq
    surfaceOp?: SurfaceOp        // 如何进入表面（append/replace）
  } : object)
}[T]
```

三个字段各管一件大事：

**`ignorable`——词汇增长的护栏。** 注释把设计动机写得掷地有声：

> an unrecognized required event may change how the rest of the log is interpreted. A writer sets `true` only on purely informational records... **defaulting to required means a forgotten marker over-refuses (an inconvenience) rather than silently resuming a gutted session.**

旧版本运行时读到不认识的事件类型时：没标 `ignorable` 就**必须拒绝重建**，而不是悄悄丢掉。宁可报错（造成不便），不可沉默地读一份被掏空的会话。新插件想往日志里加自己的事件类型？不用升级格式版本，标上 `ignorable: true` 即可——词汇表因此可以安全地被插件扩展。

**`surfaceOp` + `sourceEventSeqs`——只有消息类事件才有。** `assistant/message` 记录它由哪些 `assistant/chunk` seq 组成；压缩（compaction）产生的 replace 节点记录它遮蔽了哪些旧节点。编译器强制非表面事件不得携带这些字段。

**`SESSION_FORMAT_VERSION = 0`——版本纪律。** 什么情况才 bump 版本？注释给出一条可操作的定义：*"bump exactly when an older runtime could no longer handle a new log with full semantic correctness. **'Parses without error' is not correctness**"*——"能解析"不等于"读对了"。悄悄跳过影响重建语义的内容，就是读错了。还补了一句工程智慧：*"When in doubt, bump: a near-identity upgrade step is almost free, a missed bump makes older runtimes read new logs wrong silently."* 犹豫就 bump——近似恒等的升级步骤几乎免费，漏 bump 的代价是旧运行时沉默地读错。

### 3. 表面与投影：一条函数就是全部规则

日志里大部分事件不是消息（边界、chunk、遥测）。**哪些事件、以什么顺序构成模型历史？** dsh 的答案是一个纯函数（`surface.ts:83`）：

```ts
/** This is THE per-node projection rule ... external reconstructors and
    pure projections fold the same function over a log prefix's surface
    to rebuild the exact messages any request was built from. */
export function deriveEventMessage(event: SessionEvent): Message | null {
  switch (event.type) {
    case 'user/message':     return event.data
    case 'assistant/message': return event.data.message.content.length === 0 ? null : event.data.message
    case 'tool/result':      return event.data.message
    default:                 return null   // 边界、chunk、纯记录 → 不产生消息
  }
}
```

注释强调两点纪律。其一，这是**唯一的**投影规则：`Session.deriveMessages` 用它折叠在线表面，外部重建器（持久化恢复、transcript 导出）对日志前缀折叠同一个函数，得到的消息与当时构建请求所用的**逐字节一致**。其二，投影是**逐字透传**：

> Do NOT re-add per-type framing (e.g. `<context>`) here: framing is caller-owned.

想给注入的上下文加 `<system-reminder>` 之类的包装？生产者自己在 `content` 里包好，投影层永远不加戏。**投影层不篡改事实，这是"模型可见即已记录"能够成立的前提。**

性能上 `deriveMessages()` 做了增量缓存：每个表面节点只投影一次，每次调用只花 O(新增节点)；返回数组是快照，但其中的 `Message` 对象是共享且深冻结的——**消费者拿到手不可能改坏日志**，缓存层也无需二次拷贝。

### 4. 不变量执行器：让"模型可见即已记录"长出牙齿

`invariant.ts` 是这个包最精彩的一个文件：一个**关系不变量校验器**，把日志的语法和语义约束写成可执行的检查。它监听 Cordis 的 `internal/dispatch`，在 `session/event` 发布**之前**做纯校验：

```ts
ctx.on('internal/dispatch', (_mode, eventName, args) => {
  if (eventName !== 'session/event') return
  const [session, event] = args as [Session, SessionEvent]
  const trace = traceFor(session)
  const transition = validateEvent(trace, event, fail)   // 纯校验，不改状态
  stagedTransitions.set(event, { session, trace, transition })
})
ctx.on('session/event', (session, event) => {
  const staged = stagedTransitions.get(event)            // 事件真正提交后才落账
  ...
})
```

先校验暂存、提交才生效——注释解释了为什么：*"A later dispatch listener may veto. Validation is pure, so abandoning this weakly keyed transition does not advance or retain the session."* 如果另一个监听器否决了这条事件，暂存的转换直接作废，账本纹丝不动。

`validateEvent` 检查的关系约束包括：

- `seq` 必须严格递增（`saw 5 after 7` 直接 fail）；
- `turn/start` 时不得已有打开的 turn；`turn/end` 时不得有打开的 step；轮次号、步骤号必须等于预期计数器；
- 所有核心执行事件必须被 turn 包围（`appended outside any open turn` → fail）；
- `tool/result` 必须对应本 step 内登记过的 `tool/call`（防伪造结果）。

这把上篇讲的"事件即扩展点"补上了安全网：**任何插件想往日志里塞事件，都得过这道语法检查**——而插件自有的事件类型走 `default` 分支，"Merge-extensible event relations belong to their owning plugin"，扩展与秩序井水不水。

### 5. 崩溃恢复：合成缺失的边界

日志是逐条落盘的，进程可能在任何两条事件之间死掉——比如模型刚要调工具、工具没来得及执行。`repair.ts` 的 `interruptedTurnClosers()` 扫描日志尾部，找出没闭合的 turn，**合成**缺失的收尾事件：

- 未匹配的 `tool/call` → 补一条 code 为 `TOOL_NOT_STARTED` 的错误 result（模型看到的是结构化的"工具没启动"，而不是无限等待）；
- 执行了但结果没落盘的 → `TOOL_OUTCOME_UNKNOWN`；
- 补上打开的 `step/end` 和 `turn/end`，时间戳复用最后一条真实事件，seq 顺延。

注意它的输出定性：*"Return **deterministic** synthetic events"*——同一份崩溃日志，任何机器任何时刻恢复，得到的合成事件完全相同。恢复也是可重放的。

### 6. 于是 fork 是免费的

`index.ts` 里 fork 的错误码列表泄露了天机：`INVALID_BOUNDARY`（边界不是连续存在的 seq）、`OPEN_TURN`（选中的前缀结束于一个打开的 turn）。fork 的实现就是在任意 seq 边界**截断日志前缀**——因为历史本来就是从日志投影出来的，前缀即分叉。resume（从日志重建）、transcript（渲染日志为文本）、遥测（订阅日志事件流）同理，全部是投影而非独立机制。

对比一下：如果上下文是一个可变的消息数组，fork = 深拷贝数组，压缩 = 原地改写数组，每个功能都要回答"拷贝之后两份怎么保持一致"。事件溯源的世界里这些问题的答案统一是：**不存在第二份**。

## 动手实验

```sh
cd ~/Projects/source-decoded/dsh

# 1. 通读事件宪法（430 行，本包性价比最高的阅读）
$EDITOR packages/core/session/src/types.ts

# 2. 词汇表大小与 ignorable 使用情况
grep -c "^\s*'[a-z]*/[a-z-]*':" packages/core/session/src/types.ts   # 12 种
grep -rn "ignorable: true" packages --include="*.ts" | wc -l          # 插件自有事件的使用量

# 3. 看不变量执行器如何拦截"伪造工具结果"
grep -n "with no prior tool/call" packages/core/session/src/invariant.ts

# 4. 投影规则全文（30 行读完"历史从哪来"）
sed -n '83,130p' packages/core/session/src/surface.ts
```

## 一图总结

```
                    只追加事件日志（seq 严格递增，格式版本 0）
  ┌────────┬─────────┬──────────┬─────────┬─────────┬──────────┐
  │turn/*  │step/*   │user/msg  │asst/*   │tool/*   │request/* │
  │ 边界    │ 边界     │ 消息      │chunk+msg│call+result│请求事实  │
  └────────┴─────────┴────┬─────┴─────────┴────┬────┴──────────┘
                          │ surfaceOp / sourceEventSeqs
                          ▼
        表面（消息节点序列）──deriveEventMessage()──► 模型历史
             （append 追加 / replace 遮蔽=压缩）        = 唯一真相
                          ▲
        不变量执行器：发布前纯校验、提交后落账、可被否决
        （seq 递增 / turn-step 嵌套 / call→result 配对）
                          │
        崩溃？→ interruptedTurnClosers() 合成确定性边界
        fork/resume/transcript/遥测 = 对同一份日志的不同投影
```

**三句话带走全文：**

1. 模型上下文不是存储的一等公民，而是事件日志的投影；投影规则是唯一且逐字透传的纯函数。
2. `ignorable` 标记 + 保守的版本纪律，让 12 种核心事件之外，插件可以安全地扩展词汇表。
3. 不变量执行器在发布前拦截一切违规追加——"模型可见即已记录"不是文档承诺，是运行时断言。

## 下篇预告

日志定义了"事实如何记录"，但**谁在驱动事实的产生**？下一轮怎么开始、什么时候结束？`agent/pre-step` 瀑布怎么决定模型看到什么？**0005 · 心脏：Agent Loop 逐行剖析（1756 行）**——进入 `packages/core/agent-loop/`，这是全系列技术含量最高的一篇。

---
*上篇：[0003 装配的艺术](./0003-assembly.md) · 下篇：[0005 Agent Loop](./0005-agent-loop.md)*
