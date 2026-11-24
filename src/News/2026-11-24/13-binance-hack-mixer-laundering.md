---
title: "Binance 黑客已将 2.47 亿美元转入混币器，另有 23.5 亿美元尚未洗白（Binance Hackers Route $247 Million Through Bitcoin Mixers While $2.35 Billion Sits Unlaundered）"
shortTitle: "Binance 被盗资金链上追踪"
sidebarGroup: "2026-11-24"
order: 13
date: 2026-11-23
category:
  - "每日 AI 简报"
tag:
  - "Web3 & Crypto"
description: "CoinDesk：Binance 被盗资金中 2.47 亿美元已经比特币混币器转移，另有 23.5 亿美元仍未洗白，美国政府同步展开追赃。"
---

# Binance 黑客已将 2.47 亿美元转入混币器，另有 23.5 亿美元尚未洗白（Binance Hackers Route $247 Million Through Bitcoin Mixers While $2.35 Billion Sits Unlaundered）

> 📅 2026-11-23 | 🏷️ Web3 & Crypto | ⭐ 📰 CoinDesk · Google News（相关：美政府寻求追回被盗资产）
> 🔗 原文：https://news.google.com/rss/articles/CBMiygFBVV95cUxOU09RcS1pOWM0YURLelQ0VVhwZHlnZktIRHc0SUZHaFR5cjR4ZlYydHpZaHkyaUh5amRzU1RLV2FrMm1hNHVMS1Aza0t6WEp6MHNORkUwaWtkWW45bzlOZXdvMXRuRC1GSzdnTkdJVXJrUWJyQkZGN1cxVzBoMVBQUjV4QXJyMzNoeW93TmpyUVBsX3pfR19DbXFtRHRJMGh2Z3J2SUZLZ2N2Um9oN2FqbjZFN3AxbW5jUXJyaFI3MUxwTkRxa1dfcnJn?oc=5

## 是什么

CoinDesk 对 Binance 重大安全事件的链上追踪报道：黑客已将 **2.47 亿美元**被盗资金通过比特币混币器（mixer）转移以切断溯源，但仍有高达 **23.5 亿美元**的资金停留在可控地址、尚未洗白。同期 Investment Executive 报道美国政府正寻求追回这批被盗加密资产。这是近年规模最大的链上盗窃事件追踪样本：一边是洗钱推进，一边是巨额资金原地不动，攻防的每一步都在链上公开可见。

## 🔍 小白解读

### 先说几个词

- **混币器（mixer）**：把很多人的币混在一起再分发，切断"这枚币是谁的"的链上线索。好比把各家不同图案的扑克牌倒进一个箱子洗匀再发回去。
- **链上溯源（on-chain tracing）**：区块链账本公开可查，分析公司可以追踪每笔转账路径。币不"消失"，只是越来越难认领。
- **冻结/追赃**：交易所和监管方可以把进入受监管平台的黑名单地址资产冻结，配合执法追回。链上自由转移，但变现通道受监管约束。
- **洗白（laundering）**：把偷来的币换成难以追踪的形态（过混币器、换币种、OTC 出金）才算"落袋"。

### 这篇到底在说什么

打个比方：一伙劫匪抢了银行 26 亿美元的钻石（链上资产）。他们把其中约 2.47 亿的钻石送进了"熔炉"（混币器）重新打磨，让鉴定机构认不出原样；但剩下的 23.5 亿还堆在几个仓库里没敢动——因为每颗钻石都刻着序列号（链上记录），一出手就可能被认出是赃物并被扣下。CoinDesk 这篇报道的价值在于把攻防双方的进度条同时展示：黑客在积极推进洗钱（2.47 亿已过混币器），而绝大多数赃款因变现通道被监管盯着而滞留原地；美国政府已介入追赃。这也再次验证了链上世界的悖论：账本公开让偷窃行为无所遁形，但混币器等技术也在持续给追踪制造困难。

### 这跟普通人有什么关系

如果你的资产放在交易所或链上钱包，这个案例再次说明：大平台被盗不等于用户资产必然归零——链上追踪与执法追赃机制是真实起作用的。对普通用户，混币器交互过的"脏币"可能被交易所风控标记，收币时留意来源依然重要。

## 为什么值得架构师关注

这是一份实时的链上风控教学案例：**2.35 亿美元滞留资金意味着风控窗口仍然敞开**。对接链上业务的团队应做三件事：① 将本次事件的黑客地址簇与混币器交互特征加入 KYT（Know Your Transaction）监控规则，任何来自该地址簇的入金立即触发冻结与上报流程；② 评估自身出入金系统对"脏币回流"的延迟识别能力——赃款通常会在混币器出口分散成小额、经多跳后才尝试变现，小额多源入金检测比大额黑名单匹配更关键；③ 复盘事件披露节奏：CoinDesk 类媒体持续跟踪地址簇动态，平台的风控响应速度直接决定是截获还是被动受损。

## 核心内容

- CoinDesk 追踪：被盗资金中 2.47 亿美元已通过比特币混币器转移，切断直接溯源。
- 另有 23.5 亿美元赃款仍未洗白，停留在可控链上地址，变现通道被监管监控压制。
- 美国政府已介入寻求追回被盗加密资产（Investment Executive 报道）。
- 攻防状态公开可见：洗钱推进与巨额滞留并存，链上风控窗口仍然敞开。

## 行动建议

链上业务方：立即核对本平台是否收到与该事件地址簇相关的历史入金，更新 KYT 黑名单与混币器交互告警规则；建立"混币器出口小额分散入金"的检测策略。非当事方：了解即可，可作为链上溯源与执法追赃机制的活教材。
