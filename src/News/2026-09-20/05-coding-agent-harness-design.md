---
title: "An Empirical Study of Harness Design for Coding Agents（编码 Agent 脚手架设计实证研究）"
shortTitle: "Agent Harness 实证"
sidebarGroup: "2026-09-20"
order: 5
date: 2026-09-20
category:
  - "每日 AI 简报"
tag:
  - "前沿论文"
description: "176 组对照实验、4 个模型、SWE-Bench Verified 与 Terminal-Bench 2.1 双基准，拆解编码 Agent harness 中规划/动作空间/上下文管理各自的贡献。"
---

# An Empirical Study of Harness Design for Coding Agents（编码 Agent 脚手架设计实证研究）

> 📅 2026-09-20 | 🏷️ 前沿论文 | ⭐ HF upvotes 55
> 🔗 原文：https://huggingface.co/papers/2609.20804

## 是什么

第一篇把编码 Agent 的 harness（脚手架）拆开来做组件级对照实验的系统研究：固定执行循环不变，只替换三个组件——规划（planning）、动作空间（action space）、上下文管理（context management），在 4 个模型、176 组匹配设置下，用 SWE-Bench Verified 与 Terminal-Bench 2.1 两大基准量化每个组件的贡献。

## 🔍 小白解读

### 先说几个词

- **Harness（脚手架）**：包在模型外面的工程框架——给模型定计划、递工具、管记忆的那层代码，同一个模型换脚手架成绩可能天差地别。
- **SWE-Bench Verified**：用真实 GitHub 修 bug 任务考验 Agent 的权威基准，"人工审核版"，作弊空间小。
- **Terminal-Bench**：考察 Agent 在命令行终端里干活能力的基准，更贴近运维与工程现场。
- **规划（planning）**：Agent 先拆解任务再动手的能力，类似施工前先画图纸。
- **动作空间（action space）**：允许 Agent 用哪些工具、执行哪些操作，像给工人的工具箱里放什么工具。
- **上下文管理（context management）**：决定 Agent 每一步能看到哪些信息，像控制工人桌面上摊哪些文件。

### 这篇到底在说什么

打个比方：同一个司机（模型），换不同的车（harness），比赛成绩差多少？以前大家只比"整车成绩"，说不清是发动机好还是轮胎好。这项研究把驾驶方式固定住（执行循环不变），然后只换零件：换规划模块、换工具箱配置、换信息呈现方式，一共跑了 176 组匹配的组合、覆盖 4 个模型，在两个权威基准上量化每个零件的贡献。结论的意义在于：编码 Agent 的成绩是"模型 × 脚手架"的乘积，厂商演示里藏着的脚手架红利，采购时值得单独问价。

### 这跟普通人有什么关系

用 Copilot、Claude Code 这类编码 Agent 的开发者，偶尔会发现"换个提示词结构/换个工具配置，效果翻倍"——这篇论文解释了为什么：脚手架组件的设计本身就是一大变量。企业采购 Agent 产品时，也因此多了一个专业提问的角度。

## 为什么值得架构师关注

- **采购归因**：评估编码 Agent 产品时，把"模型版本收益"与"harness 设计收益"分开归因，避免为脚手架红利支付模型溢价。
- **自建路线**：自研 harness 的团队可以直接套用论文的三组件框架做消融实验（ablation），把迭代从"凭感觉调 prompt"升级为组件级回归测试。
- **成本杠杆**：组件级优化通常比升级更大模型便宜得多，是 agent 平台性价比优化的第一优先级。
- **基准方法**：双基准 × 匹配设置的实验设计本身可以抄，作为内部 Agent 评测的模板。

## 核心内容

- 实验规模：176 组匹配设置、4 个模型、SWE-Bench Verified + Terminal-Bench 2.1 双基准，执行循环固定。
- 变量设计：规划、动作空间、上下文管理三个组件可替换，实现组件级比较（此前研究多把 harness 当黑盒整体评估）。
- HF upvotes 55，是今日 Agent 工程方向热度最高的论文之一。
- 核心结论方向：harness 组件设计对长程软件工程表现影响显著，且不同模型对各组件的敏感度不同。

## 行动建议

把论文的三组件框架套到自家 Agent 评测流程上，做一次小规模消融；采购谈判时要求厂商提供 harness 级别的归因数据。正在自建编码 Agent 平台的团队建议精读原文。
