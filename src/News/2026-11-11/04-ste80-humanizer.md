---
title: "Dodaios/ste80-humanizer: de-AI your agent's writing（给 AI 文本去味的 Agent Skill）"
shortTitle: "STE80文本去AI味"
sidebarGroup: "2026-11-11"
order: 4
date: 2026-11-11
category:
  - "每日 AI 简报"
tag:
  - "值得研究的仓库"
description: "基于 Karpathy 分享的 ASD-STE100 简明技术英语方法，把 AI 生成文本重写去味的 Agent Skill，两天 305 星。"
---

# Dodaios/ste80-humanizer: de-AI your agent's writing（给 AI 文本去味的 Agent Skill）

> 📅 2026-11-11 | 🏷️ 值得研究的仓库 | ⭐ 305（7 天窗口）+ HN 105 分
> 🔗 原文：https://github.com/Dodaios/ste80-humanizer
> 💬 HN 讨论：https://news.ycombinator.com/item?id=50429144

## 是什么

ste80-humanizer 是一个 Python 编写的 Agent Skill：把 AI 生成的文本去掉典型「AI 味」，改写成向 ASD-STE100（简明技术英语规范）靠拢 80% 的风格——这正是 Andrej Karpathy 公开分享过的去 AI 味方法。仓库 2026-11-09 创建，两天收获 305 星，同时以 Show HN 登上 HN（105 分）。

## 🔍 小白解读

### 先说几个词

- **Agent Skill**：给 AI 助手装的「技能包」，一段规范加流程，让它在特定任务上按固定章法干活。
- **AI 味（AI tells）**：AI 生成文本的典型痕迹——华丽空洞的形容词、排比句、万能套话，一眼就能看出「这是 AI 写的」。
- **ASD-STE100**：航空航天业的「简明技术英语」规范：用词短、句子短、一句一个意思，是国际上最成熟的受控语言标准之一。
- **Andrej Karpathy**：前 Tesla AI 总监、OpenAI 创始成员，他的技术分享在开发者社区有很高关注度。

### 这篇到底在说什么

打个比方：AI 写文章像个刚学完演讲课的销售——满嘴「赋能」「卓越」「至关重要」，听着热闹但没有信息量。Karpathy 分享过一个反直觉的药方：别让 AI「写得更有文采」，而是让它向航空业的简明技术英语（ASD-STE100）靠拢——短句、实词、砍掉修饰，AI 味自然消失。这个仓库把这个方法做成了开箱即用的 Agent Skill：装上之后，你的 AI 助手输出的文档、报告、README 会被自动重写成简洁的技术文体。两天 305 星的速度说明「AI 文本一眼假」已经是被广泛吐槽的日常痛点。

### 这跟普通人有什么关系

如果你日常让 AI 写周报、文档、邮件，这个技能包能让输出立刻变得克制可信，不再让同事一眼识破「AI 味」；对内容团队来说，这也是低成本提升 AI 生成内容质量的方法。

## 为什么值得架构师关注

- **输出质量管线**：把「去 AI 味」固化为 Agent 管线中的确定性后处理步骤（受控语言规则），比 prompt 里写「自然一点」可靠得多——这是把文风问题从玄学变成规范工程的思路。
- **受控语言的启发**：ASD-STE100 的受控词表思路可迁移到企业知识库、API 文档生成场景，降低下游解析与翻译成本。
- **轻量可集成**：Python 实现、Skill 形态，接入现有 Agent 工作流的成本接近于零，适合先在内部文档链路灰度。
- **边界认知**：80% 靠拢的设定说明它刻意保留可读性而非机械合规，评估时重点看长文场景的一致性。

## 核心内容

- 仓库：Dodaios/ste80-humanizer，语言 Python，2026-11-09 创建，两天 305 星。
- 功能：移除 AI 生成文本的典型痕迹（AI tells），并重写到 ASD-STE100 简明技术英语 80% 的程度。
- 方法来源：Andrej Karpathy 公开分享的去 AI 味方法（向受控技术英语靠拢）。
- 交付形态：可直接挂载的 Agent Skill，另有 Show HN 讨论（105 分/39 评论）。
- 适用场景：技术文档、README、报告等以信息传递为主的英文文本。

## 行动建议

文档密集型团队值得一试：把该 Skill 挂到内部文档生成链路上，抽样对比处理前后的可读性与「AI 味」主观评分；注意它面向英文文本（ASD-STE100 为英语规范），中文场景需自行适配规则，评估后再决定是否固化进 Agent 标准配置。
