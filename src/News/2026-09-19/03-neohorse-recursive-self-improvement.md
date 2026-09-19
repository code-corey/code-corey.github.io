---
title: "NeoHorse-1: Towards Recursive Self-Improvement via Agentic Post-Training with Routing Harness（NeoHorse-1：智能体后训练递归自我改进）"
shortTitle: "NeoHorse 递归自我改进"
sidebarGroup: "2026-09-19"
order: 3
date: 2026-09-19
category:
  - "每日 AI 简报"
tag:
  - "值得研究的仓库"
description: "慢热发现：NeoHorse 提出 Agentic Post-Training + Routing Harness 的递归自我改进路线，配套 4B/9B 开源模型在 HuggingFace 获数千点赞。"
---

# NeoHorse-1: Towards Recursive Self-Improvement via Agentic Post-Training with Routing Harness（NeoHorse-1：智能体后训练递归自我改进）

> 📅 2026-09-19 | 🏷️ 值得研究的仓库 | ⭐ ⭐572（30天慢热发现）· HF NeoHorse-1-4B 2.4k likes/22.7k downloads、NeoHorse-1-9B 887 likes
> 🔗 原文：https://github.com/TokenRhythm/NeoHorse
> 💬 相关模型：https://huggingface.co/TokenRhythm/NeoHorse-1-4B

## 是什么

NeoHorse 是一个围绕「递归自我改进」（Recursive Self-Improvement）的开源项目：通过 Agentic Post-Training（让智能体在后训练阶段自主生成数据、自我迭代）配合 Routing Harness（路由执行框架）来提升模型。项目配套发布了 NeoHorse-1-4B 与 NeoHorse-1-9B 两个开源权重模型，其中 4B 版在 HuggingFace 上获得约 2368 个赞、2.2 万+下载。仓库创建于 2026-09-04，两周内积累 572 星，属于 30 天慢热窗口的典型样本。

## 🔍 小白解读

### 先说几个词

- **递归自我改进（RSI）**：AI 用自己当前的能力产出训练数据、再训练自己，形成「滚雪球」式提升。好比学生自己出题、自己做题、再根据错题改进学习方法，循环往复。
- **后训练（Post-Training）**：基座模型出厂后的再加工程序，包括指令微调、偏好对齐等。好比汽车下线后的调校改装。
- **Agentic Post-Training**：把「智能体自主干活」的轨迹变成训练数据喂回模型——让训练材料来自真实任务执行而非人工标注。
- **Routing Harness**：任务分发与执行框架，决定哪个请求走哪条处理路径，好比快递分拣中心。
- **慢热仓库**：不是发布即爆红，而是在数周内持续稳定涨星的项目，往往生命周期更长。

### 这篇到底在说什么

打个比方：大多数模型像毕业后就不再学习的大学生，而 NeoHorse 想造一个「边工作边进化」的员工——它让智能体在真实任务里跑，把干活的轨迹回收成教材，再喂回模型继续训练，用路由框架控制这个循环不跑偏。项目最大的说服力不在 README，而在它真的把 4B 和 9B 两个尺寸的开源模型放上了 HuggingFace，而且社区用点赞和下载投了票：4B 版两周多拿下约 2400 个赞。GitHub 上 572 星、节奏平稳不爆红，属于典型的慢热型项目。它的方向——用 agent 轨迹驱动后训练——与本周 harness 研究的热潮相互印证，说明「模型训练」与「Agent 工程」正在合流。

### 这跟普通人有什么关系

如果这条路线跑通，未来小尺寸模型（能跑在笔记本上的 4B/9B）也能通过自我迭代持续变强，本地跑 AI 助手的体验会越来越好，数据也不用上传云端。

## 为什么值得架构师关注

- **训练范式信号**：Agentic Post-Training 把数据飞轮从「人工标注」转向「智能体轨迹回收」，对规划自建微调管线的团队，这意味着数据基础设施要为轨迹采集、过滤、回灌做设计。
- **小模型路线的可行性参考**：4B/9B 尺寸 + 自我改进，是「端侧/私有化部署」场景值得跟踪的组合，直接关系到本地推理成本与数据不出域方案。
- **工程耦合度**：Routing Harness 与训练循环耦合的设计，提示未来 Agent 平台与训练平台会更深度融合，采购时需关注厂商是否具备闭环能力。

## 核心内容

- 仓库定位：Agentic Post-Training + Routing Harness 实现递归自我改进（官方描述）。
- 配套开源模型：NeoHorse-1-4B（HF 约 2368 likes / 22666 downloads，2026-09-05 发布）、NeoHorse-1-9B（约 887 likes）。
- GitHub 572 星，创建于 2026-09-04，两周内平稳增长（本期 30 天慢热窗口入选，每类目限 1 篇）。
- 与本周 harness 主题（如编码 Agent harness 实证研究）形成呼应：训练与执行框架正在合流。

## 行动建议

值得研究的方向：安排 1 名工程师复现其 4B 模型的推理基线，对照同尺寸主流模型评估实际收益；若团队在做数据飞轮/自我改进类项目，重点研究其轨迹回收与路由设计。注意：项目方法论细节以仓库文档与模型卡为准，建议先小规模验证再谈落地。
