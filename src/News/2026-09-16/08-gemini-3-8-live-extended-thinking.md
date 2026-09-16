---
title: "Gemini 3.8 Live and 3.8 Live Extended Thinking（Gemini 3.8 Live 双模型发布：语音智能体旗舰）"
shortTitle: "Gemini 3.8 Live发布"
sidebarGroup: "2026-09-16"
order: 8
date: 2026-09-15
category:
  - "每日 AI 简报"
tag:
  - "模型发布 & 行业动态"
description: "Google 官方发布 Gemini 3.8 Live 与 3.8 Live Extended Thinking：实时视觉接地、97 语言中途切换、边聊天边执行后台工具；Extended Thinking 拿下 Artificial Analysis 语音质量榜第一。HN 269分/184评论。"
---

# Gemini 3.8 Live and 3.8 Live Extended Thinking（Gemini 3.8 Live 双模型发布：语音智能体旗舰）

> 📅 2026-09-15 | 🏷️ 模型发布 & 行业动态 | ⭐ HN 269分/184评论
> 🔗 原文：https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-8-live-gemini-3-8-live-extended-thinking/

## 是什么

Google 官方（DeepMind 团队，作者 Tom Ouyang）发布两款面向语音智能体的实时对话模型：Gemini 3.8 Live 主打规模化与性价比，Gemini 3.8 Live Extended Thinking 主打高复杂度任务——「边说话边推理」，推理的同时不中断对话。已通过 Gemini API、Workspace（Docs/Gmail/Keep Live）、Search Live 与 Gemini App 同步上线。

## 🔍 小白解读

### 先说几个词

- **Live/实时语音模型**：能「边听边想边说」的模型，不是「你说完、它想半天、再回话」的语音转文字+文字转语音拼装。
- **视觉接地（visual grounding）**：对话时模型能实时「看」你摄像头里的东西并据此回答——修自行车时问「这根线接哪」，它看着画面告诉你。
- **工具调用的后台执行**：你说「帮我订个会议室」，它一边继续陪你说话，一边在后台真的去调 API 办事，办完再告诉你结果。
- **Extended Thinking（扩展思考）**：模型在回答前先做更多内部推理，但这里特殊在「推理和说话同时进行」——像客服一边说「我帮您查一下哈」一边真在查。
- **SynthID**：Google 的内容水印技术，嵌在生成的音频里，人耳听不出但机器能检测，用于溯源 AI 生成的语音。

### 这篇到底在说什么

语音助手难做的根子是「不能打断、不能等待」：人说话本来就要抢话、改口、换话题。这次发布的两个模型都在解决「自然度」：3.8 Live 能实时处理摄像头画面作为对话上下文，支持 97 种语言在对话中途自动检测切换，还能在你不停顿聊天的情况下把工具调用和 API 请求丢到后台执行。Extended Thinking 版本则更进一步——推理和说话并行，用「让我查一下哈…」这类早期口头反馈自然承接，再用实时进度播报陪你熬过多步任务。第三方基准上，Extended Thinking 拿下 Artificial Analysis 语音到语音质量指数（82.6）总榜第一，代理任务完成率 τ-Voice 68.6%、Sierra τ-Voice-banking 35.1%，Big Bench Audio 97.7%；标准版在 Speech Agent Arena 列第二，定位是「便宜大碗可量产」。分发上 Google 把牌面拉满：API、Workspace 三件套 Live 版、Search Live、Gemini App 全覆盖，企业版在 Gemini Enterprise 私测；LangChain、LiveKit、Pipecat、Vercel 等开发平台第一时间接入。所有生成音频带 SynthID 水印。

### 这跟普通人有什么关系

语音客服、电话助理、实时翻译、边看边问的教程类应用会明显变多、变自然——「对着 AI 说话像对着人说话」的体验从演示走向产品。Workspace 用户很快会在文档、邮件里遇到能「边聊边改」的语音助手。

## 为什么值得架构师关注

- **Voice Agent 技术栈换代的信号**：拼装式管线（ASR→LLM→TTS）与原生实时模型之间的分界线更清晰了；选型时「中断处理、并行工具调用、多语种切换」从加分项变成基准项。
- **基准可作验收参照**：τ-Voice、Sierra τ-Voice-banking、EVA-Bench（与 ServiceNow 合作）构成语音代理任务完成度的成套基准，可直接搬进内部评估体系。
- **平台锁定与成本结构**：原生实时模型的定价通常按会话时长而非 token 计，容量规划、降级策略（弱网/高负载时回退到拼装管线）需要重新设计；多平台接入层（LiveKit/Pipecat 等）可降低单厂商绑定。

## 核心内容

- 双模型定位：3.8 Live 面向规模与成本效率（对话智能 + 流畅 + 视觉接地），3.8 Live Extended Thinking 面向高复杂度任务（更强智能 + 多步推理），官方称其为「迄今最先进的实时对话模型」。
- Extended Thinking 实测成绩：Artificial Analysis 语音到语音质量指数 82.6（总榜第一）、τ-Voice 代理任务 68.6%、Sierra τ-Voice-banking 35.1%、Big Bench Audio 97.7%；3.8 Live 获 Speech Agent Arena 第二，主打高性价比。
- 能力清单：近实时视觉输入、97 种语言对话中途自动切换、工具/API 后台执行不打断对话、「边推理边说话」加实时进度播报。
- 可用性：Gemini API、Workspace（Docs Live/Gmail Live/Keep Live）、Search Live、Gemini App（订阅分层）；企业侧进入 Gemini Enterprise 私测；Agora、Fishjam、LangChain、LiveKit、Pipecat、Vercel、Vision Agents 等平台接入，Salesforce、Genspark、Lumeris 为合作案例。
- 安全措施：全部生成音频嵌入 SynthID 水印，附模型卡说明安全评估。

## 行动建议

正在做语音产品或客服智能体的团队，应把 3.8 Live 系列入本轮选型对比，重点测三件事：与拼装管线的端到端延迟差、工具调用并行执行在你的业务 API 上的稳定性、实际计费模式下的单会话成本；现有 ASR→LLM→TTS 架构不必推倒，但建议预留「原生实时模型」的接入抽象层。不涉及语音的团队了解即可。
