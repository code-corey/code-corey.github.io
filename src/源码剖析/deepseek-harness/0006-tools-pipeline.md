---
title: "0006 工具流水线：注册、把关与执行"
sidebarGroup: "DeepSeek Harness"
shortTitle: "0006 工具流水线"
order: 6
date: 2026-08-31
category: "源码剖析"
tag:
  - "DeepSeek Harness"
  - "源码"
  - "Agent"
description: "第 6 篇：ToolDefinition 解剖学、三道防御瀑布、fail-closed 细节与 PTC 模式。"
---

# 0006 · 工具流水线：注册、把关与执行

> **源码仓库解读 · DeepSeek Harness 系列第 6 篇**
> 剖析对象：`packages/core/tools/`（5640 行）
> 上篇：[0005 Agent Loop](./0005-agent-loop.md)

## 为什么读

工具是 agent 触碰世界的唯一通道，也因此是**安全边界所在**。上篇我们看到 agent loop 在工具调用处发出的三连瀑布（`tools/pre-execute → tools/execute → tools/post-execute`），这篇进入 `packages/core/tools/` 看它的完整设计：一个工具定义要交代哪些事情、注册表如何按 agent 划分作用域、审批/超时/沙箱分别卡在哪一环、以及几个"失败也要失败得正确"的细节。

## 源码地图

```
packages/core/tools/src/
  index.ts      主体：ToolRuntime 服务 + 事件声明 + 流水线 + 调度器接口
  types.ts      执行输入/结果/决策类型
  schema.ts / json-schema.ts   参数 schema 规范与校验
  presentation.ts              工具调用的 UI 呈现视图（card 渲染意图）
  ptc.ts        ★ PTC 模式：run_code 传输工具（本篇压轴）
  ts-types.ts / py-types.ts    工具 SDK 的 TS/Python 渲染器
  invariant.ts  流水线自身的不变量
```

## 逐段剖析

### 1. ToolDefinition：一个工具的解剖学

`index.ts:214` 的 `ToolDefinition extends ToolSchema` 是理解整个系统的入口。一个工具要向注册表交代：

```ts
export interface ToolDefinition extends ToolSchema {
  readonly output: ToolOutputDefinition      // ① 强制的输出声明
  execute(args: unknown, exec: ToolRunContext): Promise<unknown>   // ② 执行体
  finalizeContent?(exec, result): ContentBlock[] | undefined       // ③ 内容最终化
  timeoutMs?: number                         // ④ 协作式超时预算
  isConcurrencySafe?(args: unknown): boolean // ⑤ 并发安全纯分类器
  presentCall?(args): ToolCallView | undefined   // ⑥ UI 呈现（调用中）
  presentResult?(args, result): ToolResultView | undefined  // ⑦ UI 呈现（完成后）
}
```

七个槽位对应**四种不同的受众**，这是第一个值得带走的设计：

- 给**模型**看的：`ToolSchema` 继承来的 name/description/parameters——注意 0002 里 timeout-policy 源码注释点破的纪律：*"`schemas()` whitelists only name/description/parameters. Declaring it asserts this tool forwards `exec.signal`..."*——`timeoutMs` **从不发给模型**，它是运行时元数据；
- 给**运行时**看的：`execute`、`output.schema`（输出也必须声明 schema——注册时强校验）、`timeoutMs`、`isConcurrencySafe`；
- 给**渲染层**看的：`output.render`、`presentCall`/`presentResult`。后两者的注释里有一条铁律："*Pure and side-effect-free: a UI may call it during live streaming AND a session-log replay*"——**UI 视图函数必须纯**，因为它们会在直播流和日志回放两个时刻被调用，有副作用就会导致两次渲染不一致；
- 给**日志**看的：`finalizeContent`——在无损物化之前的最后一道内容变换机会，注意它"exactly once for every normalized outcome, including pipeline failures that bypass tools/post-execute"——**包括走不到 post-execute 的失败也要过它**，保证日志里的内容表示永远一致。

### 2. 注册与作用域：工具是分层的，限制是相交的

`ToolRuntime extends Service`（占据 `ctx.tools`），内部用 `ScopedLayers`（来自 `core/scope`）管理工具：

```ts
register(definition: ToolDefinition): () => void {
  // ① 输出声明必须完整：schema + render (+ presentationMeta?)
  if (output === undefined || typeof output.render !== 'function') throw new TypeError(...)
  // ② timeoutMs 必须是正有限数
  // ③ run_code 是保留名：PTC 传输专用，任何人都不能注册或遮蔽
  if (name === RUN_CODE_NAME) throw new Error(...)
  return this.layers.effect(
    this.ctx,
    layer => layer.tools.insert(name, definition),
    { label: 'tools.register()' },          // 又是 effect：注册即副作用，卸载即撤销
  )
}
```

