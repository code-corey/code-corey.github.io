---
title: "coucou: A tiny friend that watches your coding agents（住在屏幕刘海里的 Coding Agent 盯梢小宠物）"
shortTitle: "coucou 盯梢 Coding Agent"
sidebarGroup: "2026-10-02"
order: 3
date: 2026-09-27
category:
  - "每日 AI 简报"
tag:
  - "值得研究的仓库"
description: "macOS 刘海/Windows 顶部的小宠物，实时盯梢 Claude Code、Gemini CLI 等编码 Agent 状态，5 天斩获 2462 星。"
---

# coucou: A tiny friend that lives in your notch and keeps an eye on your coding agents（住在刘海里盯梢 Coding Agent 的小宠物）

> 📅 2026-09-27（7 天爆发窗口） | 🏷️ 值得研究的仓库 | ⭐ 2462（7天）
> 🔗 原文：https://github.com/Louis-CFM/coucou

## 是什么

coucou 是一个开源小工具：在 macOS 刘海处（Windows/Linux 在屏幕顶部）驻一只小宠物，实时监视你所有正在干活的编码 Agent——Claude Code、Gemini CLI、Antigravity 等。Agent 什么时候在跑、什么时候卡住等你确认，一眼可知。项目 2026-09-27 创建，5 天左右收获 2462 星，Swift 实现。

## 🔍 小白解读

### 先说几个词

- **Coding Agent（编码智能体）**：能自己连续干活（写代码、跑命令、改文件）的 AI 助手，比如 Claude Code、Gemini CLI。好比一个 remotely 办公的实习生。
- **CLI（命令行界面）**：在黑色终端窗口里敲字操作的软件形态，多数 coding agent 都长这样。
- **驻留通知/菜单栏应用**：常驻屏幕角落的小程序，不打断你，但关键时刻提醒你。类似微信的"有人@你"红点。
- **Swift**：苹果生态的编程语言，此项目用它写的 macOS 端。

### 这篇到底在说什么

用过 coding agent 的人都有同款痛点：你同时开了三四个 Agent 干活，然后切去干别的；等你想起来回去看，发现其中一个五分钟前就停了，在等你批准一条命令——整条流水线就卡在这。打个比方，你请了三个远程实习生，但他们都不主动给你发消息，你得一个个工位跑过去问"好了吗？"。coucou 就是给每个工位装了一盏状态灯：谁在忙、谁闲了、谁在等你，全在屏幕顶部一眼扫完。就这么一个小痛点，5 天 2462 星，说明"多 Agent 并行的注意力管理"是当下开发者实实在在的痒点。

### 这跟普通人有什么关系

如果你还不用 AI 写代码，可以先不了解。但如果你已经是"AI 打工人"——让 Agent 帮你跑测试、改 bug、写文档——这个工具能直接减少你的等待和切换成本，把"人等机器"变成"机器等人"。

## 为什么值得架构师关注

表面是个萌宠，实质是 **Agent 工作流可观测性（observability）的轻量样本**：它要工作，就必须从各家 Agent 的会话状态里读信号（进程、状态文件、通知钩子等），这恰好暴露了当前 coding agent 生态缺乏统一状态接口的现状。对正在搭建内部 Agent 平台的团队，两个启发：① Agent 状态上报/聚合应作为平台基础能力设计，而不是事后补丁；② 团队级场景下，"谁在等谁"的可视化直接决定并行 Agent 的吞吐，值得在平台里优先实现通知与状态聚合层。仓库本身代码量不大，适合作为参考实现快速读完。

## 核心内容

- 跨平台：macOS 刘海位、Windows/Linux 屏幕顶部驻留小宠物，监视编码 Agent 状态。
- 原生支持 Claude Code、Gemini CLI、Antigravity 等主流 coding agent，官方描述为"and more"。
- 2026-09-27 创建，约 5 天 2462 星（7 天爆发窗口），Swift 编写，增长速度显著高于同类。
- 解决的问题非常具体：多 Agent 并行时的"空闲等待"与"审批阻塞"注意力管理。

## 行动建议

个人/小团队可直接试用：装上跑一周，统计自己的 Agent 空转时间是否显著下降。平台团队建议读源码，重点看它如何检测各 Agent 的状态（轮询哪些文件/进程），作为自建 Agent 状态聚合层的参考；若你们已有内部 Agent 平台，评估把"等待审批"事件接入统一的 IM/工单通知而不是屏幕宠物。
