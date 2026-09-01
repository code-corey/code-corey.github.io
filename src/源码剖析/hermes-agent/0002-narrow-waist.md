---
title: "0002 巨核与窄腰：8954 行的 agent loop"
sidebarGroup: "Hermes Agent"
shortTitle: "0002 巨核与窄腰"
order: 2
date: 2026-09-01
category: "源码剖析"
tag:
  - "Hermes Agent"
  - "源码"
  - "Agent"
description: "Hermes Agent 源码系列第 2 篇：解剖 conversation_loop 主循环、prompt caching 四断点、micro-compaction 与传输层适配器动物园。"
---

# 0002 · 巨核与窄腰：8954 行的 agent loop

> **源码仓库解读 · Hermes Agent 系列第 2 篇**
> 主线：[0001 开箱全景](./0001-panorama.md)
> 关键文件：`run_agent.py`（AIAgent 类）· `agent/conversation_loop.py`（8954 行）· `agent/tool_executor.py`（2931 行）· `agent/prompt_caching.py` · `agent/context_compressor.py`（8839 行）

## 为什么读

0001 结尾留了个悬念：Hermes 一边宣称"核心是细腰"，一边养出了 8954 行的核心循环文件。这对矛盾本身就是本文的主题——**当扩展性靠文化而非机制约束时，核心会长成什么样？**

先摆数字（`wc -l` 实测）：

| 文件 | 行数 | 职责 |
|---|---|---|
| `agent/conversation_loop.py` | 8954 | agent 主循环（含容错/降级/压缩/计费处理） |
| `agent/context_compressor.py` | 8839 | 上下文压缩全家族 |
| `agent/tool_executor.py` | 2931 | 工具批执行、并发、取消、授权门 |
| `agent/prompt_builder.py` | 2471 | 系统提示组装 |
| `agent/turn_context.py` | 1631 | 回合上下文 |
| `agent/system_prompt.py` | 1172 | 人格 + 工具说明注入 |

作为对照，dsh 的 agent loop 是一个可从配置替换的 Cordis 插件行。Hermes 的 loop 则是**一个 while 循环 + 一支护航舰队**。

## God object 与 god file

一切从 `run_agent.py` 的 `AIAgent` 类开始（第 467 行起）。它是典型 god object：模型切换、会话持久化、上下文引擎绑定、流式诊断、状态缓冲、凭据池……几百个方法全挂在上面。

`conversation_loop.py` 的主循环签名很朴素（第 2160 行）：

```python
while (api_call_count < agent.max_iterations
       and agent.iteration_budget.remaining > 0) or agent._budget_grace_call:
```

"模型请求 → 工具调用 → 结果回填 → 再请求，直到模型收手或预算耗尽"——和任何教科书的 agent loop 没有区别。**区别全在循环体内外的关卡密度上。**

## 循环体：一圈过十道关

按源码顺序（行号可复核），每圈循环要过这些关：

```python
# 1. 排水中途 /steer：用户在模型思考时插的话，注入到本轮可见位置
_redirect_text = agent._drain_pending_redirect()
...
# 2. 回合检查点去重：每圈允许一次快照
agent._checkpoint_mgr.new_turn()
# 3. 用户中断检查（CLI Ctrl+C / 消息平台发新消息）
if agent._interrupt_requested: ... break
# 4. 后台审查的输入总预算（分离的辅助 fork 也要花钱）
if _review_input_budget_exhausted(agent): ... break
# 5. 迭代预算：耗尽但给一次"宽限圈"（grace call）
if agent._budget_grace_call:
    agent._budget_grace_call = False
elif not agent.iteration_budget.consume():
    _turn_exit_reason = "budget_exhausted"; break
# 6. 网关钩子：agent:step 事件（工具名/参数/结果回放）
if agent.step_callback is not None: ...
# 7. 技能提醒计数：干了很多轮还没沉淀技能？nudge 一下自己
if (agent._skill_nudge_interval > 0
        and "skill_manage" in agent.valid_tool_names):
    agent._iters_since_skill += 1
# 8. 预 API 排水 /steer：保证模型本轮就能看到插话
_pre_api_steer = agent._drain_pending_steer()
```

循环外围还有一圈"战地医院"：`error_classifier.py` 把异常归类为可重试/可压缩/可降级（`FailoverReason.billing` / `image_corrupt` / `long_context_tier`……），`_try_activate_fallback()` 在主模型挂掉时切换备胎；`repetition_guard.py` 拦截复读机行为；`empty_response_guard.py` 兜住空回复。**单看这一层，它更像电信级网关而不是脚本**——这也解释了为什么主循环能长到 8954 行。

循环之外，收尾工作被搬进了 `agent/turn_finalizer.py`。这个文件的注释很有史料价值：

