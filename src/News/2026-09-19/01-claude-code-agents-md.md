---
title: "Claude Code now reads AGENTS.md if there is no Claude.md（Claude Code 开始兼容读取 AGENTS.md）"
shortTitle: "Claude Code 兼容 AGENTS.md"
sidebarGroup: "2026-09-19"
order: 1
date: 2026-09-18
category:
  - "每日 AI 简报"
tag:
  - "工程 & Agent"
description: "Claude Code 官方 changelog 确认：目录中没有 CLAUDE.md 时将自动读取 AGENTS.md，编码 Agent 的项目级配置约定走向跨工具统一。"
---

# Claude Code now reads AGENTS.md if there is no Claude.md（Claude Code 开始兼容读取 AGENTS.md）

> 📅 2026-09-18 | 🏷️ 工程 & Agent | ⭐ HN 472分/171评论
> 🔗 原文：https://code.claude.com/docs/en/changelog
> 💬 讨论：https://news.ycombinator.com/item?id=49760187

## 是什么

Anthropic 在 Claude Code 官方 changelog 中确认：当项目目录中不存在 CLAUDE.md 时，Claude Code 会自动读取 AGENTS.md 作为项目级指令来源。AGENTS.md 是近两年由多家编码 Agent 厂商共同采用的开源约定文件，这次改动意味着 Claude Code 正式向这一跨工具标准靠拢。

## 🔍 小白解读

### 先说几个词

- **AGENTS.md**：一份放在代码仓库里的「给 AI 看的说明书」，告诉编码 Agent 这个项目怎么构建、代码规范是什么、哪些目录不要碰。好比新员工入职时拿到的那本《团队工作手册》。
- **CLAUDE.md**：Claude Code 自己的「专属说明书」，格式和用途与 AGENTS.md 类似，但只有 Claude Code 认识它。
- **编码 Agent（Coding Agent）**：能自主读代码、改代码、跑测试的 AI 助手，比如 Claude Code、Codex。可以理解为一位不用发工资的初级程序员。
- **约定优于配置**：软件工程里的一条老原则——大家都按同一个默认规矩来，就不必每家各搞一套。USB 接口就是最好的例子。

### 这篇到底在说什么

打个比方：以前每家 AI 编程助手都只认自己印的名片，你在 A 工具里写好的项目说明，换到 B 工具就得重写一遍。AGENTS.md 就像行业里约定俗成的「通用工牌」，OpenAI Codex 等工具已经支持它。这次 Claude Code 官方更新了规则：如果项目里没有自己的专属说明书 CLAUDE.md，就去读这张通用工牌。对开发者来说，同一份 AGENTS.md 可以在多个 Agent 工具之间直接复用，不用再为每个工具单独维护一份说明。HN 上 472 分、171 条评论的热度说明，这种「标准化」正是开发者社区盼了很久的事。

### 这跟普通人有什么关系

如果你用 AI 编程工具写代码，今后只要维护一份 AGENTS.md，换工具不用重写说明；小团队接手新项目时，AI 助手能更快理解项目规矩，产出更稳。

## 为什么值得架构师关注

- **选型锁定下降**：项目级指令文件（AGENTS.md）成为跨工具公共资产后，团队在 Claude Code / Codex 等工具间迁移的配置成本显著降低，Agent 工具选型可以更从容地按能力评估而非生态锁定。
- **规范资产的沉淀位置变化**：团队应把编码规范、构建命令、目录约束等知识正式沉淀为仓库内的 AGENTS.md，并纳入 code review 流程——它现在是 AI 与人共同消费的「活文档」。
- **治理口径统一**：安全约束（如「不得触碰 infra/ 目录」）写在一份文件里对所有 Agent 生效，比在各工具各写一份更可控、更易审计。

## 核心内容

- Claude Code 官方 changelog 新增行为：无 CLAUDE.md 时自动读取 AGENTS.md（一手信息，官方文档）。
- 该变动在 HN 获得 472 分 / 171 条评论，是近 48h 编码 Agent 工具链话题中热度最高的一条。
- AGENTS.md 是多家编码 Agent 厂商已采用的开放约定，本次意味着 Claude Code 与该约定兼容。
- 对存量用户无破坏性：已有 CLAUDE.md 的项目行为不变，优先级仍是自有文件。

## 行动建议

评估试用：在 1–2 个核心仓库补齐 AGENTS.md（构建命令、测试入口、禁区目录、代码风格），验证 Claude Code 与其他支持该约定的工具行为是否一致；同时把 AGENTS.md 纳入代码评审，防止过期指令误导 Agent。已有完善 CLAUDE.md 的团队暂不需要改动。
