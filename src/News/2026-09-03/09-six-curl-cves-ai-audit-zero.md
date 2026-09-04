---
title: "Six curl CVEs after OpenAI and Anthropic came back with zero（OpenAI 与 Anthropic 审计\"交零\"后，Aisle 找到 6 个 curl CVE）"
shortTitle: "OpenAI 与 Anthropic 审计…"
sidebarGroup: "2026-09-03"
order: 9
date: 2026-09-02
category:
  - "每日 AI 简报"
tag:
  - "安全 & 评测"
description: "安全公司 Aisle 发布博客称：其团队在 OpenAI 与 Anthropic 对 curl 的安全审计均\"交零\"（未发现漏洞）之后，独立发现了 6 个 curl CVE。这一对照直接把\"AI 大模型能否胜任安全研究\"从营销叙事拉回..."
---
# Six curl CVEs after OpenAI and Anthropic came back with zero（OpenAI 与 Anthropic 审计"交零"后，Aisle 找到 6 个 curl CVE）

> 📅 2026-09-02 | 🏷️ 🛡️ 安全 & 评测 | ⭐ HN 151 分 / 54 评论
> 🔗 原文：https://aisle.com/blog/aisle-discovered-six-curl-cves-after-openai-and-anthropic-found-zero
> 💬 HN 讨论：https://news.ycombinator.com/item?id=49536114

## 是什么

安全公司 Aisle 发布博客称：其团队在 OpenAI 与 Anthropic 对 curl 的安全审计均"交零"（未发现漏洞）之后，**独立发现了 6 个 curl CVE**。这一对照直接把"AI 大模型能否胜任安全研究"从营销叙事拉回到可检验的实证问题，HN 上引发 151 分 / 54 条评论的讨论。

## 为什么值得架构师关注

"用 AI 找洞"正在成为安全预算的正式科目，而这条新闻提供了一个罕见的**对照组样本**：同一个被审计目标（curl——全球部署量最大的基础库之一），不同团队得出的结果从 0 到 6 不等。它暴露的是评测方法论问题——**没有统一的审计范围声明、时间预算与验证标准，"AI 发现了 X 个漏洞"这类结论不可比、不可信**。任何准备把 LLM 安全审计写进流程或合同的团队，都需要先回答"零分"到底意味着能力问题还是范围问题。

## 核心内容

- **结果悬殊的对照**：同一目标上，Aisle 报告 6 个 CVE，而 OpenAI 与 Anthropic 的审计结果均为零——三方结论的巨大差异构成本文的核心论据。
- **质疑的对象是"AI 审计交零"的解读方式**：零结果可以被解读为"代码很干净"，也可以是审计范围/方法/投入的差异——作者的立场显然是后者不可轻信。
- **curl 是理想试金石**：作为基础设施级开源项目，其审计结论天然可公开验证，CVE 编号就是硬通货。
- **HN 讨论聚焦评测有效性**：151 分 / 54 评论，社区核心分歧在于如何设计公平的 AI vs 人类 vs 不同 AI 的安全审计对照实验。

## 行动建议

- **要检查自己系统吗**：是的——立即审计任何"由 AI 完成的安全扫描/代码审计"报告的采信流程：AI 报零风险 ≠ 无风险，关键组件仍需人工或第二工具交叉验证。
- 采购或内部使用 AI 安全审计能力时，把"审计范围声明 + 发现可验证性（CVE/POC）+ 对照基线"写进评估标准。
- 与今日 reverify 一文对照阅读：两者共同指向同一原则——安全场景中 AI 结论必须经确定性手段裁决。
