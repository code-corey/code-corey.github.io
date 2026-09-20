---
title: "ghost: Fund-Flow Pipeline for Robinhood Chain（14 亿笔转账回填 ClickHouse）"
shortTitle: "新链数据基建样本"
sidebarGroup: "2026-09-20"
order: 13
date: 2026-09-20
category:
  - "每日 AI 简报"
tag:
  - "Web3 & Crypto"
description: "针对 Robinhood Chain（chain 4663）的资金流管线：HyperSync 全量回填 ERC-20 转账，14 亿笔入 ClickHouse，提供只读 JSON API（⭐17，数据规模独特）。"
---

# ghost: Fund-Flow Pipeline for Robinhood Chain（14 亿笔转账回填 ClickHouse）

> 📅 2026-09-20 | 🏷️ Web3 & Crypto | ⭐ ⭐17（7 天窗口，2026-09-19 创建；因数据规模与问题独特性入选）| Python
> 🔗 仓库：https://github.com/0xmikadzyki/ghost

## 是什么

一个针对 Robinhood Chain（chain ID 4663）的链上资金流数据管线：通过 HyperSync 全量回填 ERC-20 Transfer 记录，把 **14 亿笔**转账装进 ClickHouse 分析型数据库，并对外提供只读 JSON API。星标数远低于常规入选线，入选理由是它回答了一个少见且重要的问题——"一条刚上线的新链，真实活动规模到底怎么量化"。

## 🔍 小白解读

### 先说几个词

- **Robinhood Chain**：券商 Robinhood 推出的 EVM 兼容新链（chain ID 4663），主打股票代币与 USDG 等合规资产上链。
- **EVM / chain ID**：以太坊风格的虚拟机与链的身份证号，同一套开发工具可以连不同链。
- **HyperSync**：环境科技（Envio）的高速链上数据索引服务，比传统 RPC 逐块抓取快几个量级。
- **ClickHouse**：列式分析数据库，十亿级记录的聚合查询也能秒级返回，是数据分析的后起之秀。
- **资金流分析（fund-flow）**：追踪钱在链上怎么流动，用来判断真实活跃度、识别异常地址。

### 这篇到底在说什么

打个比方：一条新公链开城，官方通稿里锣鼓喧天，但"到底有多少车真的在路上跑"得自己装摄像头。ghost 就是给 Robinhood Chain 装的全城车流统计：把所有 ERC-20 转账历史一把抓进 ClickHouse——14 亿笔这个数字，是这条新链真实活动量的第一手底数。一个旁证是，本期 GitHub 缓存里有一批新仓库都在围绕这条链做开发（股票代币操作台、按秒计费的算力结算、EVM SDK、RPC 部署脚本），说明生态确实在起步，而 ghost 这样的数据基建是判断"真热还是营销"的工具。

### 这跟普通人有什么关系

判断一条新链、一个新生态是真热还是营销，别看新闻标题，看链上转账底数。这类开源管线让普通用户和独立研究者也有能力做"链上验伪"。

## 为什么值得架构师关注

- **数据架构范式**："HyperSync 全量回填 + ClickHouse 列存 + 只读 API"是链上数据分析的标准样板，可直接复制到自有链上数据项目。
- **成本量级**：单机 ClickHouse 承载十亿级转账的聚合查询，比持续轮询链上 RPC 便宜几个数量级。
- **新链评估**：为评估新生态（尤其是机构背景新链）提供了可复用的尽调工具链，投资与 BD 团队都能用。
- **局限**：以 Transfer 事件为准，不含内部调用语义；星标 17，工程质量未经大规模验证。

## 核心内容

- 目标链：Robinhood Chain（chain ID 4663）。
- 数据规模：14 亿笔 ERC-20 Transfer 全量回填入 ClickHouse。
- 技术栈：HyperSync（回填）+ ClickHouse（存储分析）+ 只读 JSON API（消费层）。
- ⭐17，Python，创建于 2026-09-19（7 天窗口）。
- 生态旁证：缓存中 seat、rentnode、orbitflare-evm-sdk-rs、robinhood-rpc-install 等多个新仓库同指该链。

## 行动建议

做链上数据分析的团队可克隆研究其回填与表设计；研究团队用它校准"新链活跃度"类叙事的真实性；一般团队了解即可。
