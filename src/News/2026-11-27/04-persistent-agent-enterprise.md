---
title: "langchain-samples/Persistent-Agent：常驻企业 Agent 参考实现——记忆、浏览器与后台主动式 Playbook"
shortTitle: "Persistent-Agent 常驻Agent"
sidebarGroup: "2026-11-27"
order: 4
date: 2026-11-24
category:
  - "每日 AI 简报"
tag:
  - "值得研究的仓库"
description: "LangChain 官方示例仓库发布 Persistent-Agent：常驻运行、目标导向的企业 Agent 参考实现，内置记忆、浏览器操作、数百工具与后台主动式 playbook，基于 Managed Deep Agents（MDA）构建。"
---

# langchain-samples/Persistent-Agent：Persistent, proactive, always-on agent for the enterprise（常驻企业级主动式 Agent 参考实现）

> 📅 2026-11-24（创建） | 🏷️ 值得研究的仓库 | ⭐ 144 Star（7 天窗口）| 语言：Python | LangChain 官方 samples
> 🔗 原文：https://github.com/langchain-samples/Persistent-Agent

## 是什么

**Persistent-Agent** 是 LangChain 官方 samples 组织发布的新仓库（创建于 2026-11-24，一周约 144 Star），定位是**企业级的常驻式、主动式、目标导向 Agent 参考实现**。官方描述其能力组合：自带记忆（memory）、浏览器操作（browser use）、数百个工具，以及可在后台自动执行的「主动式 playbook」，构建在 LangChain 的 **Managed Deep Agents（MDA）** 之上。一句话概括：它示范的不是「问答机器人」，而是「一直在线、自己找活干的数字员工」。

## 🔍 小白解读

### 先说几个词

- **常驻式 Agent（Persistent Agent）**：不是你问一句它答一句，而是一直运行着，持续朝一个目标推进。像从「有事才找的顾问」变成「全职坐班的员工」。
- **主动式（Proactive）**：不等指令，自己发现该做的事并执行。比如后台监测到竞品降价，主动整理报告发给你。
- **Playbook（剧本/手册）**：预先定义好的标准操作流程。Agent 按剧本自动执行一串动作，像新员工照着 SOP 干活。
- **Browser Use**：让 Agent 自己操作网页浏览器——打开页面、点击、填表、抓取结果，处理没有 API 的老系统。
- **Managed Deep Agents（MDA）**：LangChain 提供的托管式「深度 Agent」基础设施，把长任务编排、工具管理这类底层杂务平台化。

### 这篇到底在说什么

2026 年企业 Agent 落地的最大瓶颈早已不是「模型聪不聪明」，而是「怎么让它像员工一样持续工作」：要有长期记忆、要能操作没有接口的系统、要能主动干活而不是等着被问。LangChain 把这套「数字员工」的完整零件清单打包成一个官方参考实现：记忆负责记住之前的交互，浏览器负责钻进没有 API 的系统，几百个工具负责具体执行，playbook 负责让它在后台自己找活。打个比方：以前的 AI 应用像「按次收费的外包顾问」，这个项目在示范怎么搭一个「24 小时在岗的正式员工」。它值钱的地方在于「参考实现」四个字——每一层怎么搭，代码里都有答案。

### 这跟普通人有什么关系

如果你带团队，未来招聘名单里可能出现「AI 员工管理」这样的职责：给 AI 员工定目标、审 playbook、验收后台干完的活。对小公司，常驻 Agent 意味着不用雇专职人员也能维持一些「有人盯着」的流程——比如每天盯数据、整理周报初稿。

## 为什么值得架构师关注

1. **「常驻 + 主动」是 Agent 平台化的下一站**：大量团队停留在「请求-响应」式 Agent，此仓库给出了向「常驻目标导向」演进的完整组件图——记忆、浏览器、工具规模、后台任务调度各自的实现位置。
2. **官方参考实现的架构可信度**：来自 langchain-samples 官方组织且基于 MDA，代码可作为自建 Agent 平台的架构评审基准，比自己拼装的方案少踩很多编排层的坑。
3. **Playbook 机制是企业落地的关键设计**：把「主动性」约束在预定义剧本内（而非完全放权），是可控主动式的务实折中——权限审批、执行范围都可以挂在 playbook 粒度上。
4. **风险提示**：144 Star 仍属早期，样本代码不等于生产级；「后台主动执行」必须配套权限白名单与操作审计，否则等于给了一个没有监控的全职员工。

## 核心内容

- LangChain 官方 samples 新仓库，2026-11-24 创建，一周约 144 Star，Python 实现。
- 定位：常驻、主动、目标导向的企业 Agent，构建于 Managed Deep Agents（MDA）。
- 能力四件套：长期记忆、浏览器操作、数百个工具、后台主动式 playbook。
- 与常规「问答式 Agent」的本质区别：持续运行、自主发现任务、后台执行。
- 官方描述自比「Muse / Instinct 的企业版」，参考实现属性大于产品属性。

## 行动建议

- 自建 Agent 平台的团队：把此仓库 clone 下来做一次架构走读，重点看记忆持久化方案与 playbook 的执行/审批模型，对照自家平台找差距。
- 评估 MDA（Managed Deep Agents）是否适合作为长任务编排层，与自研编排器做能力矩阵对比。
- 若引入「主动式」能力，先在只读场景试点（监测、汇总、报告），写操作留到权限模型完善之后。
- 了解即可：Agent 需求停留在问答/单次任务层面的团队，关注其 playbook 设计思想即可。
