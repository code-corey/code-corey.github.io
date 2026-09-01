---
title: "0003 装配的艺术：Profile / Bundle / Patch 三层组装"
sidebarGroup: "DeepSeek Harness"
shortTitle: "0003 装配的艺术"
order: 3
date: 2026-08-31
category: "源码剖析"
tag:
  - "DeepSeek Harness"
  - "源码"
  - "Agent"
description: "第 3 篇：一行 dsh web 如何从空列表叠加出完整产品；补丁整行替换与热重载防别名。"
---

# 0003 · 装配的艺术：Profile / Bundle / Patch 三层组装

> **源码仓库解读 · DeepSeek Harness 系列第 3 篇**
> 剖析对象：`apps/cli/src/profile-boot.ts` + `packages/boot/app-boot/src/profile.ts` + `packages/bundle/*`
> 上篇：[0002 Cordis 基石](./0002-cordis-foundation.md)

## 为什么读

前两篇立了两个论断：产品的每个部件都是插件（0001），插件的加载与卸载由 Cordis 全权管理（0002）。但中间还缺一环——**"86 行 YAML 如何变成一棵会跑的树？"**

这一环恰恰是 dsh 最反直觉的设计：`dsh web` 和 `dsh --profile headless` 跑的是**同一份二进制**，唯一区别是喂给启动器的装配清单不同。产品形态 = 配置。这篇我们把这个说法落到源码级：清单长什么样、补丁按什么顺序叠加、为什么热重载不会把配置"焊死"。

## 源码地图

```
apps/cli/src/bin.ts             60 行    三路分发入口（上篇已读）
apps/cli/src/profile-boot.ts    260 行   ★ 装配总指挥（本篇主战场）
apps/cli/src/dump-config.ts             --dump-config 实现
packages/boot/app-boot/src/
  profile.ts                            ★ profile 解析与内置五形态声明
  index.ts                              boot / watch / fail-loud / dump 等导出
packages/bundle/
  base/cordis.patch.yml        501 行   共享第一层：86 行插件条目
  web-app/cordis.patch.yml     445 行   浏览器应用层
  headless/cordis.patch.yml     30 行   一次性运行器层
  sdk-app / acp-app / sdk-minimal       其余形态层
```

注意体量对比：`headless` 层只有 30 行——因为它站在 `dsh-base` 的肩膀上，只需要声明"我和 base 的差异"。

## 逐段剖析

### 1. 两个清单字段：谁列 bundle，谁是 bundle

翻 `packages/bundle/web-app/package.json`，会看到仓库自定义的 `dsh` 字段：

```json
"dsh": {
  "bundle": {
    "patch": "./cordis.patch.yml"
  }
}
```

**bundle 的自我声明**：我是一个装配层，我的补丁在这个文件里。

而 profile 的声明在 `packages/boot/app-boot/src/profile.ts`（内置形态硬编码在此，自定义 profile 则存放在 Harness home）：

```ts
bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'],   // web
bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'],  // headless
bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-sdk-app'],   // sdk
bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-acp-app'],   // acp
```

**profile = 有序 bundle 列表 + 自己的 cordis.patch.yml + patch 重载策略**。五个内置形态里四个都是 `base + 一层` 的结构；唯一的例外是 `sdk-minimal`——它的补丁文件头注释公开宣称叛逆：

```yaml
# Standalone minimal SDK application. Unlike the ordinary SDK profile, this
# bundle does not layer over dsh-base: this insert is the complete Cordis tree.
```

它自带一棵 123 行的完整显式树，不叠 base。这是给 SDK 用户的"裸机模式"：你想看清每个插件从哪来？那就把整棵树摊开给你。

### 2. 补丁的两种形态：改一行，或插一段

`packages/bundle/headless/cordis.patch.yml` 虽然 30 行，却把两种形态都演了一遍：

**形态 A：按 id 定位、整行替换**（不写 `- insert:`，直接列 id）：

```yaml
- id: system-prompt
  config:
    persona: >-
      You are a coding agent powered by the {{model}} model. ...

- id: tools
  config:
    mode: !!js process.env.DSH_TOOLS_MODE
```

这两行不是新建插件——`system-prompt` 和 `tools` 都是 base 层已经插入的行。headless 只是把它们的 **config 整个换掉**。回看 base 补丁的头注释那条纪律：*"A patch replaces the targeted row's whole `config` rather than merging into it"*。没有深层合并，没有 30% 覆盖 70% 的模糊地带——每行最终长什么样，取决于**最后写它的那一层**（last write wins per row）。

**形态 B：插入新行**：

```yaml
- insert:
    - id: headless-startup
      name: '@deepseek-ai/dsh-headless/startup'
    - id: headless-runner
      name: '@deepseek-ai/dsh-headless'
      inject: [headlessStartup]
      config:
        task: !!js ctx.headlessStartup.task
```

