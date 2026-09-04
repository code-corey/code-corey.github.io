# News 模块开通 + 简报迁移 + 定时任务改造

## 背景结论（已勘察）

- 站点：VuePress Theme Hope（`E:\MyGithub\langkemaoxin.github.io`），push 到 master 触发 GitHub Actions 自动部署
- 模块注册三件套：`scripts/sidebar.config.mjs`（modules 数组）→ `pnpm sidebar:gen` → `src/.vuepress/navbar.ts`
- 站点规范要求每篇 md 有 frontmatter：title / sidebarGroup / shortTitle / order / date / category / tag / description
- 简报源数据：`G:\MyNewPaper\`，4 个日期文件夹共 44 篇 md（`_old/` 为作废草稿，不迁移）
- 现有定时任务：Windows 计划任务 `PiDailyAIBrief`，每天 08:30 → `~/.pi/daily_ai_brief.cmd`（抓取 → Pi 写稿到 G 盘 → 去重标记）

## 执行步骤

### Wave 1 — 站点开通 News 模块
1. 创建 `src/News/` 目录 + `README.md`（模块首页，含说明和日期索引）
2. `scripts/sidebar.config.mjs` 注册 `{ path: "/News/", dir: "News" }`（排在 Ai 之后）
3. `src/.vuepress/navbar.ts` 顶部导航加「每日 AI 简报」入口（📰 newspaper 图标，放 AI 旁边）
4. 跑 `pnpm sidebar:gen` 生成侧边栏

### Wave 2 — 迁移历史数据（44 篇）
5. 写迁移脚本：把 `G:\MyNewPaper\2026-09-*\*.md` 复制到 `src/News/<日期>/`，同时：
   - 从正文 `# 标题` 和 `> 📅 日期 | 🏷️ 分类 | ⭐ 热度` 提取信息，注入规范 frontmatter
   - 跳过 `_old/` 目录
6. 重跑 `pnpm sidebar:gen`，确认新页面全部进入侧边栏
7. 本地 build 验证（或 dev 冒烟）确认无构建错误

### Wave 3 — 定时任务改造
8. 更新 `~/.pi/daily-ai-brief.md` 指令文件：
   - 输出目录改为 `E:\MyGithub\langkemaoxin.github.io\src\News\<当日日期>\`
   - 要求生成的每篇 md 自带规范 frontmatter（title/sidebarGroup/shortTitle/order/date/category/tag/description）
9. 更新 `~/.pi/daily_ai_brief.cmd`：
   - 写稿目标改到 News 目录
   - 写完后自动 `pnpm sidebar:gen`
   - 自动 `git add -A && git commit -m "📰 每日简报 YYYY-MM-DD" && git push origin master`
   - `brief_seen.py mark` 路径同步改为新目录
10. 手动触发一次验证整条链路（或只 dry-run 校验脚本语法）

### Wave 4 — 收尾
11. G 盘旧数据保留不删（作为原始归档）
12. 提交本次所有站点变更并 push，触发部署
13. 完成报告

## 风险与说明
- git push 走 Windows 凭据管理器（用户平时手动 push 正常），非交互环境应可用；若失败会在日志中可见
- 每日一提交会产生较多 commit，如介意可改为每日简报自动提交 + 手动周更压缩
- GitHub Actions 免费额度对公开仓库无限制，每日一次构建无压力
