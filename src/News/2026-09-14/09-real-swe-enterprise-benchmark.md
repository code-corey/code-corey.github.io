---
title: "Real-SWE: Benchmarking AI models on private, real-world, enterprise codebases（真实企业代码库基准）"
shortTitle: "Real-SWE 企业基准"
sidebarGroup: "2026-09-14"
order: 9
date: 2026-09-12
category:
  - "每日 AI 简报"
tag:
  - "安全 & 评测"
description: "Specific Labs 发布 Real-SWE 基准：任务全部来自真实公司授权的私有生产代码库，评测「模型+工具链」组合，头部组合解决率仅 38.8%。HN 268分/147评论。"
---

# Real-SWE: Benchmarking AI models on private, real-world, enterprise codebases（用真实企业私有代码库给编码 AI 排名）

> 📅 2026-09-12 | 🏷️ 安全 & 评测 | ⭐ HN 268分/147评论
> 🔗 原文：https://withspecific.com/benchmarks/real-swe

## 是什么

Specific Labs 发布的编码智能体基准 Real-SWE：任务全部来自从真实公司授权的私有生产代码库，评测「模型+原生工具链（harness）」组合在企业级真实任务上的解决率，而非公开题库刷分。首期榜单覆盖 8 个前沿组合，最高的解决率只有 38.8%。

## 🔍 小白解读

### 先说几个词

- **基准（benchmark）**：给 AI 出统一考卷排名次。现有考卷大多题目公开——模型可能背过答案，成绩有水分。
- **解决率 / pass@1**：一次尝试就做对的比例；本基准对每个任务独立跑 8 次取平均，附 95% 置信区间。
- **harness（工具链/执行壳）**：套在模型外面的工程框架（Claude Code、Codex CLI、Gemini CLI 等）。同一个车手开不同调校的车，成绩差很多。
- **私有代码库**：从没公开到互联网上的公司内部代码，模型训练时绝无可能见过。

### 这篇到底在说什么

现在的编码 AI 榜单大多用公开题库，题目本身可能就在训练数据里，高分有注水嫌疑。Real-SWE 的做法：从真实公司拿到私有代码库的授权，把工程师真实在做的任务——修对账单计费、算税、跨服务迁移客户数据——原样出题。这些代码和答案公网上根本不存在，模型必须真正理解每家公司的私有业务规则、外部服务和代码习惯才能做对。首期排名：Fable 5.1 + Claude Code 以 38.8% 居首，GPT-6 Astra + Codex CLI 33.8%，Gemini 3.8 Flash + Gemini CLI 31.2%，GLM 5.3 挂在 Claude Code 上以 28.8% 排第四，最低的组合只有 16.2%。两个关键结论：最强组合也只做成约四成任务；「模型+工具链」的组合方式对成绩影响巨大——选型不能只看模型本体。

### 这跟普通人有什么关系

企业引入 AI 编程助手前，这类私有代码库基准比公开榜单更接近「买回来到底能顶多少人天」的真实答案；榜单也提示：换个执行壳，同一模型的产出可能差出 1.5 倍以上。

## 为什么值得架构师关注

- 选型证据链升级：38.8% 的头部解决率为「AI 编程助手 ROI 测算」提供了保守锚点——公开榜单 70%+ 的数字在企业私有库上不可复用。
- 选型单元是 model×harness 而非 model：GLM 5.3 挂在 Claude Code 上（28.8%）反超多个用自家壳的组合，「工程化包装」的价值首次被量化。
- 方法论值得内部效仿：用自己公司的真实 issue 搭内部基准，比追外部榜单更能指导采购决策。

## 核心内容

- 任务来源：真实公司授权的私有生产代码库；任务三特征——私有（公网无答案）、有业务后果（计费、算税、客户迁移）、公司特有复杂度（内部规范与代码习惯）。
- 榜单（pass@1，8 次运行平均，95% CI）：1) Fable 5.1 + Claude Code 38.8%；2) GPT-6 Astra + Codex CLI 33.8%；3) Gemini 3.8 Flash + Gemini CLI 31.2%；4) GLM 5.3 + Claude Code 28.8%；=5) Grok 4.6 + Grok Build、Muse Spark 1.3 + Muse Code 各 23.8%；7) Kimi K3 + Kimi Code 18.8%；8) GPT-5.6 Sol + Codex CLI 16.2%。
- 方法要点：使用各家原生 harness，评测「模型+工具链组合」而非裸模型；头部组合解决率不足四成。
- 作者：Snagnik Das、Siddhant Paliwal、Janak Sunil（Specific Labs，2026 年 9 月发布）。

## 行动建议

以 38.8% 作为企业场景 PoC 验收的合理预期上限；评测时优先覆盖「模型+现有工作流工具链」组合；有条件的话仿照其方法论，用自有私有库出 10–20 个真实任务做采购前评测。
