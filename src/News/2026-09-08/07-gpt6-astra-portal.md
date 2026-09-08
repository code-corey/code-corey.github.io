---
title: "OpenAI GPT-6 Astra Autonomously Completes Portal in 24 Hours for $571 in Tokens（GPT-6 Astra 24 小时自主通关《Portal》，token 成本仅 571 美元）"
shortTitle: "GPT-6 Astra 通关 Portal"
sidebarGroup: "2026-09-08"
order: 7
date: 2026-09-07
category:
  - "每日 AI 简报"
tag:
  - "模型发布 & 行业动态"
description: "Tom's Hardware 报道 GPT-6 Astra 24 小时自主通关《Portal》仅花 571 美元 token，黄仁勋称其让 AGI 更近一步。"
---

# OpenAI's GPT-6 Astra Model Autonomously Completes Portal in 24 Hours — Feat Cost Just $571 in Tokens（GPT-6 Astra 24 小时自主通关《Portal》，成本仅 571 美元 token）

> 📅 2026-09-07 | 🏷️ 模型发布 & 行业动态 | ⭐ Tom's Hardware 报道 + HN 相关讨论 240 分 / 189 评论
> 🔗 原文：https://news.google.com/rss/articles/CBMi-gFBVV95cUxPZHp0YWJlbTRTUmVFaHZ3MXJTdzkybG5RODExMEFRMW92TC1KLWM4bzB5ZlBuLWIwdkUxUkhra21oaE8yWXVvUTRoQWUxTEdoVmJnZzJJeVAyVTl2UVNDUGRJQWFtanhGZTViejd0NGF0NWVYRTNRRC1UQXRtLWZpaEpRdDdtd0FkR29Id1FDSDc5VmVzMWRuZEZsaS05X2pYV2duc21BLThrSGRSSlQ5UHN3TWdULUdJd3FjX3hqNmg3clJOTUZSNVRBdG9uQ3FsNHdKdThBU0JOcUxqSjduNWNYNWFRRl9tT2hLcHlWelhmLU9EVkcwMmtR?oc=5

## 是什么

据 Tom's Hardware 报道，OpenAI 的新模型 GPT-6 Astra 在 24 小时内自主通关了经典解谜游戏《Portal》，整个过程的 token 花费仅 571 美元。同期英伟达 CEO 黄仁勋公开表示 GPT-6 Astra"让 AGI 更近了一步"，OpenAI 首席科学家则罕见地呼吁对 AI 发展节奏保持"极度谨慎"。

## 🔍 小白解读

### 先说几个词

- **GPT-6 Astra**：OpenAI 的新一代旗舰模型。Astra（拉丁语"星辰"）这代被广泛讨论的点不是考试分数，而是"长时间自己干活"的能力。
- **长时程自主（Long-horizon Autonomy）**：不是回答一个问题，而是连续几个小时不打断地自主执行一个多步骤任务，中途自己试错、自己调整。类比：不再是"问答机"，而是"交钥匙就开工的员工"。
- **《Portal》**：一款要求连续推理"传送门空间谜题"的经典游戏，通关需要规划、试错与物理直觉，常用作 AI 自主能力的"铁人三项"。
- **Token 成本**：模型读和写的文字都以 token 计费。571 美元跑完 24 小时任务，相当于给这个"AI 员工"发了一天的日结工资。

### 这篇到底在说什么

AI 会打游戏不新鲜，新鲜的是两件事的组合：一是"自主"——没有人类在旁边一步步喂指令，模型自己在 24 小时里解完《Portal》一整款游戏；二是"成本可查"——571 美元的 token 账单第一次把长时程自主任务的价格标签亮了出来。打个比方，以前的 AI 像按分钟计费的临时工，干五分钟就要人来指导下；这次相当于外包公司派了个"员工"独立承包了一个为期一天的项目，还附上了工时账单。同一天周边信息也很密集：黄仁勋为它背书"离 AGI 更近"，OpenAI 发布了题为《An Alien Mind》的官方文章，HN 上"GPT-6 Astra 操作机械臂"的讨论拿到 240 分，而 OpenAI 首席科学家对内对外都在提示"labs 可能需要放慢速度"。欢呼与警告同框，说明这次展示的能力跨过了让从业者不安的某条线。

### 这跟普通人有什么关系

长时程自主 + 成本数据意味着"AI 承包一个完整任务"开始有明确的报价逻辑。将来你买的可能不再是"AI 问答次数"，而是"AI 完成的项目"：修一个系统、跑通一个流程、通关一个复杂任务。对打工人来说，"任务外包给 AI"的计价时代正在开门；对依赖 OpenAI 服务的企业，首席科学家的谨慎表态和监管动向都值得纳入供应商风险评估。

## 为什么值得架构师关注

- **成本基准数据点**：571 美元 / 24 小时长任务是目前罕见公开的自主 Agent 任务级成本样本，可直接用于内部 Agent 项目的预算模型与"人工时薪 vs token 时薪"测算。
- **模型选型含义**：闭源（OpenAI 专有 API）。缓存信息中没有官方与上一代的公开 benchmark 对照——评估时应以"长时程自主任务成功率与单位成本"为验收指标组织自己的实测，而非只看对话榜单。
- **要换模型吗**：对已有长时程自动化需求的团队（运维编排、批量数据处理、端到端测试），Astra 这类能力值得排进 POC；纯对话/检索场景未必需要，按任务复杂度分层选型。
- **风险信号**：模型能力越自主，沙箱、审计与熔断机制越是刚需——本简报第 08 篇的劫持事件就是同一天的对照组。

## 核心内容

- Tom's Hardware（2026-09-07）：GPT-6 Astra 自主通关《Portal》耗时 24 小时，token 成本 571 美元。
- PYMNTS（2026-09-07）：英伟达 CEO 黄仁勋表示 GPT-6 Astra"让 AGI 更近"。
- OpenAI 官方发布文章《An Alien Mind》（2026-09-06），Hacker News 上"GPT-6 Astra on robot arms"讨论获 240 分 / 189 评论。
- Bloomberg / Decrypt（2026-09-07）：OpenAI 首席科学家警告 AI 实验室"可能需要放慢速度"、呼吁以"极度谨慎"对待发展节奏。
- Help Net Security（2026-09-07）：报道称 OpenAI 在"自我改进 AI"路线上达到一个里程碑。

## 行动建议

- 立即可做：把"长时程任务 + 成本封顶"写进 Agent POC 的验收模板，用 Astra 类模型跑一次真实内部任务，拿到自己的 571 美元等价数据。
- 选型检查：如果现有方案依赖人类逐步监督，评估切换到高自主模型后沙箱与审计链路是否跟得上，能力先行、治理滞后是当前最大风险。
- 了解即可：AGI 表态与科学家警告属于舆论信号，不构成直接行动依据，但应进入季度风险评估的输入清单。
