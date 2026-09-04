---
title: "Three sites made 215,128 \"best software\" pages for AI. Perplexity cites them（三个站点批量制造了 215,128 个「最佳软件」页面，Perplexity 引用了它们）"
shortTitle: "三个站点批量制造了 215,128 个「最…"
sidebarGroup: "2026-09-04"
order: 9
date: 2026-09-02
category:
  - "每日 AI 简报"
tag:
  - "安全 & 评测"
description: "一份独立调查报告发现：三个站点批量生产了 215,128 个「best software」式页面，专门面向 AI 引擎做内容优化，而 Perplexity 的推荐结果引用了这些页面。换句话说，AI 搜索/推荐答案的「引用来源」可以被工..."
---
# Three sites made 215,128 "best software" pages for AI. Perplexity cites them（三个站点批量制造了 215,128 个「最佳软件」页面，Perplexity 引用了它们）

> 📅 2026-09-02 | 🏷️ 🛡️ 安全 & 评测 | ⭐ HN 503分/245评论
> 🔗 原文：https://trellner.com/reports/manufactured-sources-behind-ai-recommendations/

## 是什么

一份独立调查报告发现：三个站点批量生产了 215,128 个「best software」式页面，专门面向 AI 引擎做内容优化，而 Perplexity 的推荐结果引用了这些页面。换句话说，AI 搜索/推荐答案的「引用来源」可以被工业化的内容农场批量制造。HN 503 分/245 评论。

## 为什么值得架构师关注

越来越多团队用 AI 搜索做技术选型调研（「最好的 X 是什么」），这组数据证明该链路可以被系统性投毒：AI 给出的推荐可能只是 SEO-for-AI 农场的输出。对架构师的直接影响有二：①用 AI 做选型时必须溯源验证，否则评估输入本身不可信；②GEO（生成式引擎优化）正在成为新的攻击面——自家产品的「AI 口碑」同样可以被竞争对手制造或压制。

## 核心内容

- 规模：三个站点、215,128 个「best software」页面——AI 导向内容已实现工业化生产
- 影响实证：Perplexity 的推荐结果引用了上述页面（证据链见报告原文）
- 本质：AI 推荐答案的引用源可被批量伪造，RAG 类答案的可信度必须下沉到源质量
- HN 讨论（503 分/245 评论）集中于 RAG 投毒、GEO 黑产与评测失效
- 供给侧印证：同期 GitHub 热门已出现多个「SEO/GEO for AI」工具仓库，攻击门槛在快速降低

## 行动建议

①把「AI 推荐必须溯源到一手来源」写进技术选型流程；②抽查近期由 AI 搜索辅助做出的选型结论，核对其引用源质量；③若自家产品依赖线上获客，开始监测主流 AI 引擎对自家品类的推荐来源构成；④对内部 RAG 系统做一次「信源白名单」审查。
