---
title: "Show HN: Let your AI agents paint big arrows, boxes and text on your screen（让 AI Agent 在你屏幕上画大箭头）"
shortTitle: "AI Agent 屏幕标注工具"
sidebarGroup: "2026-10-10"
order: 1
date: 2026-10-09
category:
  - "每日 AI 简报"
tag:
  - "工程 & Agent"
description: "一个让 AI Agent 直接在用户屏幕上画箭头、方框和文字的开源 CLI 工具，补上人机协作里『指给你看』的沟通通道，HN 单日 368 分。"
---

# Show HN: Let your AI agents paint big arrows, boxes and text on your screen（让 AI Agent 在你屏幕上画大箭头）

> 📅 2026-10-09 | 🏷️ 工程 & Agent | ⭐ HN 368分/161评论 · GitHub ⭐449（7天）
> 🔗 原文：https://github.com/franzenzenhofer/big-arrow-on-the-screen ｜ 💬 HN 讨论：https://news.ycombinator.com/item?id=50018817

## 是什么

一个叫 big-arrow-on-the-screen（命令名 `bigarrow`）的 macOS 命令行工具，让 AI Agent 直接在你的屏幕上画大箭头、方框和文字，指出"你要点的按钮在这里"。它同时提供 Claude Code / Codex 的 Skill 形式集成，MIT 协议开源，用 Swift 编写，仓库 2026-10-08 创建，7 天拿下 449 星，HN 上 368 分、161 条评论。

## 🔍 小白解读

### 先说几个词

- **AI Agent**：能替你干活儿的 AI 程序，不只是陪你聊天，还能真的去改文件、跑命令、操作电脑。
- **CLI**：命令行工具，就是在黑底白字的终端窗口里敲一条命令就能运行的小程序。
- **Skill**：给 AI Agent 用的"技能说明书"，装上之后 agent 就学会了一项新本领，这里就是"会在屏幕上画箭头"这项本领。
- **覆盖层**：浮在所有窗口最上面的一层透明"玻璃"，箭头就画在这层玻璃上，不会挡住你点下面的东西。
- **MIT 协议**：一种非常宽松的开源协议，基本意思是"随便用，别告我"。

### 这篇到底在说什么

AI Agent 现在能帮你改代码、跑测试，但它跟你沟通只有一条路：往终端里打印文字。打个比方，这就像一个同事隔着墙冲你喊："点击那个对话框里的允许按钮！"——可你根本不知道他说的是哪个对话框。这个工具做的事很简单：让 agent 在你屏幕上、在那个按钮旁边，画一个真的大箭头，还配一句"Franz，点允许"。画出来的覆盖层可以点击穿透（你照常点下面的窗口），画完会自动消失，不打扰你干活。集成方式是一条 CLI 命令，再加上一个给 Claude Code 或 Codex 用的 Skill，agent 就"学会"了这项技能。作者用 Swift 写了一个二进制文件，没有常驻后台进程，画图甚至不需要任何 macOS 权限。项目 2026-10-08 才创建，7 天就攒了 449 星，HN 讨论 161 条，说明"agent 怎么跟人沟通"确实戳中了很多人。

### 这跟普通人有什么关系

如果你用过 AI 编程助手，一定经历过"它让你点某个按钮，你找半天"的窘境。装上这类工具，agent 就能像站在你旁边的同事一样，直接指给你看——尤其是给爸妈或不懂技术的同事演示时，一个粉色箭头比十句解释都管用。

## 为什么值得架构师关注

Agent 工作流里的人审（human-in-the-loop）环节长期只有文字 diff 和日志两条通道，缺少"在真实 UI 上指认"这种空间化沟通手段。这个项目提供的是一个极低成本的参考实现：原生 Swift 单二进制、无常驻进程、无遥测、绘制不需要额外 macOS 权限，覆盖层可点击穿透并自动消退——这些都是把"可视化辅助"塞进现有 agent 流程时最容易被忽略的工程细节。接入成本就是一行 CLI 调用加一个 Skill 文件，评估半天就能出结论，适合作为团队 agent 工作流中人机交互环节的补充件，而不是替换件。

## 核心内容

- 一条 CLI 命令即可让 agent 在屏幕上画箭头、方框、文字，例如 `bigarrow point --element "Allow" --app "System Settings"`，支持指定应用、窗口元素、箭头方向、颜色和大小。
- 覆盖层浮于所有窗口和 Space 之上，点击可穿透、不抢键盘焦点，画完自动消失；绘制本身不需要任何 macOS 权限。
- 以 Claude Code / Codex 的 Skill 形式开箱集成，也提供了常见场景脚本：系统设置授权、Keynote 三步教学、打印对话框存 PDF、十几个 Chrome 标签页里指认正确的一个。
- 单个 Swift 二进制：无守护进程、无菜单栏图标、无账号、无遥测，MIT 协议开源。
- 仓库 2026-10-08 创建，7 天 449 星；HN 368 分、161 条评论（2026-10-09）。

## 行动建议

- 让编码 agent 做 UI 改动验收时试用：改完界面让它在屏幕上圈出改动点，替代"请查看 diff"。
- 给非技术同事或家人演示 agent 工作成果时，用箭头标注代替口述操作步骤。
- Mac 团队可花半小时做集成评估：装上 CLI、把 Skill 挂进现有 agent 流程，跑两个真实场景看体验，再决定是否推广。
