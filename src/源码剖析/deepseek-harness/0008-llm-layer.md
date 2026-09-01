---
title: "0008 LLM 适配层与 DeepSeek 私有协议扩展"
sidebarGroup: "DeepSeek Harness"
shortTitle: "0008 LLM 适配层"
order: 8
date: 2026-08-31
category: "源码剖析"
tag:
  - "DeepSeek Harness"
  - "源码"
  - "Agent"
description: "第 8 篇：ctx.llm 的克制、wire extensions 事务语义与 dsh_session_log 水位协议。"
---

# 0008 · LLM 适配层与 DeepSeek 私有协议扩展

> **源码仓库解读 · DeepSeek Harness 系列第 8 篇（主线收官）**
> 剖析对象：`packages/llm/`（llm / llm-deepseek / deepseek-llm-api-extensions / token-meter / llm-pi-ai）+ `docs/deepseek-llm-api-wire-extensions.zh.md`
> 上篇：[0007 能力 Seam](./0007-capability-seams.md)

## 为什么读

前七篇我们看完了"骨架与器官"——装配、日志、循环、工具、seam。最后一篇看"嘴和耳朵"：模型调用层。这篇有两个特别的看点：

其一，`ctx.llm` 是所有模型调用的**唯一受支持路径**，它的克制程度令人发指：没有提供方协议代码、没有重试、没有计费——全部拆给邻居。看一个框架如何抵抗"什么都往核心塞"的引力，本身就是一次架构学习。

其二，`docs/deepseek-llm-api-wire-extensions.zh.md` 是一份**罕见的一手协议文档**：模型厂商为自己的 harness 定义私有 HTTP 扩展。dsh 往 DeepSeek API 的请求正文里塞了什么、为什么塞、怎么保证安全——这是其他任何开源 agent 项目都看不到的视角。

## 源码地图

```
packages/llm/
  llm/            3086 行  ★ ctx.llm 服务：词汇表 + 适配器注册表 + 流式调用
  llm-deepseek/   3180 行  DeepSeek 官方 API 适配器（provider: 'deepseek-official'）
  deepseek-llm-api-extensions/   私有字段注册表（本篇主角之二）
  plugin-package-inventory-deepseek/   贡献 dsh_plugin_packages 字段
  session-log-deepseek/（在 packages/session/）  贡献 dsh_session_log 字段
  llm-pi-ai/      3817 行  多提供方"孪生"适配器（pi-ai 生态）
  llm-retry/               持久步骤边界的重试执行
  token-meter/    1478 行  回放感知的 token 计量
docs/deepseek-llm-api-wire-extensions.zh.md   ★ 协议规范全文
```

## 逐段剖析

### 1. ctx.llm：一个只有词汇表和插座的服务

`llm` 包 README 的概述段几乎每句都是设计宣言：

> 它**不执行重试**，也**不拥有任何提供方协议逻辑**：适配器翻译各自提供方的格式，可选包 `dsh-llm-retry` 在持久步骤边界上重跑失败的请求。**请求在分发前会被深度冻结**，因此 middleware 与适配器只能读取，绝不能改写。

三个"不"加一个"冻结"，划清了整个层的边界：

- **词汇表归它**：消息（Message）、内容块（ContentBlock）、流式分片（StreamChunk）的类型定义在此，loop、会话日志、压缩、标题生成器共用同一套词汇——这就是 0005 里 agent loop 直接 import `@deepseek-ai/dsh-llm` 的原因；
- **协议归适配器**：`llm-deepseek` 认识 DeepSeek 的 SSE，`llm-pi-ai` 认识 pi-ai 生态的一堆提供方。适配器按名称注册路由（`provider: 'deepseek-official'`），服务按名分发；
- **重试归邻居**：`llm-retry` 在"持久步骤边界"重跑——注意不是无脑循环重试，而是与 0005 的 `agent/request-error` 瀑布协作：插件决策要重试，`llm-retry` 负责执行；
- **请求不可变**：深度冻结发生在分发前，任何中间件都别想在半路偷改 prompt。想改？去 0005 的 `agent/pre-step` 瀑布——那是唯一合法的改写点。