`name` 指向一个 Cordis 插件包（0002 的 `name + inject + apply` 三件套），`inject: [headlessStartup]` 甚至可以出现在**配置里**——runner 依赖同一棵树上刚插入的 startup 服务。更妙的是 `!!js ctx.headlessStartup.task`：**配置值可以是一个 JS 表达式**，在依赖服务就绪后于该插件的上下文里求值。声明式配置由此获得了受控的编程能力，但求值时机仍由依赖图严格约束。

### 3. 装配总指挥：composeProfile 的叠加算法

`apps/cli/src/profile-boot.ts` 里的 `composeProfile()` 是全文核心（有删节）：

```ts
const profile = prepareProfile(name)                                   // ① 解析 profile
const homePatches = loadOptionalPatches(NAME, homePatchPath()) ?? []   // ② $DSH_HOME 层
const overlays = patchFiles.flatMap(f => loadOverlayPatches(NAME, resolve(f)))  // ③ --patch
const bundlePatches = profile.layers.flatMap(layer => layer.patches)   // ④ bundle 层
const rows = new Map<string, EntryOptions>()
for (const row of composeEntries([bundlePatches, profile.patches, homePatches, overlays])) {
  if (typeof row.id === 'string') rows.set(row.id, row)                // ⑤ 同 id 后写覆盖
}
```

最终叠加顺序——记住这个栈，从下往上读：

```
[base ... 形态bundle]（bundle 层，按 profile 声明顺序）
  → profile 自己的 cordis.patch.yml
    → $DSH_HOME/cordis.patch.yml        （机器级偏好，凌驾于所有 profile 之上）
      → --patch 命令行 overlay            （临时实验）
        → DSH_TELEMETRY_DISABLED 开关      （隐私硬开关，永远最高）
```

顺序的语义很讲究：**越靠近用户意愿的层，权力越大**。你机器上的 home patch 能覆盖任何 profile 的默认值；命令行临时 patch 能覆盖一切持久配置；而遥测开关独占最顶端。

遥测开关的解析函数藏着一条产品哲学：

```ts
/** ANY non-empty value (including `'0'`/`'false'`) disables:
    a privacy switch prefers off-by-mistake over on-by-mistake. */
export function resolveTelemetryPatch(disabledEnv, hasRow) {
  if ((disabledEnv ?? '') === '' || !hasRow) return undefined
  return { id: TELEMETRY_ROW_ID, disabled: true }
}
```

设 `DSH_TELEMETRY_DISABLED=false` 也会关闭遥测——因为隐私开关宁可"误关"不可"误开"。而且若装配里根本没有遥测行，开关自动空操作：**开关依赖的行不存在时，不报错，静默满足**。这和 base 层里"pi-ai 适配器挂载时处于休眠、零路由、设置文档出现 providers 段才激活"是同一种思路——**装配里的行是能力插座，用不用由上层决定**。

### 4. 空根文件的秘密：为什么每次启动都重写 `[]`

`prepareProfile()` 里有个初看莫名其妙的行为：

```ts
/** The empty root entry list every profile tree patches over. */
const PROFILE_ROOT_CONFIG = `# dsh profile root — an empty entry list. ...
[]
`
writeFileSync(join(profile.dir, PROFILE_ROOT_FILENAME), PROFILE_ROOT_CONFIG)
```

每次启动都把 profile 的 `cordis.yml` 覆盖写成空列表 `[]`？源码注释给了一段精彩的推理：

> the vendored Loader's tree write-back (a plugin self-disposing persists the current tree) can bake composed rows into this file — which would duplicate every bundle insert on the next boot. The file exists on disk **only because the Loader needs a real include root to anchor `baseUrl`**.

翻译：Cordis 的 loader 会把运行中的树写回配置文件（插件自摘除时持久化现状）；如果不每次重置，第一层 bundle 插入的 86 行会被"焊死"进文件，下次启动再插一遍——全树重复。所以 dsh 的策略是：**磁盘上那个文件永远只是个锚点（给 loader 挂 baseUrl 用），真相永远在内存里的补丁栈**。配置的单一事实来源（single source of truth）不是文件，而是"空列表 + 有序补丁"这个数学结构本身。

### 5. 热重载为什么不串味：structuredClone 防别名

live reload 的实现里有一处极易被忽略的防御：

```ts
// Fresh clones per generation: the include pushes `insert` rows into the
// mounted tree BY REFERENCE and later id-targeted patches mutate those
// objects in place. Reusing one parsed patch object across applications
// would bake a user override into the bundle's in-memory insert row, so
// removing the override could never revert the row to the bundle default.
const composeLive = (): PatchOptions[] => structuredClone([...])
```

问题场景：bundle 插入行是**按引用**推进挂载树的，后续 patch 对它原地修改。如果热重载时复用同一个解析后的补丁对象，用户的临时覆盖会永久污染 bundle 层的内存副本——之后就算删掉覆盖，也回不到默认值了。解法：每代重载都 `structuredClone` 一份全新补丁栈。

