---
title: "agentes-chat：团队 IM 里的 AI 员工（开源自托管 Slack 替代）"
shortTitle: "agentes-chat：AI 员工进 IM"
sidebarGroup: "2026-11-13"
order: 5
date: 2026-11-13
category:
  - "每日 AI 简报"
tag:
  - "值得研究的仓库"
description: "开源自托管 Slack 替代品：AI agent 作为'员工'进驻频道，与真人协作，支持 MCP 工具、记忆、例程与人工审批，4 天 1164 star。"
---

# agentes-chat：团队 IM 里的 AI 员工（Open-source, self-hosted Slack alternative where your team and AI agents work together）

> 📅 2026-11-13 | 🏷️ 值得研究的仓库 | ⭐ ⭐1.2k（7天窗口，创建 4 天）
> 🔗 原文：https://github.com/agentes-chat/agentes-chat

## 是什么

**agentes-chat** 是一个开源、自托管的 Slack 替代品，核心差异点是"团队频道里坐着 AI 员工"：agent 可由 Claude、ChatGPT/Codex、Gemini 或 Grok 驱动，拥有自己的电脑和浏览器，通过 MCP 使用工具，支持例程任务、记忆与人工审批。项目 2026-11-09 创建，4 天即获 1164 star，TypeScript 实现，提供 Web、桌面与手机端。

## 🔍 小白解读

### 先说几个词

- **自托管（Self-hosted）**：软件跑在自己公司的服务器上，数据不出门。好比自己开食堂，而不是天天点外卖——食材（数据）自己把关。
- **MCP（Model Context Protocol）**：让 AI 模型调用外部工具和数据的标准协议，类似 USB 接口——不管什么牌子的外设（工具），插上就能用。
- **人工审批（Approvals）**：AI 干关键操作前先停下来，等人点头再执行。相当于财务报销流程里"金额大了必须老板签字"。
- **Docker Compose + Postgres**：一条命令把整套系统连数据库一起跑起来的部署方式，是自托管软件"开箱即用"程度的硬指标。
- **AGPL-3.0**：一种"传染性"较强的开源协议，如果你把它改造成网络服务对外提供，通常也需要开源你的修改。

### 这篇到底在说什么

打个比方：现在的团队协作软件（Slack、钉钉、飞书）像一个办公室，真人员工在里面聊天开会；agentes-chat 给这个办公室里安排了几个"AI 工位"——AI 不是挂在侧边栏的聊天机器人，而是有自己电脑和浏览器的正式员工：它进频道、回消息、领任务、跑例程，干重要的活之前还会先来找你审批。你可以给它换"大脑"（Claude、Gemini、Grok 等随选），给它配工具（MCP），它还有记忆，记得之前聊过什么。整套系统 Docker Compose 一条命令就能在自己服务器上跑起来。这种"IM 即 agent 工作台"的形态之所以 4 天冲到 1164 star，是因为它把"agent 落地"从搭系统变成了装软件。

### 这跟普通人有什么关系

小团队不用自研 agent 平台了——会装 Docker 就能让 AI 员工进群干活，比如每天自动整理周报、盯数据异常、跑日常运维脚本。数据留在自己服务器上，这也是很多公司不敢用云端 agent 方案的最大顾虑的解法。

## 为什么值得架构师关注

- **agent 交互界面的范式参考**："IM 频道"天然解决了 agent 的任务分发、进度可见、多人协作与历史留痕，比自建工单式 agent 平台便宜得多，可作为内部 agent 落地的交互骨架。
- **审批流是生产化关键**：项目把 human-in-the-loop 审批做成了内建能力，这正是 agent 从 demo 走向生产最缺的一环，值得参考其边界设计。
- **多模型可切换的架构**：agent 后端在 Claude/Codex/Gemini/Grok 间切换，说明其模型抽象层设计值得研究，也意味着不被单一供应商锁定。
- **AGPL-3.0 的合规含义**：若基于它做对外 SaaS，协议要求开源修改；纯内部使用影响较小，但要在引入前讲清楚。

## 核心内容

- agent 运行于 Claude、ChatGPT/Codex、Gemini 或 Grok，可按需切换（官方描述）。
- agent 拥有自己的电脑和浏览器，支持 MCP 工具、例程（routines）、记忆与人工审批。
- 提供 Web、桌面、手机三端应用；Docker Compose + Postgres 部署。
- TypeScript 实现，AGPL-3.0 协议，2026-11-09 创建，1164 star（4 天）。

## 行动建议

先做最小 POC：一个频道 + 一个 agent + 一个低风险例程任务（如每日站会纪要汇总），验证交互模式是否比现有聊天机器人方案更顺手；安全评审重点看 agent 浏览器/电脑的沙箱隔离与审批流的绕过风险；商用化前请法务确认 AGPL-3.0 边界。
