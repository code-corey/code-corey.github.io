---
title: "PolyStrata：在自己的 PC 上跑大模型（GLM 5.3 Flash / DeepSeek V4 Flash 等十二个模型本地推理）"
shortTitle: "PolyStrata：PC 本地跑大模型"
sidebarGroup: "2026-11-04"
order: 4
date: 2026-10-06
category:
  - "每日 AI 简报"
tag:
  - "值得研究的仓库"
description: "C++ 开源本地推理整合包：一台普通 PC 跑 Qwen3.8-Flash-Next、GLM 5.3 Flash、DeepSeek V4 Flash 等十二个模型，localhost 提供 OpenAI/Anthropic 兼容 API。"
---

# PolyStrata：在自己的 PC 上跑大模型（GLM 5.3 Flash / DeepSeek V4 Flash 等十二个模型本地推理）

> 📅 2026-10-06 | 🏷️ 值得研究的仓库 | ⭐ 808（慢热发现·30天窗口）
> 🔗 原文：https://github.com/simplexai-labs/PolyStrata

## 是什么

一个 C++ 编写的开源项目：把十二个通常需要服务器才能跑的大模型装进一台普通 PC——包括 Qwen3.8-Flash-Next（跑在 Strata 引擎上）、以及自研引擎承载的 GLM 5.3 Flash（79~114GB，大部分驻留 RAM）、DeepSeek V4 Flash（91GB）、LFM2.5、Flint 40B-A2.5B、Qwen3.6-35B-A3B 等。Windows/Linux 一键安装，在 localhost 上直接提供 OpenAI/Anthropic 兼容 API，数据不出本机。仓库 2026-10-06 创建，约四周累积 808 星——增速平稳但持续，属于典型的「慢热」实用工具。

## 🔍 小白解读

### 先说几个词

- **本地推理（local inference）**：在自己电脑上运行大模型，不联网调用云端。类比：在自己家装个发电机，不用买电网的电。
- **MoE（混合专家）**：一种模型结构，总参数很大但每次回答只激活一小部分「专家」，所以显存占用和速度比同体量的普通模型友好得多。文中 A3B、A52B 这类后缀就是「激活 3B/52B 参数」的意思。
- **VRAM（显存）**：显卡上的高速存储，模型跑得快不快很大程度看显存够不够；放不下的部分可以挪到内存（RAM），但速度会慢。
- **量化（quantization）**：把模型参数从高精度压成低精度存储（比如文件从 23GB 压到 13GB），牺牲一点点质量换显存和速度。
- **OpenAI/Anthropic 兼容 API**：本地服务对外提供和官方 API 长得一样的接口，这样 Claude Code、各种现成客户端不用改代码就能接上本地模型。

### 这篇到底在说什么

打个比方：以前想跑「大杯」的 AI 模型，你得租云服务器——就像想喝鲜榨果汁得去果汁店。PolyStrata 做的是给你一台家用榨汁机：一键安装，普通显卡（8GB 显存的笔记本都行，部分型号）就能跑十二种开源模型，其中最强的 GLM 5.3 Flash、DeepSeek V4 Flash 这类上百 GB 的大家伙，靠「大头放内存、关键部分进显存」的分层方案也能在单张 32GB 显卡上转起来。它还故意把自己的接口伪装成 OpenAI/Anthropic 的样子，于是你现有的各种 AI 工具（比如命令行编码智能体）无缝切换到本地模型，所有对话数据一台笔记本全包圆， nothing leaves your PC。README 里的实测：一台 8GB 显存的笔记本跑 Qwen3.6-35B-A3B 每秒能出 94~100 个字，RTX 5090 上到 394+。

### 这跟普通人有什么关系

数据敏感（代码、合同、病历）又想用最强模型的个人和小团队，多了一个「买断制」选项：一次硬件投入，免月费、免数据外流担忧。8GB 显卡笔记本就能跑 35B 级模型，意味着本地 AI 的门槛已经降到主流办公本。

## 为什么值得架构师关注

1. **本地推理的生产化信号**：808 星、双引擎架构、一键安装、API 兼容层齐备——「桌面级跑旗舰 MoE」已从极客玩具走向可用产品。做数据驻留方案（on-prem AI）评估时，这是新的候选基线。
2. **分层驻留（VRAM+RAM 混合）值得研究**：GLM 5.3 Flash、DeepSeek V4 Flash「大部分驻留 RAM」的跑法，本质是用 PCIe 带宽换显存容量；对预算受限的私有化部署，这种「32GB 单卡 + 大内存」的组合可能比堆多卡更省钱，值得实测推理时延。
3. **长上下文的显存账本**：README 给了具体数字——LFM2.5-24B-A2B 128K 上下文只比 32K 多 2GB 显存（大部分层无注意力），Flint 40B-A2.5B 多 2.6GB（多数层只回看 513 token）。选型长上下文本地模型时，这类「线性上下文成本」指标比参数量更重要。
4. **授权红旗**：LFM2.5 的许可证限制年收入 1000 万美元以上的公司商用——给本地模型合规清单又添一条：开源 ≠ 免费商用，逐模型查 license。
5. **兼容层即迁移成本归零**：localhost 提供 OpenAI/Anthropic 双协议，意味着现有 agent 工具链可以在云端/本地之间做 AB 测试——灰度切换的最短路径。

## 核心内容

- 十二个模型、两台引擎：Qwen3.8-Flash-Next 用 Strata 引擎（NVIDIA/AMD 卡、12GB+ 显存、Win/Linux、可读图）；其余十一个用 PolyStrata 自研引擎。
- 大杯型号：GLM 5.3 Flash 文件 79~114GB、DeepSeek V4 Flash 91GB，大部分驻留 RAM；实验性，已在单张 32GB 显卡的 PC 上运行。
- 小杯型号：八个较小模型可在 8GB 显存笔记本上运行；Qwen3.6-35B-A3B 文件 13~23GB，可读图。
- 实测速度：Qwen3.6-35B-A3B 在 8GB 卡笔记本约 94~100 token/s，RTX 5090 约 394~395 token/s。
- 长上下文显存增量：LFM2.5 128K 比 32K 多约 2GB；Flint 多约 2.6GB；DeepSeek V4 Flash 多 0.7GB。
- Windows/Linux 一键安装，localhost 暴露 OpenAI/Anthropic 兼容 API，可与 Claude Code 等编码智能体直连。
- 2026-10-06 创建，约 4 周 808 星（本刊 30 天慢热窗口收录，每期每个仓库类目最多 1 篇）。

## 行动建议

- 数据驻留/私有化部署评估：优先在「32GB 单卡 + 大内存」配置上实测 GLM 5.3 Flash / DeepSeek V4 Flash 的首 token 延迟与吞吐，与传统多卡 vLLM 方案对比 TCO。
- 长上下文本地场景（文档问答、代码库理解）：把 LFM2.5、Flint 列入短名单，重点是线性上下文显存成本；注意 LFM2.5 的商用收入限制条款。
- 个人开发者：8GB 显卡笔记本可直接试用，把它当作 Claude Code 的本地后端做体验对比。
- 已有云端方案且无合规压力的团队：了解即可。
