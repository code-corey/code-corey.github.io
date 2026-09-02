---
title: "0007 能力 Seam：换一个 Provider 就换了整个产品"
sidebarGroup: "DeepSeek Harness"
shortTitle: "0007 能力 Seam"
order: 7
date: 2026-08-31
category: "AI"
tag:
  - "DeepSeek Harness"
  - "源码"
  - "Agent"
description: "第 7 篇：Service Definition / Provider / Consumer 三角色；E2B 上云与 Claude Code 子 agent 案例。"
---

# 0007 · 能力 Seam：换一个 Provider 就换了整个产品

> **源码仓库解读 · DeepSeek Harness 系列第 7 篇**
> 剖析对象：`packages/shell/`、`packages/fs/`、`packages/e2b/`、`packages/subagent/` + `docs/capability-seams.zh.md`
> 上篇：[0006 工具流水线](./0006-tools-pipeline.md)

## 为什么读

架构文档里有句狂言：

> 一个 seam 正是替换一个提供方就能改变整个产品的原因。把它们指向远程沙箱，也就把 Bash、PTY 和 LSP 一并搬了过去，**无需提供方专用 fork**。

这不是营销话术，是可以用源码验证的架构事实。本篇解剖 dsh 的"能力 seam"模式：**Service Definition（定契约）/ Provider（供实现）/ Consumer（来消费）**三角色，并用两个真实案例检验——把命令执行搬到云端沙箱（E2B），以及把"子 agent"这个概念委派给一个完全不同的产品（Claude Code）。

## 源码地图

dsh 的 `packages/` 有十几组能力家族，每组都是同一个三段式：

```
packages/shell/        bash 能力家族
  shell/               ★ Service Definition：ctx.shell 契约（类型 + 语义）
  bash-local/          Provider：本地 bash -c 进程
  bash-sandbox/        Provider：经沙箱限制的 bash
  pwsh-local/ pwsh-sandbox/    Provider：Windows PowerShell 变体
  tool-bash/ tool-pwsh/        Consumer：面向模型的 bash/pwsh 工具
  tool-bash-persistent/ ...    Consumer：持久会话变体

packages/fs/           文件系统家族（fs / fs-local / fs-sandbox / tool-fs ...）
packages/subprocess/   子进程家族
packages/terminal/     持久 PTY 家族
packages/lsp/          语言服务器家族
packages/subagent/     子 agent 家族（8 个 Provider！）
packages/e2b/          ★ 远程执行世界（fs-e2b + subprocess-e2b + e2b）
```

`docs/capability-seams.zh.md` 是官方生成的全景图（Mermaid），列出每个 `ctx.<key>` 的声明包、实现包与消费包——读源码时把它当地图用。

## 逐段剖析

### 1. 三角色的教科书：shell 家族

**角色一：Service Definition**（`packages/shell/shell/src/index.ts`）。它不干活，只定契约——一个抽象类加一段语义承诺：

```ts
declare module '@deepseek-ai/cordis' {
  interface Context { shell: ShellExecutor }
}

/**
 * Abstract bash execution service. Subclass, implement the abstract methods,
 * and load the subclass as a plugin — it registers as `ctx.shell`
 * (one implementation per context; loading a second throws...).
 *
 * Implementations must honor these semantics:
 * - run rejects only for infrastructure failures. Nonzero exits, timeout
 *   kills, and abort kills resolve with a ShellRunResult.
 * - ShellProcess.readOutput is incremental: consecutive reads never repeat.
 * - A still-running background process is stopped and awaited when its
 *   owning composition tears down.
 */
```

三个细节见真章。其一，**契约里写的是语义不是签名**："非零退出不算失败，以结果对象 resolve；只有基础设施故障才 reject"——这条约定决定了上层 Consumer 永远不需要为"命令返回 1"写 try/catch。其二，**"第二个实现者直接抛错"**（Cordis 的重复服务注册行为）——一个世界只能有一个 shell 真相。其三，连**设置命名空间都归 Definition 所有**：

```ts
/** Settings namespace ... owned here rather than by either executor family
    because it names the capability, not an implementation. */
export const SHELL_SETTINGS_NAMESPACE = 'shell'
```

