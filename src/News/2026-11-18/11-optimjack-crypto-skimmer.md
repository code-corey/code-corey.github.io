---
title: "CNN, Zoom, Fox News Served Visitors a Crypto-Stealing Skimmer – OPTIMJACK（CNN/Zoom/Fox News 访客遭加密货币窃取脚本 OPTIMJACK 攻击）"
shortTitle: "OPTIMJACK 加密窃取事件"
sidebarGroup: "2026-11-18"
order: 11
date: 2026-11-16
category:
  - "每日 AI 简报"
tag:
  - "Web3 & Crypto"
description: "Optimizely 第三方脚本遭供应链注入，CNN、Zoom、Fox News 等 15 家知名站点访客被投放加密地址调包器+银行卡窃取器，百万级访客暴露，技术分析附完整攻击链与 IOC。"
---

# CNN, Zoom, Fox News Served Visitors a Crypto-Stealing Skimmer – OPTIMJACK（CNN/Zoom/Fox News 访客遭加密货币窃取脚本 OPTIMJACK 攻击）

> 📅 2026-11-16 | 🏷️ Web3 & Crypto | ⭐ HN 190 分 / 2 评论（技术分析文；同事件 Report URI 首发帖 664 分/263 评论，本期合并为一篇报道）
> 🔗 原文：https://amirulcyber.com/2026/11/16/optimjack-optimizely-skimmer/
> 💬 讨论：https://news.ycombinator.com/item?id=50523300

> 📌 编辑注：同一事件还有两个高相关源：Report URI 首发调查（664 分，https://blog.report-uri.com/worlds-largest-brands-infected-with-malware-via-optimizely/ ）与 BleepingComputer 跟进报道（75 分，https://www.bleepingcomputer.com/news/security/optimizely-supply-chain-attack-delivers-malware-to-cnn-fox-news-bbc-salesforce-sites/ ）。按「同一主题只选最好一篇」规则合并报道；Web3 篇选 OPTIMJACK 分析文（加密资产视角），安全影响以 Report URI 一手调查为准。

## 是什么

攻击者向 Optimizely（大型网站普遍使用的 A/B 测试/标签管理第三方服务）的 JS bundle 注入恶意代码，导致 CNN、Zoom、Fox News 等约 15 家知名站点向访客投放「加密货币地址调包器 + 银行卡窃取器」双重载荷，暴露访客量级以百万计。安全研究者发布技术复盘 OPTIMJACK，给出攻击链、载荷行为与 IOC（失陷指标）。

## 🔍 小白解读

### 先说几个词

- **供应链攻击（第三方脚本注入）**：不黑网站本身，而是污染网站引用的第三方服务（这里是被广泛接入的 Optimizely），一次中招、全网遭殃。像往自来水厂投毒，不用挨家挨户下手。
- **skimmer（卡片窃取器）**：悄悄读取你在网页上填的银行卡信息的恶意脚本。相当于在 ATM 上装的假读卡器，只是这次装在新闻网站上。
- **crypto-clipper（地址调包器）**：监听你的剪贴板，当你复制一个加密货币收款地址时，把它换成攻击者的地址。转账手一抖点发送，钱就进了别人的口袋——区块链转账不可撤销。
- **IOC（失陷指标）**：可以用来排查是否中招的「指纹」，比如恶意域名、脚本哈希、特定 URL。
- **A/B 测试服务**：给网站做实验对比（哪个按钮点击多）的工具，靠在页面里注入脚本来工作——这正是它被利用的原因。

### 这篇到底在说什么

一群大网站同时「带毒」了，但它们自己的服务器没被攻破。问题出在它们共同使用的第三方工具 Optimizely 上：攻击者想办法把恶意 JavaScript 塞进了这个工具下发的代码里。于是，当你在 CNN 看新闻、在 Zoom 页面下载客户端时，浏览器里执行的脚本中混进了两件坏事：一是盯着你的剪贴板，一旦发现你复制了加密货币钱包地址就悄悄调包成攻击者的地址；二是窃取你在网页上填写的银行卡信息。受影响站点达约 15 家知名品牌，暴露访客以百万计。安全研究者 OPTIMJACK 的复盘把攻击链、载荷和排查指纹都公开了，另一家安全公司 Report URI 最早发现了这场campaign（他们的帖子在 HN 拿到 664 分）。对 Web3 用户，这是近期最典型的「链下入口偷链上资产」案例：你的私钥没丢、钱包没被黑，但复制地址这步被劫持了。

### 这跟普通人有什么关系

如果你平时用加密货币：转账前务必逐字符核对地址（用钱包地址簿，别依赖复制粘贴）。如果你只是普通网民：在主流网站上填银行卡信息也不再有「大站=安全」的保证，接到可疑扣款要对账。

## 为什么值得架构师关注

- **第三方 tag 是最大隐形攻击面**：受影响品牌自身的 WAF/SDL 都没失守，失守的是「被信任的第三方脚本」。第三方脚本清单管理（inventory）+ 子资源完整性（SRI，对动态 tag 受限）+ CSP + 出口流量审计需要形成组合拳。
- **Web3 业务特殊暴露面**：任何含「转账地址展示/复制」的页面（交易所、支付、钱包服务）对 clipper 类载荷零容忍，前端必须内置地址完整性校验（如 EIP-681 二次确认、首尾字符强提示、剪贴板写后读校验）。
- **检测策略**：本次排查靠 IOC 与脚本行为特征（剪贴板事件监听 + DOM 修改）。企业前端监控应增加「剪贴板写入被覆盖」「第三方脚本哈希漂移」两类告警。

## 核心内容

- 攻击入口：Optimizely 分发的 JS bundle 被注入攻击者代码（「One poisoned tag layer」，分析文口径 15 家站点）
- 受影响站点示例：CNN、Zoom、Fox News（另有 BBC、Salesforce 相关站点见 BleepingComputer/Report URI 报道口径）；暴露访客量级：百万计
- 双载荷：**crypto-clipper**（剪贴板加密地址调包）+ **card skimmer**（银行卡信息窃取），波及 10+ 站点
- OPTIMJACK 分析文公开了攻击链还原、载荷行为与 IOC 清单（2026-11-16）
- HN 分布：Report URI 首发 664 分/263 评论；OPTIMJACK 分析文 190 分；BleepingComputer 跟进 75 分
- 事件性质：典型的「信任链上游失陷、下游全量暴露」的 web 供应链攻击，链上资产损失通过链下调包实现

## 行动建议

1. 立即排查自家站点是否接入 Optimizely 或同源 tag：对照 OPTIMJACK 公开的 IOC 与 Report URI 指引核查脚本完整性。
2. Web3/支付类前端本周内上线**地址防调包校验**（复制后回读比对、首尾 6 位强提示、粘贴来源检测）。
3. 建立第三方脚本台账（谁引入、什么版本、能否下线），并把「第三方脚本行为变更告警」纳入前端监控——把这次事件的成本变成自己的检测能力。
