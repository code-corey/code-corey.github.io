---
title: "0001 开箱全景：dsh 是什么，凭什么「一切皆插件」"
sidebarGroup: "DeepSeek Harness"
shortTitle: "0001 开箱全景"
order: 1
date: 2026-08-31
category: "源码剖析"
tag:
  - "DeepSeek Harness"
  - "源码"
  - "Agent"
description: "DeepSeek Harness 源码系列第 1 篇：仓库地形、启动路径与插件树全景。"
---

# 0001 · 开箱全景：dsh 是什么，凭什么"一切皆插件"

> **源码仓库解读 · DeepSeek Harness 系列第 1 篇**
> 仓库：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) · 版本：v0.1.2-alpha.2（2026-08-30）
> 本地克隆：`~/Projects/source-decoded/dsh/` —— 文中所有路径与数字均可在本地复核

## 为什么读

2026 年 agent harness（智能体框架）已经是一片红海：Claude Code、OpenClaw、Pi……每家都在讲自己的架构故事。DeepSeek 偏偏在这个时候开源了自己的 harness——`dsh`，副标题只有五个词：

> **Everything is a Plugin.**

这句口号很多项目都喊过，但 dsh 有两个少见的硬证据：

1. **范式先行**。它的底座框架 Cordis 背后有一篇正经论文——《A Programming Paradigm for Spatiotemporal Composability》（arXiv:2608.25512）。先有编程范式，再长出产品，这在工程领域是稀缺姿势。
2. **连 agent loop 都是插件**。多数框架里，"模型请求→工具调用→再请求"这个循环是写死的内核；dsh 把它拆成了一个可从配置里替换的插件行。这是我们在后续文章里会用源码验证的核心命题。

另外有个实用理由：dsh 官方文档中英双语、异常完善（`docs/` 下 360 个文件），等于官方亲自给你画好了源码地图。对想深入理解 agent 内核机制的工程师，这是目前门槛最低的一座富矿。

**风险提示**（来自官方 `SAFETY.zh.md`，值得原样转述）：dsh 是未经安全审计的开发者预览软件，会执行模型生成的代码、加载第三方插件。官方明确建议：最小权限、一次性 VM/容器、不要当唯一安全控制。

## 源码地图：一个 9078 文件的 monorepo

先看体量（本地 `git ls-files` 统计）：

```
TypeScript   3055 个 .ts + 299 个 .tsx
Markdown     2804 个（文档密度惊人，约每 1 个源码文件配 1 个文档）
YAML         1595 个（配置/装配/CI）
顶层包       packages/ 下 55 个能力包 + apps/ 两个应用
核心规模     packages/core/* 约 4.15 万行 TS
```

顶层地形（摘自 `AGENTS.md`，本地已核对）：

```
apps/cli/       dsh 命令行入口（所有形态共用一个启动器）
apps/web/       浏览器应用
packages/
  core/         ★ 产品 API 主干：session / system-prompt / tools / agent / agent-loop
  api/          远程 BFF 装配 + Typert RPC 网关
  llm/          LLM 能力系列：抽象服务 + DeepSeek 等提供方
  fs/ shell/ subprocess/ terminal/ lsp/ sandbox/
                ——文件系统、bash、子进程、PTY、语言服务器、进程限制
  subagent/     子 agent 能力系列
  compaction/   上下文压缩能力
  skill/ preset/ plan/ todo/ goal/ workflow/
                ——技能、预设、计划模式、任务清单、目标、工作流
  bundle/       ★ 安装式装配层：dsh-base / web-app / headless / sdk-app / acp-app
  boot/         profile 启动胶水
  sdk/          JSON-RPC 协议 + TypeScript 客户端
  vendor 里的框架层见 vendor/
vendor/         ★ 整个 Cordis 框架以源码形式内嵌（不是 npm 依赖！）
python/         Python SDK（把 dsh CLI 打包进运行时 wheel）
native/         Landlock 沙箱的 node-addon 源码
docs/           官方文档源（architecture / subsystems / cookbook / postmortem）
```

两个值得停留的细节：

**其一，vendor 是"收购"不是"依赖"。** `vendor/README.md` 写明：Cordis 4.0.0-rc.7 及其全家桶（loader/hmr/timer 等 10 个包）被整体拷入仓库，并改名为 `@deepseek-ai/cordis` 等作用域。原因直白——"harness 完全拥有自己的框架层（可审计、可补丁、可钉死版本）"，顺带防止上游名字在 npm 上被抢注。读懂 dsh 之前必须先读懂 Cordis，而 Cordis 的源码就在手边，这是后续文章的路线。

