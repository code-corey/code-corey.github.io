---
title: "We got admin access to Baseten's production GitHub in 25 minutes（25 分钟拿下 Baseten 生产 GitHub 管理权）"
shortTitle: "Baseten供应链漏洞复盘"
sidebarGroup: "2026-09-16"
order: 9
date: 2026-09-15
category:
  - "每日 AI 简报"
tag:
  - "安全 & 评测"
description: "安全公司 Strix 黑盒扫描推理厂商 Baseten，25 分钟从公开 Harbor 容器镜像的构建历史里挖出仍有效的 GitHub PAT：repo 权限、admin+push 主产品与 GitOps 仓库。教科书级供应链复盘。HN 196分/106评论。"
---

# We got admin access to Baseten's production GitHub in 25 minutes（25 分钟拿下 Baseten 生产 GitHub 管理权）

> 📅 2026-09-15 | 🏷️ 安全 & 评测 | ⭐ HN 196分/106评论
> 🔗 原文：https://www.strix.ai/blog/baseten-harbor-github-pat-takeover

## 是什么

安全公司 Strix（产品是自主渗透测试 Agent）在评估推理服务商 Baseten 时做了次黑盒扫描：无凭据、无源码，25 分钟后拿到一枚仍有效的 GitHub 个人访问令牌（PAT）——对 Baseten 主产品仓库、驱动集群的 GitOps 仓库和 Homebrew tap 拥有 admin+push 权限，对多个私有仓库（含按客户划分的仓库）可读写。源头是一个公开可拉的 Harbor 容器镜像。

## 🔍 小白解读

### 先说几个词

- **容器镜像（image）**：把应用和它的运行环境打包成的「安装光盘」。镜像分层存储，每层记录一次构建动作。
- **Harbor**：企业常用的容器镜像仓库管理系统（存「光盘」的图书馆），Baseten 的这个 Harbor 有个项目设成了公开。
- **构建历史（build history）**：镜像的「出厂记录」，记录每一层是怎么生成的，包括执行过的命令原文——而它随镜像一起公开可下载。
- **PAT（个人访问令牌）**：代替密码访问 GitHub 的凭证，权限可大可小；泄露=把账号钥匙插在门上。
- **黑盒测试**：不给测试者任何内部资料，完全从外部像真实攻击者一样探测——最接近真实威胁的测法。

### 这篇到底在说什么

Strix 因为要用 Baseten 做推理，出于安全习惯先扫了一遍它的域名面。侦察阶段发现一个 Harbor 镜像仓库，其中一个项目无需任何认证就能列出内容、拿匿名拉取令牌、下载镜像清单和层数据。关键的转折是：Strix 没有停在「暴露了一个仓库」这种浅层结论，而是真的把镜像拉下来解剖——用 TruffleHog 扫密钥、再直接看镜像配置里的构建历史。结果在一条 2023 年 3 月 3 日的构建记录里，发现有人把 GitHub 令牌作为构建参数（ARG GITHUB_TOKEN）传进去、又原样写进了 RUN 命令。删掉镜像里的密钥文件没有用：构建历史里还有一份，而且这枚令牌三年多之后依然有效。验证权限后 Strix 停手并立即负责任披露；Baseten 安全团队表现专业，次日下午就锁定仓库项目并轮换了令牌。事故根因是常见模式：构建时需要拉私有依赖，于是把 PAT 当构建参数传入——但它会永久烙进镜像配置。值得一提的是，镜像里还躺着一对 AWS 密钥，幸好早已失效。

### 这跟普通人有什么关系

很多公司都在用容器镜像和 CI/CD，这类「构建参数泄密」的坑不分大小厂。你的代码仓库、客户数据仓库可能正因为一枚三年前的旧令牌而裸奔。对个人开发者，同理适用于「把密钥写进 Dockerfile」的习惯。

## 为什么值得架构师关注

- **攻击面清单要加一条**：容器镜像仓库（尤其误设为公开的项目）是密钥泄露的高产矿；供应链安全审计必须覆盖「镜像层 + 构建历史 + registry 权限配置」三处。
- **CI/CD 密钥注入模式的直接整改项**：ARG 传 PAT 的模式应全面排查，改为 BuildKit 的 --mount=secret 等不落盘机制；已泄露令牌要按「可能已泄露三年」的最坏假设处理权限与审计日志。
- **第三方服务商安全评估的实操样本**：Strix 的做法（先黑盒再深挖、验证权限但不越界、快速披露）可以作为厂商安全评审的参考流程；Baseten 次日修复的响应速度也是供应商应急能力的一个标尺。

## 核心内容

- 入口链：证书日志与子域名枚举 → 发现 gcp-us-east4-zlw.registry.baseten.co 的 Harbor → 匿名列出项目、获取拉取令牌、下载 baseten/baseten-app 镜像清单与层。
- 战利品：bas*tenbot 的 GitHub PAT（X-OAuth-Scopes: repo），对主产品仓库/GitOps 仓库/Homebrew tap 为 admin+push，另有多个私有仓库读写（含按客户划分的仓库）；另有一对已失效的 AWS 密钥。
- 泄密位置：Docker 镜像配置的构建历史（history[].created_by 的 RUN 命令里 GITHUB_TOKEN 被原样展开），该构建步骤执行于 2023 年 3 月 3 日；令牌至 2026 年 7 月被发现时仍有效，三年多未轮换、未失效。
- 根因模式：构建期需拉私有 GitHub 依赖，遂以 ARG GITHUB_TOKEN 形式传入——构建参数会永久写入镜像配置，删除文件层面的密钥无济于事。
- 处置：Strix 未克隆客户仓库、未推送任何改动，取证后立即负责任披露；Baseten 确认为危急级，次日下午锁定 registry 项目并轮换令牌。

## 行动建议

本周就该做的自查：扫描自家所有镜像仓库的公开/私有配置与历史镜像；对 CI 构建历史跑一次 TruffleHog 类全量密钥扫描；排查 ARG/ENV 传密钥的构建脚本并全部改造；核查 GitHub/GitLab 组织里「长期未轮换的机器账号令牌」并建立轮换与最小权限策略。选型推理/模型服务商时，把「容器 registry 与 CI 构建卫生」列入问卷。
