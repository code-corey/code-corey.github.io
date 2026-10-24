---
title: "What Is Glamsterdam, and Why Did Ethereum Just Delay Its Testnet Launch?（以太坊为何推迟 Glamsterdam 测试网）"
shortTitle: "Glamsterdam 推迟"
sidebarGroup: "2026-10-24"
order: 14
date: 2026-10-23
category:
  - "每日 AI 简报"
tag:
  - "Web3 & Crypto"
description: "以太坊下一个大版本 Glamsterdam 的测试网启动推迟。本文科普 Glamsterdam 是什么、候选特性方向，以及推迟对生态时间表的影响。"
---

# What Is Glamsterdam, and Why Did Ethereum Just Delay Its Testnet Launch?（以太坊为何推迟 Glamsterdam 测试网）

> 📅 2026-10-23 | 🏷️ Web3 & Crypto | ⭐ 协议升级动态（以太坊下一代硬分叉）
> 🔗 原文：https://news.google.com/rss/articles/CBMiyAFBVV95cUxPY09IN0RGbVlCeXVyczlfS0hIcUljcEc2NzN3NkJLeXdVVjJkQldybzRMcTJ0d1hNcUdhaVRfcnQweWc1NDBucGNJWjJwMzZwOE0xVkZibWl0TTBqZ1llSGNBSEJpY0NFMkFsUWQtLXRWdHVBaFBPZFIxX1EteWNURGFPSEx6aGJ4RjdXYnk1UnZ4LU1OVGIzVGM2c0lERnlUeGlEZmQ1U3hWLVJEZ0J4cWRnNVdQOE9FZXIydE15Ml9lSDFWeDZqNQ?oc=5

## 是什么

据 24/7 Wall St. 报道，**以太坊下一个大版本升级 Glamsterdam 的测试网启动被推迟**。Glamsterdam 是继 Fusaka 之后的下一个计划硬分叉，社区讨论的重点候选特性包括 ePBS（协议内置提议者-构建者分离）与区块访问列表（Block Access Lists）等基础设施级改造。测试网推迟意味着主网时间表存在不确定性，依赖协议特性的基础设施团队需要调整规划。

## 🔍 小白解读

### 先说几个词

- **硬分叉（Hard Fork）**：区块链的全网规则升级，所有节点必须同步更新软件，否则会分道扬镳。打个比方：全国红绿灯规则改版，每辆车都必须装新系统。
- **测试网（Testnet）**：正式上线前的「彩排网络」，用无价值的代币演练升级，出问题不影响主网真金白银。
- **ePBS（协议内置提议者-构建者分离）**：把「打包交易的」和「排序交易的」两个角色在协议层正式分开，降低中心化与审查风险——相当于把「点菜」和「配菜」分成两个岗位互相制衡。
- **区块访问列表（Block Access Lists）**：提前声明一个区块会读写哪些账户数据，让验证更高效并行——像快递单提前写明「要动哪几个货架」。

### 这篇到底在说什么

以太坊的升级节奏是一环扣一环的：Fusaka 之后排队的下一个大版本就叫 Glamsterdam，社区目前在争论它该装什么「核心配置」——ePBS 和区块访问列表是呼声最高的候选，两者都指向同一个目标：让以太坊在去中心化的前提下跑得更快、更抗审查。这次的消息是：Glamsterdam 的测试网启动推迟了。测试网是以太坊升级流程的「彩排」，彩排延期通常意味着特性范围、工程复杂度或外部条件还没谈拢，主网时间表也会随之后移。报道原文分析了 Glamsterdam 的来龙去脉与推迟的可能原因（细节建议阅读原文）。对生态里的基础设施团队来说，这是重新校准路线图的时间点。

### 这跟普通人有什么关系

普通持币用户短期几乎无感——升级推迟不改变现有使用。但 Glamsterdam 里的特性（更快、更抗审查）决定了未来两年以太坊的手续费体验和安全性；如果你在质押或运行节点，则要提前准备客户端更新。

## 为什么值得架构师关注

- **基础设施路线图重排**：依赖以太坊协议特性的项目（L2、MEV 基建、质押服务、索引器）需要把 ePBS/BAL 的落地时间假设后移，避免按旧时间表开发。
- **ePBS 的商业影响**：若内置 PBS 落地，现有链下 MEV 拍卖、中继（relay）业务的格局会重构，相关团队应现在开始评估协议层替代方案。
- **BAL 与性能架构**：区块访问列表将改变节点的并行验证能力，影响 RPC 服务容量规划与延迟预期，是 L2 与节点服务商的红利点。
- **治理节奏判断**：以太坊升级的推迟属于常态而非危机，但连续延期会改变生态预期，需区分「工程审慎」与「方向动摇」两类信号。

## 核心内容

- 以太坊 Glamsterdam 升级的测试网启动推迟（24/7 Wall St.，2026-10-23）。
- Glamsterdam 定位：继 Fusaka 之后的下一个计划硬分叉。
- 社区重点候选特性：ePBS（协议内置提议者-构建者分离）、区块访问列表（Block Access Lists）等基础设施级改造。
- 推迟含义：主网时间表存在不确定性；具体原因与细节以报道原文及以太坊治理渠道为准。

## 行动建议

- 运营以太坊节点/L2/质押服务的团队：将 Glamsterdam 相关开发计划标注为「时间表未定」，采用特性开关（feature flag）式开发，避免硬依赖。
- MEV/中继方向团队：预研 ePBS 落地后的业务重构方案，评估协议层 PBS 对现有链下拍卖收入的侵蚀路径。
- 一般 Web3 架构师：关注以太坊核心开发者会议（ACDE）纪要确认新时间表，无需过度反应。
- 非以太坊生态从业者：作为公链治理节奏的观察样本，了解即可。