> Extracted from `agent/conversation_loop.py` as part of the **god-file decomposition campaign** ... Behavior-neutral: the body is moved unchanged.

翻译：官方正在搞"巨石文件拆解运动"，把循环尾处理（预算耗尽汇总、轨迹保存、会话持久化、**记忆/技能审查触发**）一块块外迁。细腰不是现状，是**进行时**。

## "Prompt caching is sacred" 的工程兑现

0001 提过 AGENTS.md 的第一条宪法。它在 `agent/prompt_caching.py` 里有精确实现——默认布局用 **4 个 cache_control 断点**：

```python
"""The default layout uses 4 cache_control breakpoints: the static system
prefix, the end of the system prompt, and the last 2 non-system messages.
When a static system prefix is unavailable, it falls back to one system
breakpoint plus the last 3 messages."""
```

静态前缀、系统提示末尾、最近两条非系统消息——**历史消息永远原地不动**，长对话每一轮都命中缓存前缀，这就是"神圣"的成本侧动机。为了守住它，源码里到处是防御性注释，比如 `#89886`：LiteLLM 系代理会把工具消息上的 part 级缓存标记原样映射到 Anthropic schema 不允许的位置，直接 400 杀死整个回合——所以这类路由上**干脆不发 part 级标记**，断点预算重新分配给最近的可标记消息。一个缓存标记的摆放位置都要按代理厂商分叉处理，这就是"多提供方"的隐性税。

## 压缩：一笔账的两种付法

上下文爆了怎么办？`context_compressor.py`（8839 行）给出传统答案：越过阈值 → 停下 → 把中段一次性摘要 → 继续。官方文档 `docs/micro-compaction.md` 把这叫"账单一次结清"，并给出新选项 **micro-compaction**：

> Micro-compaction pays the same bill in instalments. After each completed turn, Hermes folds the single oldest un-absorbed exchange into a running summary.

每回合结束把**最老的一条未吸收交换**折进滚动摘要。总功一样，摊成分期付款。但文档诚实得罕见——它明确列出代价：每轮回合后多一次真实压缩调用；**改写已发送的历史 = 每轮击穿 prompt 缓存前缀**（上面那条"神圣"原则的唯一豁免者）；旧对话细节更早变成二手摘要。所以它**默认关闭**（`compression.micro_compact: true` 才开启）。

一句"账单分期"背后是三条工程原则的互相拉扯：缓存 vs 窗口 vs 保真度。这种把 tradeoff 写满整页文档的做法，在开源项目里是加分项。

## 传输层：竞品即后端

`agent/transports/` 下是 API 线协议层：`anthropic.py` / `bedrock.py` / `chat_completions.py` / `codex.py`，再加一个耐人寻味的 `codex_app_server.py`——开启 `api_mode == "codex_app_server"` 时，**整个回合（终端/文件/补丁操作）都移交 Codex 的 app-server 子进程执行**，Hermes 主循环完全旁路（`conversation_loop.py` 内有显式分支）。上一轮的"终端后端七选一"是给 agent 一台机器，这一层是给 agent 换一个大脑运行时。

旁边还有 `hermes_tools_mcp_server.py`——把 Hermes 自己的工具集通过 MCP 协议**暴露出去**。它可以当客户端接任何 MCP 服务器（`tools/mcp_tool.py`），也能反串服务端。而 `agent/moa_loop.py` 实现了 `/moa`（Mixture-of-Agents）：主循环照常拥有工具调用与终止权，只是每次模型迭代前先扇出一批参考模型收集建议——并且带 PII 隐私过滤器，防止顾问输出把用户凭据回显到界面上。

## 小结：两种约束路线

把 0001 的判断落实成表：

| | dsh | Hermes |
|---|---|---|
| loop 可替换？ | **是**（Cordis 插件行，一行 patch） | 否（写死，靠拆解运动瘦身） |
| 核心膨胀约束 | **机制**（插件可替换，核心没必要大） | **文化**（评审门槛 + "细腰"宣言） |
| 现状代价 | 框架复杂度前置（必须先懂 Cordis） | 核心文件膨胀（8954 行 + 拆解运动） |
| 成本纪律 | 不变式执行器保证可信赖 | prompt caching 四断点 + 压缩分期 |

没有高下：**想研究 loop 本身，dsh 的可替换循环是更好的教材；想研究"生产级 loop 要扛住什么"，Hermes 这 8954 行是现成的故障案例集**（billing、凭据池刷新、图像损坏、长上下文分级、复读机……每个分支都是一个真实事故的化石）。

---

> 下一篇：[0003 学习闭环：MEMORY、技能与策展人](./0003-learning-loop.md)
