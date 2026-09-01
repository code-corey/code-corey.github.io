---
title: "0006 对照篇 · hermes × dsh：选地基还是选成长"
sidebarGroup: "Hermes Agent"
shortTitle: "0006 hermes × dsh 对照"
order: 6
date: 2026-09-01
category: "源码剖析"
tag:
  - "Hermes Agent"
  - "DeepSeek Harness"
  - "源码"
  - "Agent"
description: "Hermes Agent 源码系列第 6 篇（完结）：与 DeepSeek Harness 全维度对照——出身、哲学、学习、扩展、安全，回答『它和 DeepSeek agent 是一回事吗』。"
---

# 0006 · 对照篇 · hermes × dsh：选地基还是选成长

> **源码仓库解读 · Hermes Agent 系列第 6 篇（全文完结）**
> 对照对象：[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)（v0.21.0，本系列已剖）· [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（v0.1.2-alpha.2，[本站专栏已剖](/源码剖析/deepseek-harness/)）
> 主线：[0005 安全模型与插件生态](./0005-security-plugins.md)

## 先给结论

常被问到的一个问题：**"Hermes Agent 和 DeepSeek 的 agent（dsh）是一回事吗？"**

**不是，而且差异是路线级的。** 两者共同点只有一个：都属于 "agent harness" 物种——都解决"让 LLM 循环调用工具直到完成任务"。从此往下每个分叉都走了相反方向：

| 维度 | Hermes（Nous Research） | dsh（DeepSeek AI） |
|---|---|---|
| 一句话 | **越用越懂你**的个人 agent | **一切皆插件**的平台底座 |
| 语言 / 体量 | Python，1291 文件 / 约 103 万行（不含测试） | TypeScript，55+ 包 monorepo / 核心约 4.2 万行 |
| 架构隐喻 | **巨核 + 边缘生态**（细腰靠文化约束，8954 行 loop 拆解中） | **插件树**（连 agent loop 都是可替换插件行） |
| 学习 | **一等公民**：MEMORY/USER.md + 技能 + curator + FTS5 召回 + 数据飞轮 | 不内置：事件日志交给上层应用 |
| 事实存储 | SQLite 会话库 + FTS5 | 追加式事件日志 + 不变量执行器 + 投影 |
| 扩展单元 | skill（agentskills.io）+ plugin + MCP + 终端后端 | Cordis 插件 + YAML patch 栈 + skill |
| 上下文抽象 | 可插拔引擎 + 三级压缩（产品成本视角） | 事件日志投影 seam（平台资源视角） |
| 模型接入 | 适配器动物园 + 传输层（Anthropic/Bedrock/Codex/…） | deepseek-official 直连 + pi-ai 适配器 |
| 安全 | **只信 OS** 公理 + 审批/配对/分级扫描（事故预防栈） | seam 级沙箱（Landlock/bwrap/E2B）+ 瀑布审批 |
| 面向用户 | **终端用户**（23 平台消息网关，含钉钉/飞书/企微/微信/QQ/元宝） | **开发者**（无面向消费者的平台层） |
| 商业闭环 | Nous Portal 订阅 + 模型训练飞轮 | DeepSeek 模型生态的平台化配套 |

## 对照一：出身决定动机

**Nous Research 是模型实验室**（开源 Hermes 模型系列），**DeepSeek 是模型公司**。都做 agent，动机不同：

- Nous 做 Hermes，是把 agent 当**研究基础设施 + 数据飞轮**：0003 讲过 batch_runner + trajectory_compressor 这条"会话 → 轨迹 → 下一代模型训练数据"管道，用户每次学习都在为模型资产增值，所以它舍得把学习闭环做成产品核心。
- DeepSeek 做 dsh，是把 agent 当**模型能力的标准化出口**：harness 保持中立与极简（4.2 万行对 103 万行），把差异化留给插件生态。模型在别的 harness 里跑也是同样的模型——harness 不需要学习，需要的是**可信赖的事件事实**与**可替换的机制**。

一个想 owned 整个"用"的环节（并让"用"反哺"造"），一个想 owned 整个"造"的环节（让"造"服务"用"）。

## 对照二：loop 为谁而写

dsh 的 loop：`AgentLoop extends Service implements AgentFactory`，一个可从配置 patch 掉的插件行——为**想换范式的平台开发者**而写。

Hermes 的 loop：8954 行的生产级战舰，循环内外十道关卡（steer 排水、检查点、中断、双预算、宽限圈、压缩门、降级链、复读机拦截……）——为**真实世界的事故**而写，每个分支几乎都是一次真实故障的化石（billing 拦截、凭据池刷新风暴、图像损坏、长上下文分级、#89886 缓存标记 400……）。

**教材价值在 dsh，故障案例库价值在 Hermes。** 想理解 loop 该长什么样，读 dsh；想知道 loop 在生产里会遭遇什么，读 Hermes。

## 对照三：能力长在哪里

两家异口同声"能力别进核心"，但路径相反：

- **dsh 用机制**：Cordis 插件 + YAML patch 栈 + 热重载，同 id 后写胜出。可替换性是结构保证的，代价是必须先懂 Cordis 这个编程范式（背后有正经论文 arXiv:2608.25512）。
- **Hermes 用文化 + 生态**：AGENTS.md 立宪"细腰神圣"，核心工具准入靠评审门槛；实际能力增量走三条边——**技能**（agentskills.io 标准，13 类内置 + Skills Hub 市场）、**服务门控工具**（按后端能力开关）、**插件与 MCP**（双向：既能接 MCP 服务器，也能用 `hermes_tools_mcp_server.py` 把自己的工具反串成 MCP 服务端）。

耐人寻味的同构：dsh 的 `llm-pi-ai` 适配器把竞品 Pi 的模型库当 Provider；Hermes 的 `codex_app_server` 传输把 OpenAI Codex 的运行时当**整个回合的后端**。两家都信奉"竞品即零件"——agent 生态成熟度的标志。

## 对照四：学习与安全，两种哲学各自的彻底

**学习**：dsh 的哲学是 harness 不学习——提供带不变量的事件日志，学习与个性化是上层应用的事，多租户平台视角下这种中立性是特性；Hermes 的哲学是 agent 自己学习——记忆、技能、策展、召回全内建，且学习管线通向模型训练。加上隐性维度：Hermes 网关一等公民实现钉钉/飞书/企业微信/微信/QQ/元宝，中文用户开箱即连；dsh 走协议中立路线，接国内 IM 需要自己做平台适配。

**安全**：dsh 把沙箱做成 seam 级机制（Landlock/bwrap/E2B），默认姿态更硬；Hermes 把"进程内一切皆启发式"摊开说明，把真边界交给操作系统与部署姿势。**一个是机制自信，一个是认知诚实**——读哪份源码，都能学到另一半团队不愿明说的东西。

## 给自建 agent 平台者的六条启示

1. **成本纪律先行**：把"会话级 prompt 缓存神圣"写进宪法，缓存断点按声明式字节边界落位。长对话产品的毛利藏在缓存命中率里。
2. **学习要配代谢**：只有写入没有过期/归档/合并的记忆系统，半年后就是垃圾场。实时 nudge 管生长，离线 curator 管代谢。
3. **高频操作走传统索引**：跨会话召回用 FTS5 零 LLM 成本，最贵的调用只留给摘要与蒸馏。不是所有"智能"都要花 token。
4. **细腰要选对约束**：机制约束（dsh/Cordis）前期重、后期稳；文化约束（Hermes/评审）前期轻、后期还债（8954 行巨核与拆解运动）。取决于核心迭代速度与团队规模。
5. **多入口系统先修并发纪律**：锁加在"解析后的最终资源标识"上（turn_lease 的教训），派发单主化、通知无写权限。
6. **扩展面做成信任梯度**：越贴近核心越稳定、越靠边缘越严审——Hermes 的"细腰"最终不是一个面，而是一个按信任分层的梯度场（0005）。

## 系列收束

六篇走完：**0001** 认识它（自我改进 + 全家桶，23.9 万 star 的由来），**0002** 剖开它（巨核、缓存宪法、三级压缩、工具渐进披露），**0003** 验证它（学习闭环四内环 + 数据飞轮外环），**0004** 走出核心（网关、多端、任务编排——核心之外全是分布式问题），**0005** 看住它（只信 OS 的公理与信任梯度），本篇把它放进坐标系。

选型一句话：**要造 agent 平台的地基，读 dsh；要一个已经会成长的 agent，或要学"产品级 agent 该长什么样"，用 Hermes。** 而作为源码教材，两者互为镜像——一个展示了机制约束的优雅，一个展示了文化约束下真实系统的全部重量。

---

> 相关系列：[DeepSeek Harness 源码：一切皆插件](/源码剖析/deepseek-harness/)（9 篇已完结） · 回到 [专栏首页](/源码剖析/hermes-agent/)
