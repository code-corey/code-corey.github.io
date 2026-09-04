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
