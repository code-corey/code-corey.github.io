---
title: "0005 TUI 桥接：把终端扩展生态整体搬进浏览器"
sidebarGroup: "Pi Web 源码"
shortTitle: "0005 TUI 桥接"
order: 5
date: 2026-09-01
category: "源码剖析"
tag:
  - "Pi Web"
  - "源码"
  - "Agent"
  - "Next.js"
description: "Pi Web 源码系列第 5 篇：PlainTextTheme 骗过主题依赖、92 列虚拟终端、extension_ui_request 协议与 Web 组件的一一映射——让 pi 的 TUI 扩展不开一行改动能跑在网页里。"
---

# 0005 · TUI 桥接：把终端扩展生态整体搬进浏览器

> **源码仓库解读 · Pi Web 系列第 5 篇**
> 主角：`rpc-manager.ts` 的扩展 UI 上下文 · `lib/custom-ui-terminal.ts` · `components/ExtensionWidgets.tsx` · `ExtensionStatusBar.tsx`
> 上接：[0004 会话文件](./0004-session-format.md)

## 问题：扩展只认识终端

pi 的扩展系统是它生态的根：扩展可以注册命令、拦截事件、弹选择框、画状态栏 widget、甚至渲染自定义交互组件。但这一切的 API 形状都是**终端的**：

- `ui.select(title, options)` —— 假设会有一个终端弹层接收键盘上下选择；
- `ui.setWidget(key, lines)` —— 假设有一个 92 列的字符网格可以写字符画；
- 组件的 `render(width)` 返回 `string[]` —— 返回的是**带 ANSI 转义码的文本行**；
- 扩展还会访问全局 `Theme` 对象给自己的输出上色。

pi-web 要在浏览器里给这一切找到对应物。它的方案是一个**适配层**：服务端把扩展的 UI 请求翻译成协议事件推给浏览器，把浏览器的回应翻译回 Promise。扩展自己一行不改。

## 主题伪装：PlainTextTheme

扩展渲染 widget 时会调 `theme.fg(color, text)` 之类的 API 期待拿到带色字符串。pi-web 给了一个"什么都没做"的主题：

```ts
class PlainTextTheme extends Theme {
  override fg(...[, text]) { return text; }      // 原样返回，不上色
  override bg(...[, text]) { return text; }
  override bold(text) { return text; }
  override getFgAnsi() { return ""; }            // 零 ANSI 码
}
```

主题层"去色"后，扩展输出的是干净文本；浏览器端再由 `AnsiText` 组件（ansi_up）把漏进来的 ANSI 序列渲染成彩色——**两层分工：服务端保证不炸，客户端负责好看**。同时 initTheme() 仍然被调用（`if (!chatOnly) initTheme()`），因为某些扩展在非 UI 路径上也会访问 SDK 的全局主题。

## 虚拟终端：92 列的谎言

`render(width)` 需要一个宽度。pi-web 的回答直白得可爱——`lib/custom-ui-terminal.ts` 全文 32 行，造了一个冻结的假终端：

```ts
export function createHeadlessCustomUiTui(requestRender, columns = 92, rows = 40) {
  const terminal = Object.freeze({ columns, rows, kittyProtocolActive: false });
  return Object.freeze({ terminal, requestRender });
}
```

扩展拿到的 `tui.terminal` 声称自己有 92 列 40 行；`requestRender()` 不再是刷屏，而是触发"重新渲染并把最新文本行推给浏览器"。widget 的渲染协议由此成立：

```ts
private renderExtensionWidget(active: ActiveExtensionWidget): void {
  const lines = active.component.render(DEFAULT_CUSTOM_UI_COLUMNS); // 92 列
  // 校验必须返回 string[]，然后：
  this.emit({ type: "extension_ui_request", method: "setWidget",
              widgetKey, widgetLines: lines, widgetPlacement });
}
```

浏览器端 `ExtensionWidgets.tsx` 把这些行塞进编辑器上方/下方的面板（`placement: "aboveEditor" | "belowEditor"`），多行状态可以折叠展开，ANSI 颜色照常解析。**终端的"行"变成了浏览器的"块"。**

这套适配不是纸上谈兵：pi-web 自己的内置子代理扩展（第 6 篇的 8 月重头戏）就是用 `setWidget` 在网页里渲染子代理状态的——**dogfooding 逼着桥接层必须真的好用**。

## extension_ui_request：把 await 变成一次 HTTP 往返

扩展代码里写的是同步风格的 `const choice = await ui.select(...)`。桥接层把这个 await 撕开成三段：

