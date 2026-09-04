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

## 为什么值得架构师关注
长时程可靠性是 agent 从 demo 走向生产的第一道墙：上下文会腐坏、单步会失败、事后无法追责。这个仓库把四个最痛的点拆成了明确的工程组件，可以直接当作企业内部 agent 平台的需求清单与选型基准。凡是 RPA 替代、跨系统运维自动化、长流程业务处理场景，都值得拿它对标。

## 核心内容
- 定位：long-horizon computer-use harness——跨桌面应用 + CLI 长时间运行 agent，保持任务状态。
- 四个关键机制（官方描述）：fresh-context execution（每步以干净上下文执行，规避长上下文污染）、durable verified state（持久且经验证的任务状态，而非「模型自信」）、independent auditing（执行过程可独立审计）、recoverable progress（失败后进度可恢复）。
- 集成：原生支持 Claude Code / Codex / OpenClaw 接入，说明其定位是通用底座而非单一产品附属。
- 同团队信号：AMAP-ML 还发布了 LoopArena（benchmarking models as runtime Controllers for Loop Engineering，⭐77），指向「模型作为运行时控制器」的评测方向，与 harness 形成「框架 + 评测」组合。

## 行动建议
在下一个 agent 试点立项前，把该仓库的四个机制作为验收项给现有方案打分：状态可验证吗？过程可审计吗？失败可恢复吗？缺口即自研/采购重点。Python 栈可直接 clone 试运行，与内部方案做同任务对比。
