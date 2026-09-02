---
title: "0006 演进史：608 个提交里的渐进式长成"
sidebarGroup: "Pi Web 源码"
shortTitle: "0006 演进史"
order: 6
date: 2026-09-01
category: "AI"
tag:
  - "Pi Web"
  - "源码"
  - "Agent"
  - "Next.js"
description: "Pi Web 源码系列第 6 篇：逐条分析 608 个提交，还原五个半月的生长轨迹——一夜 MVP、跟版之痛、7 月爆发期、子代理之战，以及 AI 协作开发的方法论沉淀。"
---

# 0006 · 演进史：608 个提交里的渐进式长成

> **源码仓库解读 · Pi Web 系列第 6 篇**
> 素材：agegr/pi-web 全部 608 个提交（2026-03-18 → 2026-08-26），逐条归类统计
> 上接：[0005 TUI 桥接](./0005-tui-bridge.md)

前四篇我们横切了 pi-web 的四层结构。这篇纵切：**这些功能是以什么顺序、什么节奏长出来的？**答案藏在这条按月分布的提交曲线里：

```
2026-03  ██████░░░░░░░░░░░░░░  42   MVP 诞生周
2026-04  ████████░░░░░░░░░░░░  54   功能铺开
2026-05  ████░░░░░░░░░░░░░░░░  21   平台迁移（最平静的一个月）
2026-06  ███████████░░░░░░░░░  59   渲染增强 + 移动端
2026-07  ██████████████████████████ 264  ★ 爆发期
2026-08  █████████████████░░░  168  子代理与推送，走向 0.8.x
```

提交类型分布同样健康：feat 174 / fix 168 / refactor 39 / chore 30 / docs 17 / perf 15——**一半的精力花在修复和重构上**，这不是 demo 项目的手笔。

## 第一阶段（3 月）：一夜 MVP，一周成形

第一个提交 `feat: pi-web - Next.js web interface for pi coding agent` 是**一次成型**的：45 个文件、约 5800 行，今天架构图的骨架全部在位——

- SSE 事件路由（`agent/[id]/events`）、命令路由（`agent/new`、`agent/[id]`）；
- `rpc-manager.ts`（276 行）：AgentSessionWrapper、globalThis 注册表、启动锁；
- 会话浏览、文件查看器、分支导航、minimap、模型选择。

MVP 已经选定了此项目的命运：**进程内 SDK + SSE**（见 0002），后来 5 个月没有动摇过这个地基。随后一周是快速找齐产品下限：

- 03-23：模型预选、模型配置 UI、**工具预设**（替代单个工具开关）；
- 03-24：npm 包分发 + Windows 兼容（顺手 revert 掉了用 pkg 打单文件可执行的路子）；token 统计；移动端响应式；中文化开始；
- 03-25：Skills 面板；
- 03-26：**OAuth 登录系统** + SSE 心跳与自动重连 + "迁移到 pi-coding-agent 库 API"重构——注意这个节奏：**功能提交里混着持续偿还架构债的重构**。

三天后 `bump pi-coding-agent to v0.64.0`——跟版生涯开始。

## 第二阶段（4 月）：文件与多媒体，每个 commit 一件事

4 月的 54 个提交几乎一提交一功能，主题是"让 Web 比 TUI 更适合看东西"：

- 文件查看器三连：语法高亮+行号 → 实时同步+diff 视图 → Markdown/PDF/DOCX 预览；
- 图像附件（拖拽/粘贴/选择器 + 全窗口 drop zone）；
- 系统提示词查看器、分支导航上顶栏、thinking 等级选择器；
- **fork 重构**：`reimplement fork operation using SessionManager API`——放弃自己手搓复制，改用 SDK 的 `createBranchedSession()`，这就是 0004 里那个 fork 实现的由来；
- 月末开始出现值得注意的细节：`add DeepSeek compatibility shim` 后第三天 `remove DeepSeek compatibility shim after upstream pi-coding-agent support`——**自己打了补丁，上游跟上后立刻删**，寄生项目的自我修养。

## 第三阶段（5 月）：最平静的一个月，做完了一件大事

21 个提交，但有一个是分水岭：

> 05-08 `refactor: migrate from @mariozechner/pi-coding-agent to @earendil-works/pi-coding-agent`

pi 上游换组织（badlogic/mariozechner → earendil-works），pi-web 一次提交完成包名迁移。能如此平静地跟住上游换名，靠的是**只从 SDK 的少量入口 import**——门面窄，迁移就窄。这个月其余的是暗色模式（外部贡献者的 PR：View Transitions 圆形擦除动画）、OAuth device code 流、音频预览、模型延迟测试。

## 第四阶段（6 月）：渲染军备赛与第一次性能危机

会话越用越大，两个栈溢出级别的 bug 浮出水面：

- 06-04 `fix: compress linear tree chains instead of removing tree field to prevent JSON.stringify stack overflow`
- 06-09 `fix: preserve terminal leaves in compressTree and use iterative chain descent`

