---
title: "Free open-source extractor for AI coding assistant chat histories（AI 编程助手聊天记录提取器）"
shortTitle: "AI编程记录提取器"
sidebarGroup: "2026-10-09"
order: 4
date: 2026-10-07
category:
  - "每日 AI 简报"
tag:
  - "值得研究的仓库"
description: "把 Claude Code、Codex、Cursor、Windsurf、Aider 等 10 种 AI 编程工具的本地会话记录抽取为统一 JSONL：可做微调语料、使用分析与历史备份，⭐121（7 天）。"
---

# Free open-source extractor for AI coding assistant chat histories（AI 编程助手聊天记录提取器）

> 📅 2026-10-07 | 🏷️ 值得研究的仓库 | ⭐ ⭐121（7 天）
> 🔗 原文：https://github.com/nachisama/ai-data-extractor

## 是什么

一个开源 Python 工具集，把你本地的 AI 编程助手聊天记录（自己的数据）从各家工具的私有存储里抽出来，统一成标准化的 JSONL 格式。支持 10 种工具：Claude Code、Codex CLI、Cursor、Windsurf、Trae、Continue、Gemini CLI、OpenCode、Cline/Roo Code、Aider。官方用途：微调语料、个人使用分析、以及在应用本地数据库被清理前备份多年对话。

## 🔍 小白解读

### 先说几个词

- **JSONL**：每行一个独立 JSON 对象的文本格式，机器好处理、人也好读，是数据管线的通用「集装箱」。
- **会话记录**：你和 AI 编程工具的全部往来——提问、回答、代码片段、工具调用结果，通常散落在各家工具的私有数据库里。
- **微调**：用你自己的数据继续训练模型，让它学会你的代码风格和业务习惯。
- **SQLite**：一种单文件数据库，很多编辑器插件用它存历史记录，结构通常没有官方文档。

### 这篇到底在说什么

每个 AI 编程工具都把你的对话历史存在本地，但格式五花八门：Claude Code 用逐会话的 JSONL 文件，Cursor 和 Windsurf 藏在 SQLite 数据库里（后者连表结构都没有文档，需要启发式猜），Aider 存 Markdown 转录。这个项目把这些「数据孤岛」统一打通：自动发现 macOS、Linux、Windows 三平台的存储位置，抽取完整对话——包括用户消息、AI 回复、代码上下文（文件路径、选中片段）、代码 diff、工具调用及其结果、时间戳、会话 ID、项目路径、模型名等一切本地可得的信息——然后归一化成统一的 JSONL。刚发布两天就 121 星，说明「把 AI 编程历史变成资产」是真实需求。

### 这跟普通人有什么关系

你花在 AI 编程工具上的每一句对话，其实是个人和团队的知识资产。这个工具让你在换工具、重装系统、数据库被清空之前把数据攥在自己手里——也能看到自己到底把 AI 用在了哪里。

## 为什么值得架构师关注

- **团队级 AI 编程知识资产化**：散落在个人机器上的会话记录是事实上的「组织记忆」，统一抽取后可构建可检索的工程决策库，而非随人员流动而蒸发。
- **微调数据管线起点**：抽取的「提示→上下文→diff→结果」结构天然适合构建领域微调集，比手工造数据便宜几个量级。
- **审计与合规留档**：企业推进 AI 编程治理（谁用什么模型改了什么代码）需要底层数据，这个工具给出了跨工具统一的 schema 参照。
- **工程注意点**：记录里必然包含代码与潜在敏感信息，入仓前必须加脱敏与访问控制；Windsurf/Trae 的无文档 schema 靠启发式解析，稳定性需自行验证。

## 核心内容

- 支持 10 种 AI 编程工具的本地记录抽取：Claude Code、Codex CLI、Cursor、Windsurf、Trae、Continue、Gemini CLI、OpenCode、Cline/Roo Code、Aider。
- 抽取内容包括用户/助手消息、代码上下文（路径、选中片段）、代码 diff、工具调用及结果、时间戳、会话 ID、项目路径、模型名等字段。
- 自动探测 macOS / Linux / Windows 三平台存储路径（Library/Application Support、~/.config、%APPDATA% 等），无需手动指定。
- 输出统一 JSONL；定位是微调语料、使用分析与本地历史备份。
- Cline/Roo 与 Aider 为新增支持，两者分别代表「每任务一文件夹」与「Markdown 转录」两种不同的存储形态。

## 行动建议

先在个人机器上跑一次全量抽取，统计团队真实 AI 使用画像；若要升级为组织级实践，补上脱敏规则与集中存储方案再推广。做 AI 编程治理立项的团队可把它作为数据层参考实现。
