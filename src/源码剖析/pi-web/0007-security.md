---
title: "0007 安全边界：一个能执行命令的网页如何关进笼子"
sidebarGroup: "Pi Web 源码"
shortTitle: "0007 安全边界"
order: 7
date: 2026-09-01
category: "源码剖析"
tag:
  - "Pi Web"
  - "源码"
  - "Agent"
  - "Next.js"
description: "Pi Web 源码系列第 7 篇：文件白名单、项目信任门、同源校验、Basic Auth、bash 环境隔离与 Web Push——梳理 pi-web 把'agent 级权限'装进浏览器时的六道闸门。"
---

# 0007 · 安全边界：一个能执行命令的网页如何关进笼子

> **源码仓库解读 · Pi Web 系列第 7 篇**
> 主角：`lib/path-security.ts` · `lib/file-access.ts` · `proxy.ts` · `lib/request-security.ts` · `lib/project-trust.ts` · `docs/adr/0001`
> 上接：[0006 演进史](./0006-evolution.md)

pi-web 不是一个普通的 Web 应用：它背靠一个**能读写文件、执行 shell、调用模型**的 agent。浏览器里的每一次点击，背后都可能是文件系统或 shell。所以这个仓库的安全设计不是"附加功能"，而是**架构的承重墙**。本篇盘点六道闸门。

## 闸门一：文件访问白名单——"不是文件管理器"

README 里有一句容易被忽略的声明：

> **File access boundary**: the file browser is limited to working directories selected in Pi Web and project or session roots it already knows about; **it is not a general filesystem browser**.

实现上，`/api/files` 的每个请求都要过 `lib/file-access.ts` 的白名单：

```ts
export async function getAllowedFileRoots(): Promise<Set<string>> {
  // 允许的根 = 会话出现过的 cwd + 它们解析出的项目根
  //          + ~/pi-cwd-* 默认目录 + 显式 allowFileRoot() 登记的路径
}
```

关键点：白名单的**来源本身是受限的**——只有"pi 会话真实工作过的地方"才能成为可浏览的根。新会话创建时（`POST /api/agent/new`）会顺手 `allowFileRoot(cwd)`，worktree 创建、目录选择同理。**根集合随着 agent 的活动自然生长，但从不超出 agent 的活动范围。**

而真正的判定函数只有一个：

```ts
// lib/path-security.ts —— isPathWithinRoots()，全项目唯一实现
```

`AGENTS.md` 为它专门立了一条规矩："Keep that one implementation — it is the security boundary." 白名单存储时 slash 归一化只是 Set 键的约定，**判定时对两侧重新 resolve、大小写折叠**——Windows 的 `E:\a` 与 `e:/a`、符号链接、`..` 逃逸都在这一层收口。安全代码的纪律：**一个判定点，其余全是调用者**。

## 闸门二：项目信任门——不替用户执行陌生代码

打开一个新项目的工作目录时，pi 默认会加载项目里的 `.pi/extensions`——**那是在你的机器上执行别人的代码**。pi-web 的 `lib/project-trust.ts` 在创建会话前先查信任状态：

```ts
const trustReloadOptions = projectTrustReloadOptions(sessionCwd, agentDir);
const services = await createAgentSessionServices({
  /* ... */
  ...(trustReloadOptions ? { resourceLoaderReloadOptions: trustReloadOptions } : {}),
});
```

不可信项目的会话进入"受限模式"（07-27 的 `feat: add restricted mode for untrusted projects`）：扩展不自动加载，UI 弹出信任对话框，用户确认后才以 `reload` 方式重新加载资源。提交信息里的 `(#236)` 说明这是真实 issue 驱动的修复。子代理还有一层收紧：不可信项目里，即使启用了资源加载也走专门的 reload 选项（0004 提过的 `subagentLoadsResources` 分支）。

## 闸门三：同源与主机校验——middleware 上的第一道墙