用户设置里写的是 `shell:`，不关心底下是 bash 还是 pwsh——设置文档在平台间搬运后依然有效。**命名权属于抽象，不属于实现。**

**角色二：Provider**。`bash-local`、`bash-sandbox`、`pwsh-local`、`pwsh-sandbox` 四个包各自实现 `ShellExecutor` 并注册 `ctx.shell`。谁来选？**装配层**——shell 组 README 说得直白："profile 层恰好选择一个执行器实现；win32 层会把 POSIX 行换成 pwsh 行"。回到 0003 看 base bundle 的补丁就懂了：**平台差异是装配差异，不是代码分支**。

**角色三：Consumer**。`tool-bash` 把执行能力包装成面向模型的 `bash` 工具注册进 `ctx.tools`。它只依赖 `ctx.shell` 契约，对底下是本地进程、沙箱进程还是远程沙箱**一无所知**。

三角色各就各位后，那句话成立：把 `bash-local` 的装配行换成 `bash-sandbox`，工具、审批、日志、模型提示词**一行不改**，命令就从裸跑变成了沙箱内运行。

### 2. 案例 A：把整个执行世界搬上云（E2B）

`packages/e2b/` 是这个架构的极限测试——官方称"可移植执行世界"（portable execution world）POC。组 README 的概述值得整段引用：

> e2b 组把 agent 的文件与命令工作移入远程 Linux 沙箱：文件读写、shell 命令与终端都在**同一个远程世界**中运行，而不是在你的机器上。……启用本家族后，**现有的 shell、终端与语言服务器功能无需任何改动即可继续工作**，因此不需要 E2B 专用工具。harness 进程、模型调用与会话状态**永远不会移动**——只有执行世界是远程的。

三个包的分工：`e2b` 提供共享沙箱（`ctx.e2b`），`fs-e2b` 实现 `ctx.fs`，`subprocess-e2b` 实现 `ctx.subprocess`。关键在"同一个世界"四字——文件与命令共享同一个远程工作目录，agent 在文件系统里写的文件，它的 `bash` 命令立刻能读到。而 **fs 与 subprocess 共享执行世界**正是架构文档点名的例子："把它们指向远程沙箱，也就把 Bash、PTY 和 LSP 一并搬了过去"。

`fs-e2b` README 里有一句容易被略过的承诺："模型看到的结果与本地文件结果**完全一致**"——这就是 seam 契约的验收标准：Provider 换到云端，Consumer 与模型的观测体验必须逐字节不变。

还有一个耐人寻味的注脚：fs 组 README 顺手立了一条设计决策——"文件 I/O **有意不设超时**：deadline 只会杀掉操作系统仍会完成的工作"。对比 0006 里工具的 `timeoutMs`：超时是策略层的 opting，不是能力的默认属性。**契约把"哪些事归 OS、哪些事归策略"也划清了。**

### 3. 案例 B：子 agent 是个接口，Claude Code 是它的一种实现

`packages/subagent/` 是三角色模式的另一个极端样本——8 个 Provider 躲在同一个接口后面，彼此的差异大到你不会认为它们是同类：

| Provider | "子 agent"是什么 |
|---|---|
| subagent-spawn-in-process | 同进程新建一个子 agent |
| subagent-fork-in-process | fork 父会话的历史给子 agent |
| subagent-dsh-sdk | 委派给另一个 dsh 进程 |
| subagent-acp | 委派给任意 ACP 协议的 agent |
| **subagent-claude-code** | **发起一个真实的 Claude Code CLI 会话** |
| **subagent-codex** | 委派给 OpenAI Codex CLI |

看 `subagent-claude-code` 的 README 头段：

> 它在发起委派的会话工作区中**通过官方 Agent SDK 运行真实的 Claude Code CLI 子 agent**。……该提供方作为可选的 Profile Bundle 发布：安装会带入锁定的 Agent SDK 与一个兼容的平台 CLI 载荷，而**注册的提供方在绑定工具调用前保持休眠**。

