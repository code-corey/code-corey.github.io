---
title: "Claude Code's \"Don't Ask Again\" exposes passwords in 1,122 public GitHub files（Claude Code「不再询问」致 1122 个公开仓库文件泄露密码）"
shortTitle: "Claude Code 泄密事件"
sidebarGroup: "2026-11-08"
order: 9
date: 2026-11-07
category:
  - "每日 AI 简报"
tag:
  - "安全 & 评测"
description: "Apiiro 报告：Claude Code 的「Don't Ask Again」批量批准机制与 1,122 个公开 GitHub 文件中的密码暴露相关；企业级 Agent 权限治理敲响警钟。"
---

# Claude Code's "Don't Ask Again" exposes passwords in 1,122 public GitHub files（Claude Code「不再询问」致 1,122 个公开仓库文件泄露密码）

> 📅 2026-11-07 | 🏷️ 安全 & 评测 | ⭐ HN 125分/93评论
> 🔗 原文：https://apiiro.com/blog/coding-agents-leaking-secrets-github-dont-ask-again

## 是什么

应用安全公司 Apiiro 发布报告：编码助手 Claude Code 的「Don't Ask Again」（不再询问）批准机制，与 **1,122 个公开 GitHub 文件中的密码暴露**相关联。HN 125 分、93 条评论，开发者社区围绕"批准疲劳"与工具默认值设计展开了激烈讨论。这是编码 Agent 普及后出现的新型泄露通道：风险不在模型本身，而在权限设计。

## 🔍 小白解读

### 先说几个词

- **编码 Agent**：AI 帮你写代码、改文件、跑命令的开发工具（Claude Code、Cursor 等），不是聊天，是真动手。
- **权限批准**：Agent 每次要动文件、执行命令前会弹出确认框，等人点头。
- **「Don't Ask Again」**：勾选后，同类操作不再询问——一次方便，长期静默放行。
- **Secrets 泄露**：密码/API key 写进公开仓库。公认常识：GitHub 公开仓库会被自动化机器人分钟级扫描，泄露即视为已失陷，必须轮换。
- **批准疲劳**：确认框太频繁，人开始无脑点"允许"——安全机制被使用者自己拆掉。

### 这篇到底在说什么

打个比方：家里来了个勤快的钟点工，每开一个抽屉都要问你。问得多了，你说"以后别问了"。于是某天他整理你抽屉时，把一张写着银行卡密码的纸顺手夹进了寄给邻居的信封——信封（公开仓库）谁都能拆。Apiiro 的扫描发现，这种"一次批准、长期放行"的模式与 1,122 个公开 GitHub 文件里的密码暴露相关：敏感文件被 Agent 写入、提交、推送，全程无人真正过目。对企业来说，这意味着编码 Agent 的引入需要配套权限治理，而不能只当"更快的打字员"。

### 这跟普通人有什么关系

团队里任何人在用 AI 编程工具，你的密钥就可能已经躺在公开仓库里。个人开发者同样该立刻检查自己的仓库——机器人比你先看到你的密码。

## 为什么值得架构师关注

这是 Agent 权限治理的教科书案例，直接影响企业落地编码 Agent 的安全基线设计：**批准粒度**（按文件/目录/命令类型分级）、**never-ask 的范围上限**（敏感路径强制询问，不可被全局豁免）、**检测前置**（secrets 扫描移到 pre-commit/push 阶段而非事后）。与本期 [04 篇](04-sandbox-mcp-windows.md)构成同一问题的两面：权限控制 + 执行隔离，缺一不可。

## 核心内容

- Apiiro 报告将 1,122 个公开 GitHub 文件中的密码暴露与 Claude Code「Don't Ask Again」机制相关联（具体扫描方法学与统计口径以原文为准）。
- HN 125 分/93 评论：开发者对"批准疲劳"与工具默认值的设计责任展开激烈讨论。
- 机制背景（公认常识）：公开仓库中的 secrets 会被自动化机器人分钟级扫描盗用（挖矿、API 滥用），发现即应按已失陷处理并轮换凭证。
- 影响面：不止个人项目——企业内 fork、镜像、外包协作仓库同样暴露在同类风险中。
- 本期关联：Agent 风险治理 = 权限（本篇）+ 隔离（sandbox-mcp）的组合拳。

## 行动建议

今天就做：① 全组织启用 GitHub secret scanning 与 push protection；② 审计近 90 天有 Agent 参与的仓库历史；③ 收紧编码 Agent 的「不再询问」范围——目录白名单 + 敏感路径强制询问；④ 轮换任何疑似暴露的凭证。检查自己系统——这是本期唯一"立即执行"级的行动项。
