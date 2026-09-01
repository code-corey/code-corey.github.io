---
title: Hermes Agent 源码
index: false
icon: staff-snake
article: false
---

# Hermes Agent 源码：会自我成长的 agent

> 仓库：[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) · v0.21.0 · MIT
> 口号：**"The agent that grows with you"** —— 自我改进 AI agent：从经验中创建技能、在使用中改进技能、跨会话记住你是谁
> 规模：1291 个 Python 文件 / 约 103 万行（不含测试）· 239k+ stars / 48.7k+ forks（2026-09-01 实测）
> 出品方：[Nous Research](https://nousresearch.com)（开源 Hermes 模型系列背后的实验室）

它与 [DeepSeek Harness](/源码剖析/deepseek-harness/)（`dsh`）**不是一回事**：dsh 是"一切皆插件"的平台级 harness 底座（TypeScript），Hermes 是"越用越懂你"的个人 agent 产品（Python）。两者恰好代表 agent 工程的两条路线——本系列会反复回到这组对照。

## 阅读路线

- **想知道这是什么**：0001（全景）
- **想理解架构取舍**：0002（巨核与窄腰）
- **想复刻学习闭环**：0003（记忆/技能/策展人三部曲）
- **在做选型或想横向对比**：0004（hermes × dsh 对照）

## 文章目录

<Catalog />

## 写作计划（后续篇目）

- 0005 上下文工程：prompt caching 四断点策略与 micro-compaction 分期付款
- 0006 工具系统：toolsets 组合、终端七后端与 managed gateway
- 0007 消息网关：单进程多平台（Telegram/Discord/微信/QQ/元宝…）的会话路由
- 0008 安全模型：pairing、审批瀑布与技能安全扫描链