**其二，`packages/core` 是"上帝分区"。** 打开 `packages/core/`，里面不是代码，而是六个子包：`session`（会话日志）、`system-prompt`（提示词组装）、`tools`（工具注册与执行）、`agent`（Agent 接口与注册表）、`agent-loop`（默认驱动器）、`scope`（作用域原语）。整个产品的 API 主干只有约 4.15 万行，其中最核心的 agent-loop 仅 1756 行——对比许多 agent 框架动辄数万行的"内核"，这个数字本身就是设计品味的声明。

## 逐段剖析：从 `dsh web` 到一棵插件树

### 1. 入口薄得像纸

`apps/cli/src/bin.ts` 一共不到 60 行，核心就是一个三路分发：

```ts
const invocation = parseDshArgs(process.argv.slice(2), readVersion())

switch (invocation.mode) {
  case 'profile': {
    const { runProfile } = await import('./profile-boot.ts')
    await runProfile({ environment: loadLayeredEnv('dsh'), profile: invocation.profile, ... })
    break
  }
  case 'plugin':     { /* dsh plugin ... */ }
  case 'dump-config':{ /* 打印启动配置树 */ }
}
```

注意：没有 `case 'web'` 之外的专属应用入口。`dsh web` 只是 `dsh --profile web` 的别名，headless / sdk / acp 同理。**五种产品形态共用同一个启动器**，差别只在 profile 名字——这是理解 dsh 的第一把钥匙：产品形态是配置，不是代码。

### 2. 启动的起点是一个"空列表"

`apps/cli/src/profile-boot.ts` 里有一段自我说明的常量：

```ts
/** The empty root entry list every profile tree patches over. */
const PROFILE_ROOT_CONFIG = `# dsh profile root — an empty entry list. The tree is composed as patches:
# each bundle in package.json's dsh.profile.bundles, then cordis.patch.yml, then any
...
```

翻译成一句话：**dsh 启动时插件树是空的，随后的每一层都只是往这棵树上"打补丁"**。叠加顺序（`docs/architecture.zh.md`）：

```
空条目列表
  → bundle 1（如 dsh-base，按 profile 声明顺序）
  → bundle 2（如 web-app）
  → profile 自己的 cordis.patch.yml
  → Harness home 级的 cordis.patch.yml
  → 命令行 --patch overlay（临时实验用）
