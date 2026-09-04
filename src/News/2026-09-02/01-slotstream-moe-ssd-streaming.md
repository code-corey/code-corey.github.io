---
title: "Show HN: Running 104GB Qwen3.8-Flash-Next on 48GB Mac with at ~12 tok/s（在 48GB 内存的 Mac 上以约 12 tok/s 运行 104GB 的 Qwen3.8-Flash-Next）"
shortTitle: "在 48GB 内存的 Mac 上以约 12…"
sidebarGroup: "2026-09-02"
order: 1
date: 2026-09-01
category:
  - "每日 AI 简报"
tag:
  - "工程 & Agent"
description: "slotstream 是一个开源项目（MLX + Swift），通过把 MoE 专家权重从 SSD 按需流式换入内存，让 48GB 内存的 Mac 也能运行 4-bit 量化下占用 104GB 的 Qwen3.8-Flash-Next..."
---
# Show HN: Running 104GB Qwen3.8-Flash-Next on 48GB Mac with at ~12 tok/s（在 48GB 内存的 Mac 上以约 12 tok/s 运行 104GB 的 Qwen3.8-Flash-Next）

> 📅 2026-09-01 | 🏷️ 工程 & Agent | ⭐ HN 147分/90评论；GitHub ⭐134（7天窗口）
> 🔗 原文：https://github.com/carloslfu/slotstream

## 是什么
slotstream 是一个开源项目（MLX + Swift），通过把 MoE 专家权重从 SSD 按需流式换入内存，让 48GB 内存的 Mac 也能运行 4-bit 量化下占用 104GB 的 Qwen3.8-Flash-Next（125B MoE），实测约 12 tok/s，并对外暴露 Ollama 兼容 API，可直接接入现有本地推理工具链。

## 为什么值得架构师关注
本地推理的硬件成本方程可能被改写：与其为大 MoE 配 128GB+ 统一内存的机器，可以用「小内存 + NVMe 带宽」组合承接。对私有化部署、数据不出域场景，单机硬件门槛显著下降。12 tok/s 对交互式 agent 偏慢，但对离线批处理、代码审查、文档摘要等非交互场景已在可用区间——这意味着「长尾任务下沉到便宜硬件」有了新的技术选项。

## 核心内容
- 目标模型：Qwen3.8-Flash-Next，125B MoE，4-bit 量化后权重 104GB；Qwen 官方 FP8 版（2026-08-24 发布）与 unsloth GGUF 版均已进入 HF 趋势榜（GGUF 431k 下载）。
- 核心机制：MoE 每次前向只激活部分专家 → 未激活专家不必常驻内存，可从 SSD 流式换入，用 I/O 换内存。
- 实测：48GB Mac 达到约 12 tok/s；技术栈 MLX + Swift，提供 Ollama 兼容 API。
- 生态位：与「M4 Pro Mac Mini 本地模型部署」登 HN 热榜（77分）同一周出现，本地小内存跑大 MoE 正在成为一条被验证的路径。

## 行动建议
若存在数据不出域的本地化需求：在 48GB Mac 上复现该项目，用你们的真实负载测 tok/s、首 token 延迟与 SSD 写入放大；把它当作「低成本长尾推理节点」候选评估，而非主力交互模型。纯云架构团队了解即可。
