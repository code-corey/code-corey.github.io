---
title: "0003 学习闭环：MEMORY、技能与策展人"
sidebarGroup: "Hermes Agent"
shortTitle: "0003 学习闭环"
order: 3
date: 2026-09-01
category: "源码剖析"
tag:
  - "Hermes Agent"
  - "源码"
  - "Agent"
description: "Hermes Agent 源码系列第 3 篇：逐文件验证自我改进闭环——memory 双文件、/learn 管线、技能安全扫描链、curator 策展与 FTS5 跨会话召回。"
---

# 0003 · 学习闭环：MEMORY、技能与策展人

> **源码仓库解读 · Hermes Agent 系列第 3 篇**
> 主线：[0002 巨核与窄腰](./0002-narrow-waist.md)
> 关键文件：`agent/memory_manager.py`（1436 行）· `tools/memory_tool.py` · `agent/learn_prompt.py` · `agent/curator.py`（2057 行）· `tools/session_search_tool.py` · `tools/skills_guard.py`

## 为什么读

"自我改进"是 2026 年 agent 产品的通用形容词，但大多数实现停在"往 memory.md 里追加几行"。Hermes 是少数把学习做成**带生命周期管理的子系统**的：有写入门禁、有安全审计、有后台策展、有跨会话召回，甚至有技能的使用账本。本文逐环验证 0001 给出的那张闭环图。

## 第一环：记忆——两个 Markdown 文件的严肃化

落盘层朴素得惊人：`~/.hermes/` 下两个文件（`tools/memory_tool.py`）：

- **MEMORY.md**：agent 的个人笔记（环境事实、项目状态、踩过的坑）；
- **USER.md**：agent 眼中的你（偏好、沟通风格、背景画像）。

朴素的外表下是三道严肃的工程：

1. **写入门禁**（`_apply_write_gate` / `_apply_batch_write_gate`）：记忆不是 append-only 垃圾场，更新必须带 old_text 做精确替换，改不动就报错——防幻觉式覆写；
2. **漂移检测**（`_drift_error`）：读取时校验内容与 `.bak` 快照是否一致，发现被外部改动就拒绝盲写；
3. **快照消毒**（`_sanitize_entries_for_snapshot`）：进系统提示前对记忆内容做清洗。

