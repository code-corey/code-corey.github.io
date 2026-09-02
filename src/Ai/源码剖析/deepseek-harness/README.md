---
title: DeepSeek Harness 源码
index: false
icon: robot
article: false
---

# DeepSeek Harness 源码：一切皆插件

> 仓库：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）· v0.1.2-alpha.2
> 底座：[Cordis](https://github.com/cordiverse/cordis) 插件框架（论文 arXiv:2608.25512）
> 规模：9078 文件 / 55+ 包 monorepo / 核心约 4.2 万行 TypeScript

DeepSeek AI 开源的 agent harness，口号 **"Everything is a Plugin"**——连 agent loop 本身都是可替换的插件行。本系列 9 篇（8 篇主线 + 1 篇附篇）从装配机制一路剖到厂商私有协议，所有代码摘录均基于本地克隆逐行核对。

## 阅读路线

- **想快速理解产品**：0001 → 0003 → 0007
- **想深挖 agent 原理**：0004 → 0005 → 0006（核心三部曲）
- **想自研插件/平台**：0002 → 0003 → 0007 → 0008
- **想横向选型**：附篇 + 0001

## 文章目录

<Catalog />
