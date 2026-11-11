---
title: "Show HN: Get your coding agent off ~2019 JavaScript, onto modern web primitives（别让编码 Agent 再写 2019 年的老 JS）"
shortTitle: "纠正编码Agent的老JS"
sidebarGroup: "2026-11-11"
order: 2
date: 2026-11-10
category:
  - "每日 AI 简报"
tag:
  - "工程 & Agent"
description: "GoogleChrome 官方发布 modern-web-guidance 仓库：把编码 Agent 从 ~2019 风格的 JavaScript 引导到现代 Web 原生能力，HN 239 分。"
---

# Show HN: Get your coding agent off ~2019 JavaScript, onto modern web primitives（别让编码 Agent 再写 2019 年的老 JS）

> 📅 2026-11-10 | 🏷️ 工程 & Agent | ⭐ HN 239 分/68 评论
> 🔗 原文：https://github.com/GoogleChrome/modern-web-guidance
> 💬 HN 讨论：https://news.ycombinator.com/item?id=50443812

## 是什么

GoogleChrome 官方组织在 GitHub 发布了 modern-web-guidance 仓库：一套用来「纠正」编码 Agent 的引导材料，让 AI 写前端时使用现代 Web 平台原生能力（web primitives），而不是停留在训练数据里占主导的约 2019 年风格的 JavaScript 写法。以 Show HN 形式发布，获 239 分。

## 🔍 小白解读

### 先说几个词

- **编码 Agent**：能自动读代码、写代码、改工程的 AI 助手（如各类 AI 编程工具的核心）。
- **Web 原生能力（web primitives）**：浏览器本身内置的功能，比如声明式动画、容器查询、原生组件——不需要自己引一堆第三方库就能用。
- **~2019 JavaScript**：指 AI 训练数据中大量沉淀的旧式写法——手写兼容层、自己造轮子，因为旧代码在互联网上存量最大。
- **引导/规则文件**：放进项目里给 Agent 看的「作业规范」，让它在生成代码时优先遵循约定。

### 这篇到底在说什么

打个比方：AI 编程助手像一个读遍了十年前旧教材的实习生——存量资料里老写法最多，所以它一出手就是过时的套路：能一行 CSS 解决的事，它给你引一个第三方库；浏览器早就有原生方案的场景，它还在手写兼容代码。GoogleChrome 团队把这个现象做成了一个正经仓库：提供一套引导材料，贴给任何编码 Agent 用，让它「更新知识」，优先使用浏览器现代原生能力。这本质上是承认了一个行业共识：Agent 的输出质量很大程度取决于你怎么约束它，而不是模型本身不行。HN 上 239 分说明大量团队被「AI 写出老古董代码」折磨过。

### 这跟普通人有什么关系

如果你所在团队在用 AI 写前端，页面加载速度、包体积、可维护性都会因为旧写法悄悄变差；给 Agent 加上这类规范，能直接减少「AI 一改代码、性能就下降」的返工。

## 为什么值得架构师关注

- **前端技术栈治理**：AI 生成代码正在放大「依赖膨胀」问题——每个 Agent 会话都可能引入新第三方库，长期推高安全审计面与构建时间，需要把「优先平台原生能力」写进组织级 Agent 规范。
- **可直接落地的资产**：GoogleChrome 官方出品，可作为团队 Agent 引导文件（rules/skills）的基线模板，再叠加内部规范，比从零自写成本低。
- **模式可复制**：「给 Agent 喂领域现代最佳实践」这一模式适用于任何语言/框架（后端、移动端同理），值得沉淀为组织的 Agent 知识库工程。
- **评价体系缺口**：目前缺少「代码现代性」的度量指标，可考虑在评审清单中加入「是否滥用第三方库实现平台已有能力」检查项。

## 核心内容

- 仓库地址：github.com/GoogleChrome/modern-web-guidance，由 GoogleChrome 官方 GitHub 组织发布。
- 定位：把编码 Agent 的输出从约 2019 年风格的 JavaScript 引导到现代 Web 原生能力（web primitives）。
- 使用方式：作为给编码 Agent 的引导材料/规范接入（Show HN 形式发布，面向各主流编码 Agent）。
- 背景：AI 训练数据中旧式代码占比高，导致 Agent 生成代码偏向过时写法——这是社区公认的「AI 代码时代错位」问题。
- HN 239 分/68 评论，讨论集中于各团队遇到的 Agent 旧写法痛点。

## 行动建议

前端团队可直接试用：把该仓库接入现有编码 Agent 的规则配置，对比接入前后生成代码的依赖数量与包体积变化；架构师可顺势建立组织级「Agent 编码规范」仓库，将平台原生能力优先、依赖审批等要求固化进去。