记忆进入上下文的通道在 `agent/memory_manager.py`：`MemoryManager` 是**多提供方总线**——内置记忆之外可以挂 [Honcho](https://github.com/plastic-labs/honcho)（辩证式用户建模）等第三方 provider（`agent/memory_provider.py` 里 provider 标识明确列出 `'builtin', 'honcho', 'hindsight'`）。每次用户发言会触发 `prefetch_all(query)`——按当前话语主动检索相关记忆注入提示，而不是把全部记忆塞进上下文。还有一个容易被忽略的细节：`StreamingContextScrubber` 在**流式输出过程中**实时清洗 PII——记忆系统开始读你的私人笔记时，隐私工程已经前置到字节流层。

## 第二环：技能——/learn 管线与"作者即运行时"

技能是 Hermes 学习的基本单位：一个目录 + 一份 `SKILL.md`（兼容 [agentskills.io](https://agentskills.io) 开放标准），内置 13 类（`skills/` 下：devops、research、creative、social-media……）。

最有意思的设计是 **`/learn` 没有独立的蒸馏引擎**（`agent/learn_prompt.py` 模块注释原话："There is no separate distillation engine"）。`build_learn_prompt()` 只构造**一个提示**，让运行中的 agent 用自己现有的工具（`read_file` / `search_files` / `web_extract` / 当前对话）去收集素材，然后调用 `skill_manage` 按官方写作规范成稿——描述 ≤60 字符、固定章节顺序、大素材走"知识库布局"（瘦索引 SKILL.md + 按需 `skill_view` 加载的 `references/` 分章）。

这个选择非常聪明：**作者就是运行时**。技能创作不需要新模型调用管线、不需要新增核心工具，于是在本地、Docker、远程沙箱后端上行为完全一致——这正好是 0002 说的"细腰"哲学在学习系统里的兑现。

但"agent 自己写技能"带来一个别家没有的威胁模型：**模型生成的代码要落盘执行**。所以技能生命周期挂了一整条安全扫描链（`tools/` 下可数）：`skills_guard.py` → `threat_patterns.py`（威胁特征）→ `skills_ast_audit.py`（AST 级审计）→ `skillevaluator_scan.py` → `tirith_security.py`，外加 `skill_provenance.py`（来源追溯）与 `skill_usage.py` + `skill_ledger.py`（使用账本）。技能不是"写完就完"，每一步都有门禁与台账。

## 第三环：策展人——技能也会变旧

`agent/curator.py`（2057 行）是闭环里最没有竞品的部件。它是个后台守护：按配置的 `interval_hours` / `min_idle_hours` 触发，执行 `apply_automatic_transitions()`——对技能做**状态自动流转**：

- `stale_after_days`：太久没用 → 标记过期；
- `archive_after_days`：过期更久 → 归档；
- `consolidate`：碎片技能合并整理；
- `prune_builtins`：连内置技能都允许修剪。

策展报告落盘在 reports 目录，删除动作受 `curator_consolidation_delete_guard` 保护，置顶技能有 `_pinned_guard` 免死金牌。它和 0002 提到的 loop 内 **skill nudge** 形成一对：nudge 管"该不该沉淀"（实时，迭代计数器 `_iters_since_skill` 在实际使用 `skill_manage` 时归零），curator 管"沉淀后怎么演化"（离线，按天）。**一个管生长，一个管代谢**——多数"记忆系统"只有前者。

## 第四环：召回——零 LLM 成本的跨会话搜索

`tools/session_search_tool.py` 是单个工具、四种形态（靠参数自动推断）：

| 形态 | 触发参数 | 行为 |
|---|---|---|
| DISCOVERY | `query` | FTS5 全文检索 + 按会话谱系去重；默认"自适应细节"——Top1 全量水合（±5 消息窗口 + 首尾锚点），其余只给锚点消息 |
| SCROLL | `session_id` + `around_message_id` | 以锚点为中心 ±N 窗口滚动，无检索 |
| READ | 仅 `session_id` | 整会话读取（大会话给有界头/尾视图） |
| BROWSE | 无参 | 按时间线浏览近期会话（标题/预览/时间戳） |

模块注释里反复强调一句话：**"No LLM calls anywhere"**——所有形态都是纯 SQLite（FTS5 索引，`hermes_state_search.py` 含增量合并与重建限流）。跨会话召回不花一枚 token，这意味着 agent 可以频繁地"回看自己的过去"而不必做成本权衡。学习闭环里最贵的环节（摘要、蒸馏）交给 LLM，最频繁的环节（检索）交给传统索引——这个分工值得所有做 agent 记忆的团队抄走。

## 惊喜：学习的数据飞轮通向模型训练

闭环图的最外侧还有一条别人没有的输出管道：`batch_runner.py`（批量轨迹生成）+ `trajectory_compressor.py`（轨迹压缩）。Hermes 的会话可以批量跑任务、把工具调用轨迹压缩成训练数据——官方 README 直说这是为了 "training the next generation of tool-calling models"。

现在回看全局就通了：**Nous Research 是模型实验室，Hermes 的学习闭环同时是数据采集器**。用户用得越多 → 技能与记忆越厚 → 轨迹数据越好 → 下一代 Hermes 模型越强。个人 agent 产品与研究飞轮是同一台机器。

## 对照 dsh：harness 不学习，agent 才学习

把本文与 DeepSeek Harness 系列放在一起，最尖锐的分野浮现了：

| | dsh（DeepSeek Harness） | Hermes |
|---|---|---|
| 学习是否一等公民 | **否**——harness 只负责把事实如实记录成事件日志 | **是**——记忆/技能/策展/召回是核心卖点 |
| 知识形态 | 会话事件日志（供任何上层消费） | MEMORY.md / USER.md / SKILL.md（产品自带语义） |
| 知识演化 | 无内置机制（交给上层应用） | curator 自动流转 + nudge 实时提醒 |
| 召回 | 投影 seam，形态由消费方定义 | FTS5 零成本召回，产品内置 |

严格说这不是优劣而是**层次之差**：dsh 把"学习"留给搭平台的人，Hermes 把"学习"做成了产品本身。选型问题因此变成一句反问——你要的是**造 agent 的地基**，还是**一个已经会成长的 agent**？

---

> 下一篇：[0004 对照篇 · hermes × dsh：选地基还是选成长](./0004-comparison.md)
