---
title: "codex-with-chatgpt（ChatGPT 负责想，Codex 负责干）"
shortTitle: "ChatGPT 负责想，Codex 负责干"
sidebarGroup: "2026-09-01"
order: 3
date: 2026-08-28
category:
  - "每日 AI 简报"
tag:
  - "值得研究的仓库"
description: "一个 TypeScript 工具，官方描述一句话：「ChatGPT thinks. Codex works.」——用 ChatGPT 作为规划大脑（planning brain），同时保留 Codex harness 作为执行层。本质..."
---
# codex-with-chatgpt（ChatGPT 负责想，Codex 负责干）

> 📅 2026-08-28（创建）| 🏷️ 🧰 值得研究的仓库 | ⭐ ⭐2,035（4 天，约 500★/天）
> 🔗 原文：https://github.com/XiaoDuoYa/codex-with-chatgpt

## 是什么

一个 TypeScript 工具，官方描述一句话：「ChatGPT thinks. Codex works.」——用 ChatGPT 作为规划大脑（planning brain），同时保留 Codex harness 作为执行层。本质是把「规划/执行」拆给两个不同的模型，各取所长。

## 为什么值得架构师关注

- **规划/执行分离是多模型架构最直接可落地的模式**：强推理模型做 plan 与 review，高性价比执行模型做 edit/run，有机会同时优化交付质量与 token 成本——这是成本敏感团队可以直接验证的架构假设，不需要等任何新模型发布。
- **增速是本日 GitHub 榜单 7 天窗口内最快的**：2026-08-28 创建，4 天 2035★（约 500★/天），痛点真实性已被市场投票验证。
- **代表一个明确的趋势切片**：同榜的 `hkqr/my-free-code`（617★，多 provider AI 网关，带模型路由/fallback）与 `HarnessRouter`（650★，UHP 统一协议）都在做同一件事的不同层——多模型编排层正在从 idea 变成标配组件。

## 核心内容

- 模式：planner（ChatGPT）+ executor（保留 Codex harness），职责分离。
- 实现：TypeScript；仓库创建于 2026-08-28，4 天 2035★。
- 与传统单模型 agent 的差异点：规划上下文与执行上下文解耦，planner 不直接触碰工作区，executor 不承担长程推理。
- 生态对照（本日缓存数据）：AI 编排/路由类新仓密集爆发——my-free-code（617★/5 天）、HarnessRouter（650★/23 天）、useagent（264★/3 天），该层竞争刚刚开始。

## 行动建议

- 建议 immediate POC：选一类复杂但可验收的任务（如跨模块重构），对比「单模型端到端」vs「规划/执行分离」的 token 成本、返工率、交付时长，用数据决定是否采纳该模式。
- 重点评估两个模型间的上下文传递开销与信息损失——分离模式的经典风险是 planner 的意图在传递中失真。
- 观察该项目成熟度（创建仅 4 天，生产使用需谨慎），模式本身的价值独立于这个具体仓库。
