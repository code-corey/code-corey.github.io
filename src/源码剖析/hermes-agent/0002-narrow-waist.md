---
title: "0002 巨核与窄腰：agent loop、上下文工程与工具系统"
sidebarGroup: "Hermes Agent"
shortTitle: "0002 巨核与窄腰"
order: 2
date: 2026-09-01
category: "源码剖析"
tag:
  - "Hermes Agent"
  - "源码"
  - "Agent"
description: "Hermes Agent 源码系列第 2 篇：8954 行主循环的十道关、字节级缓存断点、压缩的三种付法、工具注册表与 tool_search 三层渐进披露。"
---

# 0002 · 巨核与窄腰：agent loop、上下文工程与工具系统

> **源码仓库解读 · Hermes Agent 系列第 2 篇**
> 主线：[0001 开箱全景](./0001-panorama.md)
> 关键文件：`run_agent.py` · `agent/conversation_loop.py`（8954 行）· `agent/context_compressor.py`（8839 行）· `agent/prompt_caching.py` · `agent/context_engine.py` · `tools/registry.py` · `tools/tool_search.py` · `tools/environments/`

## 为什么读

0001 结尾留了个矛盾：Hermes 一边宣称"核心是细腰，能力长在边缘"，一边养出了 8954 行的核心循环。本篇把"细腰"两侧同时剖开——循环与上下文怎么跑（核心），工具怎么接（边缘），然后看看这对矛盾在工程上怎么自洽。

先摆数字（`wc -l` 实测）：

| 文件 | 行数 | 职责 |
|---|---|---|
| `agent/conversation_loop.py` | 8954 | agent 主循环（含容错/降级/压缩/计费处理） |
| `agent/context_compressor.py` | 8839 | 上下文压缩全家族 |
| `agent/conversation_compression.py` | 5877 | 压缩的并发加固（栅栏/准入/租约） |
| `agent/tool_executor.py` | 2931 | 工具批执行、并发、取消、授权门 |
| `agent/prompt_builder.py` | 2471 | 系统提示组装 |
| `agent/system_prompt.py` | 1172 | 人格 + 工具说明注入 |

对照 dsh 的 agent loop（一个可从配置替换的 Cordis 插件行），Hermes 的 loop 是**一个 while 循环 + 一支护航舰队**。

## 主循环：一圈过十道关

一切从 `run_agent.py` 的 `AIAgent` 类开始——典型 god object，模型切换、会话持久化、凭据池、流式诊断全挂上面。主循环签名很朴素（`conversation_loop.py:2160`）：

```python
while (api_call_count < agent.max_iterations
       and agent.iteration_budget.remaining > 0) or agent._budget_grace_call:
```

"模型请求 → 工具调用 → 结果回填 → 再请求，直到模型收手或预算耗尽"。区别全在循环体内**关卡密度**上，按源码顺序：

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

循环外围还有一圈"战地医院"：`error_classifier.py` 把异常归类为可重试/可压缩/可降级（`FailoverReason.billing` / `image_corrupt` / `long_context_tier`……），`_try_activate_fallback()` 在主模型挂掉时切换备胎；`repetition_guard.py` 拦复读机，`empty_response_guard.py` 兜空回复。单看这层更像电信级网关而不是脚本——这也解释了主循环为什么能长到 8954 行。

循环之外，收尾被搬进 `agent/turn_finalizer.py`，其注释自带史料价值：

> Extracted from `agent/conversation_loop.py` as part of the **god-file decomposition campaign** ... Behavior-neutral: the body is moved unchanged.

官方正在搞"巨石文件拆解运动"，把循环尾处理（预算汇总、轨迹保存、会话持久化、**记忆/技能审查触发**）逐块外迁。细腰不是现状，是**进行时**。

## 缓存宪法：从四断点到字节级

AGENTS.md 第一条宪法——"Per-conversation prompt caching is sacred"（任何中途改写历史、换工具集、重建系统提示的行为都会击穿缓存、成倍烧钱，我们不做）。实现在 `agent/prompt_caching.py`：默认布局 **4 个 cache_control 断点**——静态系统前缀、系统提示末尾、最近两条非系统消息；无静态前缀时退化为 1+3。历史消息永远原地不动，长对话每轮命中缓存前缀。

精妙在下一层。技能、webhook、cron 建造器会把"一大块静态脚手架 + 一小撮易变尾巴"拼进**同一条用户消息**，整块缓存则每次因尾巴变化整块 miss。`agent/prompt_cache_boundary.py` 的解法是**让建造者在构造时声明稳定前缀的精确字节位置**，缓存规划器在边界落断点：

> Only the builder knows the exact byte where the volatile tail begins, so it registers the stable prefix here at construction time.

刻意不做的：请求时用分隔符反解——标记串可能合法出现在技能正文或事件载荷里（比如工单引用了一段 agent 对话），启发式切分要么缩小前缀、**要么把易变字节静默吸进缓存**，反而制造 miss。注册表是进程内 LRU（32 条 / 400 万字符），miss 回退整块缓存。多提供方的边角税也照单全收：OpenRouter 会搬运 part 级标记、LiteLLM 系代理会把标记映射到 Anthropic schema 非法位置直接 400 杀死回合（#89886）——所以这类路由干脆不发 part 级标记。

## 压缩：三种付法与一次所有权交接

上下文爆了怎么办？三级演进：

