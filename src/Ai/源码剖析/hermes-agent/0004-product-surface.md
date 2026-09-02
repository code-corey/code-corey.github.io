---
title: "0004 产品化外围：网关、多端与任务编排"
sidebarGroup: "Hermes Agent"
shortTitle: "0004 产品化外围"
order: 4
date: 2026-09-01
category: "AI"
tag:
  - "Hermes Agent"
  - "源码"
  - "Agent"
description: "Hermes Agent 源码系列第 4 篇：33,588 行网关与 23 平台动态枚举、turn_lease 并发事故复盘、微信/QQ/元宝适配器成色、Chronos 三跳信任与桌面三方权威。"
---

# 0004 · 产品化外围：网关、多端与任务编排

> **源码仓库解读 · Hermes Agent 系列第 4 篇**
> 主线：[0003 学习闭环与数据飞轮](./0003-learning-loop.md)
> 关键文件：`gateway/run.py`（**33,588 行**）· `gateway/session.py`（4,541 行）· `gateway/turn_lease.py` · `gateway/platforms/`（含 `weixin.py`、`qqbot/`、`yuanbao.py`）· `cron/` · `docs/chronos-managed-cron-contract.md` · `docs/kanban/multi-gateway.md` · `apps/desktop/` · `ui-tui/`

## 为什么读

`hermes` 命令是给一个人的；产品化的一切都发生在核心之外：20+ 平台的消息网关、serverless 场景的定时任务、多网关协同的看板、桌面与终端 UI。本篇一次讲完这层"外围"——它们的共同点是：**核心之外的世界，全是分布式问题**。

先感受体量（`wc -l` 实测）：

| 文件 | 行数 | 职责 |
|---|---|---|
| `gateway/run.py` | **33,588** | 网关主进程（比 agent loop 本体大 3.7 倍，全仓库最大文件） |
| `gateway/slash_commands.py` | 6,488 | 跨平台斜杠命令 |
| `gateway/session.py` | 4,541 | 会话存储与路由 |

## 网关：23 个平台与一个动态枚举

`gateway/config.py` 的 `Platform` 枚举列出 **23 个内置平台**：Telegram、Discord、WhatsApp（两版）、Slack、Signal、Matrix、Mattermost、Email、SMS、Home Assistant、iMessage（BlueBubbles）、API server、Webhook、MS Graph……以及中文六件套：**DINGTALK（钉钉）、FEISHU（飞书）、WECOM（企业微信）+ WECOM_CALLBACK、WEIXIN（微信个人号）、QQBOT、YUANBAO（腾讯元宝）**。可以说 Hermes 是目前对国内 IM 覆盖最完整的开源 agent——不是社区外挂，是主仓一等公民。

**国产适配器成色**直接看源码头注释：微信走腾讯 **iLink Bot API**——长轮询 `getupdates` 收件，每条出站回复必须回显对端最新 `context_token`，媒体走 **AES-128-ECB 加密 CDN 协议**，扫码登录内置安装向导——官方 API 路线，不是网页版逆向。QQ 是官方 Bot API v2 独立包（AES-256-GCM 解密、二维码扫码配置、还有一个 `_ssrf_redirect_guard`——连重定向 SSRF 都有专门守卫）。元宝走 WebSocket，连贴纸都有独立处理文件。

扩展机制两头堵：`_missing_()` 允许 `Platform("irc")` 为插件平台**按需创建伪成员**并缓存（只对捆绑/注册过的名字放行，防枚举污染）；`gateway/platform_registry.py` 让插件经 `ctx.register_platform()` 自注册适配器（工厂、配置校验、环境变量清单一次声明），`ADDING_A_PLATFORM.md` 明说插件路径"**zero changes to core Hermes code**"。

## turn_lease：一次值回票价的并发事故复盘

`gateway/turn_lease.py` 的模块注释是全仓库最值得一读的故障报告（#64934），推理链完整：

1. 网关的忙碌守卫按**路由键**（某个聊天窗口）加锁；
2. 但持久会话属于**会话 ID**——而 `switch_session()` 让路由键到会话 ID **多对一**（第二个窗口 `/resume` 同一命名会话、CLI 续聊重绑、异步委派回钉……）；
3. 于是两个路由键各自通过守卫，**两个回合在不同 agent 对象上并发跑同一会话**；
4. 后果：交互写坏一份转录——行序错乱、身份标记去重吞行、第二个回合站在没见过第一个回合的历史上，留下永久 `user;user` 交替楔子，`repair_message_sequence` 每次都修、每次都修不好。

解法"**回合租约**"：会话解析定稿后、转录加载前，按**最终会话 ID** 获取租约，序列化整个 [加载 → 运行 → 刷写] 区间。三个安全性质明文写出：世代作用域 + 身份校验的释放（陈旧释放放不掉新回合的锁）、超时即失败关闭、租约表有界。**分布式系统的教训在单进程 Python 程序里重现**——"多入口写同一份状态"本质上就是分布式问题。

## cron：触发与执行分离，进程可以死、定时不能丢

`cron/scheduler_provider.py` 的接口哲学一句话：**提供方只管"何时"，不管"何事"**——执行与投递全提供方共享（`cron.scheduler.run_job` / `_deliver_result`）。配套一条罕见的成熟度纪律：接口当前只有一个消费者（内置实现）验证，所以签名**可以无废弃周期地改**；一旦第二个提供方验证了形状，接口即冻结，此后**只许加法演进**（新增带默认值的可选方法），永不改已有签名。

