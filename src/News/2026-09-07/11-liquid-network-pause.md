---
title: "Liquid Network pauses after purported 'white-hat' hackers withdraw $320 million in bitcoin（Liquid Network 因疑似'白帽'提走 3.2 亿美元比特币而暂停）"
shortTitle: "Liquid 白帽事件"
sidebarGroup: "2026-09-07"
order: 11
date: 2026-09-06
category:
  - "每日 AI 简报"
tag:
  - "Web3 & Crypto"
description: "比特币侧链 Liquid Network 遭疑似'白帽'行为者提走约 3.2 亿美元比特币后暂停服务，联盟链安全模型与'白帽紧急提币'惯例再受审视（The Block）。"
---

# Liquid Network pauses after purported 'white-hat' hackers withdraw $320 million in bitcoin（Liquid Network 因疑似"白帽"提走 3.2 亿美元比特币而暂停）

> 📅 2026-09-06 | 🏷️ Web3 & Crypto（链上安全事件） | ⭐ The Block 独家报道
> 🔗 原文：https://news.google.com/rss/articles/CBMi1gFBVV95cUxNVU9EVnRoU1lOd2RlUjJOZWNQaHd2SFY3aGxxTVNzZlZqaFR4OTJaeW1uTkl1cWxlei10OEtPTjBvQnIxRHFmdWtEZ1FCU1kxLTVTakFaajNNV3VMZVdHR0EzNlZDd3h5VHB0Z0Q1MTAzRXBMWGl4OU14T0lCTVB3NVcwNVZRM0NXbzJaeVpLODJTM1FoRzlKbWtldjNlZUFXZl9oYnQ2RkVHOTdJUWRpWDQ3Ymg0bzNpVEZiS2tFMWE3SnFvMkMtRGRlcjE4S01GN29McUN3?oc=5

## 是什么

据 The Block 报道，比特币侧链 Liquid Network 在疑似"白帽"黑客提走约 3.2 亿美元（BTC）后暂停了网络运行。所谓"白帽"提币，指发现漏洞者抢在恶意攻击者之前把资产转移托管、倒逼官方修复并协商归还的行为惯例。该事件是本周链上安全的最大新闻，直接冲击了 Liquid 多年来的"联盟链更安全"叙事。

## 🔍 小白解读

### 先说几个词

- **Liquid Network**：由 Blockstream 等机构运营的比特币"侧链"——一条与主链挂钩、用于交易所间快速结算的附属网络，由一批联盟成员共同管理（公认背景常识）。
- **侧链/双向锚定**：把比特币"锁进"主链、在侧链上等额发行使用，像把人民币换成景区内部代币，出来时再换回。
- **白帽（White-hat）**：安全圈的好人黑客——发现漏洞后不偷不抢，通常把资金先转移到安全位置防止坏人下手，再与官方协商。
- **联盟链安全模型**：不靠全网矿工，而是靠十几家成员机构共同签名管钱；安全性取决于"这群人合谋或被攻破"的概率。

### 这篇到底在说什么

打个比方：Liquid 像一家由十几家银行联名保险的"贵重物品寄存处"，一直宣传"我们有多家机构共同看门，比普通金库更稳"。这次有人发现门锁有暗道——按加密圈的惯例，发现者自称"白帽"，抢先从暗道搬走了约 3.2 亿美元的比特币，放到自己看管的地方，等官方来谈。寄存处随即宣布"暂停营业"以便排查。这件事的要害在于：不管提走的人动机如何，暗道真实存在，而能走到搬钱这一步，说明这套"多机构共同看门"的机制出现了单点式的失守。事件后续（漏洞细节、归还安排、责任认定）截至报道时仍在发展中。

### 这跟普通人有什么关系

如果你通过交易所或钱包用过 Liquid 网络转比特币，可能遇到过延迟或暂停；更广泛地说，它提醒所有用户：机构背书不等于绝对安全，大额资产分散存放、关注官方公告的习惯能救命。

## 为什么值得架构师关注

- **联盟/多重签名模型的重估**：凡采用"少数机构共管密钥"设计（托管、跨链桥、联盟网络）的系统，都应复查本次暴露的攻击面类型与自身等效风险。
- **"白帽"流程的制度化**：事件凸显应急冻结、白帽协商、资金归还的流程需要预先写入运维手册，而不是事到临头临时决策。
- **故障熔断的代价**：整网暂停能止血，但服务连续性归零——架构上要权衡"紧急停机开关"的粒度（全网停 vs 单资产停）。
- **信息源纪律**：此类事件谣言极多，舆情期应以 Liquid 官方与 Blockstream 一手公告为唯一行动依据。

## 核心内容

- Liquid Network 宣布暂停，起因是疑似"白帽"行为者提走约 3.2 亿美元的比特币（The Block 报道口径）。
- "white-hat"为报道中的定性措辞，行为者身份与漏洞细节截至发稿未完全公开。
- 暂停意味着侧链上的转账与结算功能中断，影响依赖其做交易所结算的业务。
- 事件将引发对 Liquid 联盟安全模型（成员共管/锚定机制）的公开检讨。

## 行动建议

- 交易所/托管/桥类团队：立即复查自身是否有 Liquid 敞口，评估结算路径临时切换方案。
- 使用自建 multisig/联盟签名体系的安全负责人：对照本次事件复盘密钥管理、成员准入与异常提币告警。
- 普通持有人：了解即可——暂无需恐慌操作，关注官方归还与恢复公告，勿信"加倍返还"类钓鱼。
