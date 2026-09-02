---
title: "0005 心脏：Agent Loop 逐行剖析（1756 行）"
sidebarGroup: "DeepSeek Harness"
shortTitle: "0005 Agent Loop 剖析"
order: 5
date: 2026-08-31
category: "AI"
tag:
  - "DeepSeek Harness"
  - "源码"
  - "Agent"
description: "第 5 篇：turn/step 状态机、双目标 inbox、四个干预瀑布与有界并发工具调度。"
---

# 0005 · 心脏：Agent Loop 逐行剖析（1756 行）

> **源码仓库解读 · DeepSeek Harness 系列第 5 篇**
> 剖析对象：`packages/core/agent-loop/src/`（6 个文件，1756 行）
> 上篇：[0004 会话即事实](./0004-session-log.md)

## 为什么读

全系列至此的铺垫，都是为了这一篇。前四章我们看到：插件树如何装配（0003）、事实如何记录（0004）。现在回答终极问题——**谁在驱动事实的产生？**

多数 agent 框架的循环是"内核"：`while (模型还想调工具) { 请求; 执行工具 }` 几十行写死在主程序里。dsh 把它的循环拆成了 1756 行的**可替换插件**，并且开放了四个干预瀑布。这一篇我们逐段读它，你会看到教科书级的工程：状态机、inbox、瀑布决策、粘性错误码、有界并发调度……以及若干值得抄回自己项目的设计。

## 源码地图

```
packages/core/agent-loop/src/
  index.ts        776 行  AgentLoop 服务：创建/恢复 agent，工厂注册
  agent.ts        545 行  ★ ReactLoopAgent：turn/step 状态机（本篇主战场）
  tool-calls.ts   290 行  工具调度器：屏障 + 有界滚动并发池
  runtime-context.ts 76 行  运行时上下文投影
  invariant.ts     63 行  循环自身的日志不变量
  constants.ts      6 行  默认并发数
```

先记住三个文件的关系：`index.ts` 是**插件外壳**，`agent.ts` 是**引擎**，`tool-calls.ts` 是**传动装置**。

## 逐段剖析

### 1. "循环即插件"的铁证：三行代码

0001 立的论断在这里兑现。`index.ts:352`：

```ts
export class AgentLoop extends Service implements AgentFactory {
```

`index.ts:413`：

```ts
ctx.effect(() => ctx.agents.setFactory(this), 'agentLoop.setFactory()')
```

两行连读：AgentLoop 是一个占据 `ctx.agentLoop` 的 Cordis **Service**（0002 学过：Service 基类 = 注册即 ctx 键、卸载即注销）；它把自己注册为 `ctx.agents` 的**工厂**——而这一注册本身被包在 `ctx.effect()` 里，是可逆副作用。patch 一行配置换掉这个插件，整个产品的驱动器就换了。**没有特权内核，此处为源码级证据。**

`turnBoundaryProjectionDefinition`（index.ts 头部）展示了它的自我修养：循环把 turn/step 边界状态注册成会话投影单元（`key: 'turnBoundary'`），host 消费方通过 `stateOf()` 读取类型化状态而不用自己扫日志——循环既是事件的**生产者**，也主动为消费者提供**增量折叠好的视图**。

### 2. 状态机：三种相位，一个驱动协程

`agent.ts` 的 `ReactLoopAgent` 用一个极简的相位类型约束全部行为：

```ts
type Phase =
  | { kind: 'idle'; lastTurn: number }
  | { kind: 'maintenance'; abort: AbortController; lastTurn: number; wakeRequested: boolean }
  | { kind: 'running'; abort: AbortController; turn: number; step: number; wakeRequested: boolean }
```

`running` 相位携带当前 turn/step 编号和一个 AbortController——**取消信号与相位绑定**，abort 一个相位不会污染下一个。驱动入口只有一行循环：