这是所有"声明式 + 原地修改"系统都会踩的坑（React 里 state 不可变、Redux 里 reducer 纯函数，防的是同一类别名 bug），dsh 在配置装配层把它显式文档化了。

热重载的层级设计同样值得记住：**bundle 层沉底、overlay 浮顶，中间夹着每次代际都重新读取的两份用户文件**（profile patch + home patch）。用户编辑文件 → watcher 通知 → 用 `composeLive` 重组中间层 → 树的上下两层纹丝不动。所以用户怎么改都不可能挤掉 bundle 默认值或命令行临时 patch。

### 6. 启动窗口期的退出纪律

`runProfile()` 的收尾是一组容易被当作"样板代码"跳过、实则字字有讲究的生命周期处理：

```ts
process.on('SIGTERM', () => { interrupt(0) })    // 监管者的常规停止请求 → 退出码 0
process.on('SIGINT',  () => { interrupt(130) })  // 用户的键盘中断 → 退出码 130
installFailLoud(NAME, process, async () => { await app.current?.fiber.dispose() })
```

- SIGTERM 与 SIGINT 的退出码区分：**supervisor 的停止请求不算失败**（exit 0），Ctrl+C 才报告 130。这让容器编排和 shell 脚本能区分"正常下线"与"被打断"。
- 注释强调信号在**启动窗口期就接管 teardown**——"an inserted provider can publish before sibling rows finish mounting"：树还没挂完，插件就可能开始对外服务了，所以信号处理必须赶在 boot() 完成前装好。
- `createAppReady()`：就绪信号只有在 boot 与宿主设置全部成功后才 commit；在此之前 `onReady` 的监听者只会排队。Web 服务器监听端口、CLI 打印 URL，都应该等这个信号——防"半启动"状态对外暴露。

## 动手实验

```sh
# 1. 看你这台机器上 web 形态会装配出什么（不启动任何服务）
npx @deepseek-ai/dsh --profile web --dump-config | head -40

# 2. 亲手写一个 overlay，验证"整行替换"
cat > /tmp/my-patch.yml <<'EOF'
- id: session-title
  config:
    maxTitleBytes: 40
EOF
npx @deepseek-ai/dsh --profile web --dump-config --patch /tmp/my-patch.yml | grep -A5 "session-title"
#   对比不加 --patch 的输出：config 整个变成你的值，而不是合并

# 3. 阅读最小装配层，30 行读懂"形态 = base + 差异"
cat packages/bundle/headless/cordis.patch.yml
```

## 一图总结

```
 profile = 有序 bundle 列表 + 本地 patch + 重载策略
                    │
  ┌─────────────────▼──────────────────┐  优先级从低到高
  │ dsh-base（86 行：llm/session/tools/ │  ─────────────────
  │  沙箱/审批/设置/遥测……共享插座）      │  │ bundle 层（能力插座）
  ├────────────────────────────────────┤  │ 形态层（web/headless/…只写差异）
  │ web-app（445 行：HTTP、浏览器运行时）│  │ profile patch（形态的个人化）
  ├────────────────────────────────────┤  │ $DSH_HOME patch（机器偏好）
  │ profile/cordis.patch.yml           │  │ --patch overlay（临时实验）
  ├────────────────────────────────────┤  │ 遥测硬开关（宁误关不误开）
  │ home/cordis.patch.yml              │  └─ 同 id 整行替换，last write wins
  ├────────────────────────────────────┤
  │ --patch → DSH_TELEMETRY_DISABLED   │
  └─────────────────┬──────────────────┘
                    ▼
        空根 cordis.yml（只是锚点，每次重写 []）
                    ▼
        structuredClone 补丁栈 → boot() → 插件树
        （live reload：中间层每代重读，上下层免疫）
```

**三句话带走全文：**

1. profile 列 bundle、bundle 自带 patch；补丁两种动作——按 id 整行替换、insert 新行；同 id 后写者胜，无合并、无隐藏状态。
2. 真相不在文件在补丁栈：根文件永远重写为 `[]`，热重载靠 structuredClone 防引用别名，用户层永远夹在 bundle 与 overlay 之间。
3. 产品形态是装配的涌现属性：web 445 行、headless 30 行，差别只是"在 86 行共享插座上插了什么"。

## 下篇预告

**0004 · 会话即事实：只追加的 SessionEvent 日志。** 树装配好了，agent 开始干活。第一个值得盯住的问题：**模型看到的一切，是怎么变成一串可重放的事件的？**"模型可见即已记录"这条不变量如何用代码强制执行？fork/resume/transcript 为什么在 dsh 里是免费赠品？下一篇进入 `packages/core/session/`。

---
*上篇：[0002 Cordis 基石](./0002-cordis-foundation.md) · 下篇：[0004 会话即事实](./0004-session-log.md)*
