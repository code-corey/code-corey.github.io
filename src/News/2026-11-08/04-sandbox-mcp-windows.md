---
title: "sandbox-mcp: Fresh, throwaway Windows machines for testing your apps（sandbox-mcp：给 Agent 的一次性 Windows 沙箱）"
shortTitle: "一次性 Windows 沙箱 MCP"
sidebarGroup: "2026-11-08"
order: 4
date: 2026-11-08
category:
  - "每日 AI 简报"
tag:
  - "值得研究的仓库"
description: "shanselman 开源 sandbox-mcp：基于 Windows Sandbox 给 Agent 秒级提供真实一次性 Win11 虚机，自动部署、点击、抓崩溃、留证据再销毁。"
---

# sandbox-mcp: Fresh, throwaway Windows machines for testing your apps（sandbox-mcp：给 Agent 的一次性 Windows 沙箱）

> 📅 2026-11-08 | 🏷️ 值得研究的仓库 | ⭐ ⭐263（2天）｜JavaScript
> 🔗 原文：https://github.com/shanselman/sandbox-mcp

## 是什么

作者 shanselman（Scott Hanselman）开源的 sandbox-mcp，一句话概括 README 的主张：**给你的 AI Agent 一台全新的 Windows 电脑，用完就扔**。它自动化 Windows Sandbox，让 Agent 通过 CLI（`sbx`）或可选的 MCP 适配器，在每次都干净启动的真实 Win11 环境里部署应用、真实点击界面、捕获崩溃、留存证据，然后整机销毁。v1.2.0 提供便携版 CLI + MCP server，内置 Node.js 免环境安装。发布 2 天 263 星。

## 🔍 小白解读

### 先说几个词

- **Windows Sandbox**：Win10/11 专业版以上自带的轻量一次性虚拟机——关掉窗口，里面的所有痕迹全部消失，是系统级"临时房间"。
- **MCP（Model Context Protocol）**：AI 与外部工具连接的标准协议，让 Agent 能"发现并调用"沙箱里的能力。
- **UIA（UI Automation）**：Windows 的官方 UI 自动化接口，程序可以像人一样检查界面元素、点击、输入文字——比截图点坐标可靠得多。
- **Provisioning（环境预装）**：往干净系统里装运行库等依赖；本项目强调默认不装、必须显式请求，保证"全新客户机"的真实性。

### 这篇到底在说什么

AI 编程助手最让人提心吊胆的场景是它在你真机上乱装东西。sandbox-mcp 给了另一个解法：让 Agent 在一台"刚出厂的 Windows 11"里干活——boot、部署你的应用、真实驱动界面、抓崩溃、保存证据、删掉整台机器。README 的招牌演示直击痛点："我这能跑，客户机器跑不起来"——在一台全新的、断网的沙箱里，30 秒内复现了缺失 VC++ 运行库导致的崩溃，退出码与诊断信息一并留存。实测 GUI 自动化采样端到端约 40-50 秒。证据链完整：PNG 截图、限定时长录像、自包含 HTML 报告、可选 MP4。

### 这跟普通人有什么关系

你用的 AI 编程工具如果在沙箱里干活，你的电脑就不再被它搞乱；软件公司用这类工具测试，你装到的版本"别人机器上也能跑"的概率更高。

## 为什么值得架构师关注

这是 Agent 代码执行隔离层选型的关键样本：容器（Docker）适合服务端，microVM（Firecracker）适合 Linux 服务器侧，而 **Windows 桌面应用的 UI 测试只有 Windows Sandbox 是"真 Windows"**。架构评估点：CI 集成方式与 40-50 秒的启动开销是否可接受；默认断网 + 显式 provisioning 的安全基线如何嵌入策略；证据留存（截图/录像/HTML 报告）对审计与回归分析的价值。它同时是本期 [09 篇](09-claude-code-secret-leaks.md)的呼应——Agent 风险治理 = 权限控制 + 执行隔离，两手都要硬。

## 核心内容

- 定位：给 Agent 的真实一次性 Windows 11 机器（基于 Windows Sandbox），用完即销毁；CLI 与 MCP 适配器双接口、同一引擎。
- 实测性能：GUI 自动化采样端到端约 40-50 秒；原生 UIA 检查/点击/输入，覆盖 WinUI/WPF/WinForms/Win32 与 MSIX/AUMID 激活。
- 依赖诊断：`sbx deps` 定位缺失运行库（演示：全新机器缺 VC++ Runtime，30 秒内复现崩溃并给出退出码）；`--provision auto` 仅在显式请求时安装。
- 证据链：PNG、限定时长录像、自包含 HTML、可选 MP4；进程状态/退出码/崩溃事件留存，支持完全断网运行。
- 发布形态：v1.2.0 便携 CLI + 可选 MCP server，内置 Node.js 与 guest agent，免预装环境。

## 行动建议

做 Windows 桌面产品 + AI 测试 Agent 的团队直接试用 v1.2.0，接进 CI 作为"客户环境兼容性"门禁；部署前确认宿主机满足 Windows Sandbox 要求（专业版以上，属公认系统要求）与公司虚拟化策略。Linux/macOS 团队了解即可——但"一次性环境跑 Agent"的隔离模式值得抄。