```ts
private async kick(): Promise<void> {
  try {
    while (await this.turn()) {}        // turn() 返回 true 就继续下一轮
  } catch (_error) {
    // Reported failures and cancellation are contained at the driver boundary.
  } finally {
    if (this.phase.kind === 'running') {
      ...
      if (wakeRequested && this.inbox.hasPending) this.wakeDriver()
    }
  }
}
```

`while (await this.turn()) {}`——所有复杂性都收敛在 `turn()` 的返回值里：**还有排队的活就再转一圈，否则归位 idle**。finally 里的 wake 检查处理了一个微妙竞态：驱动退出的瞬间又有新消息插入——不丢唤醒。

### 3. 输入模型：两种目标的 Inbox

输入不是简单队列，而是**两个有语义的队列**（`packages/core/agent/src/inbox.ts`）：

```ts
private readonly state: InboxState = { 'next-turn': [], 'next-step': [] }
```

- `next-turn`：唤醒型输入——用户发来的新消息，**开启新的 turn**；
- `next-step`：步骤边界输入——比如工具执行注入的上下文（`tool-calls.ts` 里 `acceptContext` 回调就把上下文 splice 进这里），**在当前 turn 内开启下一步**。

架构文档那句话的机制在此：*"有些消息会立即唤醒它；注入的上下文会留在 inbox 中，直到另一条消息将其唤醒。"* 插入上下文本身不触发模型请求——它静静躺在 `next-step`，等下一次唤醒时搭车进入。**省掉了多少次无意义的模型调用，全在这一设计里。**

### 4. preStep：模型看到什么的唯一裁决点

`agent.ts:234`，驱动器的第一步永远是领取与裁决：

```ts
private async preStep(target, position): Promise<PreparedStep> {
  const claimed = this.inbox.claim(target, position.turn)        // ① 从 inbox 领取
  const assembly = await this.loopCtx.systemPrompt.assemble(...) // ② 组装提示词+工具 schema
  const context = this.runtimeContext.project(joinContextSections(sections), sections)
  const decision = await this.dispatch.waterfall(                // ③ 瀑布裁决
    'agent/pre-step', { messages: claimed, ...position, signal },
    (): Promise<PreStepDecision> => Promise.resolve({
      kind: 'enter',
      messages: context === undefined ? claimed : [...claimed, context],
    }),
  )
  return decision.kind === 'reject' ? decision : { ...decision, assembly }
}
```

瀑布的最后一个参数是**默认决策**（enter：领取的消息 + 运行时上下文）。排在默认值前面的，是所有想发言的插件——它们可以改写消息（例如压缩插件换上历史摘要）、注入额外内容，或直接 `reject`（例如守卫插件拦下违规请求）。架构文档那句话的代码形态：**`agent/pre-step` 决定模型看到什么。**

还有一行注释值得单独裱起来：

> A removed waking message or an enter decision rewritten to empty still owns the initial turn boundary, but it **spends no model call**.

首次领取被拒绝或改写为空时，仍然会关闭一个不含步骤的持久轮次——日志如实记录"这次唤醒发生过"，但不浪费一次模型调用。**审计完整性与成本控制的平衡点，被显式写进了状态机。**

### 5. turn()：边界、粘性与 finally 纪律

`turn()`（agent.ts:255）的骨架（节选注释后的核心）：

```ts
this.session.append('turn/start', { turn })
while (true) {
  const decision = await this.preStep(target, { turn, step })
  if (decision.kind === 'reject') { turnEnds = { kind: 'blocked' }; return false }
  ...
  this.session.append('step/start', { turn, step })
  try {
    for (const message of decision.messages)
      this.session.append('user/message', message, { surfaceOp: 'append' })
    const stepEnd = await this.step(decision.assembly, decision.startsRequestSeries === true)
    // max-tokens is sticky: once any step hits the ceiling, later steps
    // that complete normally must not downgrade the turn outcome.
    if (turnEnds === null || turnEnds.kind !== 'max-tokens') turnEnds = stepEnd
  } finally {
    this.session.append('step/end', { turn, step })
  }
  if (turnEnds && this.inbox.nextStep.length === 0) {
    await this.dispatch.serial('agent/turn-stopping', { turn, signal })
    ...
  }
  target = 'next-step'
}
```

