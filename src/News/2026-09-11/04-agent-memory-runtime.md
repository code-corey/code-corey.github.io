---
title: "tigerless-labs/agent-memory：Markdown 事实源的 Agent 长期记忆运行时（agent-memory）"
shortTitle: "agent-memory 记忆层"
sidebarGroup: "2026-09-11"
order: 4
date: 2026-09-11
category:
  - "每日 AI 简报"
tag:
  - "值得研究的仓库"
description: "以纯 Markdown 为事实源的 Agent 长期记忆运行时：本地排序检索、独立 sleep-time Manage 层，Claude Code 与 Codex 共享一个记忆库，无需 API key，30 天窗口 845 星。"
---

# tigerless-labs/agent-memory：Markdown 事实源的 Agent 长期记忆运行时（agent-memory）

> 📅 2026-09-11 | 🏷️ 值得研究的仓库 | ⭐ ⭐845（30 天慢热发现）
> 🔗 原文：https://github.com/tigerless-labs/agent-memory

## 是什么

agent-memory 是一个 AI Agent 的**长期记忆运行时**：用**纯 Markdown 文件作为事实源（source of truth）**，配本地排序检索，外加一个独立的「sleep-time Manage」管理层；Claude Code 和 Codex 可以共享同一个记忆库，全程**不需要 API key**。Python 实现，30 天慢热窗口内累积 845 星。

## 🔍 小白解读

### 先说几个词

- **长期记忆**：让 AI 记住跨会话信息的能力。没有它，AI 就像金鱼——每次对话都从零开始。
- **事实源（Source of Truth）**：系统里「说了算」的那份数据。这里用 Markdown 文本文件担当，意味着记忆是肉眼可读、可用 git 管理、可人工修改的。
- **本地检索**：在你自己的机器上对记忆做排序查找，不把数据发到云端。
- **sleep-time Manage 层**：在 Agent「不忙」的时候，由独立进程整理、归并记忆（类似人睡觉时大脑巩固记忆），把整理开销从工作主链路挪走。

### 这篇到底在说什么

打个比方：主流方案像把记忆存进一个「云保险柜」——强大但要钥匙（API key）、要走网络、你看不到柜子内部。agent-memory 把记忆换成你桌上的一摞笔记本（Markdown 文件）：想看就翻、想改就改、搬家时揣走就行；检索和整理由本地程序自动完成。845 星的慢热曲线说明它不是靠一波热点冲榜，而是开发者们口口相传试出来的。

### 这跟普通人有什么关系

如果你日常用 Claude Code 或 Codex 这类 AI 编码助手，共享记忆库意味着换工具时不用从头「教」它你的项目习惯；对重视数据不出门的团队，本地 Markdown 是最透明的存储形态。

## 为什么值得架构师关注

1. **记忆层选型的第三条路**：托管记忆服务（便利、外部依赖）vs 自建向量库（可控、工程重）之外，「Markdown 事实源 + 本地检索」提供了零供应商依赖的极简方案，特别适合合规敏感或离线场景。
2. **架构模式值得借鉴**：把记忆整理放进独立的 sleep-time 层，是把「写时整理」改成「闲时整理」的经典架构取舍——读写路径解耦，主链路零开销，这个模式可平移到任何 Agent 记忆系统设计。
3. **跨工具共享记忆**：Claude Code 与 Codex 共用一个存储，暗示「记忆」正在从单工具特性变成跨工具的基础设施层——团队级记忆规范应该尽早规划（权限、清理、审计）。

## 核心内容

- 纯 Markdown 作为事实源，记忆内容人类可读可编辑（缓存数据：仓库描述）。
- 本地排序检索 + 独立 sleep-time Manage 整理层（缓存数据：仓库描述）。
- Claude Code 与 Codex 共享同一记忆库；无需 API key（缓存数据：仓库描述）。
- Python 实现，⭐845，创建于 2026-09-01（缓存数据：gh.json）。

## 行动建议

怎么评估试用：在个人开发环境先跑一周，重点验证两点——检索命中率（它能否在恰当时机召回相关记忆）与 Markdown 的膨胀速度（整理层是否压得住）。若通过，可试点推广到小团队，并把记忆目录纳入版本管理与备份策略。标注：本期仓库类目慢热发现（30 天窗口，仅此一篇）。
