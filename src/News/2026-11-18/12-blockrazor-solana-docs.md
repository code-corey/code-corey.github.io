---
title: "blockrazor-documentation（BlockRazor Solana 交易基础设施技术文档，3 天 153 星）"
shortTitle: "BlockRazor Solana 文档"
sidebarGroup: "2026-11-18"
order: 12
date: 2026-11-15
category:
  - "每日 AI 简报"
tag:
  - "Web3 & Crypto"
description: "BlockRazor 官方技术文档仓库开源：覆盖 Solana 交易发送（HTTP/gRPC、Fast 与三明治缓解模式、bundle/tip）、MEV 保护与订单流拍卖等技术参考，3 天 153 星。"
---

# blockrazor-documentation（BlockRazor Solana 交易基础设施技术文档，3 天 153 星）

> 📅 2026-11-15 | 🏷️ Web3 & Crypto | ⭐ ⭐153 / 0 fork（GitHub API 实测，7 天窗口；文档型仓库）| MIT | HTML
> 🔗 原文：https://github.com/guruyxs/blockrazor-documentation

## 是什么

BlockRazor（Solana 链上交易发送与 MEV 相关基础设施服务商）的官方技术文档仓库：以站点形式（已开启 GitHub Pages）系统公开其交易发送服务的技术参考——HTTP/gRPC 接入、Fast 与「三明治缓解」（Sandwich Mitigation）两种发送模式、bundle 与 tip 机制、Base64/二进制载荷、批量交易与保活连接等。创建 3 天 153 星。

## 🔍 小白解读

### 先说几个词

- **交易发送服务（transaction sending）**：帮你把链上交易「快递」出去并尽力上链的基础设施。Solana 上竞争激烈，速度和服务质量直接决定交易成败。
- **MEV（最大可提取价值）**：通过安排、插入交易顺序赚到的钱。像排队时插队赚钱——有人靠这个获利，也就有人需要「防插队」服务。
- **三明治攻击（sandwich attack）**：在你买卖前后各塞一笔交易，夹住你吃差价。三明治缓解模式就是服务商承诺帮你「防夹」。
- **bundle / tip**：把多笔交易打包成一个原子单位提交，并给验证者小费（tip）换取优先处理。像加急件多付快递费。
- **gRPC**：一种高性能的远程调用协议，比普通 HTTP 接口更快，适合对延迟敏感的交易发送。

### 这篇到底在说什么

在 Solana 上，交易「发得快、不被夹」是高频交易者和应用的生死线，由此形成了一批专门的基础设施服务商，BlockRazor 是其中之一。这家服务商把自己的技术文档开源成了一个 GitHub 仓库：怎么用 HTTP 或 gRPC 连接、普通快速模式和防三明治模式怎么选、批量交易和打包（bundle）怎么做、给验证者的小费（tip）怎么设置、长连接怎么保活。配套还有一个 Go 语言示例仓库（solana-resp-trader-client-go，25 星），演示实际调用。仓库 topics 里还能看到它同时覆盖 MEV 保护、订单流拍卖（orderflow auction）、searcher（套利/搜索者）、Jito 生态等关键词。需要说明：这是**文档型仓库**（HTML 页面，非代码库），且属于商业服务的官方材料，自带推广属性——但作为了解「Solana 交易基础设施长什么样、服务商在卷什么参数」的公开教材，是目前很少见的完整样本。

### 这跟普通人有什么关系

你在 Solana 上交易时感受到的「快」和「没被三明治夹」，背后就是这类基础设施在起作用。理解它，至少能帮你看懂为什么不同钱包/交易所的成交体验差异巨大。

## 为什么值得架构师关注

- **Solana 交易链路选型参考**：对做市、高频、支付类团队，该文档完整暴露了生产级交易发送的评估维度：接入协议（HTTP vs gRPC）、模式（Fast vs Sandwich Mitigation）、bundle/tip 经济学、连接保活——可直接转化为供应商评估问卷。
- **MEV 防护产品化趋势**：三明治缓解作为独立服务模式（而非协议层特性）成熟，应用架构需把「交易发送通道」视为可插拔组件而非默认 RPC。
- **多链扩张信号**：topics 含 Base、BNB Chain、Ethereum、Robinhood Chain 等，说明 Solana 交易基础设施服务商正在多链化——多链部署的 infra 供应商复用可能性上升。
- **注意甄别**：文档仓库（153★/0 fork）商业推广属性明显，技术参数需实测验证，不可仅凭文档做采购决策。

## 核心内容

- 仓库定位：BlockRazor 官方「Technical Guide and Reference」，HTML 文档站（GitHub Pages 已开启），MIT
- 覆盖内容（据仓库描述与配套示例仓库）：Solana 交易发送 over **HTTP 与 gRPC**；**Fast 与 Sandwich Mitigation 两种模式**；Base64/二进制载荷；单笔/批量交易；**bundle 与 tip**；keep-alive 连接
- 配套示例仓库 `Savageworks/solana-resp-trader-client-go`（25★，2026-11-14 创建）提供 Go 调用示例
- topics：mev-protection、orderflow-auction、searcher、jito、backrun、quant、base、bnb-chain、ethereum、robinhood-chain 等
- GitHub API 实测（11-18）：153★ / 0 fork / 创建 2026-11-15 / 最近一次推送 11-17（持续更新中）
- 7 天爆发窗口；文档型仓库，无代码审计对象，采用前需通过实测与合约/服务侧尽调

## 行动建议

1. Solana 高频/做市/支付类团队：把该文档整理成**供应商对比基线**（延迟、防夹承诺、tip 透传、SLA），与 Jito 系等现有通道做一次实测对比。
2. 应用架构上把「交易发送通道」抽象为可配置组件（多通道冗余 + 故障切换），避免绑定单一服务商的 Fast 模式。
3. 一般开发者可将其作为 Solana 交易基础设施的学习材料；不涉及该项目则了解 MEV 防护产品化趋势即可。
