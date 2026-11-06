---
title: "PolinRider Returns: Hijacked npm Packages Use Ethereum Blockchain to Conceal Malware Infrastructure（PolinRider 回归：被劫持 npm 包用以太坊区块链隐匿恶意基础设施）"
shortTitle: "npm 攻击用以太坊藏毒"
sidebarGroup: "2026-11-06"
order: 14
date: 2026-11-05
category:
  - "每日 AI 简报"
tag:
  - "Web3 & Crypto"
description: "安全厂商 OX Security 报告：PolinRider 供应链攻击活动回归，被劫持的 npm 包转而使用以太坊区块链藏匿恶意软件的基础设施配置——区块链正在成为攻击者对抗封禁的隐匿层。"
---

# PolinRider Returns: Hijacked npm Packages Use Ethereum Blockchain to Conceal Malware Infrastructure（PolinRider 回归：被劫持 npm 包用以太坊区块链隐匿恶意基础设施）

> 📅 2026-11-05 | 🏷️ Web3 & Crypto | ⭐ 安全厂商一手报告（OX Security，11-05）
> 🔗 原文：https://news.google.com/rss/articles/CBMixwFBVV95cUxOamx3V0NyZG5udUZjdUZmNjBVU010QWVWVFNxdDFuR0tPXzl5d1lhQS0tQ21Pb0dGMVBCRkFBWlU3MjFtc3RFeHU1WUNMQzBua2JVYnkxcWpfMml4QVZ2UWhzR2d3ZVVLMDd6TzIzWG9aZEpTM25nMGNHR0ExZnRqQzRndEx4M2R2TlZnM2IzWUZHMEhMMGFNWHVXQ3ZsNFRPSlM1cktYTG5hTHBWQmpxcDd0aVpkb2NsNVd6UEtLLWtiVkRyR1U0?oc=5

## 是什么
安全厂商 OX Security 报告，此前被披露的 **PolinRider** npm 供应链攻击活动卷土重来：攻击者劫持 npm 包后，这次改用以太坊区块链来**藏匿恶意软件的指挥控制（C2）基础设施线索**，使防守方难以通过传统手段封禁和溯源。

## 🔍 小白解读

### 先说几个词
- **供应链攻击（Supply Chain Attack）**：不黑你的系统，而是污染你依赖的开源组件——你装包的时候把「毒」一起请了进来。
- **npm 包劫持**：npm 是 JavaScript 的包仓库；劫持指攻击者通过接管维护者账号或发布仿冒包，把恶意代码塞进开发者会安装的软件包里。
- **C2（Command and Control）**：恶意软件的「指挥部地址」，中毒程序靠它接收指令、回传数据。
- **区块链隐匿**：把 C2 配置写在以太坊这类公链上——链上数据公开、永久、没人能「删除」，安全厂商封域名、下架服务器的老办法全部失效。
- **对抗性演进（Adversarial Evolution）**：攻击者针对防守手段升级而改变手法，像病毒对抗抗生素产生的耐药性。

### 这篇到底在说什么
打个比方：以前骗子在小广告上留联系地址，警察一封一个准；现在骗子把地址写在了一本全人类共同保管、永远不许撕页的公共账本上——谁也没法删，所有人都能看，但警方只能眼睁睁看着恶意程序照着账本找到指挥部。OX Security 发现 PolinRider 正在这样做：被劫持的 npm 包运行后从以太坊链上读取配置信息，据此连接真正的恶意服务器。这标志着供应链攻击进入了「链上隐匿」阶段——区块链的不可篡改性从安全保障变成了攻击资源的「免费高可用基础设施」。

### 这跟普通人有什么关系
如果你是开发者，「npm install」可能就把这种包拉进了项目；如果你用某些加密相关的小工具，风险更高。对普通用户，这条新闻的启示是：开源生态的信任需要层层验证，不能「官方仓库=绝对安全」。

## 为什么值得架构师关注
三个层面的直接输入：**依赖治理**——npm 依赖必须有版本锁定、lockfile 审计与 SCA（软件成分分析）扫描，CI 流程禁止任意 post-install 脚本；**检测规则**——传统的「封 IP/域名」式响应对此类攻击失效，检测需覆盖「进程读取链上 RPC 数据」这一新型指标；**威胁模型**——区块链作为抗审查基础设施被攻击者武器化，意味着任何允许代码访问公链数据的环境（含 Web3 应用、智能体工具链）都要重新评估出站策略。PolinRider 的手法演进路径值得纳入内部红队演练场景。

## 核心内容
- OX Security 报告 PolinRider 活动回归：被劫持 npm 包再度投放恶意代码。
- 新手法：用以太坊区块链藏匿 C2 基础设施配置，规避传统封禁与溯源。
- 区块链「公开、永久、抗删除」的特性被攻击者反向利用为高可用配置分发渠道。
- 具体技术细节与 IOC（失陷指标）以 OX Security 原始报告为准。

## 行动建议
所有维护 JavaScript/Node.js 项目的团队：立即审计 lockfile 与依赖来源，启用 SCA 扫描与 post-install 脚本审查；安全团队应把「链上数据读取行为」纳入出站检测规则；持续跟踪 OX Security 后续披露的 IOC 清单并比对自身环境。
