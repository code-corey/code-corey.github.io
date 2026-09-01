---
title: "0008 总结：给 agent 换皮的三条路线与 borrow/build 清单"
sidebarGroup: "Pi Web 源码"
shortTitle: "0008 总结 borrow/build"
order: 8
date: 2026-09-01
category: "源码剖析"
tag:
  - "Pi Web"
  - "源码"
  - "Agent"
  - "Next.js"
description: "Pi Web 源码系列完结篇：PTY 壳、协议重写、进程内 SDK 三条路线对比，pi-web 的 borrow vs build 全清单，以及八篇连载沉淀的十条可迁移设计模式。"
---

# 0008 · 总结：给 agent 换皮的三条路线与 borrow/build 清单

> **源码仓库解读 · Pi Web 系列完结篇**
> 上接：[0007 安全边界](./0007-security.md)
> 系列导航：[0001](./0001-panorama.md) → [0002](./0002-binding-inprocess.md) → [0003](./0003-binding-sse.md) → [0004](./0004-session-format.md) → [0005](./0005-tui-bridge.md) → [0006](./0006-evolution.md) → [0007](./0007-security.md) → 本篇

八篇走完，把结论收拢成三张清单：路线对比、borrow/build 划账、可迁移的模式。

## 路线 A/B/C：给 agent 做 Web 壳的三种姿势

| | A · PTY 终端壳 | B · 协议重写 | **C · 进程内 SDK（pi-web）** |
|---|---|---|---|
| 做法 | spawn CLI + PTY，解析终端屏幕 | 自建 RPC 协议，agent 端改造适配 | import SDK，进程内持有 AgentSession |
| 保真度 | 差（文本屏幕反推结构） | 好（自定义协议） | 好（结构化事件对象） |
| 上游升级成本 | 低（黑盒） | 高（协议双端改） | 中（跟版本，适配面小） |
| 扩展生态 | 天然继承（终端渲染） | 全部要重写 | **整体桥接继承** |
| 工程难点 | 屏幕解析、尺寸协商 | 协议演进、双端一致性 | 热重载、对象生命周期、TUI 假设 |

pi-web 证明了 C 路线在"上游有自己的 SDK"时是性价比之王——但它的三个前提值得复述：**上游 SDK 有稳定的编程入口**（`createAgentSession` / `SessionManager`）、**事件是结构化的**（`session.subscribe`）、**格式有版本号和通用容器**（JSONL v3 + custom 条目）。没有这三个前提，A/B 路线反而更稳。

## borrow vs build：pi-web 的账本

**Borrow（从 pi 白拿的）**：

- 会话模型与 JSONL 格式（树、分叉、压缩、导出）
- 模型注册、OAuth/API key 存储认证（`AuthStorage`/`ModelRegistry`）
- 扩展/skills/prompts/themes 加载器（`DefaultResourceLoader`）
- 工具系统与工具名语义（`--models` glob 等）
- 内置子代理（以"内置扩展"形态实现，管理 UI 复用自家桥）
- 上下文文件发现（AGENTS.md/CLAUDE.md 拼系统提示词）

**Build（pi-web 自己的）**：

- 命令协议与生命周期（wrapper、注册表、空闲回收、fork 状态机）
- SSE 事件流与前端状态机（快照去重、run id、对账）
- 会话浏览的读路径（有界读取、多级缓存、路径映射）
- TUI→Web 桥（PlainTextTheme、92 列假终端、extension_ui_request）
- Web 独有体验：minimap、文件查看器、worktree 切换、PWA、Web Push、i18n ×3
- 安全边界（六道闸门，0007）

比例大致是 **borrow 六成、build 四成**，但注意 build 的四成几乎全是"Web 服务器当 agent 宿主"的本征难题——这一层换任何上游都要重写，才是这个仓库真正的资产。

## 十条可迁移的设计模式

1. **进程内 SDK 优先于子进程**：有结构化 API 就别解析文本协议；
2. **globalThis 注册表**：在会热重载的框架里管长生命周期对象；
3. **单飞锁 = 共享 Promise**：并发去重不靠布尔标志靠 await 同一个 Promise；
4. **两阶段提交语义**：preflight 受理后才返回 200，拒绝与运行期失败分开报；
5. **单调 run id**：一切"迟到事件复活幽灵 UI"问题的通用解；
6. **快照+缓冲的事件流握手**：先冲头、再握手、去重重放；
7. **白名单安全 + 单一判定点**：登记散布各处，判定只在一处；
8. **上游格式的私有扩展**：通用容器 + 版本号 + 明确缺省行为（`pi-web:tool-selection`）；
9. **桥接生态而非移植生态**：给"对面的世界"造一个诚实的假象（假终端、假主题），能映射的映射，不能的显式失败；
10. **文档化锁死架构决策**：AGENTS.md 军规 + ADR + 术语表，让 AI/新人/未来的自己都越不过安全线。

## 与 DeepSeek Harness 的遥相呼应

本站 [DeepSeek Harness 系列](../deepseek-harness/)附篇对比过 dsh × Pi × Claude Code 三种 harness 哲学。pi-web 恰好补上了第四个视角：**harness 之上的一层——壳的哲学**。dsh 说"一切皆插件"，pi 说"少即是多"，而 pi-web 的答案是"**寄生即共赢**"：不做平台，做平台最认真的一块拼图。它对上游的每分依赖都换回一分能力，对上游的每次跟随都换回一分兼容。5 个月 608 个提交，没有推翻过一次地基——**选对寄生对象、守住集成边界、把跟随做成纪律**，这就是 pi-web 全部的架构故事。

## 系列完结

| 篇 | 一句话总结 |
|---|---|
| 0001 | pi-web = pi SDK 的进程内宿主 + 浏览器第二张脸 |
| 0002 | 命令通道：wrapper 协议、globalThis、两阶段 prompt、fork 状态机 |
| 0003 | 事件通道：SSE 快照去重、优雅期、run id、对账 |
| 0004 | 数据层：JSONL 树、两种读法、两种分叉、私有扩展条目 |
| 0005 | 生态桥：假主题、假终端、extension_ui_request 协议 |
| 0006 | 演进：一夜 MVP → 跟版纪律 → 7 月爆发 → 子代理灰度 |
| 0007 | 安全：六道闸门，白名单 + 单一判定点 + 诚实降级 |
| 0008 | 收官：三条路线、borrow/build、十条模式 |

完。