三个校验都在注册时**即时失败**（fail-fast），其中 `RUN_CODE_NAME` 的保留逻辑值得停留：注释解释道 *"any agent may select a code mode for itself, so a name free to take under the deployment default would become a collision the moment a preset mounted"*——今天在默认装配下注册成功，不代表挂上某个 preset 后不冲突。**保留名是跨装配冲突的唯一解。**

按 agent 划分作用域的第二把刀是 `restrict()`：

```ts
/** Restrict global tools for the calling agent scope. Empty filters, unknown
    names, scope-local names, and reserved transport names fail.
    Restrictions intersect; scoped registrations remain visible. */
restrict(filter: ToolRestriction): () => void
```

语义三条：`allow`（只留这些）与 `deny`（去掉这些）可以组合；多个 restrict 之间**取交集**（限制只会越叠越紧）；scope 内注册的工具不受全局限制影响。而它有一条硬性前提——必须在**agent 作用域上下文**里调用（`agent.ctx`），在全局上下文里调用直接抛错：*"a context-global restriction would mask every agent"*。**危险操作的 API 面在设计上就不允许被误用**，这是把"安全"从运维纪律下沉为类型签名。

### 3. 流水线总览：三道瀑布 + 一次广播 + 一个内部调度器

`index.ts` 的事件声明区把流水线的每个卡点写得明明白白，整理成表：

| 卡点 | 模式 | 职责（原文摘要） | 典型居民 |
|---|---|---|---|
| `tools/pre-execute` | waterfall | "Allow, deny, or **ask** before dispatch" | 审批插件、命令白名单 |
| `tools/execute` | waterfall | "Around-dispatch for **timeout, retry, metrics**；wrapper 只能换 `exec.signal`，调用身份不可变" | 超时策略（0002 的主角）、沙箱 |
| `tools/post-execute` | waterfall | "Accept, replace, enrich, or **block** a normalized result" | 结果脱敏、溢出预览（spill） |
| `tools/ptc-dispatch-log` | waterfall | 只改**持久日志副本**的内容，程序已拿到完整值 | 大结果落盘替换为预览+定位器 |
| `tools/result` | emit | 观察冻结的无损 JSON 终局 | 遥测 |
| `tools/change` | emit | 注册表变化广播，**故意不按作用域过滤** | UI 刷新、prompt 重组装 |

三条瀑布正好是三层防御纵深：**事前**（这调用该不该发生）、**事中**（执行过程被谁包裹）、**事后**（结果以什么面目呈现）。0002 的洋葱模型在这里有了完整的应用图景——同一份代码（`timeout-policy`）我们已经在 `tools/execute` 层见过一次，现在你知道它的邻居是谁。

`tools/change` 的"故意不过滤"是个反直觉的好设计：*"a global change concerns every agent's next assembly, so a scoped listener subscribing here sees every change"*——**作用域过滤适合"事件内容属于某个 agent"的场景；注册表变化天然是全局事实**，过滤反而制造盲区。

### 4. Fail-closed 的细节清单

流水线的注释里散落着一组"失败方向"的决策，单列出来就是一份设计检查单：

1. **ask 降级为 deny**。pre-execute 的决策可以是 allow/deny/ask，但"missing approval support turns `ask` into denial"——审批服务不存在时，"请示"自动变成"拒绝"。宁可误拒，不可放行。
2. **信号不可被 wrapper 劫持**。`tools/execute` 的 wrapper 只允许替换 `exec.signal`（0002 的超时插件正是这么干的），而"call identity remains immutable"；注册表在工具体执行前"re-fuses the original caller signal"——包装层换上的信号到期后，注册表**重新焊接**调用者的原始取消信号，"replacement cannot detach caller cancellation"。外层用户按 Ctrl+C 永远有效。
3. **两种 ABORTED 错误码**。`TOOL_ABORTED`（工具体已启动后被取消）与 `TOOL_ABORTED_BEFORE_DISPATCH`（还没派发就被取消）——上篇 tool-calls.ts 里"每个 call 都必须有 result"的粒度，细到了"取消发生在哪一毫秒"。
4. **未知工具的错误也分两种**。`ToolNotFoundError` 的构造函数有个可选参数 `reachableFrom`：名字注册了但 PTC 模式下不允许直接调用时，错误信息是 `unknown tool "x": reachable via run_code`——**同一个"未知"，注册表不认识和呈现层禁呼是两回事，错误信息必须教模型怎么走对路**。
5. **restrict({}) 直接抛错**："an empty filter is almost always a materialized-empty-config bug"——空限制几乎必然是配置物化出错的症状，静默接受等于掩盖 bug。

