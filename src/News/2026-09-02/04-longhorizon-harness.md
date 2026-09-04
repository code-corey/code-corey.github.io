---
title: "AMAP-ML/LongHorizon-Harness（长时程计算机操作 agent 运行框架）"
shortTitle: "长时程计算机操作 agent 运行框架"
sidebarGroup: "2026-09-02"
order: 4
date: 2026-08-04
category:
  - "每日 AI 简报"
tag:
  - "值得研究的仓库"
description: "高德（AMAP）ML 团队开源的长时程 computer-use 运行框架：让 AI agent 跨桌面应用与 CLI 长时间执行复杂工作流，核心目标是「保持任务状态并可靠推进」。官方列出的四个关键机制——fresh-context ..."
---
# AMAP-ML/LongHorizon-Harness（长时程计算机操作 agent 运行框架）

> 📅 2026-08-04 创建 | 🏷️ 值得研究的仓库 | ⭐ 1,432（29 天）| lang: Python
> 🔗 原文：https://github.com/AMAP-ML/LongHorizon-Harness

## 是什么
高德（AMAP）ML 团队开源的长时程 computer-use 运行框架：让 AI agent 跨桌面应用与 CLI 长时间执行复杂工作流，核心目标是「保持任务状态并可靠推进」。官方列出的四个关键机制——fresh-context 执行、可验证的持久状态、独立审计、可恢复进度——原生集成 Claude Code / Codex / OpenClaw。

## 🔍 小白解读

### 先说几个词

- **Computer-use（操控电脑）**：让 AI 像人一样操作电脑——点鼠标、切窗口、填表格、跑命令。
- **长时程任务**：不是「问我答」式的几秒钟任务，而是要连轴转几十分钟、几小时、跨好几个软件才能完成的复杂活。
- **上下文污染**：AI 的「工作记忆」有限，任务拖得越长，记忆里垃圾越多，AI 就越来越糊涂。相当于连续加班 24 小时后的脑子。
- **fresh-context（新鲜上下文）**：每一步都让 AI 「睡醒再干」——只带最必要的状态开工，而不是背着全部历史包袱。
- **可审计 / 可恢复**：AI 干的每一步都留有记录可查（审计），中途崩了能从断点继续而不是从头再来（恢复）。

### 这篇到底在说什么

让 AI 替你操作电脑干长活，最大的敌人不是「不会干」，而是干着干着「忘了自己是谁、刚干嘛了、下一步该干嘛」，或者一步错步步错没人发现。高德开源的这个框架相当于给 AI 配了个「项目经理」：每步开工前把记忆清干净只留关键进度；每个关键节点都核对一遍成果再往下走；全程留痕可审计；中断了能从存档点继续。大厂把自己的内部实践开源出来，含金量不低。

### 这跟普通人有什么关系

如果你幻想过「让 AI 帮我把报表系统跑一遍、把数据从 A 系统搬到 B 系统」，卡住你的就是可靠性——AI 干长活容易「中途变傻」。这类框架就是在解决这件事，意味着「AI 员工干一整天活」离实际可用又近了一步。团队可以直接拿来用，不必自己从零造。

## 为什么值得架构师关注
长时程可靠性是 agent 从 demo 走向生产的第一道墙：上下文会腐坏、单步会失败、事后无法追责。这个仓库把四个最痛的点拆成了明确的工程组件，可以直接当作企业内部 agent 平台的需求清单与选型基准。凡是 RPA 替代、跨系统运维自动化、长流程业务处理场景，都值得拿它对标。

## 核心内容
- 定位：long-horizon computer-use harness——跨桌面应用 + CLI 长时间运行 agent，保持任务状态。
- 四个关键机制（官方描述）：fresh-context execution（每步以干净上下文执行，规避长上下文污染）、durable verified state（持久且经验证的任务状态，而非「模型自信」）、independent auditing（执行过程可独立审计）、recoverable progress（失败后进度可恢复）。
- 集成：原生支持 Claude Code / Codex / OpenClaw 接入，说明其定位是通用底座而非单一产品附属。
- 同团队信号：AMAP-ML 还发布了 LoopArena（benchmarking models as runtime Controllers for Loop Engineering，⭐77），指向「模型作为运行时控制器」的评测方向，与 harness 形成「框架 + 评测」组合。

## 行动建议
在下一个 agent 试点立项前，把该仓库的四个机制作为验收项给现有方案打分：状态可验证吗？过程可审计吗？失败可恢复吗？缺口即自研/采购重点。Python 栈可直接 clone 试运行，与内部方案做同任务对比。