逐句翻译成架构语言：subagent seam 的 Service Definition 定义了"接受一个自包含文本任务，返回严格最终答案或安全失败诊断"的约定；Claude Code Provider 用**竞争对手的产品**实现了这个约定；它是随发行版分发的 bundle，装配前休眠不占资源；连权限模型都入乡随俗（`permissionMode` 决定无人值守查询如何过 Claude Code 的权限检查）。模型在 dsh 里调用一个 `delegate` 类工具时，背后可能是一个 dsh 子 agent，也可能是 Claude Code 在干活——**对模型而言是同一个工具，对架构而言是同一行可替换的装配配置**。

这个案例顺手回答了一个大问题：agent 生态会走向诸侯割据还是互操作？dsh 的答案是后者——**只要对方能塞进你的 seam 契约，竞品就是你的一个 Provider**。

### 4. seam 的成本：被契约吃掉的复杂性

三角色不是免费午餐，公平起见看代价。shell Definition 的语义承诺清单（非零退出 resolve、增量 readOutput、teardown 时停止并等待后台进程……）意味着每个 Provider 都要写大量"把平台差异翻译成契约语义"的胶水；`docs/subsystems/` 下每个 seam 都配有穷尽式的约定与错误分类文档；还有 invariant 伴随插件（如 `shell-invariant`）守着契约的运行时边界。dsh 用 55 个包的粒度换这一点，本质上是把复杂性**从调用方搬到实现方、从运行时搬到装配时**——调用方（工具、策略、模型提示词）因此极度稳定。对单一产品这是重资产；对要承载任意 Provider 生态的平台，这是必要投资。**是否采用 seam 架构，取决于你想成为产品的使用者，还是世界的提供方。**

## 动手实验

```sh
cd ~/Projects/source-decoded/dsh

# 1. 三秒看懂一个家族的三角色
ls packages/shell/

# 2. 读 shell 契约的语义承诺（最重要的 40 行）
sed -n '1,80p' packages/shell/shell/src/index.ts

# 3. 数一数 subagent 接口背后有多少个世界
ls packages/subagent/ | grep subagent-

# 4. 官方 seam 全景图（Mermaid，浏览器渲染后阅读）
grep -c "svc_" docs/capability-seams.zh.md
```

## 一图总结

```
                 Service Definition（契约）
     shell 包：ShellExecutor 抽象 + 语义承诺 + ctx.shell 键
     （设置命名空间归抽象所有；第二个 Provider 直接抛错）
        ▲                                │
        │ 实现                            │ 依赖
        │                                ▼
   ┌──────────┐  ┌──────────┐      Consumer（面向模型的工具）
   │bash-local│  │bash-sandbox│ …   tool-bash / tool-pwsh
   │pwsh-local│  │fs-e2b      │      注册到 ctx.tools
   │claude-code│ │subprocess-e2b│    只认契约，不认实现
   └──────────┘  └──────────┘
   Provider 由装配层选择（win32 换 pwsh 行；E2B 整体上云）
   ⇒ 换 Provider = 换一行 patch，工具/审批/日志/提示词零改动
```

**三句话带走全文：**

1. 能力 seam = Definition 定契约（含语义与命名权）+ Provider 供实现（装配层恰好选一）+ Consumer 来消费（只认 `ctx.<key>`）。
2. "执行世界可移植"是 seam 的极限验证：fs + subprocess 指向 E2B 远程沙箱，Bash/PTY/编辑器整体上云，harness、模型调用与会话状态原地不动。
3. subagent 案例揭示生态哲学：竞品（Claude Code、Codex）只是你 seam 后的另一个 Provider——契约够稳，敌人即插件。

## 下篇预告

系列的最后一篇主线回到模型侧：`ctx.llm` 背后的适配器体系长什么样？流式 chunk 如何归一化？dsh 为 DeepSeek API 做的"wire extensions"（`deepseek-llm-api-extensions`）扩展了什么？token 计量（`token-meter`）为何是一个独立 seam？**0008 · LLM 适配层与 DeepSeek 私有扩展**收官主线，随后附篇做 dsh × Pi × Claude Code 三方对照。

---
*上篇：[0006 工具流水线](./0006-tools-pipeline.md) · 下篇：[0008 LLM 适配层](./0008-llm-layer.md)*
