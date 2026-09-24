---
title: "Oldcircle/geo-sleuth（照片地理定位 Agent 技能）"
shortTitle: "geo-sleuth 照片定位"
sidebarGroup: "2026-09-24"
order: 6
date: 2026-09-18
category:
  - "每日 AI 简报"
tag:
  - "值得研究的仓库"
description: "给 Claude Code、Codex、Cursor 等 6 大编程 Agent 用的照片地理定位技能：融合 OSM 几何、高程天际线、卫星影像与街景并给出推理链，一周 294 星。"
---

# geo-sleuth: An agent skill that finds where a photo was taken（照片地理定位 Agent 技能）

> 📅 2026-09-18 | 🏷️ 值得研究的仓库 | ⭐ ⭐294（7天）
> 🔗 原文：https://github.com/Oldcircle/geo-sleuth

## 是什么

一个一周拿下 294 星的 Python 开源项目：给编程 Agent 用的照片地理定位技能。官方描述："An agent skill that finds where a photo was taken — OpenStreetMap geometry, elevation skylines, satellite imagery and street view — and shows its work. Works with Claude Code, Codex, Cursor, Gemini CLI, OpenCode and GitHub Copilot."

## 🔍 小白解读

### 先说几个词

- **Agent Skill**：给编程 Agent 加装的一包「专业技能」，像给万能工具钳换上一个专用批头，装上就会干某类活。
- **OSINT**：开源情报，只靠公开可得的信息做调查，像侦探只用报纸、地图和街景破案。
- **OpenStreetMap**：志愿者共建的免费世界地图，号称地图界的维基百科。
- **交叉验证**：多个独立证据指向同一结论才算数，就像消息要找两个信源确认。

### 这篇到底在说什么

你给 geo-sleuth 一张照片，它就动用多种公开数据来回答「这是在哪拍的」：比对 OpenStreetMap 的道路与建筑几何、用高程数据核对画面里的天际线轮廓、查卫星影像和街景做确认，并且把推理过程完整展示出来。打个比方：它像一个拿着地图册、地球仪和街景照片的侦探，逐条线索排查，最后把破案笔记摊开给你看。最值得注意的设计是它的载体形态——「Agent Skill」不是独立 App，而是一份能被 Claude Code、Codex、Cursor、Gemini CLI、OpenCode、GitHub Copilot 六大主流编码 Agent 直接复用的技能包。写一份技能、六个平台通用，这正是「可移植能力单元」模式的典型样本。方法论上，它不赌单一模型的「眼力」，而是多证据交叉验证，结论可追溯、可复核。当然，它也是一面镜子：随手分享的照片，可能正暴露着你的位置。

### 这跟普通人有什么关系

发照片前想想背景里的山、楼和街牌——如今的 AI 已经能据此推断你大致在哪。对孩子和老人的照片分享习惯，也值得多做一句提醒。

## 为什么值得架构师关注

「Agent Skill」作为可移植能力单元的模式值得纳入工具链设计：技能与宿主解耦，一份投递覆盖六大编码 Agent，边际成本趋近于零，团队内部知识（检索流程、领域方法论）可以沉淀为技能库而非散落的 prompt。技术上，多源地理证据（OSM 几何、高程天际线、卫星影像、街景）的交叉验证管道是确定性数据 + LLM 推理结合的好范例，推理链可审计。风险面：这类 OSINT 能力被滥用作定位追踪的隐忧真实存在，企业内部署需明确使用边界。

## 核心内容

- 一份 Agent Skill 跨 Claude Code、Codex、Cursor、Gemini CLI、OpenCode、GitHub Copilot 六大 Agent 复用。
- 多证据地理定位：OpenStreetMap 几何 + 高程天际线比对 + 卫星影像 + 街景，结论附推理链（shows its work）。
- Python 实现，2026-09-18 创建，一周 294 星。
- 体现 OSINT 地理定位的经典方法论：不依赖单一信号，交叉验证后才下结论。

## 行动建议

研究其仓库（https://github.com/Oldcircle/geo-sleuth ）学习 Agent Skill 的组织方式，评估把团队内部方法论封装成可移植技能的可行性；普通人层面的行动是养成分享照片前检查背景信息的习惯。
