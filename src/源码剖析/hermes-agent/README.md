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
- **想理解核心架构**：0002（巨核与窄腰：loop / 上下文 / 工具）
- **想复刻学习闭环**：0003（记忆/技能/策展/召回 + 数据飞轮）
- **搭多端与定时任务**：0004（网关 / 桌面 TUI / cron / 看板）
- **做安全与插件设计**：0005（只信操作系统 + 信任梯度）
- **在做选型或横向对比**：0006（hermes × dsh 对照收束）

## 文章目录

<Catalog />

## 写作计划（后续篇目）

- 0007 实战篇：把 Hermes 接入微信/QQ 从安装到跑通
- 0008 源码演进观察：god-file 拆解运动与版本变更追踪