四个精密细节：

**粘性的 max-tokens**。任何一步触到 token 上限后，turn 的结局就锁定为 `max-tokens`——后续步骤即使正常完成也**不允许降级**这个结论。注释重复了两次（作者显然被咬过）。这是一条通用的工程原则：*结局码只能升级，不能降级*。

**finally 里写 step/end**。无论正常完成、模型报错还是信号中断，步骤边界**必定落盘**——配合 0004 的崩溃恢复（repair.ts 合成缺失边界），保证日志永远可以被补成合法形状。

**turn/end 的 reason 分类学**。finally 里：`this.session.append('turn/end', { turn, reason: turnEnds! })`。reason 有五种：`completed` / `blocked`（pre-step 拒绝）/ `aborted`（带取消原因）/ `error`（结构化：LlmError 保留事实，其他拍平成 `errorChain` 文本）/ `max-tokens`。**每一种结束方式都是数据，不是异常**——下游统计、UI 展示、断言测试全部有据可查。

**turn-stopping 是 serial 事件**。轮次收尾前给插件一次按序发言的机会（0002 表格里的 serial 模式），没有 `next()`，无法拦截，只能观察或记录。对比 pre-step 的 waterfall——**能改变行为的地方用瀑布，只能知情的地方用串行**，权限语义通过分发模式表达。

### 6. step()：流式、中断保全与请求级重试

`step()`（agent.ts:341）内层还有一个 `while (true)`——那是**请求级重试循环**。关键段落：

```ts
const stream = preparedCall?.stream(request) ?? this.loopCtx.llm.stream(request)
for await (const chunk of stream) {
  chunkSeqs.push(this.session.append('assistant/chunk', { turn, step, chunk }).seq)
  assembler.push(chunk)
}
```

流式片段**逐个落盘**（0004 说的"回放与 UI 保真"由此而来）。若流中途被打断，已有内容不丢：

```ts
if (signal.aborted) {
  const content = assembler.interruptedBlocks()
  if (content.length > 0) {
    this.session.append('assistant/message', { ..., interrupted: true },
      { surfaceOp: 'append', sourceEventSeqs: chunkSeqs })
  }
}
```

中断的部分回答带着 `interrupted: true` 与全部 chunk 溯源（`sourceEventSeqs`）永久入库——用户看到的半截回复，重载后还是那半截。

模型流报错时不直接抛，先过一道瀑布：

```ts
const action = await this.dispatch.waterfall('agent/request-error', {...}, () => undefined)
if (action?.kind !== 'retry') throw new LlmError(...)
continue    // 重试同一个请求
```

`agent/request-error` 瀑布让重试策略本身成为插件——默认监听器返回 undefined（不重试，抛错），重试插件可以接手。工具调用结束后：

```ts
const { concluded } = await executeToolCalls(...)
return concluded ? { kind: 'completed' } : null   // null = 工具欠一次请求，继续 while
```

`concludesTurn` 标志由工具结果携带——**工具可以声明"我这步做完，轮次可以收了"**，驱动器尊重它。否则返回 null，turn() 的内层循环领取 `next-step` 输入开启下一步（工具结果上下文已在 inbox 里等着）。

### 7. tool-calls.ts：屏障 + 有界滚动并发池

调度器头注释就是最好的设计文档：

> **Exclusive calls form barriers; parallel calls use a bounded rolling pool and are reclassified before start.** Dispatch may overlap, while policy, results, and result context remain model-ordered.

翻译：一个 step 里模型可能发出 N 个工具调用。执行模式分两种——`exclusive`（独占，如写文件）形成**屏障**，一次只跑一个；`parallel`（并行，如多次读文件）进入**有界滚动池**，跑完一个补位一个，池上限即 `DEFAULT_MAX_PARALLEL_TOOL_CALLS`。**调度可以乱序，但落账严格按模型发出的顺序**——工具结果进日志的顺序 = 模型期待看见的顺序，回放永远成立。

