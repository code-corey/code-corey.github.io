---
title: "0004 会话文件：一份 JSONL，两种读法"
sidebarGroup: "Pi Web 源码"
shortTitle: "0004 会话文件"
order: 4
date: 2026-09-01
category: "源码剖析"
tag:
  - "Pi Web"
  - "源码"
  - "Agent"
  - "Next.js"
description: "Pi Web 源码系列第 4 篇：pi 的 JSONL 会话格式、条目树与 parentId、fork 与 in-session 分支两种分叉、有界读取与多级缓存，以及 pi-web:tool-selection 这个'私有扩展'的教科书示范。"
---

# 0004 · 会话文件：一份 JSONL，两种读法

> **源码仓库解读 · Pi Web 系列第 4 篇**
> 主角：`lib/session-reader.ts`（652 行）· pi 会话文件格式 v3 · `docs/adr/0002-chat-only-tool-selection.md`
> 上接：[0003 SSE 事件流](./0003-binding-sse.md)

## 格式即契约

pi 的会话是**一个目录一个项目、一个文件一次会话**的 JSONL：

```
~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl
```

首行是 header，之后每行一个条目，条目之间靠 `parentId` 连成一棵**树**：

```jsonl
{"type":"session","version":3,"id":"<uuid>","cwd":"/path","parentSession":"/abs/parent.jsonl"}
{"type":"model_change","id":"a1b2c3d4","parentId":null,"provider":"...","modelId":"..."}
{"type":"message","id":"e5f6a7b8","parentId":"a1b2c3d4","message":{"role":"user","content":"..."}}
{"type":"message","id":"9f8e7d6c","parentId":"e5f6a7b8","message":{"role":"assistant","content":[...]}}
{"type":"message","id":"11223344","parentId":"9f8e7d6c","message":{"role":"toolResult",...}}
{"type":"compaction","id":"55667788","parentId":"...","summary":"...","firstKeptEntryId":"..."}
{"type":"session_info","id":"...","parentId":"...","name":"用户起的名字"}
```

这棵树不是摆设——它是"从任意一条历史消息重新分叉"的数据基础。`parentSession` header 字段则记录"我是从哪个会话文件 fork 出来的"，pi-web 用它在侧栏里把 fork 出来的子会话挂到父会话下形成会话树。

**共享这个格式是 pi-web 的立身之本**：不认识格式就读不了历史，格式认识得不全就会在 pi 升级后读崩。`AGENTS.md` 里专门记录了两个格式层的坑：pi 存 toolCall 用 `{type:"toolCall", id, name, arguments}`，而 `ToolCallContent` 用 `{toolCallId, toolName, input}`——`lib/normalize.ts` 的 `normalizeToolCalls()` 在**文件加载和流式事件两条路径上都要调**，否则同一份历史在"浏览态"和"运行态"渲染不一致。

## 两种读法：浏览走文件，运行走内存

pi-web 对会话有两条截然不同的读取路径，这是理解它资源模型的关键：

**路径 A：只读浏览（不碰 AgentSession）**。侧栏列表、点开历史会话，走的是 `lib/session-reader.ts` 直接读文件：

```ts
// listAllSessions()：扫目录 + 读 header，带 30s TTL 缓存
export async function listAllSessions(options: { force?: boolean } = {})
// buildSessionContext()：按 leafId 从树里投影出"当前分支"的消息序列
export function buildSessionContext(filePath, ..., leafId?)
```

性能优化做在三层：

1. **有界读取**：`readBoundedLines()` 用 `openSync/readSync` 只读前 N 字节（header 最多 64KB、关系元数据 256KB），**不会为了列表页把几百 MB 的会话文件整个读进内存**；
2. **双向路径缓存**：sessionId ↔ filePath 的映射缓存后，列表页不再需要打开每个文件（后来又加了"无全量扫描的路径解析"，见第 6 篇）;
3. **TTL 缓存 + 主动失效**：列表 30 秒缓存，但任何写操作（发消息、fork、改名）都调 `invalidateSessionListCache()`，一致性靠失效而不是猜。

**路径 B：进程内运行（AgentSession 持有 SessionManager）**。发过消息的会话由 wrapper 持有，内存里就是权威状态。这里有个格式级的补丁很能说明问题——pi 为了性能**延迟首次落盘**（第一条 assistant 消息出现才写文件），但 pi-web 里存在"只跑了一条 bash 命令、没有任何 assistant 消息"的会话，这种会话在 pi 的规则下永远不会出现在文件系统里。pi-web 的 `persistBashOnlySession()` 手动把 header+entries 写出去，还顺手把内部 `flushed` 标志置真：

```ts
// Pi normally delays the first flush until an assistant message exists.
// A leading shell command has no assistant message, so mark this SDK
// manager as flushed after writing its own generated entries.
(manager as unknown as { flushed: boolean }).flushed = true;
```