线性超长会话让递归序列化爆栈，两轮修复才找到"压缩线性链 + 迭代下降"的完整解。同月性能与体验并进：智能自动滚动（用户意图检测）、LaTeX/KaTeX、Mermaid、HTML 导出、移动端适配六连提交、slash 命令面板、**扩展 UI 支持落地**（dialogs/widgets/status bar——0005 那套桥接的最初版本）。06-26 版本号跳到 0.7.0。

## 第五阶段（7 月）：爆发期，264 个提交从哪来

7 月单月 264 个提交，日均 8.5 个。拆开看是四条并行战线：

**性能专线**（perf 15 条里 13 条在这个月）：历史消息 IntersectionObserver 懒加载、thinking 内容延迟解析、工具结果图片移出初始加载、session 路径双向缓存、`/api/models` 60s TTL（避免重复初始化 SDK 服务）、streaming 时跳过语法高亮……每条都小而独立，**性能工作被切成了一次次可独立回滚的提交**。

**功能面**：运行状态灯、git diff 查看器、自动会话命名、`!`/`!!` shell 前缀、键盘快捷键、**i18n 框架**（英/中双语，月末 586 行消息文件 × 2）、**PWA 支持**、**Basic Auth 密码保护**、**worktree 切换器**、**不可信项目受限模式**（安全篇的主角之一）。

**发布流水线**：7-01 到 7-22 连发 v0.7.1 → v0.8.0，17 个版本。`release` 脚本一行：`npm version patch && next build && npm publish`。

**外部贡献开始进来**：PR #80（扩展模型修复）、#85、#88（codex-review 流程审查）陆续合入——项目从个人仓库变成有贡献者的小生态。

## 第六阶段（8 月）：子代理之战与收尾打磨

8 月的重头戏是**内置子代理**（08-16 起连续 15+ 个提交）：

```
08-16  feat: add built-in inspectable subagents      ← 核心落地
08-16~17  restore / refactor: snapshot-only / enforce read-only tools
08-20  feat: add built-in subagent toggle            ← 全局开关（默认关）
08-20  feat: add subagent session switcher           ← 会话切换器
08-20  feat: add persisted chat-only sessions
08-21  feat: pass text files to subagents
08-25  fix: resolve built-in subagent integration regressions
08-25  chore: disable built-in subagents for release ← 发布前一键关闭
```

注意最后一条：**功能做完了，发布前先禁用**。子代理涉及"往用户会话里注入扩展、拦截保留工具名"这类高风险行为，先灰度、观察、再放开——成熟软件的发版纪律。配套的还有 ADR 0003（激活与扩展优先级）和"用 ADR 0002 的资源快照持久化子代理配置"。

同月的第二主题是**触达**：Web Push 完成通知（VAPID 密钥存 `~/.pi/web-push.json`）、浏览器通知、繁体中文 locale、`--help` 启动参数、版本检查退出开关。08-26 的 v0.8.11 收在"Project Info 显示 git 分支/worktree"这个体验细节上。

## 跟版全记录：寄生者的宿命与纪律

5 个月里 pi SDK 的版本跟随（commit 信息里可考的）：

```
0.64.0 → 0.65.0 → 0.65.2 → 0.66.1 → 0.67.1 → 0.70.0 → 0.70.2 → 0.71.0
→ [包名迁移 @mariozechner → @earendil-works]
→ 0.78.0 → 0.78.1 → 0.79.0 → 0.79.10 → 0.80.2 → … → 0.84.1 → 0.84.2 → 0.84.3
```

15+ 次升级，全部是**独立小提交**（`chore: upgrade pi dependencies to …`），升级引入的适配紧随其后（如 0.70.0 的"adapt to new tool configuration API"）。纪律可总结为三条：

1. **小步快跟**：每次只跟一个小版本，适配面立刻暴露、立刻修；
2. **自造补丁限期回收**：DeepSeek thinking shim 三天 lifecycle；
3. **格式/API 永远委托上游解析**：模型 glob 语义、会话投影全部走 SDK 函数，自己的实现只做缓存和 IO。

## 方法论沉淀：这个仓库怎么管理"一点点"

最后回到那个最特别的证据——**这个仓库的大部分代码是 AI 协作写成的**，而它管理这一点的方式是把经验固化成文档资产：

- **AGENTS.md（234 行）**：开发手册。架构图、文件地图、以及十几条"陷阱军规"（fork 夺舍、Windows 路径、glob 委托、双列表刷新……）。每条都是某次真实 bug 的墓志铭；
- **CONTEXT.md**：术语表，强制"Host Runtime Environment / Project Command Environment"的用语一致——防止 AI 在环境变量隔离这种高危区域语义漂移；
- **docs/adr/**：3 份正式 ADR，只写"非显而易见"的决策（bash 环境隔离、chat-only 资源策略、子代理开关）；
- **144 个 `*.test.mjs`**：与源码同目录共置，`node --test` 直跑；
- **conventional commits 全覆盖**：608 条提交几乎零违反，release note 自动化的基础。

一句话：**把"AI 能稳定输出的部分"（遵守文档、写测试、规范提交）制度化，把"AI 不稳定的部分"（架构决策、安全边界）文档化锁死。**这套打法本身就值得抄。

> 下一篇：[0007 · 安全边界：一个能执行命令的网页如何关进笼子](./0007-security.md)
