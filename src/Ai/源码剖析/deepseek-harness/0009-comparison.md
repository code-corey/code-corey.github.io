---
title: "附篇 · dsh × Pi × Claude Code：三种 harness 哲学对照"
sidebarGroup: "DeepSeek Harness"
shortTitle: "附篇 三方哲学对照"
order: 9
date: 2026-08-31
category: "AI"
tag:
  - "DeepSeek Harness"
  - "源码"
  - "Agent"
description: "附篇：极简主义、平台主义与产品主义的对照，给自建 agent 平台者的四条启示。"
---

# 附篇 · dsh × Pi × Claude Code：三种 harness 哲学对照

> **源码仓库解读 · DeepSeek Harness 系列附篇（全文完结）**
> 对照对象：deepseek-ai/deepseek-harness（v0.1.2-alpha.2，本系列已剖）· badlogic/pi-mono（Pi，本机安装 v0.84.3）· anthropics/claude-code（闭源产品）
> 主线：[0008 LLM 适配层](./0008-llm-layer.md)

## 为什么做这次对照

八篇主线剖完 dsh，一个自然的追问是：**这是唯一的做法吗？**

agent harness 的"三件套"——会话管理、agent 循环、工具系统——如今已是行业标配。但同一副骨架，不同的哲学会长出完全不同的动物。本文选三个最有代表性的样本对照：**Pi**（个人开发者 badlogic/Mario Zechner 的极简开源框架，即本机安装的 `pi`）、**dsh**（DeepSeek 的平台级开源框架）、**Claude Code**（Anthropic 的闭源旗舰产品）。

一个有趣的前情：dsh 的 `llm-pi-ai` 适配器直接通过 Pi 生态的 `@earendil-works/pi-ai` 库路由模型请求——竞品的模型访问层成了它的一个 Provider（0007 的哲学连竞品都不放过）。三者的关系比想象中紧密。

## 一张总表

| 维度 | Pi（极简主义） | dsh（平台主义） | Claude Code（产品主义） |
|---|---|---|---|
| 核心体量 | 极小（核心单包，typescript mono 文件数千行级） | 55+ 包 / 核心 4.2 万行 | 闭源（不可审计） |
| 架构隐喻 | **工具箱**：核心是库 + CLI，扩展是选修 | **插件树**：一切皆插件，连循环都是 | **产品**：一体成型，开放边界 |
| 循环可替换？ | 否（核心内置，但核心本身可作为库嵌入） | **是**（`ctx.agentLoop` 是一个可 patch 的插件行） | 否 |
| 会话模型 | JSONL 会话文件，可 fork/export | 只追加事件日志 + 投影 + 不变量执行器 | 私有会话存储，`--resume`/`--fork-session` |
| 扩展单元 | extension（TS 模块：tool/command/hook）+ skill（Markdown） | Cordis 插件 + bundle/profile patch + skill | MCP 服务器 + hooks + slash command + subagent + plugin |
| 装配机制 | 包管理器安装扩展（`pi install`） | YAML 补丁栈，同 id 后写胜，热重载 | 固定内置 + 配置开关 + 插件市场 |
| 提供方 | 多提供方（pi-ai 目录，OAuth 登录） | deepseek-official 直连 + pi-ai 适配器 + 自声明网关 | 仅 Anthropic（订阅绑定） |
| 安全模型 | 沙箱提示 + 权限询问，实现从简 | 瀑布审批 + seam 级沙箱（Landlock/bwrap/E2B）+ 不变量 | 权限模式 + 沙箱 + hooks 把关，产品级打磨 |
| 适用者 | 想理解/魔改 agent 内核的工程师 | 想搭建 agent 平台的团队 | 想立刻干活的从业者 |

## 对照一：循环是谁的？

三个样本最深的分歧在这里。

**Pi 的答案：循环是核心，但核心是库。** Pi 的 agent loop（模型生成 → 工具调用 → 结果回填 → 再生成，直到模型收手）写死在核心包里——但它刻意把核心做得足够小、足够可读，让"魔改"变成 fork 一下的事。本机 Pi 学习路线里我们逐层拆过它：循环、上下文管理、compaction 都是可教学的百行级概念。极简主义的可替换性靠**源码可读性**实现：你改不动配置，但你读得懂全部。

**dsh 的答案：循环是一个插件行。** 0005 已验证——`AgentLoop extends Service implements AgentFactory`，注册动作包在可逆 effect 里。想换掉"模型→工具→再请求"的范式本身（比如换成计划-执行两阶段驱动器），写一个插件 + 一行 patch。可替换性靠**机制**实现：你不用读全部源码，但你必须理解 Cordis。

**Claude Code 的答案：循环是产品。** 闭源、不可替换，可扩展性全部推到边界上——hooks 在工具调用前后把关（类似 dsh 的 `tools/*` 瀑布，但只此一处）、MCP 协议接外部工具、subagent 做委派。可替换性几乎不存在，换来的是开箱即用的打磨度。

