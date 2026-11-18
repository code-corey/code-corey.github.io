---
title: "Running coding agents without handing them my credentials（不交出凭证运行编码智能体）"
shortTitle: "lend：凭证隔离跑 Agent"
sidebarGroup: "2026-11-18"
order: 5
date: 2026-11-17
category:
  - "每日 AI 简报"
tag:
  - "工程 & Agent"
description: "开发者实践：agent 跑在可丢弃 VM，笔记本凭证永不交给 agent；自研 lend 以审批+租约+审计方式让远程 agent 安全使用本机工具，HN 128 分引发凭证边界大讨论。"
---

# Running coding agents without handing them my credentials（不交出凭证运行编码智能体）

> 📅 2026-11-17 | 🏷️ 工程 & Agent | ⭐ HN 128 分 / 112 评论
> 🔗 原文：https://blog.antonio.cx/running-agents-with-lend
> 💬 讨论：https://news.ycombinator.com/item?id=50526152

## 是什么

开发者 antonio 公开自己的多 agent 工作流安全架构：编码 agent 全部跑在可随时销毁的远程 VM 上，笔记本只保留 SSH 密钥、1Password 保险库等敏感凭证；当 agent 需要用到本机工具时，通过自研工具 lend 以「审批 + 租约 + 审计」的方式临时借用，全程凭证对 agent 不可见。HN 评论 112 条，是近期 agent 安全讨论最热烈的一篇实践文。

## 🔍 小白解读

### 先说几个词

- **凭证（credentials）**：登录钥匙串——SSH 私钥、云账号登录态、API 令牌。交给 agent 就像把自家钥匙交给陌生家政：大概率没事，但出事就是大事。
- **一次性 VM（可丢弃虚拟机）**：用完即扔的远程电脑。agent 在「出租屋」里干活，你的「家」（本机）钥匙它碰不到，房子脏了直接退租。
- **审批卡（approval card）**：agent 遇到需要权限的操作时，在你手机上弹出一张「是否允许」的卡片。类似银行转账前的指纹确认。
- **租约（lease）**：临时授权，到点自动收回。像共享充电宝：借你 30 分钟，超时自动断电，不用你记得还。
- **审计日志**：记录谁在什么时候用了什么权限。相当于门口的监控录像，事后能回放追责。

### 这篇到底在说什么

这位作者日常同时开好几个编码 agent：Claude Code 在一个仓库干活、Codex 在另一个分支做评审，还有长期任务在后台跑，甚至让 agent 互相检查工作。这些 agent 都不在他的笔记本上，而是跑在一台用完就重置的远程虚拟机里，笔记本上只留下真正值钱的东西：SSH 密钥、密码管理器、已登录的命令行工具。问题来了：agent 干活时难免要用到「只有笔记本上才有」的工具，比如查询某个需要登录的服务。他的解法是自研的 lend：agent 需要时提出申请，他在手机上通过审批卡确认，lend 才让 agent 临时用一下笔记本上的对应工具——而且密钥本身 agent 自始至终看不见，授权到期自动收回，每一步都留有记录。配套的两个工具也值得一提：herdr 是专门面向 agent 的终端复用器，每个窗口感知 agent 状态、还能让 agent 指挥另一个 agent；Ovis 把这一切搬到手机上，agent 提问就变成一张推送卡片。作者还诚实地写了「lend 不防护什么」的边界清单。

### 这跟普通人有什么关系

哪怕你只是让 AI 助手帮你发邮件、整理文件，同理也适用：给它专用的小号，别给你主账号密码。AI agent 越能干，「最小权限」这条老规矩就越值钱。

## 为什么值得架构师关注

- **agent 凭证边界是当下最大空白**：多数团队的 agent 直接复用开发者本机凭证，一次提示注入即可横向移动。本文给出可复制的三层防御：隔离执行环境（一次性 VM）→ 审批网关（approval + lease）→ 全程审计。
- **审批不能停在「确认弹窗」**：lend 的关键设计是密钥对 agent 不可见（代理执行而非转交凭证）+ 租约到期自动收回，比常见的「human-in-the-loop 弹窗」高一个安全等级。
- **agent 指挥 agent 的治理**：herdr 让 agent 可以启动、提示、读取另一个 agent——多 agent 编排需要有统一的「状态面板 + 审批出口」，否则审批流在编排层被打穿。

## 核心内容

- 架构：agent 全部运行在可丢弃远程 VM（pico.sh 托管），笔记本仅保留 SSH 密钥、1Password、gh/cloud CLI 登录态
- **herdr**：面向 agent 的终端复用器，pane 级 agent 状态感知（工作/等待/完成）；提供 `herdr agent start/prompt/read` 命令，让 agent 驱动 agent、等待完成并读取输出
- **Ovis**：herdr 的手机/浏览器客户端，agent 会话以聊天形式呈现，审批请求转为卡片 + 推送通知，手机上即可回复 agent
- **lend**：远程 agent 经审批后使用本机工具；密钥对 agent 不可见；授权以租约（lease）形式管理；全程可审计（「Seeing what happened」章节）；支持在笔记本侧回答 agent 提问
- 作者明确列出「lend 不防护的场景」边界清单（诚实标注能力边界）
- HN 128 分 / 112 评论，评论区大量同类实践与争议（博文发布于 11-13，11-17 登上 HN）

## 行动建议

1. 盘点现有 agent 接入点的凭证暴露面：CI 令牌、开发机 SSH agent 转发、长期登录态的 CLI——按「agent 能否触达」重新分级。
2. 参照三层模型改造：执行环境隔离（容器/VM）+ 审批网关（代理执行密钥，而非下发）+ 审计留痕；至少先做到「agent 永远拿不到密钥明文」。
3. 多 agent 编排上线前，把「agent 启动 agent」的链路纳入审批与审计范围，别让二级 agent 绕过一级审批。
