---
title: "0001 开箱全景：The agent that grows with you"
sidebarGroup: "Hermes Agent"
shortTitle: "0001 开箱全景"
order: 1
date: 2026-09-01
category: "源码剖析"
tag:
  - "Hermes Agent"
  - "源码"
  - "Agent"
description: "Hermes Agent 源码系列第 1 篇：它是什么、有多大、凭什么 239k stars，以及一句话说清它和 DeepSeek Harness 的区别。"
---

# 0001 · 开箱全景：The agent that grows with you

> **源码仓库解读 · Hermes Agent 系列第 1 篇**
> 仓库：[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) · 版本：v0.21.0（2026-09-01 拉取）
> 本地源码：`~/Projects/hermes-research/hermes-src/` —— 文中所有路径与数字均可在本地复核

## 先回答两个问题

**这是什么？** Nous Research 开源的个人 AI agent，官方一句话定位：

> **The self-improving AI agent** — creates skills from experience, improves them during use, and runs anywhere.

它不是模型（Nous Research 的 Hermes 模型系列是另一回事），而是一个**跑在任何模型之上**的 agent 宿主：接 OpenRouter、OpenAI、Anthropic、Bedrock、Vertex、本地 Ollama/LM Studio 都行，`hermes model` 一条命令切换，不锁死任何厂商。

**和 DeepSeek agent（dsh）一样吗？** 不一样，而且差异很本质。一句话版本：

> **dsh 是"一切皆插件"的平台底座（TypeScript，连 agent loop 都可替换）；Hermes 是"越用越懂你"的个人 agent（Python，loop 写死在核心，但自带记忆/技能/自我改进闭环）。**

同属 "agent harness" 这个物种，但是两个亚种：一个做**给开发者搭平台的框架**，一个做**给普通人用的成长型助理**。本系列第 4 篇会逐维度对照，这里先按下不表。

## 量级：这是个庞然大物

先看硬数字（本地 `wc -l` 与 GitHub API 实测）：

| 维度 | 数字 |
|---|---|
| GitHub stars / forks | **239,053 / 48,757**（2026-09-01） |
| Python 文件（不含 tests） | **1,291 个** |
| Python 总行数（不含 tests） | **约 103.3 万行** |
| 创建时间 | 2025-07-22（一年出头冲到 23 万 star） |
| 许可证 | MIT |
| 语言 / 运行时 | Python ≥3.11（`pyproject.toml`：`requires-python = ">=3.11,<3.14"`） |

作为对照：dsh 核心约 4.2 万行 TypeScript。**Hermes 的体量是它的 20 倍以上**——这个差距不是"代码写得多"，而是产品半径完全不同：dsh 是框架，Hermes 是框架 + 20 平台消息网关 + 技能市场 + 桌面应用 + 运维工具链的**全家桶**。

顶层目录一览（`ls` 可复核）：

```
agent/      ← 核心：agent loop、上下文引擎、记忆、技能（约 180 个模块）
tools/      ← 约 120 个工具实现：终端/浏览器/文件/语音/图像/MCP…
gateway/    ← 消息网关：20+ 平台接入（含 qqbot、weixin、yuanbao）
skills/     ← 13 类内置技能：devops/research/creative/social-media…
hermes_cli/ ← CLI 入口；ui-tui/ ← 终端 UI；web/ website/ ← 文档与站点
cron/       ← 定时任务；evals/ ← 评测；providers/ ← 模型接入基座
docs/       ← 设计文档与 RFC（micro-compaction、kanban、relay 契约…）
```

## 招牌：闭环学习（Learning Loop）

Hermes 的 README 把它列为第一条特性，也是它与所有"能装技能"的竞品的分野。官方表述拆开是五个机制：