回顾 0003 的 base bundle 里那条 `llm-pi-ai` 行的注释，可以把适配器的生灭讲全：*"mounted dormant: zero routes (and no extra models in the picker) until a `llm-pi-ai:` settings section supplies provider profiles — then those routes register live... and drop again when the section empties. **Which adapters exist is composition; which providers run is the user's settings document.**"*——适配器在不在场是装配问题；提供方跑不跑是用户设置问题。两层正交。

### 2. 私有协议扩展：命名先立宪

`wire-extensions` 文档开篇是一张命名空间宪法：

| 位置 | 命名方式 | 示例 |
|---|---|---|
| HTTP 标头 | 小写 kebab-case | `x-deepseek-harness-session-id` |
| 请求正文扩展字段 | **保留 `dsh_` 前缀** snake case | `dsh_plugin_packages`, `dsh_session_log` |
| DSH 持有的嵌套成员 | Camel case | `afterSeq`, `throughSeq` |
| 带标签的值 | `domain/action` | `session-log-deepseek/delivery-accepted` |

一句关键的协议哲学：*"每个正文扩展独立持有自身的 version……不同字段的版本之间不存在兼容或排序关系"*——扩展字段各自独立演进，绝不让一个字段的升级绑架整个协议。加上"JSON 成员顺序不属于协议"这句（呼应 0003 的"配置没有隐藏状态"），处处是**把隐式约定显式化**的偏执。

四个标头里最有意思的是隐私设计：`x-deepseek-harness-user-id` 是"Harness home 的稳定**匿名** UUID"，且"凭据失败发生在解析匿名用户 id 之前，因此未授权请求**既不会发送这些标头，也不会创建身份文件**"——身份文件只有在第一次成功授权时才落盘。遥测的默认值又是那个熟悉的取向：宁可少收集。

### 3. 扩展字段的事务语义：prepare → serialize → 2xx → accept

`deepseek-llm-api-extensions` 是一个 Registry 服务（`ctx.deepseekLlmApiExtensions`），插件通过声明合并认领字段，一个字段一个主人（重复注册同步失败）。它的生命周期是完整的事务：

1. **prepare(request)**：适配器先序列化**完整基础正文**（含确切 messages），再让已注册提供方并发准备贡献。提供方收到不可变正文、取消信号、可选的 sessionId 与 purpose；字段不适用就返回 `undefined`；
2. **合并发送**：准备失败的提供方会**阻止整个请求**（在 HTTP 分发前）——绝不发半残请求；
3. **accept()**：端点返回 2xx 后、读取 SSE 之前，只运行一次。传输失败或非 2xx → 任何贡献都**不被接受**；即使 2xx，accept 失败也让模型请求失败。

最后这条最严格：*"即使端点返回 2xx，接受失败仍会使模型请求失败。"* 原因藏在语义里——accept 记录的是"提供方的状态机已推进"（比如水位已提交），如果允许静默失败，提供方的状态与服务器就会悄然失配。**分布式系统里，"对端说 OK 但本地记账失败"必须当作错误，不能当作可以忽略的警告。**

### 4. dsh_session_log：把会话日志变成协议一等公民

两个内置的正文扩展字段中，`dsh_plugin_packages`（当前存活插件包清单，默认启用）相对平常——支持与遥测用途。真正的重头戏是 `dsh_session_log`（**默认禁用**）：把权威会话日志的一段**连续后缀**随请求发送给 DeepSeek API：

```json
{
  "dsh_session_log": {
    "version": 1,
    "session": { "version": 0, "id": "session-id", "createdAt": 1780000000000 },
    "afterSeq": -1,
    "throughSeq": 0,
    "events": [ { "type": "turn/start", "seq": 0, ... } ]
  }
}
```

协议细节处处与 0004 呼应：

- `session` 成员是"确切的 `Session.header`"——就是 0004 里那个带 `SESSION_FORMAT_VERSION` 的不可变头。文档特意注明两个 version 独立演进：外层选的是本扩展字段的 schema 版本，内层选的是磁盘会话格式版本；
- **水位协议**：首次上传 `afterSeq: -1` 携带全量日志，此后每次只发"服务器已确认的最大水位"之后的增量（`afterSeq + 1` 到 `throughSeq`）。这是一个标准的可靠传输确认协议，只是传输的内容换成了会话事件；
- **快照语义**："发送方为每次请求仅快照一次事件数组；快照后的追加内容属于后续请求"——发送过程中日志还在追加（agent 可没停），协议必须定义清楚哪条算哪次。

