---
title: "Pg_vectorsearch：比 pgvector 内置索引更快的向量索引（工程 & Agent）"
shortTitle: "pg_vectorsearch 新向量索引"
sidebarGroup: "2026-10-15"
order: 1
date: 2026-10-14
category:
  - "每日 AI 简报"
tag:
  - "工程 & Agent"
description: "Timescale 开源 pg_vectorsearch，宣称在相同召回率下比 pgvector 内置的 IVFFlat 与 HNSW 更快，RAG 向量检索选型添新选项。"
---

# Pg_vectorsearch: An index that is faster than pgvector's IVFFlat and HNSW（比 pgvector 的 IVFFlat 和 HNSW 更快的向量索引）

> 📅 2026-10-14 | 🏷️ 工程 & Agent | ⭐ HN 186分/48评论
> 🔗 原文：https://github.com/timescale/pg_vectorsearch
> 💬 HN 讨论：https://news.ycombinator.com/item?id=50086165

## 是什么

Timescale（PostgreSQL 生态知名公司，TimescaleDB 的缔造者）发布了开源项目 pg_vectorsearch，官方宣称这是一个比 pgvector 内置的 IVFFlat 和 HNSW 索引更快的向量索引。项目发布后迅速登上 HN 首页，获得 186 分和 48 条评论，讨论集中在真实场景下的性能对比与召回率表现。

## 🔍 小白解读

### 先说几个词

- **向量检索**：把文字、图片变成一串数字（向量），再找「数字最相近」的内容。就像把每道菜按「咸度、辣度、油度」打分，你说想吃微辣，系统就找分数最接近的菜。
- **pgvector**：PostgreSQL 数据库的一个插件，让这个老牌关系型数据库也能存向量、做相似度搜索，是目前「一个库搞定业务数据 + 向量数据」的主流方案。
- **IVFFlat / HNSW**：pgvector 内置的两种向量索引算法。IVFFlat 像把图书馆的书先按大类分架再找；HNSW 像给书建了一张多层跳转地图，顺着导航走，快但占内存。
- **召回率（Recall）**：检索结果里「真正该找到的」占多少。快但老漏东西的索引没有意义，所以评测都要看「召回率相同时谁更快」。
- **RAG**：让大模型回答问题前先去知识库里「查资料」的技术，查资料那一步用的就是向量检索。

### 这篇到底在说什么

打个比方：pgvector 就像在 PostgreSQL 这个「万能仓库」里划了一块区域能存「气味样本」（向量），但找起来用的是两种通用货架方案。现在 Timescale 说：我造了一个更快的新货架。仓库里堆了几百万条文档向量、每次查询要在一秒内返回的 RAG 系统里，索引快慢直接决定用户体验和服务器账单。HN 上 48 条评论主要在掰扯：新索引到底在什么数据规模、什么过滤条件下快，召回率有没有偷偷打折——这也是任何向量索引评测都该追问的两个问题。

### 这跟普通人有什么关系

你公司内部的智能客服、知识库问答，背后大概率跑着向量检索。索引升级意味着同样一台服务器能扛更多用户、答案返回更快，或者每月云账单更低。对个人开发者，这意味着自建 RAG 应用时多了一个不必引入独立向量数据库的选择。

## 为什么值得架构师关注

- **减少组件**：如果业务数据已经在 PostgreSQL 里，一个更快的原生向量索引意味着可以砍掉独立的向量库（Milvus/Qdrant 等省下的不只是 license，还有一套数据同步与运维）。
- **选型依据需要实测**：向量索引的「快」必须在真实数据分布、真实过滤条件（如 metadata 过滤）、目标召回率下验证，README 数字只能作为初筛。
- **供应商信号**：Timescale 深耕 PG 生态多年，此项目表明主流 PG 厂商正把向量检索当作战略赛道，pgvector 生态会加速内卷，跟随者受益。

## 核心内容

- Timescale 发布开源项目 pg_vectorsearch，定位为 pgvector 的更高速向量索引。
- 官方对比对象是 pgvector 内置的两种索引：IVFFlat 与 HNSW，宣称速度更优。
- 项目上线即获 HN 186 分 / 48 评论，社区关注度高，HN 讨论聚焦实测条件与召回率公平性。
- 对 RAG 场景的直接意义：向量检索是 RAG 链路中最频繁调用的组件，索引性能直接影响延迟与成本。

## 行动建议

在 staging 环境用真实业务数据（含 metadata 过滤的真实查询模式）对比 pgvector HNSW 与 pg_vectorsearch 的 QPS / P99 延迟 / 内存占用 / 召回率曲线，再决定是否迁移；同时确认项目 license、维护活跃度与 Timescale 的商业支持条款。已有独立向量库的团队可将其列为「降本合并」评估项。
