---
title: "0002 Cordis 基石：插件、服务与可逆副作用"
sidebarGroup: "DeepSeek Harness"
shortTitle: "0002 Cordis 基石"
order: 2
date: 2026-08-31
category: "源码剖析"
tag:
  - "DeepSeek Harness"
  - "源码"
  - "Agent"
description: "第 2 篇：2693 行的 Cordis 框架如何实现服务容器、依赖注入、事件总线与可逆副作用。"
---

# 0002 · Cordis 基石：插件、服务与可逆副作用

> **源码仓库解读 · DeepSeek Harness 系列第 2 篇**
> 剖析对象：`vendor/cordis/`（Cordis 4.0.0-rc.7，源码内嵌）+ `docs/cordis-primer.zh.md`
> 上篇：[0001 开箱全景](./0001-panorama.md)

## 为什么读

上篇我们看到：dsh 的五种产品形态共用一个启动器，产品的每一块——会话、提示词、工具箱、agent loop——都是插件树上的一个节点。支撑这一切的就是 Cordis。

Cordis 不是 dsh 的新发明，它源自 [cordiverse/cordis](https://github.com/cordiverse/cordis)（一个在机器人社区演化多年的插件框架），dsh 把 4.0.0-rc.7 整体 vendor 进仓库，改名为 `@deepseek-ai/cordis`。**整个框架只有 2693 行 TypeScript**，分 9 个文件：

```
vendor/cordis/src/
  context.ts    146 行  Context：服务容器 + 插件注册入口
  events.ts     352 行  五种分发模式的事件系统
  fiber.ts      754 行  插件生命周期（加载/卸载/资源回收）
  registry.ts   337 行  插件注册表与服务查找
  service.ts    115 行  Service 基类（占据 ctx.<key> 的服务）
  reflect.ts    418 行  运行时元数据
  logger.ts     270 行  日志
  utils.ts      287 行  工具
  index.ts       14 行  导出
```

两千七百行撬动一个 9 万行的产品——这个杠杆比本身就值得研究。

## 源码地图

先建立五个概念（对应官方 cordis-primer，我们在源码里逐个验证）：

1. **插件是实现 Service 的对象**——可以是一个带 `inject` + `apply(ctx)` 的普通函数/对象，也可以是 `Service` 子类。
2. **上下文是服务的容器**——服务占据稳定的 `ctx.<key>`（`ctx.tools`、`ctx.llm`、`ctx.sessions`），消费方按 key 查找，而不是 import 具体实现。
3. **依赖用 `inject` 声明**——声明的服务全部就绪，插件才启动；加载顺序由服务依赖图表达，**没有手写的启动序列**。
4. **通信靠类型化事件**——五种分发模式（emit/waterfall/parallel/serial/bail）。
5. **注册是可逆的副作用**——所有 `ctx.on()` / `ctx.effect()` 安装的东西，卸载时自动撤销。

## 逐段剖析

### 1. 一个真实插件的完整解剖：22 行策略代码

dsh 仓库里最好的一份 Cordis 教材，是 `packages/guard/timeout-policy/src/index.ts`（工具超时守卫）。先看它的"插件声明三件套"：

```ts
/** Cordis plugin name used by loader diagnostics. */
export const name = 'timeout-policy'

/** The tool registry service this plugin wraps (`tools/execute`) and reads (`get`). */
export const inject = ['tools']

export function apply(ctx: Context): void {
  ctx.on('tools/execute', async (exec, next): Promise<ToolExecutionResult> => {
    const timeoutMs = ctx.tools.get(exec.name, exec.agent)?.timeoutMs
    if (timeoutMs === undefined) return next()   // 工具没声明预算：原样放行
    ...
  })
}
```

逐行读出 Cordis 的三个契约：

- `name`：给 loader 诊断用的插件名（对应 YAML 装配清单里的一行 `id/name`）。
- `inject: ['tools']`：**"我依赖 ctx.tools 服务"**。Cordis 会等 `tools` 服务就绪才调用 `apply`——依赖顺序由这句声明推导，无需人为编排。
- `apply(ctx)`：插件主体。注意它没有直接调用任何超时逻辑，而是往 `tools/execute` 事件上挂了一个瀑布监听器——**插件不调用世界，插件包裹世界**。

看监听器主体里最精妙的细节（节选）：

```ts
using d = deadline(exec.signal, timeoutMs, TOOL_TIMEOUT)
const upstream = exec.signal
exec.signal = d.signal           // 换上带截止时间的信号
try {
  const result = await next()    // 委托下游（真正的工具执行）
  if (timeoutOf(d.signal, TOOL_TIMEOUT) !== undefined) {
    return toolTimeoutResult(timeoutMs)  // 只有自己的定时器赢了才替换结果
  }
  return result
} finally {
  exec.signal = upstream         // 恢复上游信号，下游监听器看不见这层包装
}
```

`await next()` 是瀑布式事件的签名：不调用 = 短路（否决），调用 = 委托并可包装返回值。这个超时插件把自己活成了洋葱的一层——它能裹住任何工具，而不需要任何工具知道它的存在。

### 2. `ctx.<key>` 是怎么长出来的：声明合并 + Service 基类

插件里直接写 `ctx.tools.get(...)`，但 `Context` 类型上本来没有 `tools`。类型从哪来？看 `packages/core/session/src/index.ts` 的开头：

```ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    sessions: SessionStore
  }
  interface Events {
    /** @mode emit */
    'session/created'(this: Scoped<Session>, session: Session): void
    ...
  }
}
```

TypeScript 的**声明合并**（declaration merging）：服务提供方在自己的包里向 `Context` 接口追加字段、向 `Events` 接口追加事件签名。于是 `ctx.sessions` 在编辑器里是有完整类型的，事件参数也有类型——而运行时的绑定由 Cordis 完成。

运行时这边的 `Service` 基类（`vendor/cordis/src/service.ts`）只做一件事：

```ts
constructor(protected ctx: Context, name: string) {
  ...
  self.ctx.reflect.provide(name, self, this[symbols.check])
  return self
}
```

`provide(name, self)` 把实例登记进注册表，从此 `ctx.<name>` 可用；注释里点明生死契约——*"the service is unregistered automatically when the owning fiber unloads"*（所属 fiber 卸载时服务自动注销）。**注册与注销对称，这就是"可逆副作用"的第一半。**

### 3. 事件系统的五种分发模式（352 行的精华）

`vendor/cordis/src/events.ts` 定义了五种模式（DispatchMode），语义一张表说完：

| 模式 | await？ | 顺序 | 返回值 | 典型用途 |
|---|---|---|---|---|
| `emit` | 否 | 顺序观察 | 无 | 广播事实（`session/created`） |
| `waterfall` | 否* | 洋葱式包裹 | 有 | 拦截/改写（`tools/execute`、`agent/pre-step`） |
| `parallel` | 是 | 并行扇出 | 无 | 各自独立的观察者 |
| `serial` | 是 | 顺序执行到有人 bail | 有 | 有序决策（`agent/turn-stopping`） |
| `bail` | 否 | 顺序执行到有人 bail | 有 | "谁先拍板谁说了算" |

*\*waterfall 的监听器回调本身可以是 async。*

瀑布的实现只有八行，值得原样品读：

```ts
waterfall(...args: any[]) {
  const cbs = this.dispatch('waterfall', args)
  const inner = args.pop()            // 最后一个参数是最内层 next（内置行为）
  const next = () => {
    const cb = cbs.shift() ?? inner   // 队列空了才轮到内置行为
    return cb(...args)
  }
  args.push(next)
  return next()                       // 从最外层监听器开始洋葱式展开
}
```

监听器数组被折叠成一条 `next()` 链：每层收到同一个 `next`，调用它就执行下一层；**谁不调用 next，谁就否决了包括内置行为在内的所有下游**。注释写得很狠：*"a listener that does not call `next()` vetoes the rest of the chain, including the built-in behavior."*

dsh 正是用这个原语搭建了整个审批体系：审批插件在 `tools/execute` 瀑布上排队，用户拒绝时直接返回替换结果而不调用 `next()`——工具压根不会执行。策略即洋葱层。

### 4. 可逆副作用的另一半：fiber 与 disposer

`fiber.ts`（754 行，框架里最大的文件）管理每个插件实例的生死。核心约定两条：

```ts
/** Disposers run in reverse registration order when the owning fiber unloads; */
```

第一，`ctx.effect(fn)` 里的 fn 返回一个 disposer，fiber 把它收进 `_disposables`；卸载时**逆序执行**——后装的先拆，符合栈式资源管理的直觉。第二，监听器注册本身就是 effect（`events.ts` 的 `register()`）：

```ts
return this.ctx.fiber.effect(() => {
  hooks[method]({ ctx: this.ctx, callback, ...options })
  return () => this.unregister(hooks, callback)
}, label)
```

于是上篇那个论断有了机制背书：*"each registration is a side effect that is undone when its plugin unloads"*——插件卸载时，它挂过的所有事件监听器、装过的所有工具 schema、注册的所有提供方，自动消失，不留残骸。这就是 dsh 敢于把"热重载 patch"作为产品功能的底气。

fiber 还有 LOADING / UNLOADING / DISPOSED 状态机、异步 disposer 的 await、以及防止卸载期间重入的 epoch 机制——这些属于健壮性细节，读源码时值得顺藤摸瓜，正文不展开。

### 5. dsh 在 Cordis 上的纪律

官方 primer 结尾的"实践规则"是理解 dsh 代码组织的钥匙：

- 行为按事件域归位：工具流水线的事挂 `ctx.tools`，模型流挂 `ctx.llm`，实时协调挂 `ctx.agents`——**一个包往哪个 ctx 键上注册，暴露了它的职责归属**。上篇 55 个包的目录分类，本质上就是按 ctx 键分的风.
- 拦截与策略优先用事件（洋葱层），直接能力调用优先用服务方法（`ctx.<key>`）。
- **每个注册都要有配对的 disposer**：要么 `ctx.effect()` 返回，要么用框架辅助函数。teardown 有顺序要求时，放进同一个 effect。

再叠加一个 dsh 自研的约束：每个事件必须用 `@mode` 标签声明分发模式，CI 会把声明与所有分发调用点交叉校验（`docs/cordis-primer` 提到，源码里随处可见 `/** @mode emit */`）。框架的弹性 + 工程的纪律，缺一不可。

## 动手实验

```sh
cd ~/Projects/source-decoded/dsh

# 1. 感受框架体量：2693 行的"上帝框架"
wc -l vendor/cordis/src/*.ts | tail -1

# 2. 找出 dsh 全部事件声明里的 @mode 标注分布
grep -rh "@mode " packages docs --include="*.ts" | sort | uniq -c | sort -rn

# 3. 阅读最小瀑布插件（22 行读懂洋葱模型）
cat packages/guard/timeout-policy/src/index.ts

# 4. 看声明合并如何给 ctx 长出新键
grep -A4 "declare module '@deepseek-ai/cordis'" packages/core/session/src/index.ts
```

## 一图总结

```
            装配层(YAML patch)                 运行时(Cordis 2693 行)
  ┌─────────────────────────┐        ┌────────────────────────────────┐
  │ - id: llm               │        │  Fiber 状态机 (LOADING→…→DISPOSED)│
  │   name: @deepseek-ai/…  │ ────►  │    │ apply(ctx)                │
  │ - id: tools             │  加载   │    ├─ inject 就绪才启动        │
  │   name: …               │        │    ├─ ctx.on/effect() 注册     │
  └─────────────────────────┘        │    │    └─ disposer 入栈(逆序撤销)│
                                     │    └─ Service.provide() → ctx.key│
                                     ├────────────────────────────────┤
                                     │  事件总线: emit/waterfall/      │
                                     │  parallel/serial/bail          │
                                     │  waterfall = 洋葱中间件链       │
                                     └────────────────────────────────┘
  插件 = name + inject + apply    世界 = ctx.<key> 服务 + Events 通道
  一切注册可逆 ⇒ 卸载无残骸 ⇒ patch 热替换才成为可能
```

**三句话带走全文：**

1. Cordis 用 2693 行实现四个原语：服务容器（ctx key + 声明合并）、依赖注入（inject）、事件总线（五种分发模式）、可逆副作用（effect/disposer 逆序栈）。
2. 插件不调用世界，插件包裹世界——瀑布事件的 `next()` 是 dsh 所有拦截、审批、超时、改写机制的公共形状。
3. 注册即 effect，卸载即回滚；这让"改一行 YAML 换掉一个子系统"从理想变成了运行时事实。

## 下篇预告

**0003 · 装配的艺术：Profile / Bundle / Patch 三层组装。** 我们已经知道插件树从一个空列表长出来，但"86 行 YAML 如何变成一棵会跑的树"？下一篇进入 `packages/bundle/` 与 `apps/cli/src/profile-boot.ts`，追踪一次真实的装配过程：bundle 怎么声明、patch 怎么逐行定位替换、`--dump-config` 打印的树里每一行怎么读。

---
*上篇：[0001 开箱全景](./0001-panorama.md) · 下篇：[0003 装配的艺术](./0003-assembly.md)*