为什么 DeepSeek 要在自家 API 里加这个字段？协议本身不解释动机，但可以推断：拿到结构化的完整会话事实流（而非拼凑的 messages 数组），服务端可以做精确的上下文缓存、会话级分析与更聪明的模型侧优化。对我们读者，更重要的一课是：**0004 的"模型可见即已记录"在这里兑现成了协议能力——因为日志权威且自描述，它才能作为一等公民上传**。事件溯源的架构红利，最终由厂商的 API 承接。

### 5. token-meter：计量也是一个 fold

`token-meter` 的概述只有一句话的核心：

> `ctx.tokenMeter` **从持久事件日志为每个会话推进一个隔离 fold**，因此压缩与其他压力敏感插件可以共享同一份计量，无需依赖压缩引擎。

又是 0004 的投影思想：计量不维护自己的数据结构，而是对事件日志做增量折叠（fold）——任何时刻都能从日志重建，重放安全。它区分三种定价来源：文本与未声明图片用固定启发式，适配器声明了视觉定价就用精确值，"**只有请求 envelope 完全匹配时才复用提供方报告的用量**"——缓存的服务器报告 usage 不能张冠李戴到另一个请求上。末尾照例划界："它不添加任何自己的提示词、消息、schema 或工具，也绝不为 loop 做决定。" 计量就是计量，决策归压缩插件。

## 动手实验

```sh
cd ~/Projects/source-decoded/dsh

# 1. 通读协议规范（本仓库最独特的文档之一，中英双语）
$EDITOR docs/deepseek-llm-api-wire-extensions.zh.md

# 2. 看 llm 服务的"三不"边界声明
grep -B2 -A2 "不执行重试\|深度冻结" packages/llm/llm/README.zh.md

# 3. 数一数 dsh 底盘共有多少个 LLM 相关包
ls packages/llm/

# 4. 找到水位协议的快照语义声明
grep -n "仅快照一次\|watermark\|水位" docs/deepseek-llm-api-wire-extensions.zh.md
```

## 一图总结

```
 消费方（loop / 标题生成 / 压缩 / 插件…）
        │  共享词汇：Message / ContentBlock / StreamChunk
        ▼
 ┌─────────────── ctx.llm ────────────────┐
 │  适配器注册表（按 provider 名路由）        │
 │  请求深度冻结（middleware 只读）          │
 │  不重试 · 不懂协议 · 不计价               │
 └───────┬───────────────┬────────────────┘
         │               │
   llm-deepseek      llm-pi-ai（休眠，设置激活）
         │ 序列化基础正文
         ▼
   extensions registry: prepare（并发、可失败即阻发）
         │ 合并 dsh_plugin_packages / dsh_session_log
         ▼
   HTTP 2xx → accept()（只一次；失败=请求失败）
         │
   SSE 流 → StreamChunk → BlockAssembler → 消息落账（0005）
         │
   token-meter：对事件日志做隔离 fold，共享计量
```

**三句话带走全文：**

1. `ctx.llm` 只拥有词汇表与路由，协议归适配器、重试归邻居、计价归 meter、不可变性靠深度冻结——核心的克制是它成为"唯一路径"的资格。
2. 私有协议扩展是一套严格事务：基础正文先冻结、prepare 失败即阻发、2xx 后才 accept、accept 失败即请求失败——记账与对端状态永远一致。
3. `dsh_session_log` 把会话日志变成协议一等公民：水位增量上传、双版本独立演进、快照语义——事件溯源的架构红利由厂商 API 承接。

## 主线收官 · 附篇预告

八篇主线至此合拢：**装配（0003）长出插件树 → 日志（0004）定义事实 → 循环（0005）驱动事实 → 工具（0006）触碰世界 → seam（0007）替换世界 → LLM 层（0008）连接模型**。

附篇做一次横向对照：**dsh × Pi × Claude Code——三种 harness 哲学**。同样的"会话日志 + agent 循环 + 工具系统"三件套，极简主义（Pi）、平台主义（dsh）与产品主义（Claude Code）分别把它做成了什么样子？对想自建 agent 平台的工程师，各自的启示是什么？

---
*上篇：[0007 能力 Seam](./0007-capability-seams.md) · 附篇：[dsh × Pi × Claude Code 对照](./0009-comparison.md)*