另一个精彩细节在主循环：

```ts
// Commit before classifying again so registry changes affect unstarted calls.
const mode = ctx.tools.executionMode(first.exec).kind
```

每跑完一组都**重新分类**下一个调用的执行模式——因为并行执行期间，某个工具插件可能已把自己（或别人）改成独占模式。**分类读取的是实时注册表，不是开工时的快照**。并发正确性之外的"注册表时效性"，多数实现会漏掉这一课。

abort 的收尾也值得记住：已启动的调用被 drain（等它们自然结束），未启动的调用补上合成错误结果 `TOOL_ABORTED_BEFORE_DISPATCH`——**每个 callId 都必须有 result，模型侧的协议永不悬空**（与 0004 的 TOOL_NOT_STARTED 一脉相承）。

## 动手实验

```sh
cd ~/Projects/source-decoded/dsh

# 1. 亲手量一量这个"内核"的体积
wc -l packages/core/agent-loop/src/*.ts | tail -1    # 1756 行

# 2. 找到循环的可替换注册点
grep -n "setFactory" packages/core/agent-loop/src/index.ts packages/core/agent/src/*.ts

# 3. 数一数循环开放的瀑布/串行事件（干预面）
grep -n "dispatch.waterfall\|dispatch.serial\|dispatch.emit" packages/core/agent-loop/src/agent.ts

# 4. 阅读粘性 max-tokens 与空轮次不花模型调用这两段注释
grep -B2 -A2 "sticky\|spends no model call" packages/core/agent-loop/src/agent.ts
```

## 一图总结

```
                 kick(): while (await this.turn()) {}
                              │
   ┌──────────────────────────▼───────────────────────────┐
   │ turn()                                               │
   │  append turn/start                                   │
   │  while(true):                                        │
   │    preStep: inbox.claim → 组装 prompt → ★waterfall    │
   │             agent/pre-step（改写/注入/reject）          │
   │    reject → turnEnds=blocked                          │
   │    append step/start → user/message(s)                │
   │    step():                                            │
   │      buildRequest(deriveMessages 冻结快照)             │
   │      llm.stream → 逐 chunk 落盘                        │
   │      ★waterfall agent/request-error（可重试）           │
   │      append assistant/message（溯源 chunkSeqs）         │
   │      executeToolCalls: 屏障 + 有界并发池               │
   │        tools/pre-execute → execute → post-execute     │
   │      工具欠请求? → 继续 while；否则 completed           │
   │    finally: append step/end                           │
   │    结束? → serial agent/turn-stopping                  │
   │  finally: append turn/end{reason: completed|blocked|  │
   │           aborted|error|max-tokens（粘性）}             │
   └──────────────────────────────────────────────────────┘
   干预面：pre-step / request-error 瀑布 + turn-stopping 串行
          + tools/* 三连瀑布（0006 详讲）
```

**三句话带走全文：**

1. 驱动器是一个可替换的 Service（`setFactory` 注册于可逆 effect）——"没有特权内核"在此兑现为三行源码。
2. 状态机 + 双目标 inbox + 瀑布裁决构成循环骨架；粘性结局码、finally 必落盘、空轮次不花模型调用是它的三颗螺丝。
3. 工具调度：独占成屏障、并行进有界池；执行可乱序、落账必有序；分类读实时注册表，abort 时每个 call 都有合成结局。

## 下篇预告

循环里的 `tools/pre-execute → tools/execute → tools/post-execute` 三连瀑布我们只是瞥了一眼。**0006 · 工具流水线：注册、把关与执行**——进入 `packages/core/tools/`：工具如何声明 schema、如何按 agent 划分作用域、审批插件在哪一环卡住危险调用、超时与沙箱如何叠加成洋葱。

---
*上篇：[0004 会话即事实](./0004-session-log.md) · 下篇：[0006 工具流水线](./0006-tools-pipeline.md)*