scale-to-zero 场景（空闲时整个 agent 进程停掉省钱）由 `docs/chronos-managed-cron-contract.md` 解决：**放弃进程内 ticker，每个任务只向 NAS 预约一个外部 one-shot**，定在真实下次触发时刻；到点 NAS 回调 agent，跑完再预约下一个——两次触发之间进程可以完全停止。信任模型三跳逐跳验证：agent → NAS 用 Nous Portal 访问令牌；调度器 → NAS 用请求**签名**；NAS → agent 用**短时 JWT**（`purpose=cron_fire`），agent 拿 NAS 的 JWKS 验签，到手后走 **store CAS 原子认领**再执行——同一发回调不会被两个复活中的进程重复消费。文档细节抠到：托管 agent 手里**从来没有** `agent:{instance_id}` 形状的 OAuth 客户端凭据（那是给浏览器交互授权的），出站用的是 NAS 预埋的 bootstrap-session 令牌。

运维侧 `docs/cron-doctor-spec.md` 是可直抄的工具规格：`hermes cron doctor` 只读体检，专治**静默退化**（脚本被挪走、workdir 消失、投递开始失败）；Non-goals 比目标还认真（不改任务、不自动修复、不动网关、不碰密钥），验收精确到退出码。`cron/` 包全家福：blueprint_catalog + suggestions（自然语言创建定时任务的底座）、executions、incidents、monitor、notepad、lifecycle_guard。

## 看板：多网关并存的单调度器纪律

多网关进程并存（每档案一个：default / writer / admin / coder / researcher）时，**谁派发看板任务**？`docs/kanban/multi-gateway.md` 的答案：`kanban.dispatch_in_gateway: true` 只允许一个网关持有，其余显式关闭——**派发单主，通知投递档案私有**（每个网关只轮询自己托管平台适配器的订阅，原子事件认领防重复投递）。一条有分寸的设计：评审反馈作为可操作 BLOCK 通知投递、`notify+wake` 能唤醒源头聊天，但**评审永远不创建、不解锁、不重排队、不变更任务**——通知通道与任务状态机的写权限刻意分离。

`tools/kanban_tools.py` 回答"为什么用工具不用 CLI"：工作者 agent 的终端可能在 Docker/Modal/SSH 里，那里没装 `hermes` 也没挂载看板 DB——工具跑在 agent 的 Python 进程里，永远够得着 `~/.hermes/kanban.db`。顺带两个理由：免 shell 引号脚枪、结构化 JSON 错误可比 stderr 好推理。普通聊天会话的 schema 里**看不到任何看板工具**——除非真的在调度器下运行。

## 多端：三个权威的边界艺术

一个 agent 仓库养着 Electron、React 终端 UI 和 Tauri 安装器，容易烂成前端粥。Hermes 把**前端架构文档写得像后端**。`apps/desktop/AGENTS.md` 的三方权威：

> - **Electron** owns the machine: process lifecycle, native filesystem/git/windows … a narrow, typed capability bridge.
> - **The renderer** owns the experience: navigation, presentation, ephemeral interaction state.
> - **The agent backend** owns the work: sessions, tools, model calls, streaming.

渲染层永不直接碰 Node/Electron——原生能力经"窄的、类型化的能力桥"，不是通用逃生舱；agent 行为活在网关后面，**绝不用 React 重新实现**。最值钱的决策规则——**按权威决定状态归属**："任何状态的第一问不是放哪方便，而是**谁有资格是对的**"：别的入口也能改的归后端（渲染层只是缓存），机器事实归 Electron，纯窗口呈现才归渲染层；持久化状态要在**键名里声明作用域**。"新建全局 store 是一个主张——去挣得这个主张。"配套的 `DESIGN.md` 把设计系统当 API 维护：**"文档里的过期名字就是 bug，和过期类型同罪"**；一个关注点一个原语；扁平不套盒。

`ui-tui/` 一句话定架构：**TypeScript owns the screen. Python owns sessions, tools, model calls, and most command logic.** React + Ink 画界面，客户端拉起 `python -m tui_gateway.entry`，stdio 上换行分隔 JSON-RPC（请求/响应/事件）；`tui_gateway/` 侧有 `event_publisher` / `event_replay`（事件可重放，UI 崩溃重连不丢状态）。

注意它与网关**同构**：网关用平台适配器把消息变成事件流，TUI 用 JSON-RPC 把终端变成事件流，桌面用能力桥把窗口变成事件流——**三种入口，一条事件脊椎**。这也解释了 0002 里工具可见性为何绑定"会话来源"：来源不同，权威不同，schema 就该不同。

## 对照 dsh 与可抄清单

dsh 没有这一层——ACP 适配器是它唯一的"平台"，因为平台底座不面对消费者；33,588 行买的是"每个平台的原生体验"（贴纸、语音、草稿流式输出、按聊天限长，各有字段在 3000+ 行的 `BasePlatformAdapter` 基类里）。

五条可抄：**多入口共享状态的系统，锁加在"解析后的最终资源标识"上**（turn_lease）；无服务器定时的正解是"预约精确 one-shot + 逐跳异构认证 + CAS 认领"；多进程派发单主化、投递档案化、通知通道无写权限；前端按"谁有资格正确"分状态；多入口产品先造统一事件脊椎，再让每种入口各自投影。

---

> 下一篇：[0005 安全模型与插件生态](./0005-security-plugins.md)
