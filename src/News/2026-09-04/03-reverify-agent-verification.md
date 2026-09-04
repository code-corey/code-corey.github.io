---
title: "reverify — Anti-hallucination for AI agents that read binaries（reverify：给读二进制的 agent 加防幻觉层）"
shortTitle: "reverify：给读二进制的 agent…"
sidebarGroup: "2026-09-04"
order: 3
date: 2026-08-31
category:
  - "每日 AI 简报"
tag:
  - "值得研究的仓库"
description: "一个针对「会读二进制/底层字节的 agent」的防幻觉基础设施。核心机制是 propose-verify 分离：模型提出断言，确定性工具裁决——每条关于字节内容的声明都会被标记为 VERIFIED 或 REFUTED 并附证据；已验证..."
---
# reverify — Anti-hallucination for AI agents that read binaries（reverify：给读二进制的 agent 加防幻觉层）

> 📅 2026-08-31 创建 | 🏷️ 🧰 值得研究的仓库 | ⭐ 761★（上线 4 天，7 天爆发窗口）| Python
> 🔗 原文：https://github.com/2akouwu/reverify

## 是什么

一个针对「会读二进制/底层字节的 agent」的防幻觉基础设施。核心机制是 propose-verify 分离：模型提出断言，确定性工具裁决——每条关于字节内容的声明都会被标记为 VERIFIED 或 REFUTED 并附证据；已验证的事实可以跨上下文重置存活。提供 MCP server + CLI 两种接入形态。

## 为什么值得架构师关注

agent 做逆向工程、固件分析、安全审计、编译产物检查时，幻觉的直接后果是错误的工程决策甚至安全事故。reverify 把「模型说的」和「字节里真实存在的」用证据链强制分开，是 agent 可靠性工程里少数能直接落地的模式。这个「声明必须过确定性验证才成为事实」的架构，可以推广到任何 agent 读文件/读数据库的场景。

## 核心内容

- 核心原则：The model proposes, deterministic tools decide（模型提议，确定性工具裁决）
- 每条声明输出 VERIFIED / REFUTED + 证据，而非让模型自我报告
- 已验证事实持久化：grounded facts survive context resets（上下文重置不丢已验证结论）
- 交付形态：MCP server + CLI，可挂进现有 agent 工作流
- 增速信号：上线 4 天 761★（7 天爆发窗口），说明「agent 验证层」需求真实存在

## 行动建议

团队若有二进制分析、逆向、安全审计类 agent 任务，直接按 README 跑一次 MCP 接入试点；评估点是其验证工具对目标二进制格式的覆盖面。即便不用此仓库，也建议把「声明-证据」模式写进自家 agent 的工具设计规范。
