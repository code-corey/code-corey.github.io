---
title: "Windows 11 is collecting data on which coding agents and developer tools you use（Windows 11 正在收集你使用哪些编码智能体的数据）"
shortTitle: "Win11 编码 Agent 遥测"
sidebarGroup: "2026-11-18"
order: 9
date: 2026-11-16
category:
  - "每日 AI 简报"
tag:
  - "安全 & 评测"
description: "逆向工程发现：Windows 11 MissionControlAggregator.dll 内置 Claude/Codex/Copilot/Cursor 等编码智能体名单，记录使用情况并随诊断数据上传微软，HN 709 分/589 评论引爆隐私争论。"
---

# Windows 11 is collecting data on which coding agents and developer tools you use（Windows 11 正在收集你使用哪些编码智能体的数据）

> 📅 2026-11-16 | 🏷️ 安全 & 评测 | ⭐ HN 709 分 / 589 评论
> 🔗 原文：https://xusheng.dev/posts/windows-coding-agent-telemetry/
> 💬 讨论：https://news.ycombinator.com/item?id=50524736

## 是什么

开发者 Xusheng Li 逆向分析发现：Windows 11 的系统组件 MissionControlAggregator.dll 中内置了主流编码智能体与开发工具的名单（claude.exe、codex.exe、copilot.exe、cursor.exe、antigravity.exe、python.exe 等），会记录本机使用过哪些 AI 编码工具和开发工具，并作为诊断数据上报微软——除非用户关闭默认开启的「可选诊断数据」。

## 🔍 小白解读

### 先说几个词

- **遥测（telemetry）**：软件自动把「你怎么用它」的数据发回厂商。像汽车行车记录仪上传驾驶习惯——帮你改进产品，也暴露你的行踪。
- **逆向工程**：不看源代码，通过分析编译后的程序文件弄清它到底在干什么。相当于通过品尝菜推断出完整菜谱。
- **DLL**：Windows 的共享功能模块文件，程序运行时按需调用。 MissionControlAggregator.dll 就是其中之一，名字直译「任务控制聚合器」。
- **特性开关（feature flag）**：厂商远程控制某个功能「开/关」的暗门。本文发现的功能开关名叫 CLICodingAgentUsage，编号 62580080。
- **可选诊断数据**：Windows 隐私设置里的一项，默认开启；开启时微软可收集比「基本」级别更多的设备与使用数据。

### 这篇到底在说什么

一位开发者最近让 AI 帮他翻 Windows 的系统文件找「没写进文档的功能」，结果翻到一份扎眼的名单：claude.exe、codex.exe、copilot.exe、cursor.exe——这些 AI 编程工具的名字，和一个系统 DLL 躺在一起。他顺着线索用逆向工具深挖，发现这个叫 MissionControlAggregator 的组件里有专门的「格子」：四个格子盯着命令行 AI 编码工具（copilot、claude、codex、agy），五个格子盯着桌面版（github、claude、codex、cursor、antigravity），旁边还有一排传统开发工具（python、node、dotnet、gcc、VS Code）。它会记录你用过哪些，存下来，然后作为「诊断数据」发回微软——只要你的「可选诊断数据」开关保持默认的开启状态。作者还找到了控制这个功能的内部开关代号。文章在 HN 引爆：709 分、589 条评论，是近两天讨论最激烈的安全/隐私话题——争论点集中在：操作系统厂商对「开发者用什么 AI 工具」的监控颗粒度，以及企业环境里这意味着什么。

### 这跟普通人有什么关系

你用什么 AI 助手写代码、用什么语言开发，这些信息默认可能正在被操作系统收集并上传。在意的话，去设置里关掉「可选诊断数据」。对普通用户这更多是知情权问题，但对公司来说就不是小事了。

## 为什么值得架构师关注

- **企业合规与竞争情报风险**：开发者工具栈选择属于企业敏感信息（技术路线、供应商关系、内部项目特征）。受管设备默认上传「agent 使用清单」，需评估是否构成数据出境/保密协议违约面。
- **安全评估输入**：agent 使用遥测 + 进程名单意味着攻击者对目标企业「用哪个 AI 工具」的画像成本下降；针对特定编码 agent 的供应链攻击（恶意 skill/扩展）的定向能力随之上升。
- **默认配置即风险**：又是「默认开启的可选数据」。企业终端基线（组策略/Intune）应把诊断数据级别列为必查项，尤其在研发涉密环境。
- **AI 辅助逆向的信号**：作者用 AI agent 在二进制中定位字符串比较逻辑——安全审计工作流正在被 agent 重塑，红队/审计团队应尽快工具化同类方法。

## 核心内容

- 逆向对象：Windows 11 `MissionControlAggregator.dll`；方法：AI 辅助定位 → Binary Ninja 人工分析（作者博客，2026-11-16）
- 内置名单——CLI agent 槽位 4 个：`copilot.exe`、`claude.exe`、`codex.exe`、`agy.exe`（WSL 侧有扩展名等价物）；桌面 agent 槽位 5 个：`github.exe`、`claude.exe`、`codex.exe`、`cursor.exe`、`antigravity.exe`
- 同组件还监控开发工具：`node.exe`、`python.exe`、`dotnet.exe`、`gcc.exe`、`code.exe` 等
- 功能开关：`CLICodingAgentUsage`（feature ID 62580080）
- 行为：记录哪些编码 agent 与开发工具被使用 → 本地保存 → 计入诊断 ETW 报告；**「可选诊断数据」默认开启时上传微软**（作者实测口径）
- HN 709 分 / 589 评论，隐私与企业管控争论激烈；微软尚未见公开回应（以官方渠道为准）

## 行动建议

1. **本周内**检查受管设备诊断数据基线：研发/涉密终端统一关闭「可选诊断数据」或以组策略锁定为「基本」级别。
2. 把「编码 agent 使用遥测」加入终端安全评估清单与隐私影响评估（PIA）范围，明确是否需在员工协议中披露。
3. 安全团队可复现该逆向流程（AI 辅助二进制分析），对自家终端基线镜像做一次同类审计——这个方法本身值得内化。
