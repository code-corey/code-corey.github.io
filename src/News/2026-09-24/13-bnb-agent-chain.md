---
title: "BnbAgentChainL2/bnb-agent-chain：一条为 Agent 而生的链（BNB 上的链上智能体实验）"
shortTitle: "BNB Agent Chain 实验"
sidebarGroup: "2026-09-24"
order: 13
date: 2026-09-22
category:
  - "每日 AI 简报"
tag:
  - "Web3 & Crypto"
description: "BNB Smart Chain 上的「Agent 原生链」实验：创世只带系统合约与三件中立工具，其余代币、池子、市场全部由 Agent 自行部署发现，链上智能体经济的极端设计样本，尚处预启动阶段。"
---

# BnbAgentChainL2/bnb-agent-chain: A chain for agents, on BNB Smart Chain（一条为 Agent 而生的链）

> 📅 2026-09-22 | 🏷️ Web3 & Crypto | ⭐ ⭐50（7天·低星独特项）
> 🔗 原文：https://github.com/BnbAgentChainL2/bnb-agent-chain

## 是什么

GitHub 仓库 BnbAgentChainL2/bnb-agent-chain（JavaScript，stars 50，创建于 2026-09-22）提出了一个激进的实验：在 BNB Smart Chain 上造一条「为 Agent 而生」的链。官方描述为：「A chain for agents, on BNB Smart Chain. Genesis carries three system contracts and three neutral tools — Multicall3, a CREATE2 deployer and Wrapped BAC. Every token, pool and market beyond that is deployed by an agent. Agents never sleep, so they find each other's contracts in seconds. Pre-launch: nothing is deployed.」

## 🔍 小白解读

### 先说几个词

- **创世块**：一条区块链的第 0 块，记录链诞生时的初始状态。好比新小区交房时的毛坯状态。
- **系统合约**：创世时就内置在链上的基础智能合约，是所有后续活动的地基。
- **Multicall3**：一个被广泛使用的「中立工具」合约，让用户把多个合约调用打包成一笔交易执行，各链地址统一。
- **CREATE2**：一种智能合约部署方式，可以提前算出合约将来的地址——Agent 之间可以据此「预告」自己要部署的合约位置。
- **预启动（Pre-launch）**：官方明确说明尚未真正上线，什么都没部署。

### 这篇到底在说什么

打个比方：一般的新链像一家开好店铺、招好商场的购物中心，项目方把代币、交易池、市场都准备好了才开门。这条实验链反其道而行——「毛坯交房」，创世时只给三件中立工具（Multicall3、CREATE2 部署器、Wrapped BAC），除此之外的每一个代币、池子、市场，都必须由 AI Agent 自己部署、自己发现。官方的说法很有画面感：「Agent 永不睡觉，所以它们几秒内就能找到彼此的合约。」这是把链上经济活动的「发起权」完全交给智能体的极端设计：人类不预设任何金融结构，看 Agent 生态能长出什么。它本质上是 Web3 与 AI 交叉的一次思想实验，值得关注，但请记住——项目明确标注 Pre-launch，什么都没部署，本文只是观察记录，不是参与推荐。

### 这跟普通人有什么关系

短期没有直接关系——这是预启动的实验项目。但它预示的方向值得留意：未来的链上世界可能大量活动由 Agent 之间自主发生，这会改变「链上热闹」的含义，也带来全新的风险形态。

## 为什么值得架构师关注

第一，中立基础设施作为 Agent 互发现的「公共坐标」：Multicall3 的全链统一地址、CREATE2 的确定性地址计算，事实上构成了 Agent 可依赖的寻址协议——设计多链 Agent 系统时应优先复用这类中立工具而非私有方案。第二，「创世最小化」是值得借鉴的架构美学：平台只提供不可变的中立原语，把组合自由留给生态，与 Unix 哲学同构。第三，风险面：无人审核的 Agent 部署意味着垃圾合约、钓鱼合约、经济攻击会在秒级出现，这类链的安全模型必须假设「合约即不可信输入」，索引器与浏览器类基础设施需要全新的合约信誉层。

## 核心内容

- 创世只内置系统合约与三件中立工具：Multicall3、CREATE2 deployer、Wrapped BAC。
- 其余一切代币、池子、市场均由 Agent 自行部署与发现，官方称 Agent「几秒内」即可互相找到合约。
- 仓库 stars 50，低于本栏目常规 100 星门槛，因「Agent 原生链的极端设计」入选观察项。
- 官方明确标注 Pre-launch、nothing is deployed——不存在任何可参与的已部署内容。
- 设计隐含的安全与合规隐忧：无审核的 Agent 部署 = 垃圾合约与攻击面的失控风险。

## 行动建议

- Agent/基础设施架构师：研究 Multicall3 与 CREATE2 作为跨链「中立寻址层」的设计，评估在自己系统中的复用。
- 关注链上安全者：跟踪此类 Agent 原生链的合约信誉与垃圾合约治理思路。
- 普通读者与投资者：了解即可——项目处于 Pre-launch，无任何已部署内容，勿轻信任何以该项目为名的代币或活动。