### 5. PTC 模式：当工具多到模型调用不过来

`ptc.ts` 实现的 PTC（Programmatic Tool Calling）模式是本包最有想象力的部分。开启后，模型面对的工具列表**坍缩成一个 `run_code`**：

> `${RUN_CODE_NAME} is the only tool you can call directly — a tool call naming any other tool fails. Reach every tool the SDK declares below from inside the program.`

所有常规工具改为在一段模型编写的 TypeScript/Python 程序里以 SDK 形式调用（`ts-types.ts`/`py-types.ts` 渲染出类型化的 SDK 文档），循环控制、条件分支、批处理全部发生在**一次**模型生成的程序内，而不是 N 次模型往返。注册表按已加载的 `ctx.codeRuntime.language` 选择渲染器，语言没有对应渲染器就"fails the assembly loudly"——又是即时失败。

源码里那段 PTC_ONLY_INSTRUCTION 的注释是这个包最闪光的产品思考：

> **A rule the model can only discover by being denied is one it corrects too late.**

规则如果只能靠"被拒绝后试错"学到，模型纠正它的时机就太晚了。所以约束条件必须**写进系统提示词**预先声明，而不是藏在运行时的拒绝里。给所有做 prompt 工程的人，这句话值得贴在显示器上。

## 动手实验

```sh
cd ~/Projects/source-decoded/dsh

# 1. 数一数流水线卡点，读它们的事件声明
grep -n "'tools/" packages/core/tools/src/index.ts | head

# 2. 读 restrict() 的防御性报错（三种即死场景）
sed -n '/restrict(filter: ToolRestriction)/,/^  }/p' packages/core/tools/src/index.ts | head -30

# 3. 看看真实工具长什么样：内置的 todo_write
ls packages/todo/ && head -60 packages/todo/*/src/index.ts 2>/dev/null || find packages/todo -name "*.ts" | head -3

# 4. PTC 指令全文（一段写给模型的"宪法"）
grep -B3 -A3 "PTC_ONLY_INSTRUCTION" packages/core/tools/src/index.ts | head -12
```

## 一图总结

```
 模型发出 tool call
        │
        ▼
 ┌─ tools/pre-execute (waterfall) ── 审批/白名单     allow│deny│ask(无审批服务→deny)
 │         │ allow
 │         ▼
 │   prepare(): 参数校验 + 快照冻结(args 不可变)
 │         │
 │ ├─ tools/execute (waterfall) ──── 超时/重试/沙箱   wrapper 只能换 exec.signal
 │ │        │ next()                                 注册表 re-fuse 调用者信号
 │ │      工具体 execute()（并发池 or 屏障，0005）
 │ │        │
 │ ├─ tools/post-execute (waterfall) 结果脱敏/增强/拦截
 │ │        │
 │ └─ finalizeContent()（含被绕过 post 的失败路径）
 │          │
 │     无损物化 → tool/result 落账 → tools/result (emit, 冻结快照)
 ▼
 run_code（PTC 模式）：常规工具塌缩为程序内 SDK 调用
```

**三句话带走全文：**

1. ToolDefinition 的七个槽位对应四种受众（模型/运行时/UI/日志），`timeoutMs` 永不发给模型、UI 视图必须纯——受众隔离是工具接口的第一原则。
2. 三道瀑布 = 三层防御纵深：事前审批（ask 无支持则降级拒绝）、事中包裹（wrapper 只能换信号，调用者取消不可剥离）、事后改写（日志副本与程序所见分离）。
3. 失败要失败得正确：保留名防装配冲突、restrict 必须带作用域、空限制即报错、错误信息要教模型走对路——安全不是一层开关，是一组方向一致的默认值。

## 下篇预告

我们反复见到"换一个 provider 就换了整个产品"的许诺：把 fs 和 subprocess 指向远程沙箱，Bash/PTY/LSP 整体搬家；subagent 提供方从"新建子 agent"到"委派给另一个产品"。**0007 · 能力 Seam：换一个 Provider 就换了整个产品**——解剖 Service Definition / Provider / Consumer 三角色，用 shell 与 sandbox 两个真实 seam 验证这句话。

---
*上篇：[0005 Agent Loop](./0005-agent-loop.md) · 下篇：[0007 能力 Seam](./0007-capability-seams.md)*
