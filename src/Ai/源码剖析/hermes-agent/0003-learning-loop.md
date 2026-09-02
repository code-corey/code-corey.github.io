---
title: "0003 学习闭环与数据飞轮：为训练下一代模型而生的记忆系统"
sidebarGroup: "Hermes Agent"
shortTitle: "0003 学习闭环与数据飞轮"
order: 3
date: 2026-09-01
category: "AI"
tag:
  - "Hermes Agent"
  - "源码"
  - "Agent"
description: "Hermes Agent 源码系列第 3 篇：memory 双文件与门禁、/learn 管线、curator 策展、FTS5 零成本召回，以及轨迹压缩六步策略与召回率 eval 矩阵。"
---

# 0003 · 学习闭环与数据飞轮：为训练下一代模型而生的记忆系统

> **源码仓库解读 · Hermes Agent 系列第 3 篇**
> 主线：[0002 巨核与窄腰](./0002-narrow-waist.md)
> 关键文件：`agent/memory_manager.py`（1436 行）· `tools/memory_tool.py` · `agent/learn_prompt.py` · `agent/curator.py`（2057 行）· `tools/session_search_tool.py` · `batch_runner.py` · `trajectory_compressor.py` · `evals/compaction/`

## 为什么读

"自我改进"是 2026 年 agent 产品的通用形容词，多数实现停在"往 memory.md 追加几行"。Hermes 是少数把学习做成**带生命周期管理与质量验收的子系统**的：有写入门禁、有安全审计、有后台策展、有跨会话召回，甚至有技能使用账本——而这条学习管线的最外侧，接着一条通向模型训练的数据飞轮。本文从内环到外环逐环验证。

```
经验(会话) ──┬──> MEMORY.md / USER.md          ← memory 工具 + 写入门禁
             ├──> skills/*/SKILL.md             ← /learn + skill_manage + 安全校验
             │        └──> curator 后台策展      ← 过期/归档/合并自动流转
             └──> session DB (FTS5)             ← session_search 跨会话召回
                        │
（外环）批量轨迹 → 轨迹压缩 → 召回率验收 → 下一代工具调用模型训练
```

## 内环一：记忆——两个 Markdown 文件的严肃化

落盘层朴素得惊人：`~/.hermes/` 下两个文件（`tools/memory_tool.py`）——**MEMORY.md**（agent 的个人笔记：环境事实、项目状态、踩过的坑）与 **USER.md**（agent 眼中的你：偏好、沟通风格、画像）。朴素外表下是三道工程：

1. **写入门禁**（`_apply_write_gate`）：记忆不是 append-only 垃圾场，更新必须带 `old_text` 精确替换，改不动就报错——防幻觉式覆写；
2. **漂移检测**（`_drift_error`）：读取时校验与 `.bak` 快照一致性，发现外部改动就拒绝盲写；
3. **快照消毒**（`_sanitize_entries_for_snapshot`）：进系统提示前清洗。