```ts
// 服务端（rpc-manager）：
private requestExtensionUi(request, defaultValue, parseResponse, timeout?) {
  const id = randomUUID();
  this.pendingUiRequests.set(id, fullRequest);     // 挂起
  this.pendingUiResponses.set(id, { resolve, cancel });
  this.emit(fullRequest as AgentEvent);            // ① 事件推给浏览器
  // ② 浏览器渲染成对话框，用户操作后 POST 回来
  // ③ extension_ui_response 命令 → resolveExtensionUiResponse() → Promise resolve
}
```

四种原语对应四种 Web 控件：

| 扩展调用 | method | 浏览器呈现 | 超时缺省值 |
|---|---|---|---|
| `ui.select(title, options)` | `select` | 选项列表 | `undefined` |
| `ui.confirm(title, msg)` | `confirm` | 确认框 | `false` |
| `ui.input(title, placeholder)` | `input` | 输入框 | `undefined` |
| `ui.editor(title, prefill)` | `editor` | 多行编辑器 | `undefined` |

每个请求都带可选 `timeout`/`expiresAt`，超时安静地取缺省值——**扩展在终端里也是这么设计的（不回答就走默认），桥接层只是忠实搬运**。比模态框更野的是 `ui.custom(factory)`：扩展给一个组件工厂，工厂拿到那个 92 列假 TUI，`render()` 出的每一帧都作为 `method:"custom"` 事件推给浏览器，浏览器的按键输入又通过 `extension_ui_input` 命令喂回 `component.handleInput()`——一个跑在 HTTP 上的远程字符终端。

更妙的是还有一群"明确摆烂"的空实现：

```ts
setFooter: () => {}, setHeader: () => {}, setWorkingIndicator: () => {},
addAutocompleteProvider: () => {}, setEditorComponent: () => {},
setTheme: () => ({ success: false, error: "Theme switching is not supported in Pi Web extension UI yet" }),
```

桥接层的完整性哲学是：**能映射的映射，不能映射的明确签名"不存在"，绝不假装成功**。扩展拿到的是诚实的失败，而不是静默的黑洞。

## 状态与通知：status / notify / setTitle

widget 之外还有三条轻量通道，全部收敛成同一种事件：

```ts
setStatus(key, text)  → { method: "setStatus", statusKey, statusText }
notify(message, type) → { method: "notify", message, notifyType }
setTitle(title)       → { method: "setTitle", title }
```

浏览器端 `ExtensionStatusBar.tsx` 把多条状态收进底部状态栏，8 月的"compact extension widgets into status bar"提交又把单行 widget 也折叠进去——Web 端有自己的信息密度美学，桥接层只管忠实地把数据送到，怎么展示是 React 组件的事。

## 为什么这一层是 pi-web 的战略资产

回头算账：pi 生态里的扩展（bash 增强、子代理、各种集成）如果在 Web 端全部重写，工作量是 O(扩展数 × Web 端功能面)。有了这层桥：

- **新扩展零成本**：只要在 pi TUI 里能跑，网页里就能跑；
- **上游演进自动继承**：pi 给扩展系统加新 API，pi-web 只需要在 uiContext 里补一个映射（或者一个诚实的空实现）；
- **内置子代理免开发**：pi-web 的 subagent 功能直接以"内置扩展"的形态实现（`createSubagentExtension()` 塞进扩展加载链），管理界面复用自家桥接层。

这也是第 8 篇"borrow vs build"清单里最典型的一条：**桥接生态，而不是移植生态**。

## 本篇小结

| 终端概念 | Web 对应物 | 实现要点 |
|---|---|---|
| Theme 上色 | PlainTextTheme 去色 + AnsiText 还原 | 服务端保稳，客户端好看 |
| 终端宽度 | 92 列冻结假终端 | 32 行的 custom-ui-terminal.ts |
| select/confirm/input/editor | 对话框组件 + Promise 往返 | timeout 缺省值语义 |
| custom 组件 | 远程字符终端 | render 帧→SSE，按键→POST |
| widget/状态栏 | 面板组件 + 状态栏 | placement 上下分区 |
| 不支持的能力 | 显式失败的空实现 | 诚实大于假装 |

至此，pi 和 web 结合的四层全部拆完：进程内 SDK（0002）→ SSE 事件（0003）→ 会话文件（0004）→ TUI 桥接（0005）。下一篇换一个视角：**这四层不是一天建成的**——608 个提交、5 个月，我们按时间轴重走一遍。

> 下一篇：[0006 · 演进史：608 个提交里的渐进式长成](./0006-evolution.md)
