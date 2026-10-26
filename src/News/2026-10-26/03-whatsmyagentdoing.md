---
title: "whatsmyagentdoing: See What Every Coding Agent on Your Machine Is Doing（whatsmyagentdoing：实时围观你机器上的每一个编程 agent）"
shortTitle: "agent办公室可视化"
sidebarGroup: "2026-10-26"
order: 3
date: 2026-10-23
category:
  - "每日 AI 简报"
tag:
  - "值得研究的仓库"
description: "开源工具 whatsmyagentdoing 把机器上每个 Claude Code / Codex agent 的实时状态渲染成一间「小办公室」，创建 3 天斩获 227 星。"
---

# whatsmyagentdoing: See What Every Claude Code and Codex Agent on Your Machine Is Doing — Live, in a Little Office（whatsmyagentdoing：实时围观你机器上的每一个编程 agent）

> 📅 2026-10-23 | 🏷️ 值得研究的仓库 | ⭐ ⭐227（7 天窗口，创建 3 天）
> 🔗 原文：https://github.com/Charonyuu/whatsmyagentdoing

## 是什么

一个开源可视化小工具：把同一台机器上正在运行的每个 Claude Code 与 Codex agent 的实时状态，渲染成一间「小办公室」——每个 agent 是办公室里的一个工位，谁在干活、谁在等你确认、谁卡住了，一眼扫尽。项目用 JavaScript 实现，10 月 23 日创建，3 天内涨到 227 星，是本周 GitHub 上反应最快的 agent 周边工具之一。

## 🔍 小白解读

### 先说几个词

- **Coding agent**：能自主改代码、跑命令、多步骤干活的 AI 程序员，Claude Code 和 Codex 是目前最有代表性的两个。
- **多 agent 并行**：同时开好几个 agent 各干各的任务——比如一个改前端、一个写测试、一个修 bug。
- **可观测性（Observability）**：系统能让你随时看清「里面正在发生什么」。这是运维领域的老词，现在轮到 agent 了。
- **可视化仪表盘**：把看不见的进程状态变成一眼能读懂的画面，就像把服务器的 CPU 曲线画成图表。

### 这篇到底在说什么

打个比方：你同时请了五个远程实习生，都在各自房间里敲代码。以前你想知道进度，得一个房间一个房间敲门问；这个工具相当于装了一排监控屏，五个人的工位画成一间办公室，谁在认真敲键盘、谁停下来等你的反馈、谁已经发呆，抬眼就能看到。它解决的是「多 agent 并行时代」一个非常具体的小痛点：agent 开多了之后，人类根本记不住谁在干什么。项目上线三天 227 星，说明这个痛点足够普遍。

### 这跟普通人有什么关系

哪怕你只同时跑两三个 agent，也会遇到「忘了它做到哪了」「不知道它是不是卡死了」的问题。这类工具把「盯着 AI 干活」的成本降下来——对用 AI 打工的个人和小团队，这就是实打实的效率。

## 为什么值得架构师关注

1. **信号价值大于工具价值**：227 星/3 天说明「agent 车队可观测性」已是刚需前兆——当团队 agent 数量超过个位数，没有状态聚合就管不动了。
2. **与昨日报道的 Corgi（{agent, terminal} 多路复用器）同属多 agent 工作流管理赛道，但定位是「看」而非「管」**：两者互补，可作为团队 agent 工作台观测层的选型参考。
3. **本地运行、架构轻**：JavaScript 实现，无云端依赖，引入成本低，适合作为「agent 车队监控」的原型参考实现来读源码。
4. **管理视角**：团队引入批量 agent 后，「谁在干什么、花了多少时间」会成为新的管理报表需求，这类可视化是雏形。

## 核心内容

- 功能：实时展示机器上每个 Claude Code / Codex agent 的状态，呈现为一间「小办公室」的可视化界面。
- 技术栈：JavaScript；定位是本地运行的轻量工具。
- 增长信号：2026-10-23 创建，3 天 227 星（7 天爆发窗口）。
- 场景：多 agent 并行时的进度盘点、卡死发现、状态一目了然。

## 行动建议

团队已并行跑多个 agent 的：直接试用，成本几乎为零，并可借鉴其思路规划正式的 agent 监控方案；想深入研究多 agent 可观测的：源码短小，适合通读。单 agent 轻度用户：了解即可。
