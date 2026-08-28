---
name: write-blog
description: 当用户说「写一篇博客记录一下 / 写篇博客 / 记到博客里 / 发篇文章」等要求写博客时使用。往 Corey 的博客仓库（VuePress Theme Hope）写文章：确定目录、按规范写 frontmatter、更新系列导航、重跑 sidebar:gen。凡是要把内容落成博客文章的场景都用此 skill。
---

# 写博客（code-corey.github.io）

用户的博客仓库：`D:\MyGithub\code-corey.github.io`（Git Bash 路径 `/d/MyGithub/code-corey.github.io`）
技术栈：VuePress 2 + vuepress-theme-hope，pnpm 管理。

用户说「写一篇博客记录一下」时，按下面的流程执行。

## 1. 先弄清楚要写什么

- 如果用户只给了个话题，先确认三件事再动笔：**主题内容、归到哪个目录（模块/子目录）、是独立文章还是某系列的续篇**。
- 不确定就问，不要猜目录。

## 2. 选目录

文章必须放在 `src/<模块>/<子目录>/` 下，**不要直接扔在 `src/` 根或模块根**。

现有模块（`src/` 下的顶层目录）：
`Ai` `BigData` `DotNet` `Java` `Windows` `Tools` `English` `Notes` `Linux` `云原生` `中间件` `并发编程` `软件架构` `性能调优` `数据库` `分布式` `微服务` `源码剖析` `微信小程序` `前端` `亿级规模系统` `web3区块链`

- 归入现有子目录：直接放。
- 需要新建子目录：除了建文件夹，还要在 `scripts/sidebar/<模块>.mjs` 里加一项（title / icon / order），否则侧边栏组标题不对。
- 文件名用英文小写加连字符（kebab-case），如 `tcpdump-classroom-dialogue.md`。

## 3. frontmatter（必填，缺一不可）

```yaml
---
title: "文章完整标题"
sidebarGroup: "侧边栏组名（通常 = 子目录的 title）"
shortTitle: "侧边栏里显示的短标题"
order: 1                # 子目录内的排序数字，新文章一般取现有最大值 +1
date: 2026-08-23        # 今天日期，格式 YYYY-MM-DD
category: "工具"         # 所属大类，与模块对应（如 Tools → 工具）
tag:
  - "标签1"
  - "标签2"
description: "一句话摘要，会显示在列表和 SEO"
---
```

可用 `node scripts/validate-fm.js` 校验 frontmatter。

## 4. 系列文章的导航（三处，缺一不可）

如果文章属于系列（目录里已有多篇带「第 N/M 篇」的文章）：

1. **头部导航块**：`> 系列 · 组 · 第 N/M 篇` 计数行 + 上一篇/下一篇链接
2. **上一篇尾部**：把它的「下一篇」链接指向新文章，更新它的计数 M
3. **新文章尾部**：`➡️ 下一篇` 预告（没有下一篇就写「系列完结」）

批量重排参考 `scripts/rebuild-k8s-nav.mjs` 的做法：先列出全系列顺序表（SEQ），再一次性重建所有链接，防止改一半断链。

## 5. 收尾（每次必做）

1. `pnpm sidebar:gen` —— 新增/删除/改名文章后必须重跑，**绝不手改 `src/.vuepress/sidebar.ts`**
2. `pnpm docs:dev` 起本地预览，确认侧边栏和页面正常（用户确认后再关）
3. 改了文件名 → `grep` 全仓库搜旧 slug，把所有引用一次性替换掉
4. 提交 git（用户要求时）

## 6. 文风要求（来自仓库 CLAUDE.md）

- 聊天式说人话，不念稿；少加粗、少口号式句子
- 一轮只讲 1~2 个点，不贪多
- **师生对话实录**类文体（教学系列）：AI 当老师、用户当 0 基础学生，每次只讲一个概念，对话按时间顺序追加落盘；代码必须本地真实可运行，不能捏造运行结果
- 文中贴的代码要确保能运行；涉及最新 API/语法要先查最新稳定版文档

## 7. 硬性红线

- ❌ 不手改 `src/.vuepress/sidebar.ts`
- ❌ 不省略任何 frontmatter 字段
- ❌ 不把独立文章硬塞进系列、不打乱现有 order
- ❌ 不在文里编造「运行结果」「实测数据」——要么真跑，要么明说是示意
