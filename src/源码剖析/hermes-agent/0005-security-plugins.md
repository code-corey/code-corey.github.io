---
title: "0005 安全模型与插件生态：一条按信任分层的供应链"
sidebarGroup: "Hermes Agent"
shortTitle: "0005 安全与插件生态"
order: 5
date: 2026-09-01
category: "源码剖析"
tag:
  - "Hermes Agent"
  - "源码"
  - "Agent"
description: "Hermes Agent 源码系列第 5 篇：『只信操作系统』的信任公理、导入期冻结的 YOLO 开关、DM 配对码、技能/插件分级扫描、ctx.llm 受控车道与 fail-closed 密钥作用域。"
---

# 0005 · 安全模型与插件生态：一条按信任分层的供应链

> **源码仓库解读 · Hermes Agent 系列第 5 篇**
> 主线：[0004 产品化外围](./0004-product-surface.md)
> 关键文件：`SECURITY.md` · `tools/approval.py` · `gateway/pairing.py` · `tools/skills_guard.py` + `threat_patterns.py` · `tools/plugin_guard.py` · `agent/plugin_llm.py` · `plugins/plugin_storage.py` · `agent/secret_scope.py` · `acp_adapter/`

## 为什么读

agent 的安全文章大多停留在"记得加审批"。Hermes 的难得之处：一份**承重结构写得清清楚楚**的安全文档、每道启发式都自觉声明自己"不是边界"、以及一条按信任分层的扩展供应链。本篇从信任公理读到四道防线，再看插件这"更危险的一档"怎么管。

## 信任公理：只信操作系统

`SECURITY.md` §2.2 的原话是整个安全体系的公理：

> **The only security boundary against an adversarial LLM is the operating system.** Nothing inside the agent process constitutes containment — not the approval gate, not output redaction, not any pattern scanner, not any tool allowlist.

对抗可能被注入的 LLM，**唯一的安全边界是操作系统**。审批门、输出脱敏、模式扫描器、工具白名单——进程内一切都不构成遏制，只是"作用于攻击者影响的字符串上的启发式"，统一被定性为 **accident-prevention（事故预防）**。