**"用供应商的格式，补供应商的边角"，这是寄生式 UI 的日常。**

## 两种分叉：fork 是新文件，分支是同文件

pi-web UI 上有两个长得像但语义完全不同的操作，对应的也是完全不同的数据操作：

**Fork（独立新文件）**——从某条历史消息开创一个新会话文件：

```ts
case "fork": {
  const sourceManager = SessionManager.open(currentSessionFile, sessionDir);
  const forkedPath = sourceManager.createBranchedSession(entry.parentId);
  // 复制到分叉点为止的路径 → 新 .jsonl
  // 新文件 header 里 parentSession = 原文件路径
}
```

侧栏里它显示为父会话的"子节点"（靠 `parentSession` 字段）。适合"回到当时，走另一条完全独立的时间线"。

**In-session 分支（同一文件内的树）**——`navigate_tree` 只是在**同一个 JSONL 里**切换 leafId：树上有多个节点共享同一个 `parentId`，UI 上用 `BranchNavigator` 切换，服务端用 `/api/sessions/[id]/context?leafId=` 投影出所选分支。适合"同一对话里试两种问法"。

配合而来的一个大胆结论（`AGENTS.md` 原话）：**session files can be fully rewritten**。既然 `parentSession` 只是显示元数据、树结构才是内容权威，那么删除会话时级联改写孤儿们的 header、用 `writeFileSync` 整文件重写都是安全的——pi 自己做格式迁移时也这么干。

## pi-web:tool-selection：给上游格式做"私有扩展"的教科书

pi 的原生格式**不记录**"这个会话激活了哪些工具"。pi-web 偏偏需要这个信息（网页版有工具预设：Chat only / Read only / Default / Full）。它没有改 pi，而是用了 JSONL 里现成的 `custom` 条目类型：

```json
{
  "type": "custom",
  "customType": "pi-web:tool-selection",
  "data": { "version": 1, "tools": [] }
}
```

ADR 0002 把语义定得极其严谨：

- **最新一条合法条目是权威**；没有条目 = 老会话，保持 pi 默认行为（向后兼容）；空数组 = Chat only；非空 = 恢复所选内置工具；
- 存的是**用户的选择**，扩展工具是运行时动态叠加的，不入库；
- 这个条目必须在 `createAgentSessionServices()` **之前**解析出来——因为 Chat only 模式要求"根本不加载扩展/skills/themes"，事后再改就晚了；
- 子代理不用这个条目，用自己 metadata 里的 `resourceSnapshot`。

这就是"寄生式扩展"的标准姿势：**用上游预留的通用容器装自己的私有语义，带版本号，定义清晰的缺省行为**。pi 的格式一个字节没动，pi 升级也不会踩坏它。

## Chat only：一种"最小会话"的诞生

工具预设的极端形态是 Chat only（全部工具关闭）。pi-web 发现这不是"少开几个工具"的问题，而是**资源策略的质变**：干脆连扩展、skills、提示词模板、主题都不加载，系统提示词替换为 pi 发现的上下文文件（AGENTS.md / CLAUDE.md 等）按序拼接：

```ts
export const CHAT_ONLY_RESOURCE_LOADER_OPTIONS = {
  noExtensions: true, noSkills: true, noPromptTemplates: true,
  noThemes: true, noContextFiles: false,
  systemPrompt: " ",                       // 占位，阻止 loader 发现配置的 prompt 文件
  systemPromptOverride: () => undefined,
};
```

代价是：**跨越 Chat only 边界必须重建 wrapper**（普通 wrapper 已经加载了扩展，无法原地"卸载"），而非空预设之间切换可以原地更新。一个 `isChatOnly()` 的判断，决定了整条生命周期管理策略——这种"资源策略"思维在第 5 篇的 TUI 桥接里还会出现。

## 本篇小结

| 主题 | 要点 |
|---|---|
| 格式 | JSONL + parentId 树，v3；parentSession 只是显示元数据 |
| 双路径 | 浏览=有界文件读取+缓存；运行=进程内 AgentSession |
| 两种分叉 | fork=新文件（parentSession 链）；分支=同文件切 leafId |
| 私有扩展 | `pi-web:tool-selection` custom 条目，带版本、定义缺省 |
| Chat only | 资源策略质变，跨边界必须重建 wrapper |

会话层、命令层、事件层都通了。还剩最后一块拼图：pi 的**扩展是给终端 TUI 写的**——弹窗、widget、状态栏都是终端概念，pi-web 凭什么让它们在浏览器里活起来？

> 下一篇：[0005 · TUI 桥接：把终端扩展生态整体搬进浏览器](./0005-tui-bridge.md)
