---
title: "Cronos Erased Two Hours of Transactions to Reverse $111 Million DeFi Exploit（Cronos 抹掉两小时交易，逆转 1.11 亿美元 DeFi 攻击损失）"
shortTitle: "Cronos 回滚2小时交易"
sidebarGroup: "2026-09-09"
order: 14
date: 2026-09-08
category:
  - "每日 AI 简报"
tag:
  - "Web3 & Crypto"
description: "Decrypt：Cronos 链为追回 1.11 亿美元 DeFi 攻击损失，抹除两小时链上交易——'不可篡改'承诺遭遇现实检验。"
---

# Cronos Erased Two Hours of Transactions to Reverse $111 Million DeFi Exploit（Cronos 抹掉两小时交易，逆转 1.11 亿美元 DeFi 攻击损失）

> 📅 2026-09-08 | 🏷️ Web3 & Crypto | ⭐ Decrypt 报道
> 🔗 原文：https://news.google.com/rss/articles/CBMigAFBVV95cUxOS0hUU1BZVVhURUdpZlZfRmJJSTBPaTFzNXN4bjRNQmJXbVVvTW5WdmhEaEd0UHRHcTBCM21PQzVJUHVxUHVVcTdmTGpKczRxNWprSmhqeDFNZWtBdER1NzhrSUVBbEFBVmhBaXhBMTlwOVRQeXFYblhTeXVCNVVnS9IBiAFBVV95cUxQZ05IZGRDMzVxVGRnWDNZX2tIRlp6ekxjQ01SWE1IVTljU3Z1Tkx0bl9aRzZCdDlpc3dHb1V3eFFlX2s0SEFlbzVxajB3LWFZZF8xcS1aVGVXUng1eVlWVEhySWVyVm55WWp6UzY1YmlkRldUWWxyeVdDdGJtMnpLX21heTNiNGQ1?oc=5

## 是什么

据 Decrypt 报道，Cronos 链（Crypto.com 生态的公链）遭遇 1.11 亿美元的 DeFi 攻击后，选择了最具争议的处置方式：**抹掉两小时的链上交易**，把账本回滚到攻击发生之前，从而逆转损失。"代码即法律""链上不可篡改"这两个行业基石承诺，在这一刻被现实重新定价。

## 🔍 小白解读

### 先说几个词

- **Cronos**：Crypto.com（大型加密交易平台）生态的公链，上面跑着各类 DeFi 应用。
- **DeFi 攻击（Exploit）**：利用智能合约或协议设计的漏洞把钱转走——不是偷钥匙，而是"利用规则本身的漏洞"。
- **回滚/抹除交易（Reorg/Rollback）**：把链的账本"倒带"到某个历史时刻，之后发生的交易一律作废——技术上意味着网络参与者协调一致地重组了账本。
- **不可篡改性（Immutability）**：区块链的核心卖点——账本一旦写下就改不了。抹除交易恰恰证明：在部分链上，"改不了"是有前提条件的。
- **社会共识（Social Consensus）**：技术之外，链的最终裁决权其实在"多数参与者同意什么"——回滚能成功，说明主要参与者同意了。

### 这篇到底在说什么

区块链行业最响亮的广告词是"不可篡改"：账本写上去就改不了，谁也做不了弊。但 Cronos 这次给大家上了一堂昂贵的现实课——1.11 亿美元被攻击者利用 DeFi 漏洞转走后，这条链选择了"倒带"：把两小时的交易全部抹掉，账本回到攻击前，攻击者的"收获"凭空消失。打个比方：一局扑克打完了，庄家说"这局不算，重来"——输家当然欢呼，但所有人从此都会问一个问题："下次'不算'的标准是谁定的？"从技术上看，能完成两小时级别的抹除，说明这条链的网络结构允许参与者协调重组账本；从治理上看，这开创了"大额损失可以触发回滚"的先例。支持者说这是止损的务实之举，批评者说这动摇了区块链存在的意义——真相在两者之间：**每条链的"不可篡改"成色不同，选链就是选治理结构**。

### 这跟普通人有什么关系

在这条链上有资产、做应用的人，需要重新理解"最终性"的含义——你以为已成交的交易，理论上可能被抹掉。对更广泛的用户，这是挑选公链/平台时的新判断维度：出了事，这条链是"认赔"还是"倒带"？

## 为什么值得架构师关注

- **链选型新维度：回滚先例**：评估公链/侧链/消费级链时，除了 TPS 与费用，必须增加"治理集中度与回滚历史"——Cronos 先例之后，这是尽调必查项。
- **应用层的最终性设计**：依赖链上确认做业务决策（放款、发货、结算）的系统，应按所选链的最坏情况设计确认深度与对冲逻辑，"确认即不可逆"不再是无条件成立。
- **风险偏好即产品定位**：高监管行业倾向"能纠错的链"（回滚=保护用户），原教旨 DeFi 倾向"绝不回滚"——给业务选链本质是在选争议裁决机制。
- **应急剧本补充**：与 Liquid 事件（本文 12 篇）对照：一条链"熔断停机"，一条链"倒带回滚"——资产类系统的事件预案应同时覆盖这两种响应模式。

## 核心内容

- Decrypt（2026-09-08）：Cronos 链遭遇 1.11 亿美元 DeFi 攻击（exploit）。
- 处置方式：抹除两小时的链上交易，将账本回滚至攻击前状态，逆转损失。
- 行业含义：证明部分公链在重大事件下具备（且愿意行使）协调重组账本的能力，"不可篡改"的成色因链而异。
- 对照样本：同周 Liquid Network 事件选择"暂停交易"处置——两条链、两种哲学，构成链上应急治理的对照实验。

## 行动建议

- 做链上应用的团队：重审所选链的治理结构与回滚历史，把"交易被回滚"纳入故障模型，设计相应的业务对冲（如确认深度加保险期）。
- 金融机构：若评估公链结算场景，Cronos 先例应写进尽调问卷——"重大损失时链的处置机制是什么"。
- 一般读者：了解即可——记住：不同链的"不可篡改"不是同一种承诺。
