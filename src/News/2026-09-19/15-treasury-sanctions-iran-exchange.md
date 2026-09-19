---
title: "Treasury Sanctions Crypto Exchange Behind Iran's Bitcoin Tolls on Hormuz Ships（美财政部制裁为霍尔木兹船只收「比特币过路费」的伊朗关联交易所）"
shortTitle: "美财政部制裁伊朗交易所"
sidebarGroup: "2026-09-19"
order: 15
date: 2026-09-18
category:
  - "每日 AI 简报"
tag:
  - "Web3 & Crypto"
description: "据 Decrypt 报道，美国财政部制裁了一家为通过霍尔木兹海峡的船只收取比特币「过路费」的伊朗关联加密交易所——加密制裁从个人与混币器延伸到地缘咽喉要道的收费用链上基础设施。"
---

# Treasury Sanctions Crypto Exchange Behind Iran's Bitcoin Tolls on Hormuz Ships（美财政部制裁为霍尔木兹船只收「比特币过路费」的伊朗关联交易所）

> 📅 2026-09-18 | 🏷️ Web3 & Crypto | ⭐ Decrypt 报道
> 🔗 原文：https://news.google.com/rss/articles/CBMipgFBVV95cUxOUUd2bUJIMlpoSzRHU3oxWHV2bGxaRHQ5UDlGcHhkZGFQeWlzbkYtaU1zUmp5OEY3U2ZpMnJ4V2tpRk94QzQ1bWF0UldpanhUZmJSdVVWTkN3WUFMd0FwaEZwaXhDbWhfNzhLcmtERUdDdGFkQkpVUnhWTVluLWpUQUdKUTdUcThNamptWmhhd2p2bzBoal9pRjFJNGE5MENHR0cyUXB30gGuAUFVX3lxTE9CWkxiUXp2Y0Q0SkVsVTVNQnE5MTZoa240a0RQN2hqZ0hyS1V4VnVYUXVFNUdNZTlUVUxDUVJ5RnZ4Q2ROV3FwNXVlQl9TdU5LWVNJRTFucC13d1RWZWJPR2tTdUx1aFI4TWZWUmZWMnZ6M0FTQkhBTGZKZDBKU0hhdWs3TUhWZWNNSnlEUjNFZEJnX1RUdF9TRWVxQ3hJMjZEdi1lMlREbnVNOEQ3QQ?oc=5

## 是什么

据 Decrypt 报道，美国财政部（OFAC）制裁了一家伊朗关联的加密交易所，该交易所被指为通过霍尔木兹海峡（Hormuz）的船只运营比特币「过路费」收取业务——把链上支付嵌入了地缘政治要道的通行环节。这是加密制裁工具箱从混币器、个人钱包扩展到「地缘收费用链上基础设施」的又一实例。

## 🔍 小白解读

### 先说几个词

- **制裁（Sanctions）**：美国财政部把某个实体列入黑名单（SDN 清单），美国企业与个人不得与其交易，其美元资产可被冻结；全球使用美元体系的银行和交易所通常也会跟进封禁。
- **OFAC**：美国财政部海外资产控制办公室，制裁名单的管理者，是加密行业合规最常打交道的「清单来源」。
- **霍尔木兹海峡**：全球约两成石油运输必经的咽喉水道，位于伊朗与阿曼之间。「在这里收过路费」意味着把航道通行与链上支付绑定。
- **加密合规链路**：交易所、稳定币发行方、托管机构都内置了制裁名单筛查——地址一旦上榜，链上资金会遭遇「冻结潮」。
- **链上可追溯性**：与直觉相反，比特币每笔交易公开可查，制裁机构正是靠链上分析追踪资金流。

### 这篇到底在说什么

打个比方：某条全球最重要的运河突然有人设卡收费，而且只收比特币——这种把「链上支付」嵌入地缘政治的场景，以前更多出现在想象里，这次被美国财政部以制裁行动坐实了。据 Decrypt 报道，被制裁对象是一家伊朗关联的加密交易所，其「业务」是为通过霍尔木兹海峡的船只收取比特币过路费。制裁意味着：美国主体不得与它交易，它的地址会被各大交易所与稳定币发行方屏蔽，相关链上资金会面临连锁冻结。这件事的信号意义大于单一事件：加密基础设施正被越来越深地卷入地缘博弈，制裁的对象形态也在进化——从交易所、混币器，到今天的「航道收费用」链条。对行业来说，「这笔钱从哪来、到哪去」的链上合规审查，已经从选修课变成了生存课。

### 这跟普通人有什么关系

做跨境加密业务或使用稳定币收付款的个人与商家，收到「脏钱」可能连带账户被冻结；对地缘敏感地区的用户，链上资产的可冻绞性是现实风险。

## 为什么值得架构师关注

- **制裁筛查必须实时化**：地址黑名单（OFAC SDN 及衍生清单）持续更新，交易前筛查+交易后监控要做成准实时管道，而非每日批量对表。
- **地理围栏与业务隔离**：平台架构需支持按法域快速隔离资产与功能（分域部署、按辖区熔断），应对制裁名单的突发扩展。
- **稳定币冻结效应**：USDC/USDT 等发行方的地址冻结能力使「制裁传导」在数小时内完成，设计资金路径时要评估对手方链路的制裁暴露度。

## 核心内容

- 美国财政部制裁一家伊朗关联加密交易所（Decrypt 报道）。
- 指控行为：为通过霍尔木兹海峡的船只收取比特币「过路费」。
- 制裁效果：列入 SDN 后，美国主体禁止交易，链上地址将遭交易所与稳定币发行方屏蔽（制裁机制常识）。
- 事件反映制裁对象形态扩展：从交易所/混币器延伸至地缘要道的链上收费用基础设施。

## 行动建议

合规团队更新 OFAC SDN 清单并将相关地址纳入实时筛查库；涉跨境支付的系统复查对手方链路的制裁暴露评估流程。地缘与合规无关的团队了解即可。
