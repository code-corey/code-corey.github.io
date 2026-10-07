---
title: "Arbitrum joins Paxos-led Global Dollar Network as USDG lands on Ethereum L2（Paxos 将 USDG 稳定币带到 Arbitrum，全球美元网络扩容）"
shortTitle: "USDG稳定币登陆Arbitrum"
sidebarGroup: "2026-10-07"
order: 13
date: 2026-10-06
category:
  - "每日 AI 简报"
tag:
  - "Web3 & Crypto"
description: "CoinDesk 报道 Arbitrum 加入 Paxos 主导的 Global Dollar Network，30 亿美元规模稳定币 USDG 落地以太坊 L2，稳定币多链扩张与支付场景竞争持续升温。"
---

# Arbitrum joins Paxos-led Global Dollar Network as USDG lands on Ethereum L2（Paxos 将 USDG 稳定币带到 Arbitrum，全球美元网络扩容）

> 📅 2026-10-06 | 🏷️ Web3 & Crypto | ⭐ 📰 CoinDesk
> 🔗 原文：https://news.google.com/rss/articles/CBMizgFBVV95cUxNRnFzYTcyaU95UmJZVnBNb3lEajFlcjM5cW9QOEc0TVhXUDJzYldqMy0zQmJoZ01OZXFjbnVrb0w2QmtaVXlBcWtmc09aTTlZYk9qQ2lZWDRNX1BWSXRMOHZBZ3hVUGJJOGczVGdDY1d3QWwxcUl2cmxIek5MVnZaYWpaVUt3ZkxkT2tmUkxscVJLb0lKRHBvaE5DZHMzNHdYZkgxSENfTnhaSl9pak5RZFFuemtfemZiSkFfcmVNaDRjQkR1N09DRzk3Y25XQQ?oc=5

## 是什么

据 CoinDesk 10 月 6 日报道，Arbitrum 加入由 Paxos 主导的 Global Dollar Network（全球美元网络），稳定币 USDG 落地以太坊 L2。Yahoo Finance 同日标题称 Paxos 将 30 亿美元（$3B）规模的 USDG 带到 Arbitrum——稳定币的多链扩张与支付场景竞争持续升温。

## 🔍 小白解读

### 先说几个词

- **稳定币（USDG）**：价格锚定美元的代币，像「链上的数字美元存款凭证」，用于转账、支付和结算。
- **Paxos**：受纽约州金融服务局（NYDFS）监管的头部稳定币发行商，类比「有正规牌照的发钞机构」。
- **Arbitrum**：主流以太坊 Layer2（L2），可以理解为「以太坊的高速辅路」——把交易搬到这里处理，更快更便宜，最终结算仍回以太坊主网。
- **Global Dollar Network**：Paxos 主导的稳定币联盟网络，发行方靠联盟和多链扩张网络是当前主流打法。
- **L2（Layer2）**：区块链的二层扩容网络，主链之上、用于承载高频交易的技术层。

### 这篇到底在说什么

打个比方：USDG 这张「数字美元卡」原来只能在几条链上刷，现在 Arbitrum 这条高速辅路也接入了发卡网络。发行商 Paxos 通过吸纳 Arbitrum 加入其主导的联盟，把约 30 亿美元规模的 USDG 铺到以太坊 L2 上，让用户在低费环境下使用合规稳定币。这不是孤例：同日有数据显示 XRP Ledger 上稳定币供应量一周增长 8%、距超越 Avalanche 不足 5000 万美元，加密卡支付规模也达创纪录的 125 亿美元——说明「稳定币多链扩张 + 支付场景竞争」是当前行业的主线动作。

### 这跟普通人有什么关系

未来在更多链上使用合规稳定币支付、转账会更方便，手续费也可能更低。对做跨境收款的小商家来说，可选的合规结算通道在变多。

## 为什么值得架构师关注

稳定币发行联盟的成员结构决定了对手方与合规风险边界：接入 Paxos 这类 NYDFS 监管发行商的网络，与接入无牌照发行方，在尽调与审计要求上完全不同，选型时应把「发行方监管属地 + 联盟治理」作为硬性评估项。L2 通道接入涉及跨链消息传递、最终性确认窗口与桥接安全，成本模型要把 L2 上的 gas 波动和提款周期算进去。同时行业数据（多链供应量快速迁移、支付规模创新高）提示结算通道的流动性分布会持续变化，系统设计需支持多链、多稳定币的可插拔接入，避免绑定单一通道。

## 核心内容

- CoinDesk（10-06）：Arbitrum 加入 Paxos 主导的 Global Dollar Network，USDG 落地以太坊 L2。
- Yahoo Finance（10-06）标题：Paxos 将 30 亿美元（$3B）规模的 USDG 稳定币带到 Arbitrum。
- 行业佐证（24/7 Wall St., 10-06）：XRP Ledger 上稳定币供应量一周增长 8%，距超越 Avalanche 不足 5000 万美元。
- 支付佐证（CryptoRank/Bitcoin Magazine, 10-06）：加密卡支付规模达创纪录的 125 亿美元，稳定币采用度上升。
- 常识背景：Paxos 是受 NYDFS 监管的头部稳定币发行商；Arbitrum 是主流以太坊 Layer2；联盟/多链扩张是稳定币发行方的主流打法。

## 行动建议

做跨境支付/结算的工程团队，可评估在 L2 上接入合规稳定币结算通道的成本与对手方风险：核对发行方牌照与联盟治理条款、测算跨链与提款周期、预留多链可插拔架构。具体网络成员与接入细节，以官方公告为准。
