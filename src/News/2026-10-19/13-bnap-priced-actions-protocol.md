---
title: "BNAP: a universal plug for priced and permissioned actions（BNAP：给「付费/授权动作」定一个通用插头）"
shortTitle: "BNAP付费动作协议"
sidebarGroup: "2026-10-19"
order: 13
date: 2026-10-19
category:
  - "每日 AI 简报"
tag:
  - "Web3 & Crypto"
description: "BNAP 协议尝试为「按价计费、按权限放行」的动作定义通用标准：规范 + 注册表 + 测试向量 + 一致性测试套件，Rust 参考实现 Caparra 自带钱包、CLI 与 MCP server——AI Agent 按标准付费执行链上动作的早期基础设施尝试（⭐1）。"
---

# BNAP: a universal plug for priced and permissioned actions（BNAP：给「付费/授权动作」定一个通用插头）

> 📅 2026-10-19 | 🏷️ Web3 & Crypto | ⭐ 1（7天窗口，创建于 2026-10-13）| 语言：Python（规范）/ Rust（参考实现）
> 🔗 原文：https://github.com/bnap-protocol/bnap
> 🔗 参考实现：https://github.com/bnap-protocol/caparra

## 是什么

BNAP 是一个极早期的协议项目，目标一句话：给「付费且需要授权的动作」定义一个通用插头（universal plug）。仓库内容是一套正经的标准化配置——规范（spec）、注册表（registry）、测试向量（test vectors）、一致性测试套件（conformance suite）；配套的 Caparra 是其 Rust 参考实现，包含 gate（闸门）、wallet（钱包）、CLI 和 MCP server。两个仓库均创建于 2026-10-13，⭐1，但工程配置的完整度远超同星数项目。

## 🔍 小白解读

### 先说几个词

- **协议规范（spec）**：规定「大家怎么互相说话」的公开文档，配上测试集让实现者自证兼容。
- **一致性测试（conformance suite）**：一套标准考卷，谁宣称实现了协议，跑一遍就知道真不真。
- **参考实现（reference implementation）**：官方提供的示范代码，「照着这个写就不会错」。
- **MCP（Model Context Protocol）**：AI Agent 接入外部工具的开放协议，Agent 生态的通用插座。

### 这篇到底在说什么

设想一个正在逼近的场景：网站、API、Agent 工具都想「按次收费」或「按权限放行」，但每家自己发明一套计费与鉴权方式，互不兼容——今天 AI 栏目里「网站对 Agent 关门」正是这个乱局的症状。BNAP 想做的就是这层标准化：把「一个动作值多少钱、调用者有什么权限、如何验权、如何结算」定义成通用格式，任何网页、API、链上合约都能插上这个插头。它的 Rust 实现 Caparra 带了 MCP server，意味着 AI Agent 可以按这套标准直接付费执行动作——这是 Web3×AI 交叉最实在的落点：Agent 经济需要统一的「动作计价」底座。打个比方：充电桩接口统一之前，每家车企一个插头；BNAP 在争的就是那个国标插头——极早期，但方向真实。

### 这跟普通人有什么关系

若这类协议成熟，你用 AI 助理付费获取内容或服务时会有一套透明的按次计价标准，而不是各平台各立各法；内容创作者也多一种「按次卖内容给 Agent」的变现方式。

## 为什么值得架构师关注

与今日 AI 栏目「网站关闭 Agent 大门」对照阅读：封锁与计费是同一问题的两面，动作级计价协议是 Agent 与 Web 重新定价的基础设施。BNAP 的价值在 spec 设计的完整性意识（测试向量 + 一致性套件是协议项目的正确姿势），风险在极早期（⭐1、无落地案例、无生态）。给架构师的定位：不采用，但值得放进观察清单——重点跟踪其授权模型（权限如何声明与撤销）、争议处理（付了钱动作失败怎么办）与与既有标准（x409/paid-crawl 类方案）的关系。任何「Agent 付费调用 API/内容」的中长期规划，都应预留一个标准化计价协议的集成位。

## 核心内容

- 仓库：bnap-protocol/bnap——规范、注册表、测试向量、一致性测试套件（Python 生态），⭐1
- 参考实现：bnap-protocol/caparra——Rust 编写，含 gate、wallet、CLI、MCP server 四件套，⭐1
- 定位：priced and permissioned actions 的通用协议插头，面向按次计费与按权放行场景
- Web3×AI 交叉点：MCP server 让 AI Agent 能按标准付费执行动作
- 工程姿态：极低热度但标准化配置完整（测试向量 + 一致性套件），属「问题独特例外」选题

## 行动建议

做内容付费、API 计费或 Agent 商业化的团队：读其 spec 与测试向量，理解「动作计价标准化」的设计空间；不做采用决策，列入季度观察。其余读者了解即可——记住关键词「动作计价协议」，它会在 Agent 经济里反复出现。
