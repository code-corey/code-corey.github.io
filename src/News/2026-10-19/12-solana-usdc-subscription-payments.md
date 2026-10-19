---
title: "solana-payments: USDC payments and subscriptions on Solana（solana-payments：Solana 上的 USDC 一次性与订阅支付库）"
shortTitle: "Solana USDC订阅支付"
sidebarGroup: "2026-10-19"
order: 12
date: 2026-10-19
category:
  - "每日 AI 简报"
tag:
  - "Web3 & Crypto"
description: "TypeScript 库 solana-payments：基于官方 @solana/kit 构建 USDC 一次性支付与周期订阅收款，含 SIWS 钱包登录验证。稳定币支付工程的基本件选题（⭐4，7 天窗口），订阅授权模型值得产品与工程团队读源码研究。"
---

# solana-payments: USDC payments and subscriptions on Solana（solana-payments：Solana 上的 USDC 一次性与订阅支付库）

> 📅 2026-10-19 | 🏷️ Web3 & Crypto | ⭐ 4（7天窗口，创建于 2026-10-14）| 语言：TypeScript
> 🔗 原文：https://github.com/fianto-xyz/solana-payments

## 是什么

fianto-xyz 发布的 TypeScript 支付库：在 Solana 上构建并验证 USDC 支付与订阅（payments and subscriptions），集成 SIWS 钱包登录，构建在 Solana 官方新版 SDK @solana/kit 之上。覆盖「收款请求 → 到账验证 → 周期性订阅扣款」的完整链路，属于稳定币支付工程方向的基本件。

## 🔍 小白解读

### 先说几个词

- **USDC**：美元稳定币，1 USDC 锚定 1 美元，链上美元转账的主要载体。
- **订阅支付**：像视频会员一样按月自动扣费；链上实现它的难点在于「谁授权持续扣款」。
- **SIWS（Sign-In With Solana）**：用 Solana 钱包签名完成登录验证的标准做法，相当于「用钱包当账号密码」。
- **@solana/kit**：Solana 官方新一代 TypeScript SDK，链上开发的基础工具包。

### 这篇到底在说什么

稳定币最实在的用法之一就是收付款：跨境结算、内容订阅、API 计费。Solana 官方的支付方案主要覆盖单次转账，而商业世界大量需求是「订阅」——每月自动扣。链上做订阅的本质难题是授权：用户不在场时，谁能替他发起扣款、怎么撤销？这个库把「生成 USDC 收款请求、验证到账、管理周期订阅、SIWS 登录」打包成一套 TypeScript API，构建在官方 @solana/kit 上，省去开发者逐个拼积木。星数只有 4，但「稳定币订阅」是支付赛道的关键缺口方向，代码可直接读。

### 这跟普通人有什么关系

做跨境收款或内容付费的小团队多一条低费率通道；消费者一侧的体验方向是「用钱包订阅数字服务」，不用再绑国际信用卡。

## 为什么值得架构师关注

价值在授权模型而非代码量：链上无托管订阅的授权设计（委托额度、定期签名、撤销机制）是所有稳定币订阅产品的核心难题，无论最终用不用这个库，其源码都是现成的设计参考。评估清单：授权如何授予与撤销（用户能否一键断掉月扣）、失败扣款的重试与降级策略、金额上限风控、与 SIWS 登录的会话绑定。合规提醒：稳定币收付的法务边界因地区而异，收单类业务上线前需要牌照与合规评估。成熟度：⭐4、POC 级，读代码学设计可以，直接上生产需安全审计。

## 核心内容

- 仓库：fianto-xyz/solana-payments，TypeScript，⭐4（7 天窗口，创建于 2026-10-14）
- 能力：USDC 一次性支付 + 周期订阅 + SIWS 钱包登录验证
- 技术基座：Solana 官方 @solana/kit，非第三方魔改 SDK
- 解决的问题：Solana 官方支付工具以单次转账为主，订阅类收款缺现成方案
- 定位：低星但方向关键（稳定币支付工程），源码可读性优先于热度判断

## 行动建议

做稳定币收款/订阅的产品团队：读其订阅授权模型源码作为设计参考，需要时做小规模 POC；生产采用前安排合约与代码安全审计。其余读者把「链上订阅 = 授权问题」这个框架带走即可。
