---
title: "0004 对照篇 · hermes × dsh：选地基还是选成长"
sidebarGroup: "Hermes Agent"
shortTitle: "0004 hermes × dsh 对照"
order: 4
date: 2026-09-01
category: "源码剖析"
tag:
  - "Hermes Agent"
  - "DeepSeek Harness"
  - "源码"
  - "Agent"
description: "Hermes Agent 源码系列第 4 篇：与 DeepSeek Harness 全维度对照——出身、语言、哲学、学习、扩展、安全与用户画像，回答『它和 DeepSeek agent 是一回事吗』。"
---

# 0004 · 对照篇 · hermes × dsh：选地基还是选成长

> **源码仓库解读 · Hermes Agent 系列第 4 篇（本批完结）**
> 对照对象：[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)（v0.21.0，本系列已剖）· [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（v0.1.2-alpha.2，[本站专栏已剖](/源码剖析/deepseek-harness/)）
> 主线：[0003 学习闭环](./0003-learning-loop.md)

## 先给结论

常被问到的一个问题：**"Hermes Agent 和 DeepSeek 的 agent（dsh）是一回事吗？"**

**不是，而且差异是路线级的。** 两者的共同点只有一个：都属于 "agent harness" 物种——都解决"让 LLM 循环调用工具直到完成任务"这件事。但从此往下每一个分叉都走了相反方向：

| 维度 | Hermes（Nous Research） | dsh（DeepSeek AI） |
|---|---|---|
| 一句话 | **越用越懂你**的个人 agent | **一切皆插件**的平台底座 |
| 语言 / 体量 | Python，1291 文件 / 约 103 万行（不含测试） | TypeScript，55+ 包 monorepo / 核心约 4.2 万行 |
| 架构隐喻 | **巨核 + 边缘生态**（细腰靠文化约束，8954 行 loop 拆解中） | **插件树**（连 agent loop 都是可替换插件行） |
| 学习 | **一等公民**：MEMORY/USER.md + 技能 + curator + FTS5 召回 | 不内置：事件日志交给上层应用 |
| 事实存储 | SQLite 会话库 + FTS5 | 追加式事件日志 + 不变量执行器 + 投影 |
| 扩展单元 | skill（agentskills.io 标准）+ plugin + MCP + 终端后端 | Cordis 插件 + YAML patch 栈 + skill |
| 模型接入 | 适配器动物园 + 传输层（Anthropic/Bedrock/Codex/…） | deepseek-official 直连 + pi-ai 适配器 |
| 安全 | pairing、审批、技能 AST 审计链、沙箱后端 | 瀑布审批 + Landlock/bwrap/E2B seam 级沙箱 |
| 面向用户 | **终端用户**（20+ 平台消息网关，含微信/QQ/元宝） | **开发者**（无面向消费者的平台层） |
| 商业闭环 | Nous Portal 订阅 + 模型训练飞轮 | DeepSeek 模型生态的平台化配套 |

## 对照一：出身决定动机

**Nous Research 是模型实验室**（开源 Hermes 模型系列），**DeepSeek 是模型公司**。都做 agent，动机却不同：

- Nous 做 Hermes，是把 agent 当**研究基础设施 + 数据飞轮**：0003 讲过 `batch_runner.py` + `trajectory_compressor.py` 这条"用户会话 → 工具调用轨迹 → 下一代模型训练数据"的管道。agent 的每一次学习都在为模型资产增值，所以它舍得把学习闭环做成产品核心。
- DeepSeek 做 dsh，是把 agent 当**模型能力的标准化出口**：harness 保持中立与极简（4.2 万行对 103 万行），把差异化留给插件生态。模型在别的 harness 里跑也是同样的模型——harness 不需要学习，需要的是**可信赖的事件事实**与**可替换的机制**。

一个想 owned 整个"用"的环节，一个想 owned 整个"造"的环节。

## 对照二：loop 为谁而写

dsh 的 loop：`AgentLoop extends Service implements AgentFactory`，一个可从配置 patch 掉的插件行——为**想换范式的平台开发者**而写。

Hermes 的 loop：8954 行的生产级战舰，循环内外十道关卡（steer 排水、检查点、中断、双预算、宽限圈、压缩门、降级链、复读机拦截……）——为**真实世界的事故**而写。它的每个分支几乎都是一次真实故障的化石（billing 拦截、凭据池刷新风暴、图像损坏、长上下文分级、#89886 缓存标记 400……）。

**教材价值在 dsh，故障案例库价值在 Hermes。** 想理解 loop 该长什么样，读 dsh；想知道 loop 在生产里会遭遇什么，读 Hermes。

## 对照三：能力长在哪里

两家异口同声"能力别进核心"，但路径相反：

- **dsh 用机制**：Cordis 插件 + YAML patch 栈 + 热重载，同 id 后写胜出。可替换性是结构保证的，代价是你必须先理解 Cordis 这个编程范式（背后还有正经论文 arXiv:2608.25512）。
- **Hermes 用文化 + 生态**：AGENTS.md 立宪"细腰神圣"，核心工具准入靠评审门槛；实际的能力增量走三条边——**技能**（Markdown + 脚本，agentskills.io 开放标准，13 类内置 + Skills Hub 市场）、**服务门控工具**（浏览器/语音/图像，按后端能力开关）、**插件与 MCP**（双向：既能接 MCP 服务器，也能用 `hermes_tools_mcp_server.py` 把自己的工具反串成 MCP 服务端供别人用）。

耐人寻味的同构：dsh 的 `llm-pi-ai` 适配器把竞品 Pi 的模型库当 Provider；Hermes 的 `codex_app_server` 传输把 OpenAI Codex 的运行时当**整个回合的后端**。两家都信奉"竞品即零件"——agent 生态的成熟度标志。

## 对照四：学习为谁而做

0003 的结论在这里升级成选型判据：

- **dsh 的哲学：harness 不学习。** 它提供的是带不变量的事件日志——"模型可见即已记录"，学习与个性化是上层应用的事。如果你要搭的是多租户 agent 平台，这个中立性是特性不是缺陷。
- **Hermes 的哲学：agent 自己学习。** 记忆、技能、策展、召回全部内建，且带完整的安全与代谢机制。如果你要的是"开箱即成长的助理"，这些是别人给不了的开箱体验。

还有一个隐性维度：**中文可用性**。Hermes 的 `gateway/platforms/` 下一等公民实现了 `qqbot`、`weixin`（微信）、`yuanbao`（腾讯元宝）——中文用户获得的是"开箱即连微信"的体验；dsh 走的是协议中立路线，接微信需要自己做平台适配。

## 给自建 agent 平台者的四条启示

对照完两套源码，比"选谁"更值钱的是这几条可迁移的经验：

1. **成本纪律先行**：Hermes 把"会话级 prompt 缓存神圣不可侵犯"写进宪法，四断点策略 + 压缩分期付款的每一步都在给缓存让路。长对话产品的毛利藏在缓存命中率里。
2. **学习要配代谢**：只有"写入记忆/技能"没有"过期/归档/合并"的记忆系统，半年后就是垃圾场。抄 Hermes 的 curator + nudge 双机制：实时管生长，离线管代谢。
3. **高频操作走传统索引**：跨会话召回用 FTS5 零 LLM 成本，最贵的 LLM 调用只留给摘要与蒸馏。不是所有"智能"都要花 token。
4. **细腰要选对约束**：机制约束（dsh/Cordis）前期重、后期稳；文化约束（Hermes/评审）前期轻、后期要还债（8954 行巨核与拆解运动）。选哪条，取决于你的核心迭代速度与团队规模。

## 系列小结

四篇走完：0001 认识它（自我改进 + 全家桶），0002 剖开它（巨核、缓存宪法、传输动物园），0003 验证它（学习闭环四个环 + 数据飞轮），本篇把它放进坐标系（地基 × 成长的两条路线）。

后续待写：上下文工程细节、工具系统、消息网关、安全模型（见专栏首页写作计划）。

---

> 相关系列：[DeepSeek Harness 源码：一切皆插件](/源码剖析/deepseek-harness/)（9 篇已完结）
