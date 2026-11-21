---
title: "blender-ai-mcp-addon：让 Claude/GPT 直接操作 Blender 的 MCP 插件（两天 1.7k Star）"
shortTitle: "Blender AI MCP插件"
sidebarGroup: "2026-11-21"
order: 3
date: 2026-11-21
category:
  - "每日 AI 简报"
tag:
  - "值得研究的仓库"
description: "为 Blender 提供 AI 助手与 MCP 服务器：可视化对话、场景工具、多智能体工作流，兼容 Claude/GPT/Gemini/Ollama 等，发布两天揽 1773 Star。"
---

# blender-ai-mcp-addon：让 Claude/GPT 直接操作 Blender 的 MCP 插件（两天 1.7k Star）

> 📅 2026-11-21 | 🏷️ 值得研究的仓库 | ⭐ 1,773 Star（7 天爆发窗口，11-19 创建，MIT License，经 GitHub API 核实）
> 🔗 原文：https://github.com/bookwjitchieni1986/blender-ai-mcp-addon

## 是什么

一个将 **Blender（开源 3D 建模软件）接入 MCP 协议**的插件项目：一边是 Blender 内的 AI 助手插件（可视化对话、场景操作工具），一边是标准 MCP 服务器，让 Claude、ChatGPT/GPT、Gemini、Ollama、OpenCode 等任意支持 MCP 的 AI 客户端都能直接读写 Blender 场景、执行 bpy 脚本、编排多智能体 3D 工作流。仓库创建于 11 月 19 日，两天内获得 1,773 Star，是本周 GitHub 上爆发最快的 AI 工具向项目之一。

## 🔍 小白解读

### 先说几个词

- **Blender**：免费开源的 3D 制作软件，建模、材质、动画、渲染全都能干，游戏、影视、电商产品图都在用。
- **MCP（Model Context Protocol）**：Anthropic 提出的开放协议，让 AI 模型能以标准方式调用外部工具和数据。打个比方：以前每个 AI 接家电都要单独拉一根私有插线板，MCP 是统一插座标准。
- **bpy**：Blender 的 Python 接口，理论上 Python 能干的事（建模、改材质、批量导出）它都能干，是 AI 操控 Blender 的「手」。
- **多智能体工作流（Multi-agent）**：让多个 AI 分工协作，比如一个负责建模、一个负责打光、一个负责质检。

### 这篇到底在说什么

以前你想让 AI 帮你做 3D，基本只能「问它怎么做的教程」，然后自己一步步点。这个项目把这条路打通了：AI 通过 MCP 直接对 Blender 下命令——「建一个圆角盒子，放个三点点光源，渲染一张白底产品图」——AI 调用 bpy 脚本替你完成。它同时提供了两种形态：Blender 插件（在软件里直接跟 AI 对话）和独立 MCP 服务器（让外部的 Claude Desktop、IDE 里的 coding agent 等都能连接你的 Blender）。两天 1.7k Star 说明「AI 操控专业创作工具」的需求远比想象中大。

### 这跟普通人有什么关系

做电商的可以批量生成产品展示图，做自媒体的可以快速出 3D 片头，开发者可以把「3D 资产管线」交给 agent 半自动跑。门槛从「学半年 Blender」降到「会描述需求」。

## 为什么值得架构师关注

1. **MCP 生态纵深扩张的样本**：MCP 服务器正从文档/数据库类工具向专业创作软件（3D、设计、音视频）渗透，评估企业内「AI 工具总线」架构时，创作类资产管线是下一个集成域。
2. **设计资产自动化管线的参考实现**：可视化对话 + 场景工具 + 多智能体编排的三层结构，可作为「专业软件 + agent」集成的模式参考，同样适用于 CAD、DCC 等工具链。
3. **多模型兼容性**：同时支持云端商用模型与本地 Ollama，对数据不出域的 3D 资产生产场景（工业设计、未发布产品）有实用意义。
4. **风险提示**：项目增速极快且发布账号为看似一次性注册的新账号（作者历史不可考），**接入前务必自行审查代码**——MCP 服务器可执行任意 bpy/Python 命令，权限边界必须自己划。

## 核心内容

- 双形态架构：Blender 内插件（可视化对话 + 场景工具）+ 独立 MCP 服务器（供外部 AI 客户端连接）。
- 官方描述支持的能力：可视化对话、场景操作工具集、多智能体工作流、bpy Python 脚本执行。
- 兼容客户端：ChatGPT/GPT、Claude、Gemini、Ollama、OpenCode 等 MCP 生态主流客户端。
- 增长信号：11-19 创建，约两天 1,773 Star，MIT 协议（经 GitHub API 于 11-21 核实：1773 stars，非 fork）。
- 注意：仓库主语言字段为空（插件类项目的常见情况），代码质量与文档完成度需自行 review。

## 行动建议

- **怎么评估试用**：在隔离环境（虚拟机/容器）中部署 MCP 服务器，先用只读类工具（场景树查询、截图）验证稳定性，再开放写操作；重点审查其暴露给 AI 的工具函数清单与权限粒度。
- **对比测试**：与社区已有的 blender-mcp 类项目对比工具覆盖度、维护活跃度后再决定是否引入生产管线。
- **适用场景**：电商产品图批量生成、游戏资产出初稿、可视化内容生产线；高精度影视级资产仍需人工把关。
