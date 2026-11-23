---
title: "Inkling-2 开源系列：3 天下载破 80 万"
shortTitle: "Inkling-2 系列"
sidebarGroup: "2026-11-23"
order: 7
date: 2026-11-20
category:
  - "每日 AI 简报"
tag:
  - "模型发布 & 行业动态"
description: "Thinking Machines 的开源多模态模型家族 Inkling-2 走热：Mini 版 GGUF 上架 3 天 80+ 万下载、876 赞，本地部署生态（量化版+指南）快速跟进。"
---

# Inkling-2：Thinking Machines 开源多模态家族 3 天下载破 80 万

> 📅 2026-11-20 | 🏷️ 模型发布 & 行业动态 | ⭐ Mini GGUF 876 赞 / 805,993 下载（上架 3 天）
> 🔗 Mini GGUF：<https://huggingface.co/unsloth/Inkling-2-Mini-GGUF>
> 🔗 官方系列：<https://huggingface.co/thinkingmachines/Inkling-2-Small>

## 是什么

Thinking Machines Lab（Mira Murati 创立的 AI 公司）的 Inkling-2 开源模型家族正在 HuggingFace 上爆发：官方 Inkling-2-Small（image-text-to-text 多模态）11 月 4 日发布，已获 691 赞、4.9 万下载；unsloth 转制的 Mini GGUF 版 11 月 20 日上架后 3 天内拿下 876 赞、80.6 万下载；社区「无审查」变体同步走红。同日，一篇「Inkling + Qwen + Unsloth 本地部署指南」登上 HN（159 分），「发布→量化→部署指南」的完整生态链路一天内成形。

## 🔍 小白解读

### 先说几个词

- **开源权重**：模型参数公开可下载，可以自己部署、微调，而不只是调用 API。
- **GGUF 与量化**：GGUF 是本地运行的主流模型格式；量化是把模型「压缩」到更低精度，让消费级显卡也能跑。
- **image-text-to-text**：能同时看图和读文字并生成回答的多模态能力。
- **Thinking Machines Lab**：前 OpenAI CEO Mira Murati 创立的 AI 公司，Inkling-2 是其开源模型系列。

### 这篇到底在说什么

一个新开源模型家族的走红速度可以从三个数字看出来：官方 Small 版发布两周半拿到 691 赞；unsloth 的量化 Mini 版上架 **3 天**拿下 80.6 万下载和 876 赞；连社区的无审查变体都有 485 赞、12.9 万下载。更重要的信号是生态速度——量化版、部署指南（HN 159 分）几乎同步出现，说明「本地跑 Inkling-2」已经是一条被踩实的路。按模型发布类的规矩回答三个问题：**开源还是闭源**——权重公开在 HF，可本地部署；**和竞品比强在哪**——缓存数据中没有官方 benchmark，具体性能请以模型卡与第三方实测为准，本文不做结论；**对现有架构意味着什么**——如果你的私有化/端侧方案在选多模态基座，Inkling-2 已进入可评测名单（与 Qwen 系列同场对比）。

### 这跟普通人有什么关系

开源多模态模型越多越强，本地 AI 助手的选择就越多：数据不出门、不按 token 付费的「自己的 AI」正变得越来越现实。

## 为什么值得架构师关注

- **私有化选型**：Inkling-2 的下载曲线与生态跟进速度（量化 + 指南 + HN 热度）是「社区已验证可部署」的强信号，建议纳入私有化多模态基座的评测矩阵。
- **成本结构**：GGUF 量化版意味着单卡可用；高调用量场景对比「本地 Inkling-2 vs 云 API」的盈亏平衡点，是本季度值得做的一次测算。
- **合规提醒**：社区 uncensored 变体下载量不低，企业环境必须锁定官方/受控权重源，防止未审查版本流入生产。

## 核心内容

- thinkingmachines/Inkling-2-Small：image-text-to-text，2026-11-04 发布，691 赞 / 48,974 下载（HF 趋势数据）。
- unsloth/Inkling-2-Mini-GGUF：2026-11-20 上架，3 天 876 赞 / 805,993 下载。
- AtomicChat/Inkling-2-Mini-Uncensored-GGUF：社区变体，485 赞 / 129,693 下载（11-20 创建）。
- 生态信号：HN 本地部署指南 159 分（2026-11-22），围绕该模型的部署生态快速成形。

## 行动建议

本地化团队：把 Inkling-2 加入评测名单，与 Qwen 同量级版本跑同一业务集对比效果/吞吐/显存；选型前先读模型卡的 benchmark 与许可证条款；生产环境明确禁用社区 uncensored 变体。