```

`dsh-base`（所有主流 profile 的共享第一层）的补丁文件 `packages/bundle/base/cordis.patch.yml` 有 **86 行插件条目**，llm、session、审批策略、沙箱、遥测……全是 YAML 里的一行行 `id + name`。它的头注释把设计纪律写得斩钉截铁：

> A patch replaces the targeted row's whole `config` rather than merging into it.
> （补丁替换目标行的**整个** config，而非合并。）

不允许"合并"意味着每一行的最终状态都能被一眼看清——**配置没有隐藏状态**。这是把"可替换"从口号落到机制的关键一刀。

### 3. "一切皆插件"的证据清单

翻 `docs/architecture.zh.md` 的核心包表，`ctx` 键一栏透露了天机：

| 包 | 职责 | ctx 键 |
|---|---|---|
| core/session | 只追加的 SessionEvent 日志 | `ctx.sessions` |
| core/system-prompt | 提示词片段与工具 schema 组装 | `ctx.systemPrompt` |
| core/tools | 作用域化工具注册表 + 把关执行流水线 | `ctx.tools` |
| core/agent | Agent 接口、注册表、`agent/*` 事件 | `ctx.agents` |
| core/agent-loop | 默认驱动器 | `ctx.agentLoop` |

会话是插件、提示词是插件、工具箱是插件、连 agent loop 都是插件。**不存在需要打补丁的特权内核**（官方原话：*There is no privileged kernel to patch*）——想换掉 dsh 的主循环？写一个插件往 `ctx.agentLoop` 挂上你的实现，或者用 patch 替换那一行配置。

仓库里甚至有现成的自反性彩蛋：`packages/` 分组表里有一个组叫 `self-modification/`——"the agent inspects/mounts its own plugins"（agent 检视并挂载自己的插件）。系统对自己也是插件化的。

### 4. 三种事件域 = 三种扩展点

dsh 把"扩展点"统一成事件，但刻意分成三个域（这三分法是全文最值得带走的模型）：

1. **会话事件**（`turn/*`、`step/*`、`user/message`、`assistant/*`、`tool/*`）——持久事实，追加进日志，重启后仍在。当你记录的"事实"必须活过一次 reload，用它。
2. **Agent 事件**（`agent/*`）——携带活跃 Agent 的实时事件：inbox、步骤、状态、请求、拦截。想在干活时观察/干预，用它。
3. **能力事件**（`fs/*`、`tools/*`、`telemetry/*`）——不产生 import 环，就能给某项能力挂策略或适配器。想改"规则"，用它。

其中 `agent/pre-step`、`agent/request`、`llm/stream` 和三个 `tools/*` 事件是 **waterfall（瀑布式）**：监听器必须调用 `next()` 才放行——这就是审查/改写/拒绝请求的卡点机制，我们第 5、6 篇会进入它的实现。

### 5. 一轮对话的生命周期（官方时序，先混个脸熟）

```
turn/start
  claim next-step input + 一条排队消息
  组装提示词片段 + 工具 schema
  -> agent/pre-step         拒绝 | 放行(enter)
     step/start
     追加消息 → 从日志推导模型历史
     agent/request → llm/stream → assistant/chunk* → assistant/message
     tool/call* → tools/pre-execute → tools/execute → tools/post-execute → tool/result*
     step/end
     工具欠一次请求，或新输入到达 → 领取 → 下一步
  -> agent/turn-stopping
turn/end
```

配套的还有一条架构级不变量：**模型可见即已记录**（what the model sees is what's logged）——任何抵达模型的输入都必须能从会话日志重建，运行时有断言强制执行。fork、恢复、transcript、遥测全部派生自这一个事实流。第 4 篇我们专门剖它。

## 动手实验

本机（Windows + Git Bash 亦可）：

```sh
# 1. 跑起来（约 100MB 下载；务必在可控环境执行）
npx @deepseek-ai/dsh web          # 默认 http://127.0.0.1:3080

# 2. 不跑，只看"你的机器会装配出什么"
npx @deepseek-ai/dsh --profile web --dump-config | head -40
#   打印的每一行，理论上都可以被你自己的 patch 替换

# 3. 克隆源码，亲手数一遍"一切皆插件"
git clone --depth 1 https://github.com/deepseek-ai/deepseek-harness
cd deepseek-harness
grep -c "id:" packages/bundle/base/cordis.patch.yml    # 86 行插件条目
wc -l packages/core/agent-loop/src/index.ts            # 主循环不足 800 行
```

（实验 3 的预期输出已在上文给出；实验 1/2 请遵守 `SAFETY.zh.md` 的隔离建议。）

## 一图总结

```
                    ┌──────────────────────────────────────┐
   dsh web/headless/sdk/acp                            同一启动器
                    └──────────────┬───────────────────────┘
                                   ▼
        空条目列表 ──► dsh-base(86 行) ──► 形态 bundle ──► 用户 patch
                                   ▼
                     Cordis 插件树（vendor 内嵌，源码级拥有）
   ┌──────────┬───────────┬───────────┬────────────┬───────────┐
   │ ctx.llm  │ctx.sessions│ctx.systemPrompt│ctx.tools │ctx.agentLoop│
   │ 模型适配 │ 会话事实日志 │ 提示词组装   │ 工具流水线 │ agent loop │
   └──────────┴───────────┴───────────┴────────────┴───────────┘
        全部可被 patch 逐行替换 —— 没有特权内核
```

**三句话带走全文：**

1. dsh 的五种产品形态 = 同一棵插件树 + 不同装配清单；产品是配置，不是代码。
2. "一切皆插件"的机制保障：启动起点是空列表，装配 = 有序补丁，补丁整行替换、无隐藏合并。
3. 扩展点收敛为三个事件域：持久事实（会话）、实时干预（agent/*）、能力策略（seam）。

## 下篇预告

**0002 · Cordis 基石：插件、服务与可逆副作用。** dsh 的所有魔法都发生在 Cordis 这层：插件如何声明依赖并被拓扑排序加载？`ctx.inject` 的服务注入如何做到"卸载即回滚"？事件发射器的"时空可组合"论文到底在讲什么？下一篇我们直接进 `vendor/cordis/` 的源码。

---
*上篇：无（系列开篇） · 下篇：[0002 Cordis 基石](./0002-cordis-foundation.md)*
