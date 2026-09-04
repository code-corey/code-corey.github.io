---
title: "Which tools do Claude, Codex and Cursor choose? We measured 17k runs to find out（实测 1.7 万次运行：Claude、Codex 和 Cursor 各自选择哪些工具？）"
shortTitle: "实测 1.7 万次运行：Claude、Co…"
sidebarGroup: "2026-09-04"
order: 1
date: 2026-09-03
category:
  - "每日 AI 简报"
tag:
  - "工程 & Agent"
description: "Armature 发布的一项实测研究：对 Claude、Codex、Cursor 三个主流 coding agent 的 17,000 次真实运行做系统测量，统计它们在任务中实际选择安装和使用的工具。这是少见的把 agent「自主行为..."
---
# Which tools do Claude, Codex and Cursor choose? We measured 17k runs to find out（实测 1.7 万次运行：Claude、Codex 和 Cursor 各自选择哪些工具？）

> 📅 2026-09-03 | 🏷️ 🏗️ 工程 & Agent | ⭐ HN 73分/21评论
> 🔗 原文：https://armature.tech/blog/which-tools-coding-agents-install

## 是什么

Armature 发布的一项实测研究：对 Claude、Codex、Cursor 三个主流 coding agent 的 17,000 次真实运行做系统测量，统计它们在任务中实际选择安装和使用的工具。这是少见的把 agent「自主行为」当作可量化对象的大样本研究。

## 🔍 小白解读

### 先说几个词

- **Coding agent**：能自己写代码、改代码、装依赖、跑测试的 AI 助手。Claude、Codex、Cursor 是当前最火的三个。
- **实测 vs 官方宣称**：厂商发布会说「我们的 AI 会用 XXX 工具」，实测派把 AI 真的跑一万七千遍，统计它实际干了什么—— akin 「看广告」和「看销量」的区别。
- **工具选择**：AI 干活时自己决定装什么工具、用什么命令，这个「自主决定」过程以前没人系统测过。
- **可回归验证**：测出来的结论可以反复重跑验证，不是一次性印象——科学方法的最基本要求。

### 这篇到底在说什么

三个最火的 AI 编程助手，谁更好用？厂商各说各话。有个团队做了件笨功夫但有价值的事：让它们真跑了 17,000 次任务，统计每次 AI 自己决定装什么工具、用什么命令，用数据说话。这种「不看广告看疗效」的大样本测量在 AI 行业还很少见，价值在于把「AI 的自主行为」从玄学变成了可量化、可复验的数字。

### 这跟普通人有什么关系

选 AI 编程工具就是选同事，直觉和广告都不可靠，这类实测数据才是硬参照。更通用的启示：面对任何「AI 能自动做 XX」的宣传，多问一句「有实测数据吗、样本多大、怎么验证的」，能避开大部分营销坑。文中还附了测量方法，有技术团队可以直接照着测自己的场景。

## 为什么值得架构师关注

agent 的工具选择行为直接决定它在你的代码库里能不能干活、会不会跑偏。如果三家 agent 的工具偏好存在系统性差异，就意味着「仓库脚手架和工具声明怎么写」已经和 onboarding 文档一样，是影响开发效率的一等工程因素。另外，agent 会自主安装工具，这本身就是一个供应链攻击面，应纳入安全评审范围。

## 核心内容

- 样本量 17,000 次真实 agent 运行，横向对比 Claude、Codex、Cursor 三家
- 测量对象是 agent 实际选择安装/使用的工具，而非官方宣称的能力清单
- 核心产出：三家 agent 工具偏好的差异数据（完整数据见原文）
- 附带一套可复用的测量方法：把「agent 用什么工具」变成可回归验证的指标
- HN 讨论区有从业者对照自家仓库的经验交流，可作补充信源

## 行动建议

用自己 2-3 个真实仓库跑一遍同类小样本测量，确认主力 agent 在你的代码库里装什么、用什么；把「agent 友好的工具声明」写进仓库规范；对 agent 自动安装的工具建立白名单审计。暂无 agent 落地则了解即可。