记忆进上下文的通道在 `agent/memory_manager.py`：`MemoryManager` 是**多提供方总线**——内置记忆之外可挂 [Honcho](https://github.com/plastic-labs/honcho)（辩证式用户建模）等第三方 provider（provider 标识明列 `'builtin', 'honcho', 'hindsight'`）。每次用户发言触发 `prefetch_all(query)`——按当前话语主动检索相关记忆注入提示，而非全量塞入。细节亮点：`StreamingContextScrubber` 在**流式输出过程中**实时清洗 PII——记忆系统开始读私人笔记时，隐私工程已前置到字节流层。

## 内环二：技能——/learn 管线与"作者即运行时"

技能是学习的基本单位：目录 + `SKILL.md`（兼容 [agentskills.io](https://agentskills.io) 开放标准），内置 13 类。最有意思的设计是 **`/learn` 没有独立蒸馏引擎**（`agent/learn_prompt.py` 原话："There is no separate distillation engine"）：`build_learn_prompt()` 只构造**一个提示**，让运行中的 agent 用现有工具（`read_file`/`search_files`/`web_extract`/当前对话）收集素材，调用 `skill_manage` 按官方规范成稿——描述 ≤60 字符、固定章节顺序、大素材走知识库布局（瘦索引 + 按需 `skill_view` 加载的 `references/` 分章）。

这个选择非常聪明：**作者就是运行时**。技能创作不需要新模型管线、不新增核心工具，于是在本地、Docker、远程沙箱后端上行为完全一致——0002 的"细腰"哲学在学习系统的兑现。

但"agent 自己写技能"带来别家没有的威胁模型：**模型生成的代码要落盘执行**。所以技能生命周期挂了完整安全链（`tools/` 下可数）：`skills_guard.py` → `threat_patterns.py`（威胁特征，含零宽字符等不可见字符检测）→ `skills_ast_audit.py`（AST 级审计）→ `skillevaluator_scan.py` → `tirith_security.py`，外加 `skill_provenance.py`（来源追溯）与 `skill_usage.py` + `skill_ledger.py`（使用账本）。

## 内环三：策展人——技能也会变旧

`agent/curator.py`（2057 行）是闭环里最没有竞品的部件：后台守护按 `interval_hours` / `min_idle_hours` 触发 `apply_automatic_transitions()`，对技能做**状态自动流转**——`stale_after_days` 标过期、`archive_after_days` 归档、`consolidate` 合并碎片、`prune_builtins` 连内置都允许修剪；策展报告落盘，删除受 `curator_consolidation_delete_guard` 保护，置顶技能有 `_pinned_guard` 免死金牌。

它与 0002 的 loop 内 **skill nudge** 成对：nudge 管"该不该沉淀"（实时，`_iters_since_skill` 在实际使用 `skill_manage` 时归零），curator 管"沉淀后怎么演化"（离线，按天）。**一个管生长，一个管代谢**——多数"记忆系统"只有前者。

## 内环四：召回——零 LLM 成本的跨会话搜索

`tools/session_search_tool.py`：单工具四形态（参数自动推断）——**DISCOVERY**（`query` 触发 FTS5 + 按会话谱系去重；自适应细节：Top1 全量水合 ±5 消息窗口 + 首尾锚点，其余只给锚点）；**SCROLL**（`session_id` + `around_message_id`，锚点 ±N 窗口滚动）；**READ**（整会话或有界头/尾视图）；**BROWSE**（时间线浏览近期会话）。

注释反复强调：**"No LLM calls anywhere"**——全部是纯 SQLite（FTS5 索引，`hermes_state_search.py` 含增量合并与重建限流）。跨会话召回不花一枚 token，agent 可以频繁"回看过去"而不做成本权衡。**最贵的 LLM 调用只留给摘要与蒸馏，最频繁的检索交给传统索引**——这个分工值得所有做 agent 记忆的团队抄走。

## 外环：数据飞轮——为训练下一代模型而生

普通公司做 agent 为了卖产品；模型实验室做 agent，产品只是飞轮一环。`batch_runner.py` 是批量生成轨迹的总装线：数据集装载、多进程并行、**断点续跑**（`--resume`）、轨迹落盘。还有个隐蔽参数 `--distribution`——**工具集概率分布**（`toolset_distributions.py`）：每个 prompt 按概率抽工具集（如 `image_gen` 分布让图像工具 100% 出现）。训练数据里工具集的出现分布直接决定下一代模型对工具的选择先验，**这是一门手艺**。

轨迹格式（`agent/trajectory.py`）：ShareGPT 风格 JSONL，完成与失败**分文件**（`trajectory_samples.jsonl` / `failed_trajectories.jsonl`），带 `<REASONING_SCRATCHPAD>` → `<think>` 的净化转换。`mini_swe_runner.py` 证明格式环境无关：SWE 任务跑在 local/docker/modal 上输出同样格式，与压缩管线无缝衔接。

超预算怎么办？`trajectory_compressor.py` 的六步策略值得整段抄录：

> 1. Protect first turns (system, human, first gpt, first tool)
> 2. Protect last N turns (final actions and conclusions)
> 3. Compress MIDDLE turns only, starting from 2nd tool response
> 4. Compress only as much as needed to fit under target
> 5. Replace compressed region with a single human summary message
> 6. Keep remaining tool calls intact (model continues working after summary)

保护头部（任务定义）、保护尾部（结论）、只压中段且从第二个工具响应开始（第一轮工具往返是最有教学价值的示范）、按需不超卖。`datagen-config-examples/trajectory_compression.yaml` 显示连 tokenizer 都可配置（示例 `moonshotai/Kimi-K2-Thinking`，目标 29000 token）——**为哪家模型的分词器优化是显式决策**。

最后是质量验收：`evals/compaction/` 回答"压缩到底损失了什么"——从**即将被压缩掉的区域**生成一库事实召回问题（按转录缓存保证可复现），跑过压缩策略矩阵（current default / aggressive tail / codex-style…），让**全新 LLM** 只看压缩后上下文闭卷作答，对照金标准评分，产出**召回准确率 vs 保留 token 数**记分卡。压缩策略从"感觉不错"变成可量化的召回-成本曲线——训练视角（这条轨迹还能教会模型多少）与产品视角（用户上下文还能召回多少）在此同构。

## 对照 dsh 与收束

| | dsh（DeepSeek Harness） | Hermes |
|---|---|---|
| 学习是否一等公民 | **否**——harness 只负责把事实如实记录成事件日志 | **是**——记忆/技能/策展/召回是核心卖点 |
| 知识形态 | 会话事件日志（供上层消费） | MEMORY/USER.md、SKILL.md（产品自带语义） |
| 知识演化 | 无内置机制 | curator 流转 + nudge 提醒 |
| 记录的目的 | 审计与重现（"模型可见即已记录"） | 蒸馏与进化（轨迹 → 训练数据） |

严格说这不是优劣而是**层次之差**：dsh 把"学习"留给搭平台的人，Hermes 把"学习"做成了产品本身——并让"用"反哺"造"（会话 → 轨迹 → 下一代模型 → 更强的会话）。选型问题因此变成一句反问：你要的是**造 agent 的地基**，还是**一个已经会成长、且越用越强的 agent**？

---

> 下一篇：[0004 产品化外围：网关、多端与任务编排](./0004-product-surface.md)
