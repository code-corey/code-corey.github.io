---
title: "v4revert: Decode Uniswap v4 revert data（v4revert：逐层解开 Uniswap v4 报错数据的单文件解码器）"
shortTitle: "v4revert 交易报错解码器"
sidebarGroup: "2026-11-08"
order: 14
date: 2026-11-08
category:
  - "每日 AI 简报"
tag:
  - "Web3 & Crypto"
description: "3 天 51 星的小工具：v4 hook 失败被 WrappedError/ExecutionFailed 多层包裹，v4revert 单文件零依赖离线逐层解码，直指 hook 回调与真实原因。"
---

# v4revert: Decode Uniswap v4 revert data（v4revert：逐层解开 Uniswap v4 报错数据的单文件解码器）

> 📅 2026-11-08 | 🏷️ Web3 & Crypto | ⭐ ⭐51（3天）｜小而美
> 🔗 原文：https://github.com/zhouxingchi1017/v4revert

## 是什么

一个解决 Uniswap v4 开发痛点的小工具：当 hook 合约失败时，PoolManager 会把真实错误包进 `WrappedError`，Universal Router 可能再包一层 `ExecutionFailed`——调试时 Ethers/Viem 只会打印一坨十六进制或一句 "execution reverted"。v4revert 递归剥开每一层，告诉你：哪层出错、哪个 hook 回调阶段、真实原因是什么。单文件、零依赖、完全离线，3 天 51 星。

## 🔍 小白解读

### 先说几个词

- **revert（回滚）**：智能合约执行失败时的"全部撤销"，链上只留一段报错数据（revert data）。
- **Uniswap v4**：Uniswap 最新大版本（公认背景），引入 hook 机制，错误路径比 v3 复杂得多。
- **Hook（钩子）**：v4 的核心扩展点——在池子生命周期的各个阶段（如 beforeSwap）插入外部合约逻辑，Swap 之前某个 hook 挂了，交易就回滚。
- **WrappedError**：v4 包装 hook 失败的错误类型（选择器 0x90bfb865），里面再套真实原因——像俄罗斯套娃。
- **Permit2**：Uniswap 系生态的代币授权合约，也是报错链条里的常客。

### 这篇到底在说什么

打个比方：v4 的报错像一台层层包装的快递箱——外箱写着"运输失败"（ExecutionFailed），打开还有一层"内件异常"（WrappedError），真实原因（比如 "wallet cap exceeded"）在最里面。常规工具懒得拆，直接给你一串十六进制。v4revert 是个专门的"开箱器"：递归剥层、翻译所有标准错误（Error(string)、Panic、v4-core/v4-periphery、Universal Router、Permit2），还能按选择器指名出错的是哪个 hook 回调阶段。`npx` 直接跑，支持传入自定义错误签名，也能作为 JS 库嵌入你的监控/调试系统。

### 这跟普通人有什么关系

你在 Uniswap 或集成它的产品上交易失败时，钱包只会说"失败了"；这类工具是开发者弄清"为什么"的眼睛。工具越好用，产品修得越快，你的交易体验越可靠。

## 为什么值得架构师关注

DeFi/交易基础设施团队的标准件补全：做 v4 集成、路由、MEV 或做市，交易失败诊断链路里必须有协议级错误解码器。选型理由（低于百星仍入选）：问题足够独特（v4 新错误包装机制尚无成熟工具）、代码形态可见（单文件零依赖离线可用）、3 天 51 星增速健康。方法论同样值得抄：**错误解码器要跟协议版本走**——每次协议升级，解码字典都要同步扩展。

## 核心内容

- 问题：v4 hook 失败被 PoolManager 包为 WrappedError（0x90bfb865），Universal Router 可再包 ExecutionFailed，常规工具输出不可读。
- 能力：递归剥层，解码 Error(string)/Panic/v4-core/v4-periphery/Universal Router/Permit2 错误，按 selector 指名 hook 回调阶段（如 beforeSwap）。
- 形态：单文件、零依赖、完全离线；CLI（npx/参数/stdin）+ JS 库（decode/render）双用法；`--sig` 注册自定义错误。
- 数据：创建 3 天 51 星（JavaScript），填补 v4 早期工具链空缺。
- 背景：hook 机制让 v4 错误路径天然多层，这是 v3 时代工具无法照搬的原因。

## 行动建议

v4 集成/MEV/交易路由团队直接纳入调试工具箱（npx 即用、可离线）；把它当"协议错误解码器"模式的模板，给自家协议也配一个；纯交易用户了解即可。