三种取舍没有高下：**教学价值 Pi 最大，平台价值 dsh 最大，交付价值 Claude Code 最大。**

## 对照二：事实存在哪里？

**Pi**：会话是 JSONL 文件——每条消息一行，人类可读可 grep，fork 是复制文件加截断。诚实、简单、够用。

**dsh**：会话是带类型词汇表的事件日志——12 种核心事件、`ignorable` 护栏、关系不变量执行器、崩溃恢复合成器、投影 seam（0004 全套）。为的是一句"模型可见即已记录"能被运行时强制，最终甚至能把日志以水位协议上传给模型厂商（0008）。复杂度数倍于 Pi，换来的是**平台级的可信赖**：多形态消费（web/cli/sdk/acp）、热重载、供应商协议集成，全都站在同一份事实上。

**Claude Code**：会话是产品内部细节，暴露给用户的是 `--resume`、`--fork-session`、transcript。哲学接近 Pi（文件化、够用），但细节不开放——你信任它，而不是验证它。

这里有个值得内化的判断标准：**你的会话数据要不要被"三方"消费（其他进程、其他产品、模型厂商）？** 不要——学 Pi；要——学 dsh。

## 对照三：扩展点放在哪一层？

把三者的扩展面叠在一起看，会发现一条光谱：

```
扩展点深入内核 ◄──────────────────────────────► 扩展点止于边界
  dsh：pre-step/request-error/tools/* 瀑布、seam 三角色、
       profile/patch 逐行替换、甚至 self-modification 包
  Pi：extension API（tool/command/hook/event）、skill、theme——
      内核行为可挂钩，但循环与日志格式不可变
  Claude Code：hooks（PreToolUse/PostToolUse/…）、MCP、
      subagent、slash command——全部在产品边界外
```

dsh 把干预点放进了**循环的每一拍**（0005 的四个瀑布），Pi 放在**事件边界**上，Claude Code 放在**进程边界**上。干预点越深，插件能做的事越多，内核契约的稳定性责任越重——dsh 为此付出了 55 个包 + 双语文档 + 不变量体系的代价。

## 对照四：他们对"安全"的回答

- **Pi**：`--no-tools`、权限询问、谨慎的默认。个人工具的诚实答案："这是你的机器，注意。"
- **dsh**：把安全做成了**架构**——审批是 pre-execute 瀑布上的一个插件（0006）、沙箱是 shell/fs 的 Provider 变体（0007）、遥测开关"宁误关不误开"（0003）、SAFETY.md 明说"不要当唯一安全控制"。平台的安全必须是**可组合的机制**，不是产品承诺。
- **Claude Code**：权限模式（plan/auto-edit/full）、沙箱执行、hooks 审计——产品化的纵深防御，外加企业合规能力。

## 给自建平台者的四条启示

1. **先定事实模型，再定循环**。dsh 的八篇故事本质上是 0004 那一句"模型可见即已记录"展开成的产品。事实模型定了，fork/恢复/压缩/审计全是投影；定错了，每个功能都是补丁。
2. **可替换性要有机制，不能只有源码**。"读得懂所以能改"只适用于你自己的团队；`setFactory + effect`（0005）或等价的注册点设计才能让第三方参与。
3. **克制是核心竞争力**。`ctx.llm` 的三个"不"（0008）、`restrict({})` 即报错（0006）、空根文件每次重写（0003）——平台框架的价值密度不在于做了多少，在于**拒绝做了多少**。
4. **竞品即插件**。dsh 把 Claude Code 做成 subagent Provider（0007）、把 Pi 的模型库做成 llm 适配器——当你的契约足够稳，生态位从"二选一"变成"都为我所用"。

## 全系列结语

九篇文章，我们从一个 npm 命令出发，穿过 2693 行的 Cordis 框架（0002）、三层装配栈（0003）、一部 12 种事件的会话宪法（0004）、一个 1756 行的可替换循环（0005）、三道防御瀑布（0006）、三角色 seam（0007），最后抵达一份厂商私有协议（0008），并在与 Pi 和 Claude Code 的对照中看清了每种哲学的价码（本篇）。

"Everything is a Plugin"——读完全系列你会发现这句话的准确含义：**不是所有东西都写成了插件，而是所有东西都*可以被*替换，且替换的机制经得起源码检验。** 这才是它值得被逐行阅读的原因。

---

| 系列导航 |
|---|
| [0001 开箱全景](./0001-panorama.md) → [0002 Cordis 基石](./0002-cordis-foundation.md) → [0003 装配的艺术](./0003-assembly.md) → [0004 会话即事实](./0004-session-log.md) → [0005 Agent Loop](./0005-agent-loop.md) → [0006 工具流水线](./0006-tools-pipeline.md) → [0007 能力 Seam](./0007-capability-seams.md) → [0008 LLM 适配层](./0008-llm-layer.md) → **附篇（本篇）** |
