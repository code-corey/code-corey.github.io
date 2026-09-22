---
title: "DeepSeek Bets Big on Huawei Chips to Bypass U.S. Export Controls（DeepSeek 押注华为芯片绕开出口管制）"
shortTitle: "DeepSeek 押注华为芯片"
sidebarGroup: "2026-09-22"
order: 8
date: 2026-09-21
category:
  - "每日 AI 简报"
tag:
  - "模型发布 & 行业动态"
description: "The Information 独家报道：DeepSeek 正大举押注华为芯片以绕开美国出口管制。基座厂商的算力转向是影响国内推理/训练基础设施选型的战略级信号。"
---

# DeepSeek Bets Big on Huawei Chips to Bypass U.S. Export Controls（DeepSeek 押注华为芯片绕开出口管制）

> 📅 2026-09-21 | 🏷️ 模型发布 & 行业动态 | ⭐ Google News 英文源（The Information）
> 🔗 原文：https://news.google.com/rss/articles/CBMingFBVV95cUxNNGdQTkhtZGdCYl90YWNhLUMtbXJPUjBvd3piRlI1NU5Rdkw0SjFPQ3Y2N1lFd2d2LVBCNzVERXEzQUczZmg5aGJnQXhoX1MzNFFCMGZGaXUxYVUtQmFka0dQTzgzM2o0ai1tamxOc2ZOVVI0QWVzeDIxUUxUQVZjWFM5aEJDUVBETHF1OThwQmVNZmtvNU4yLXoyeTRtUQ

## 是什么

据 The Information 9 月 21 日报道，中国头部大模型公司 **DeepSeek 正在大举押注华为芯片**，以绕开美国出口管制对先进 AI 算力的限制。这属于本简报认定的战略级信号：基座模型厂商的算力底座转向，会沿供应链影响国内所有 AI 基础设施的选型预期。

## 🔍 小白解读

### 先说几个词

- **DeepSeek**：中国的明星大模型公司，以极低的训练成本做出对标一线的模型（V3/R 系列）而震动业界。
- **出口管制（Export Controls）**：美国限制最先进 AI 芯片卖到中国的政策，等于掐住了国内算力供给的水龙头。
- **华为昇腾（Ascend）**：华为的 AI 芯片产品线，是目前国内最被寄予厚望的替代算力。
- **软件生态**：芯片能跑只是第一步，配套的软件工具链（如英伟达的 CUDA）才是真正的护城河——好比买了新灶台，还得有整套锅具和菜谱。

### 这篇到底在说什么

打个比方：以前国内 AI 公司做饭主要靠"进口高级灶台"（英伟达芯片），现在进口受限，头牌餐厅（DeepSeek）带头把厨房换成"国产灶台"（华为昇腾）。头牌餐厅换灶台的示范效应远大于普通餐厅——它会带动上游供应商投入适配、下游同行敢于跟进，国产灶台的"菜谱库"（软件生态）因此加速补齐。需要说明的是，这是一篇媒体独家报道，具体投入规模、迁移进度等细节以 The Information 原文与后续官方信息为准。

### 这跟普通人有什么关系

国内用 AI 服务的成本和供给稳定性，很大程度上取决于算力从哪来。头部厂商完成国产芯片适配后，国内 AI 服务的供应会更稳、长期价格更有下行空间；对在 AI 相关行业工作的人来说，昇腾/CANN 生态的岗位需求会继续升温。

## 为什么值得架构师关注

- **供应商风险重估**：国内项目的推理/训练算力规划中，"英伟达供给不确定性"权重上升，昇腾路线从"合规备选"变为"战略主线"的信号更明确了。
- **软件生态是关键变量**：CUDA 与昇腾 CANN 的算子覆盖、推理框架支持度差距，是迁移成本的主要来源，选型评估应按"算子覆盖率 × 迁移人力"量化。
- **模型-芯片协同红利**：若 DeepSeek 后续开源针对昇腾优化的推理/训练方案，将直接外溢改善整个国产算力生态，值得持续跟踪其开源动作。
- **与国内信源互证**：同日 21财经刊发陈云霁（寒武纪联合创始人）访谈称"国产 AI 芯片进入加速期"（本期第 10 篇），中英文信源同日共振，信号可信度高。

## 核心内容

- The Information 独家报道（一手调查报道）：DeepSeek 大举押注华为芯片，动机是绕开美国出口管制。
- 报道日期 2026-09-21，经 Google News 英文源收录；具体投入与进度细节以原文为准。
- 战略含义：头部基座厂商算力国产化，将加速昇腾软件生态成熟与国内算力供应链重构。
- 关联背景：国内同日发布的《2026 年中国人工智能计算力发展评估报告》预计智能算力规模增长 87.9%（本期缓存信源）。

## 行动建议

建议纳入规划：国内部署项目在下一轮容量规划中，将昇腾推理栈的成熟度（算子覆盖、vLLM/MindIE 等框架支持、单位推理成本）正式列入评估维度，并预留双栈兼容设计；跟踪 DeepSeek 后续是否放出昇腾适配的开源成果——那将是生态成熟度的最硬指标。