1. **批量压缩**（默认）：越线 → 停下 → 一次摘要中段 → 继续。账单一次结清。
2. **micro-compaction**（`docs/micro-compaction.md`，默认关闭）：每回合把最老一条未吸收交换折进滚动摘要。账单分期，代价是**每轮击穿缓存前缀**（宪法唯一豁免者）+ 旧细节更早变二手摘要。文档诚实列出全部代价，让运营者自己选。
3. **native compaction**（`agent/native_compaction.py`）：摘要外包给厂商——OpenAI Responses API 的 server-side compaction，服务器自动把旧上下文折成加密的 `compaction` 输出项。

native 路线的门控是保守主义范本：**仅 gpt-5.6 家族**（发给 gpt-5.1/5.2 稳定 500 或流式卡死，且无结构化"不支持"错误可降级，唯一安全门是显式家族检查）；**仅直连路由**；**本地压缩全程在岗**——native 阈值钳制在本地触发点之下让服务器先压，压不成（中途禁用、厂商抽风）本地摘要器按原样兜底，"There is no new custody state"——不引入新的所有权状态，只做优先级让渡。支撑它的 `conversation_compression.py`（5877 行）里是 `CompressionCommitFence` 提交栅栏、执行器饱和准入、超时租约下的冷却捕获——**压缩被当成关键路径上的分布式事务来做**。

这一切挂在 `ContextEngine` 抽象基类上（可插拔，标识符形如 `'compressor'`/`'lcm'`），核心契约是两个钩子：`select_context()` 请求前决定带哪些历史，`on_turn_complete()` 回合后连同 token 用量一起观察——插件引擎不必再滥用压缩接口来"顺便看历史"。

## 工具系统：注册表、组合与渐进披露

**注册表**：`tools/registry.py` 头注释即架构——每个工具文件模块层自注册（schema、处理器、工具集归属、可用性检查），中央注册表是唯一事实，没有平行手工清单；依赖链刻意无环（registry 不依赖工具文件）。分发边界统一**封顶错误体**（模型可见 2048 字符、日志 8192），连 `json.dumps({'error': str(exc)})` 的绕过路径都在边界兜住——工具错误会跨重试叠加烧上下文。

**Toolsets**：工具集 = 具名工具 + `includes` 组合其他工具集，CLI 与所有消息平台共享同一份核心清单。GUI 专属工具集（`desktop_ui`、`project`）**刻意不进核心清单**——由桌面网关按"会话来源"启用，**绝不按进程环境变量启用**，因为环境变量看不见"桌面客户端正对着远程后端"这回事。

**渐进披露**：接 MCP 后模型可见 tools 数组会爆炸（注释举例：Cloudflare 约 3300 个工具，光名字约 32K token）。`tools/tool_search.py` 用三个桥接工具（`tool_search`/`tool_describe`/`tool_call`）替换 MCP/插件工具，三层披露：Tier 0 全量直通 → Tier 1 目录占上下文 ≤5%（超了降级纯名字清单）→ Tier 2 只剩桥 + 每服务器一行摘要。**核心工具永不退场**（"Always-load means always-load. No exceptions."）。目录**每回合从活体注册表重建**，绝不跨回合缓存——注释里点名了教训来源：OpenClaw 的 cron 回归 #84141，"会话键控目录与活体注册表漂移 → 工具静默消失"。

**执行端**：七种终端后端（`local/docker/modal/vercel_sandbox/ssh/singularity/daytona`）共享 `BaseEnvironment` 抽象：`_BoundedOutputCollector` 超限输出溢写磁盘 spill 文件（模型拿截断视图 + 路径，海量日志不灌上下文也不丢）；`ProcessHandle` 协议统一本地远端进程语义。委派侧 `tools/delegate_tool.py`：子 agent 拿全新对话、独立 task_id、继承工具集减去 `DELEGATE_BLOCKED_TOOLS`（frozenset 硬编码）、按目标聚焦的系统提示；**父上下文只看到委派调用 + 摘要结果**——上下文成本与信息泄漏的双重防火墙。`agent/subagent_lifecycle.py` 配完整状态机。

## 对照 dsh 与可抄清单

| | dsh | Hermes |
|---|---|---|
| loop 可替换？ | **是**（Cordis 插件行） | 否（写死，拆解运动瘦身中） |
| 核心膨胀约束 | **机制**（可替换，核心没必要大） | **文化**（评审门槛 + 细腰宣言） |
| 现状代价 | 框架复杂度前置（先懂 Cordis） | 核心文件膨胀（8954 行） |
| 上下文抽象 | 事件日志投影 seam（平台视角） | 可插拔引擎 + 三级压缩（产品视角） |
| 工具接入 | 插件即工具 | 注册表 + toolsets + 技能/服务门控 |

六条可抄：成本纪律写进宪法、缓存断点按声明式字节边界落位；压缩做成"可灰度、可回退、无新状态"的外包；双钩子契约（选择在前、观察在后）是记忆型上下文的正确接口；错误体在分发边界统一封顶；工具可见性绑定会话语境而非进程环境；目录类元数据永远从活体注册表重建。

想研究 loop 本身，dsh 的可替换循环是更好教材；想知道生产级 loop 要扛住什么（billing、凭据池刷新、图像损坏、长上下文分级、缓存标记 400……每个分支都是一次真实事故的化石），Hermes 这 8954 行是现成案例库。

---

> 下一篇：[0003 学习闭环与数据飞轮](./0003-learning-loop.md)
