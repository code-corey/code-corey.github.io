---
title: "Nvidia to acquire Hugging Face（NVIDIA 近 130 亿美元收购 Hugging Face）"
shortTitle: "NVIDIA 近 130 亿美元收购 Hu…"
sidebarGroup: "2026-09-04"
order: 8
date: 2026-09-03
category:
  - "每日 AI 简报"
tag:
  - "模型发布 & 行业动态"
description: "CNBC 报道：NVIDIA 同意以近 130 亿美元收购 Hugging Face，作为其 AI 扩张布局的一部分。开源模型世界的事实标准分发平台归于 GPU 巨头麾下，HN 297 分/93 评论。这是典型的战略级信号——基座生态..."
---
# Nvidia to acquire Hugging Face（NVIDIA 近 130 亿美元收购 Hugging Face）

> 📅 2026-09-03 | 🏷️ 📣 模型发布 & 行业动态 | ⭐ HN 297分/93评论
> 🔗 原文：https://www.cnbc.com/2026/09/03/nvidia-agrees-to-buy-hugging-face-for-almost-13-billion-ai-expansion.html

## 是什么

CNBC 报道：NVIDIA 同意以近 130 亿美元收购 Hugging Face，作为其 AI 扩张布局的一部分。开源模型世界的事实标准分发平台归于 GPU 巨头麾下，HN 297 分/93 评论。这是典型的战略级信号——基座生态的关键入口被收购。

## 为什么值得架构师关注

Hugging Face 是开源权重分发的事实入口：本期 HF 趋势数据可见其体量——Qwen3.8-27B 下载量 525 万、GLM-5.3-Flash 下载 51.8 万、all-MiniLM-L6-v2 累计下载 2.46 亿。企业自托管、微调、RAG 用的模型工件大多经此流转。交易完成后，「GPU 厂商 + 模型分发平台」的垂直整合将影响三件事：开源模型分发的中立性、许可证与商业模式走向、以及所有依赖 HF Hub 的构建/部署流水线的供应链风险。

## 核心内容

- 交易：NVIDIA 同意以近 $13B 收购 Hugging Face（CNBC，2026-09-03），定位为 AI expansion
- HF 生态体量参考（本期趋势榜）：Qwen3.8-27B 5,254,882 下载；all-MiniLM-L6-v2 累计 246,135,287 下载
- 结构性影响：模型分发入口与算力供给方合一，开源生态的中立性预期需要重估
- HN 讨论（297 分/93 评论）焦点集中在生态中立与后续条款
- 截至抓取时点：未见监管审批结论，条款细节待官方披露

## 行动建议

①把关键模型工件（weights + tokenizer + config + 校验和）的自托管镜像列入本周待办；②评估 HF 之外的分发渠道（如国内镜像源）作为备份；③若在用 HF Hub 的付费/企业功能，暂缓续约决策至许可证与服务条款明朗；④把「单一分发入口依赖」加入年度架构风险清单。