1. **从经验中创建技能**——复杂任务做完后，agent 自己把可复用的部分沉淀成 SKILL.md；
2. **在使用中改进技能**——技能不是死的文档，会被后续会话修订；
3. **自我提醒持久化**——loop 内置 "skill nudge" 计数器（`agent/conversation_loop.py` 里可以找到 `_iters_since_skill`），干了很多轮还没沉淀知识就主动提醒自己；
4. **搜索自己的过去**——SQLite FTS5 全文索引全部历史会话，`session_search` 工具零 LLM 成本召回；
5. **建立用户画像**——`USER.md` + [Honcho](https://github.com/plastic-labs/honcho) 辩证式用户建模，跨会话越懂你。

第 3 篇会逐文件剖这套闭环（`memory_manager.py` / `curator.py` / `/learn` 管线 / 技能安全扫描链），这里只给一个总览：

```
经验(会话) ──┬──> MEMORY.md / USER.md          ← memory 工具 + 写入门禁
             ├──> skills/*/SKILL.md             ← /learn + skill_manage + 安全校验
             │        │
             │        └──> curator 后台策展      ← 过期/归档/合并自动流转
             └──> session DB (FTS5)             ← session_search 跨会话召回
                        │
                        └──> trajectory 压缩     ← 反哺下一代模型训练（Research-ready）
```

最后一环很少被人注意：仓库根目录有 `trajectory_compressor.py` 和 `batch_runner.py`——Hermes 可以**批量生成训练轨迹并压缩**，用来训练下一代工具调用模型。它同时是产品和研究数据飞轮，这正是 Nous Research（模型实验室）做 agent 的动机差异。

## 部署形态：runs anywhere 不是口号

- **七种终端后端**（`tools/environments/` 本地可数）：`local / docker / ssh / singularity / modal / daytona / vercel_sandbox`。其中 Modal 与 Daytona 支持 **serverless 挂起**——agent 环境空闲时休眠、按需唤醒，官方口号是"跑在 $5 VPS 或 GPU 集群上，空闲时几乎不花钱"。
- **两个入口**：`hermes`（终端 TUI）与 `hermes gateway`（消息网关进程）。网关侧支持 Telegram、Discord、Slack、WhatsApp、Signal、iMessage（BlueBubbles）、webhook/API——以及**国内三件套：`qqbot`、`weixin`（微信）、`yuanbao`（腾讯元宝）**，都在 `gateway/platforms/` 下有一等公民实现。中文用户不需要任何社区桥接。
- **桌面端**：Electron 应用（`apps/`、`tui_gateway/`）。
- **定时任务**：内置 cron 调度器（`cron/`），自然语言描述定时任务，结果投递到任意平台。
- **从 OpenClaw 一键迁移**：`hermes claw migrate` 可导入 SOUL.md 人格文件、记忆、技能、API key——它是 OpenClaw 生态的正式继任者路线。

安装是两条一行命令（Linux/macOS/WSL2/Termux 走 install.sh，Windows 原生走 install.ps1），细节见官方[文档](https://hermes-agent.nousresearch.com/docs/)，此处不赘述。

## 一个反直觉的架构判断

看体量你以为核心会很庞大，但 `AGENTS.md`（开发者指南，1784 行）开篇就立了两条"宪法"：

> **Per-conversation prompt caching is sacred.**（会话级 prompt 缓存是神圣不可侵犯的——任何中途改写历史、换工具集、重建系统提示的行为都会击穿缓存、成倍烧钱，我们不做。）

> **The core is a narrow waist; capability lives at the edges.**（核心是细腰；能力长在边缘——每加一个核心工具，每次 API 调用都要多发一份 schema，所以核心工具的准入门槛极高，新能力一律做成 CLI 命令 + 技能 / 服务门控工具 / 插件。）

有意思的是：**"细腰"哲学与 dsh 的"一切皆插件"殊途同归**——都拒绝把能力堆进核心。区别在实现路线：dsh 用 Cordis 插件机制从结构上保证可替换；Hermes 用代码纪律 + 门控评审从流程上保证核心不膨胀。一个是机制约束，一个是文化约束。

而文化约束的代价清晰可见：核心循环文件 `agent/conversation_loop.py` 已经长到 **8954 行**，仓库自己发起了 "god-file decomposition campaign"（拆解巨型文件运动，见 `agent/turn_finalizer.py` 的模块注释），正在把循环尾处理、轨迹保存逐块外迁。第 2 篇我们就剖这个 8954 行的巨核。

## 系列路线图

- **0002 巨核与窄腰**：conversation_loop 主循环解剖 + "prompt caching 神圣"的工程兑现
- **0003 学习闭环**：memory / skills / curator / FTS5 召回，逐文件验证上面那张图
- **0004 对照篇**：hermes × dsh 全维度对照，回答"选哪个/学哪个"

---

> 下一篇：[0002 巨核与窄腰：8954 行的 agent loop](./0002-narrow-waist.md)
