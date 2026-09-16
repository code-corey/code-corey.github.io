---
title: "Nari Qwen3-TTS/ASR lead Coval voice AI benchmarks（Nari Qwen3 语音双模型登顶 Coval 基准）"
shortTitle: "Nari Qwen3语音登顶"
sidebarGroup: "2026-09-16"
order: 10
date: 2026-09-14
category:
  - "每日 AI 简报"
tag:
  - "国内生态"
description: "Nari Labs 基于阿里 Qwen3 开源模型优化的 TTS 1.7B 与 ASR 1.7B 登顶 Coval 语音基准：STT 延迟第一（TTFS p50 44ms）、TTS WER 第一，价格低至 $0.06/小时。HN 89分/31评论。"
---

# Nari Qwen3-TTS/ASR lead Coval voice AI benchmarks（Nari Qwen3 语音双模型登顶 Coval 基准）

> 📅 2026-09-14 | 🏷️ 国内生态 | ⭐ HN 89分/31评论
> 🔗 原文：https://narilabs.com/blog/nari-labs-leads-coval-voice-ai-benchmarks/

## 是什么

Nari Labs 官宣：其基于 Qwen3 开源模型优化的两款语音模型——Nari Qwen3-TTS 1.7B 与 Nari Qwen3-ASR 1.7B（均公测中）——在权威语音评测机构 Coval 的基准上同时登上 STT 与 TTS 双榜：STT 延迟第一、WER 第二；TTS WER 第一、延迟第二，且包揽公开模型中的「延迟-成本」帕累托前沿。

## 🔍 小白解读

### 先说几个词

- **TTS/ASR**：文字转语音（合成）和语音转文字（识别）。语音助手、电话机器人的一进一出两个口。
- **WER（词错误率）**：识别/合成质量的核心指标——转出来的字错得越多 WER 越高，越低越好。
- **TTFA/TTFS（首音频/末文本时间）**：语音产品的体感命门——用户说完到听到回应的等待。延迟高，语音 Agent 就显得「反应慢半拍」。
- **帕累托前沿**：多项指标不可兼得时，「没有任何对手能同时全面赢你」的最优边界线。
- **Qwen（通义千问）**：阿里开源的大模型家族，这也是本文「国内生态」标签的由来——Nari 是在 Qwen3 开源底座上做优化与服务化的团队。

### 这篇到底在说什么

Nari Labs 的打法是「开源模型 + 生产级托管 API」：拿 1.7B 的小模型做深度优化，把延迟和成本打到行业前列。在 Coval 2026 年 9 月中的榜单上：识别侧，Qwen3-ASR Fast 以 p50 44 毫秒拿下 TTFS（响应速度）第一，词错误率 3.6% 列第二（仅次于 AssemblyAI Universal 3.5 Pro 的 3.5%）；合成侧，TTS 拿下 WER 第一、延迟第二。价格是另一把刀：ASR Fast 每小时 $0.12，在 Coval 有公开报价的模型里并列第二低，标准档 $0.06/小时为全场最低——比 AssemblyAI Universal 3.5 Pro 便宜 3.75 倍，比 Deepgram Nova 3 便宜 2.4 倍。也就是说，它不是靠单项碾压，而是把「质量-延迟-成本」三角同时做进第一梯队。需要留两个心眼：Coval 榜单每 30 分钟波动一次，且 Nari 只统计公开可调用的端点（不比内部 API）；HN 讨论里围绕小模型能打到什么程度也有争议。

### 这跟普通人有什么关系

语音客服、会议转写、实时翻译这类服务的价格会继续下探、响应会更快；「小模型 + 深度优化」路线赢过大参数堆料，最终让中小公司也用得起生产级语音能力。

## 为什么值得架构师关注

- **Voice 栈的性价比新锚点**：1.7B 级模型做到 44ms 级 TTFS，意味着「端侧/单卡自托管语音 Agent」在成本模型上成立，自建 vs API 的测算基准变了。
- **国产开源底座的服务化范本**：Qwen3 开源权重 → 垂类优化 → 托管 API 出海的路径再次验证；评估国内开源生态时，可把「有无第三方服务化成功案例」作为成熟度信号。
- **选型对比方法**：Coval 的 TTFA/TTFS + WER + 单价三维榜单可直接作为语音组件采购的评分卡；注意其榜单波动性与「仅公开端点」口径。

## 核心内容

- 模型：Nari Qwen3-TTS 1.7B 与 Nari Qwen3-ASR 1.7B，基于 Qwen3 开源模型优化，均以生产 API 形式公测。
- STT：Qwen3-ASR Fast 的 TTFS p50 为 44ms（第一），WER 3.6%（第二，落后 AssemblyAI Universal 3.5 Pro 的 3.5%）。
- TTS：Coval 榜 WER 第一、延迟第二；Nari 同时占据 TTS 与 STT 的「质量-延迟」及「延迟-成本」帕累托前沿（公开模型范围内）。
- 价格：ASR Fast $0.12/小时（并列第二低），Standard $0.06/小时（最低）；对比 Universal 3.5 Pro 贵 3.75 倍、Deepgram Nova 3 贵 2.4 倍。
- 口径声明：Coval 榜单约每 30 分钟刷新，排名会波动；统计仅覆盖公开可用端点。

## 行动建议

做语音相关产品的团队，把 Nari 双模型加进与 AssemblyAI、Deepgram 的同场对比：用自家真实音频测 WER、用真实并发测 TTFS、按账单测单价，特别关注中文与混合语言的识别质量（Coval 榜单以英文为主，中文场景需自测）。延迟敏感的自托管场景可评估其开源权重的可行性。其余团队了解即可。