`proxy.ts`（Next.js middleware）对每个 `/api/*` 请求做身份审问：

```ts
const isTrustedRequest = isApiRequest
  ? isApiRequestAllowed(request)          // API：同源证据
  : isApiRequestHostAllowed(request);     // 页面：Host 白名单
if (!isTrustedRequest) return new NextResponse("Untrusted API request", { status: 403 });
```

这套防的是 **DNS rebinding / 跨站驱动**：你机器上跑着的 pi-web（127.0.0.1:30141）不能被互联网上某个页面的脚本当作"内网 API"随意调用。有意思的是它的迭代过程（提交史里能看到攻防）：

```
08-16  fix: accept same-origin requests behind a scheme-rewriting proxy
08-25  fix: require same-origin evidence for proxy relaxation
```

先为了兼容反向代理放宽，发现放宽面太大又收紧——`isApiRequestAllowed()` 最终要求 JSON Content-Type + 同源证据，还留了 `PI_WEB_ALLOWED_HOSTS` 给合法的反代场景。**安全规则跟着部署形态长，但每次放宽都有对应的收紧证据。**

## 闸门四：Basic Auth + 回环绑定——出笼必须有价

默认姿态是保守的：绑定 `127.0.0.1`，无认证。一旦 `--hostname 0.0.0.0`，CLI 立刻警告：

```
Warning: pi-web is listening on 0.0.0.0 without authentication.
Only use this on a trusted network.
```

要出笼就得配 `PI_WEB_PASSWORD`（middleware 里校验 Basic Auth，用户名固定 `pi`），README 还明确告知局限：Basic Auth 不加密传输，公网必须挂 HTTPS 反代或 VPN，反代传来的外部主机名要逐字加入 `PI_WEB_ALLOWED_HOSTS`。**默认安全，越权要有意识、有配置、有警告。**

## 闸门五：bash 环境隔离——不给宿主环境添乱

一个容易被忽视的面：pi-web 自己（Next.js 进程）的环境变量里有 `PORT`、`NODE_ENV`、`NEXT_*`——这些是**宿主的运行时配置**。如果 agent 在项目里跑 `npm run dev`，宿主变量泄漏进去会造成端口冲突、环境错乱。ADR 0001 记录了这个决策：

> The agent `bash` tool and direct user shell commands remove `PORT`, `NODE_ENV`, and `NEXT_*` variables while preserving the SDK-managed PATH, Pi session metadata, and all other inherited values.

注意分寸：**只摘宿主特有的三组变量，其余原样继承**；第三方扩展自己的工具完全不碰。这就是 `CONTEXT.md` 那套术语的现实意义——"Host Runtime"和"Project Command Environment"是两个世界，边界上只搬走该搬的。

## 闸门六：Web Push 的密钥保管

8 月加入的完成通知（Web Push）引入了新的敏感物：VAPID 私钥和订阅端点。存放位置是 `~/.pi/agent/web-push.json`，且写入走**原子私有文件**：

```ts
writePrivateFileAtomicSync(path, state)   // 0600 权限 + 原子替换
```

订阅端点被视为敏感数据（它能把通知发给任意持有者），API 状态接口永远不回显密钥原文——与 auth 路由"永不返回 raw key"是同一条纪律。

## 安全设计的三条元原则

把六道闸门横向对齐，能提炼出 pi-web 的元原则：

1. **白名单优于黑名单**：文件根、主机名、可执行路径全部是"默认拒绝，逐一登记"；
2. **单一判定点**：路径安全只有一个实现，安全语义不散落；其余代码只是登记员和调用者；
3. **诚实降级**：不可信项目降级但不失能（扩展不加载，核心可用）；出公网降级体验（要密码/HTTPS）但路径清晰。

对一个"把 agent 装进浏览器"的项目来说，这些原则比任何单个功能都更值得抄。

> 下一篇：[0008 · 总结：给 agent 换皮的三条路线与 borrow/build 清单](./0008-takeaways.md)