沿公理给出两种 OS 级隔离姿势，要求运营者**刻意选择**：**终端后端隔离**（LLM 发出的 shell 与文件操作进容器/云沙箱/远程主机；关不住 agent 自己 Python 进程里的一切——代码执行工具、MCP 子进程、插件/hook/技能加载全都 import 进解释器）；**整进程包裹**（整个进程树进沙箱——自家 Docker/Compose，或集成 [NVIDIA OpenShell](https://github.com/NVIDIA/OpenShell)：文件/L7 出网/系统调用/推理路由四层声明式策略，网络与推理策略可热重载，凭据从 Provider store 注入、永不落沙箱文件系统）。配套披露纪律同样罕见：无赏金计划、报告走私密通道、明确列出什么会被关闭（演示进程内启发式局限而不触及 §2 边界的按 out-of-scope 处理）。**把"我们不信什么"写进文档，比"我们防什么"值钱。**

## 防线一：审批——先堵自己的后门

`tools/approval.py` 自称危险命令系统的"single source of truth"（模式检测、会话级审批态、CLI 交互与网关异步审批、辅助 LLM 智能审批、永久白名单）。最值得学的是第一个设计决定：

> Freeze YOLO mode at module import time. Reading os.environ on every call would allow **any skill running inside the process** to set this variable and instantly bypass all approval checks — a prompt-injection escalation path.

YOLO 免审开关**模块导入时读一次环境变量并冻结**——若每次调用都读 `os.environ`，进程内运行的任何技能（可能正被提示注入操纵）都能随手改环境变量、瞬间绕过全部审批。**攻击面分析精确到"谁与你同进程"**，这是 agent 安全区别于传统应用安全的地方。审批态用 `contextvars` 存（网关在线程池并发跑回合，进程级全局变量会串会话）。

## 防线二：DM 配对——陌生人的门禁

`gateway/pairing.py`：平台上收到陌生人私信，发**一次性配对码**，机主在 CLI 侧批准。注释直接标注对标 OWASP + NIST SP 800-63-4：8 字符码、32 字符无歧义字母表（去 0/O/1/I）、`secrets.choice()` 密码学随机、1 小时过期、每平台最多 3 个待审码、每用户 10 分钟限速 1 次、批准失败 5 次锁定 1 小时、数据文件 `chmod 0600`、**验证码永不进日志**。一个"加好友"功能做出完整认证工程，可直接抄进任何有 bot 入口的系统。

## 防线三：技能供应链——信任分级 + 隔离检疫

`tools/skills_guard.py` 对每个外部技能做安装前静态扫描（数据外传、提示注入、破坏性命令、持久化），按**来源信任分级**放行：`builtin` 随发布永不全扫；`trusted` **只有 openai/skills 和 anthropics/skills 两仓**，允许 caution 结论通过；`community` 其余一切，**任何发现即阻止**，除非 `--force`。安装前进 `skills/.hub/quarantine/` 检疫目录。`threat_patterns.py` 有**零宽字符等不可见字符**检测——针对藏在 Unicode 里的提示注入。同样可贵的是书面自知：注释专设 "Known limitation"，承认语言级写 API（`open(...,'w')`、`pathlib.write_text`…）对 agent 配置的定向写入无法被静态正则可靠关联——"如果以后补上，应该作为第四个机械层级"。**把盲区写在未来作者的注释里，而不是假装防线完整。**

外围两件套：`tirith_security.py` 把外部扫描器二进制作为预执行包装，**退出码即裁决**（0 放行 / 1 阻断 / 2 警告），自动安装走 SHA-256 校验、有 cosign 时加验 GitHub Actions 工作流签名；`tools/path_security.py` 把 `resolve() + relative_to()` 防穿越模式从五个工具文件抽成共享函数。

## 插件：比技能危险的供应链怎么管

技能是 Markdown + 脚本，插件是**跑在 agent 进程里的 Python**。直接复用技能扫描器不行——`tools/plugin_guard.py` 头注释把道理讲透：

> Plugins are strictly more dangerous than skills — they run Python in-process with the agent — but they are also *expected* to do things a skill never should: read their own API keys from environment variables, call provider HTTP APIs with those keys, and spawn subprocesses.

天真套用技能威胁模式会把**每个正经 provider 插件**都误报。所以分三档：对**文档/配置文件**（README、after-install.md、plugin.yaml…）跑完整 skills_guard 模式集——提示注入与社会工程住在这里；对**代码文件**豁免"读自己的环境变量密钥 / 带密钥调 HTTP"这一族——那是插件本职；但保留真正恶意信号：**触碰别人的凭据库**（`~/.ssh`、`~/.aws`、`~/.hermes/.env`）、反弹 shell、破坏性命令、持久化机制、混淆执行、已知外传服务。判定沿用 Cowork 三档（safe 正常装 / caution 强制显式确认），注释注明灵感来自 Claude Cowork 2026-08-06 的扫描公告。**同引擎、按威胁模型分档复用**——比"扫得更多"值钱。

插件的自描述与配套机制：`plugin.yaml`（以 spotify 为例：`kind: backend`、`provides_tools` 七个工具、认证方式 `hermes auth spotify` + PKCE、门控条件写明）——**配置即契约**。插件最常见的越界需求是自己调模型，`agent/plugin_llm.py` 给了正门：`ctx.llm` 门面的 `complete()` / `complete_structured()`（JSON schema 校验的有界结构化推理）+ asyncio 孪生，provider/model/profile 全是显式关键字参数——**不许嵌 slug、不许走捷径**。持久状态走 `plugins/plugin_storage.py` 的 `plugin-data/<name>/` 惯例——因为插件想要持久状态时"都会发明同一条错误路径"（在安装目录里刨坑，而 `plugins remove` 会删掉它，**用户数据陪代码一起死**）；且明确宣布**密钥不在此惯例内**，一律走 `secret_scope`/`.env`。外部编辑器类客户端走 `acp_adapter/`——`permissions.py`、`edit_approval.py`、`provenance.py` 把权限、编辑审批、来源追溯做成协议层一等概念，**客户端不同，审批语义不能丢**。

## 防线四：密钥作用域——fail-closed 的多租户

`agent/secret_scope.py` 解决多档案网关的隐蔽问题：一个进程伺候多个档案，各有各的 `.env` 与平台 token，**绝不能**并进进程全局 `os.environ`（否则档案 A 的密钥漏进档案 B 的回合和每个子进程）。解法是 contextvar 作用域：`set_secret_scope()` 随任务上下文（`copy_context()`）传入工作线程，`get_secret()` 只读作用域——并且 **fail-closed**：多路复用激活时若调用点没设作用域，当场 raise——"让未迁移的调用点在那一行响亮地失败，而不是悄悄漏出另一个档案的值"；单档案默认模式则透明回退。失败模式的选择（响 vs 静默）在这里是显式设计。

## 对照 dsh 与信任梯度收束

| | Hermes | dsh |
|---|---|---|
| 边界宣言 | **只信 OS**，进程内皆启发式（事故预防） | seam 级沙箱（Landlock/bwrap/E2B）做进机制 |
| 审批 | YOLO 导入期冻结 + 辅助 LLM 智能审批 + 白名单 | 瀑布审批 |
| 供应链 | 来源分级 + 检疫 + 不可见字符检测 + 插件分档 | 插件经 Cordis 装配，YAML patch 栈同 id 后写胜 |
| 多租户隔离 | fail-closed 密钥作用域（contextvar） | 不变量执行器保证事件日志可信 |

dsh 把沙箱做成 seam 级机制，默认姿态更硬；Hermes 把"进程内一切皆启发式"摊开说明，把真边界交给操作系统与部署姿势。**一个是机制自信，一个是认知诚实。**

最后把五篇的扩展面摞起来，是一条清晰的信任梯度：

```
技能 skill      — Markdown + 脚本，community 档任何发现即阻
MCP 工具        — 外部进程协议，tool_search 渐进披露（0002）
插件 plugin     — 进程内 Python，guard 分档扫描 + ctx.llm 受控车道
平台 platform   — 注册表自注册，零核心改动（0004）
引擎/提供方      — context_engine / cron provider，接口凭第二消费者冻结（0002/0004）
```

越往下越可信、越贴近核心、接口越稳定；越往上越危险、越开放、审查越严。**Hermes 的"细腰"最终不是一条线，而是一个按信任分层的梯度场**——这是它与 dsh"一切皆插件"平面模型最深的差别。

四条可抄：进程内开关一律导入期冻结；陌生人门禁用限时配对码 + 服务端限速锁定；外部代码按来源分级放行、按威胁模型分档扫描并书面承认盲区；多租户密钥 fail-closed、缺作用域即抛错。

---

> 下一篇：[0006 对照篇 · hermes × dsh](./0006-comparison.md)
