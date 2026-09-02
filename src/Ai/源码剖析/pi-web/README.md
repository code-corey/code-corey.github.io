---
title: Pi Web 源码
index: false
icon: laptop-code
article: false
---

# Pi Web 源码：给 Agent 换第二张脸

> 仓库：[agegr/pi-web](https://github.com/agegr/pi-web)（npm 包 `@agegr/pi-web`，v0.8.11）
> 剖析对象：pi coding agent 的官方生态 Web UI —— [earendil-works/pi](https://github.com/earendil-works/pi)（本机安装 v0.84.3，即 [DeepSeek Harness 系列](../deepseek-harness/)附篇对比过的那个 Pi）
> 规模：608 个提交 / 约 5 个月 / 4.4 万行 TypeScript / 144 个测试文件

pi 是一个跑在终端里的 TUI 编码智能体。pi-web 没有重写它，而是把 pi 的 SDK **原样 import 进一个 Next.js 服务端进程**，在浏览器里长出了第二张脸：会话浏览器、流式聊天、文件管理、模型配置、子代理——而磁盘上的 `~/.pi/agent` 数据一个字节都没换格式。

本系列 8 篇回答两个核心问题：

1. **pi 和 web 是如何结合的？**——答案是"进程内 SDK + 命令协议 + SSE 事件流"三件套，外加一层把 TUI 扩展生态"骗"进浏览器的虚拟终端桥。
2. **功能是如何一点点加上去的？**——我们逐条分析了全部 608 个提交，从 3 月 18 日一夜间出现的 45 文件 MVP，到 7 月单月 264 个提交的爆发期，还原一条完整的生长轨迹。

## 阅读路线

- **想快速搞懂结合机制**：0001 → 0002 → 0003（机制三部曲）
- **想深挖数据层与兼容性**：0004 → 0005
- **想学习"渐进式长功能"的工程方法**：0006（本系列最"史书"的一篇）
- **要部署/二开 pi-web**：0007（安全边界必读）
- **想自研 agent 前端**：0008（borrow vs build 清单）

## 文章目录

<Catalog />
