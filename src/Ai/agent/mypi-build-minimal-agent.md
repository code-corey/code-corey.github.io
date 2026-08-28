---
title: "我用两个 Python 文件仿了个 Pi——MyPi 最简 Agent 的设计与实现"
sidebarGroup: "Agent / 方法论"
shortTitle: "MyPi 最简 Agent 实战"
order: 35
date: 2026-08-29
category: "AI"
tag:
  - "agent"
  - "python"
  - "工具调用"
  - "vllm"
  - "开源"
description: 造轮子是最好的学习：模仿 Pi 的核心功能，用 mypi.py + tools.py 两个文件实现命令行编码智能体——OpenAI 与 Anthropic 双协议客户端、7 个内置工具（含免 API Key 的 DuckDuckGo 联网搜索）、最多 30 轮的工具循环。记录接口契约设计、双协议转换的三处暗坑、用 mock 服务器离线测试协议的方法，最后推上 GitHub。
---

# 我用两个 Python 文件仿了个 Pi——MyPi 最简 Agent 的设计与实现

## 开头：有 Pi 了，为什么还要写 MyPi

前几篇把 AutoDL 上的 vLLM 环境跑通了（[上篇：部署 vLLM + Gemma-4](/Linux/ssh/ssh-02-autodl-vllm-gemma4-deploy.html)），Pi 也能连上本地模型干活。但用得越多越痒：**Agent 的核心到底是个啥？** 抛开精致的 TUI、会话管理、MCP 生态，一个能干活的 Agent 最小集是多少行？

这次的答案：**两个 Python 文件，约 500 行**。

| 目标 | 达成 |
|------|------|
| 命令行敲 `mypi` 就能用 | ✅ bash 脚本 + cmd 双启动器 |
| 模型参数配置化（像 Pi 的 models.json） | ✅ `~/.mypi/config.json` |
| 能联网、能浏览网页 | ✅ web_search（免 API Key）+ web_fetch |
| 能操作文件、跑命令 | ✅ bash / read / write / edit / list_dir |
| 主流模型都能接 | ✅ OpenAI + Anthropic 双协议 |

先看成品——一条命令让它联网搜资料并写入文件（真实运行截图）：

![Agent 循环：web_search + write_file](/Ai/agent/mypi-build-minimal-agent/02-agent-task-web.png)

模型自己决定先 `web_search` 搜资料，拿到结果后调用 `write_file` 落盘，最后中文总结——两轮工具循环，一气呵成。

仓库：**[github.com/code-corey/mypi](https://github.com/code-corey/mypi)**

---

## 一、先把 Agent 拆到最小

写之前先把「Agent」这个词拆开。剥掉所有外包装，一个 Agent 循环长这样：

```text
┌──────────────────────── Agent 循环 ────────────────────────┐
│                                                            │
│  用户任务 ──► LLM ──► 要用工具吗？──否──► 输出最终回答，结束  │
│               ▲              │                             │
│               │             是                              │
│               │              ▼                             │
│               └──── execute_tool(name, args)               │
│                       结果回填消息历史，进入下一轮           │
└────────────────────────────────────────────────────────────┘
```

就这么点事：**把工具清单发给模型 → 模型说要调哪个工具 → 本地执行 → 结果喂回去 → 重复，直到模型不再要工具**。Pi、Claude Code、Cline，剥掉 UI 后核心都是这个循环。MyPi 的 `run_task()` 只有 40 行，加上上限保护（最多循环 30 轮，防止模型无限调工具烧钱）。

三个「故意不做」的决定：

1. **不做流式输出**。流式只是体验优化，与 Agent 本质无关，但会把消息处理代码复杂度翻倍；
2. **不做会话持久化**。REPL 内存里存 `history` 列表，`/reset` 清空，进程退出即丢——最简版够用；
3. **只拆两个文件**。`mypi.py`（核心）+ `tools.py`（工具），工具与核心之间只靠两个导出点连接，读者十分钟就能通读。

---

## 二、tools.py：先定契约，再写实现

两个文件并行开发的关键是先冻结契约。核心引擎对工具模块的全部预期就两个名字：

```python
TOOL_SCHEMAS: list[dict]          # OpenAI function-calling 格式
def execute_tool(name: str, args: dict) -> str
```

`TOOL_SCHEMAS` 是发给模型的工具清单（JSON Schema 描述每个工具的参数）；`execute_tool` 负责执行。**签订单一，加工具只动 tools.py**。

### 契约里最重要的一条：永不抛异常

`execute_tool` 遇到任何错误——文件不存在、网络超时、命令被拒——一律**返回以 `Error:` 开头的字符串**，绝不像正常 Python 代码那样抛异常。为什么？因为调用方是 Agent 循环：工具失败不是程序故障，而是**模型需要看到的信息**。把错误原样喂回给模型，它下一轮就会自己纠正（换个路径重读、改关键词重搜）。抛异常反而打断了这个自我纠错回路。

### 七个工具，三个值得展开的细节

**细节一：web_search 怎么做到免 API Key。** 主流搜索 API 都要钱要注册，但 DuckDuckGo 有个 HTML 版端点 `html.duckduckgo.com/html/`，POST 一个 `q` 参数就返回传统搜索结果页。用正则抽 `result__a`（标题+链接）和 `result__snippet`（摘要）即可。有个小坑：结果链接是 DDG 的重定向包装（`uddg=` 参数里藏着真实 URL），要 `unquote` + `parse_qs` 还原：

```python
if "uddg=" in href:
    qs = parse_qs(urlparse(unquote(href)).query)
    href = qs.get("uddg", [href])[0]     # 真实 URL
```

**细节二：web_fetch 的极简去标签。** 不引 BeautifulSoup（守住「仅依赖 requests」的底线），三行正则够用：

```python
html = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", html)
html = re.sub(r"<[^>]+>", " ", html)          # 去所有标签
html = re.sub(r"\n\s*\n+", "\n\n", html)      # 压缩空行
```

再配合 `resp.encoding = resp.apparent_encoding` 兜底中文页面乱码、8000 字符截断保护上下文。

**细节三：bash 工具的危险命令过滤。** 让模型跑 shell 是双刃剑。MyPi 用一个正则列表拦截明显作死的行为（`rm -rf`、`mkfs`、`dd of=/dev/`、fork bomb、`format x:` 等），命中直接拒绝并把拒绝原因返回给模型。这不是沙箱（真正的隔离请看[上上篇的 Docker 沙箱](/Ai/agent/agent-docker-sandbox-dialogue.html)），但聊胜于无，成本一行配置。

---

## 三、mypi.py：双协议是暗坑重灾区

核心文件四件事：配置加载、REPL、Agent 循环、**LLM 客户端**。前三件平平无奇，双协议客户端是重灾区——OpenAI 和 Anthropic 的工具调用协议有三处「看起来一样其实完全不同」的地方：

### 暗坑一：工具参数，一个是字符串一个是对象

```python
# OpenAI: arguments 是 JSON 字符串，要自己 loads
args = json.loads(fn["arguments"])        # "{\"city\": \"北京\"}" → dict

# Anthropic: input 直接就是对象
args = b["input"]                          # {"city": "北京"}
```

MyPi 对 OpenAI 的 `json.loads` 加了容错：解析失败就包成 `{"command": raw}` 传下去——弱模型偶尔会吐出非法 JSON，直接崩掉整轮不如让工具返回错误让模型重试。

### 暗坑二：工具结果的「角色」不同

```python
# OpenAI：工具结果是独立的 role=tool 消息
history.append({"role": "tool", "tool_call_id": c["id"], "content": result})

# Anthropic：工具结果必须包装成 user 消息里的 tool_result 块
conv.append({"role": "user", "content": [{
    "type": "tool_result", "tool_use_id": tr_id, "content": result}]})
```

### 暗坑三：assistant 的工具调用要「原样回放」

Anthropic 要求多轮工具对话中，assistant 消息里必须带 `tool_use` 块（含 `id`），且与后面的 `tool_result` 一一配对——漏了 id 或配错对，API 直接 400。MyPi 的做法：内部消息统一用 OpenAI 形态存（`_tool_calls` 私有字段挂在 assistant 消息上），只在 anthropic 客户端发请求时现场转换。**内部格式唯一，协议差异封死在客户端层**，这是整个设计的承重墙。

配置层面的体现就是那个 `api` 字段：

```json
{
  "providers": {
    "autodlgpu": { "baseUrl": "http://localhost:8000/v1", "apiKey": "EMPTY",
                   "api": "openai",    "model": "gemma-4-12b" },
    "glm":       { "baseUrl": "http://172.16.248.56:8715", "apiKey": "sk-xxx",
                   "api": "anthropic", "model": "glm-5.2" }
  },
  "defaultProvider": "autodlgpu"
}
```

---

## 四、实测：真模型 + 假服务器，两条路都要走通

### 4.1 Anthropic 协议：真实端点跑真实任务

```bash
mypi --provider glm "用web_search搜索vLLM是什么，一句话总结，把结论写入intro.txt"
```

![Agent 循环](/Ai/agent/mypi-build-minimal-agent/02-agent-task-web.png)

第 1 轮模型调用 `web_search` → 第 2 轮基于搜索结果调用 `write_file` → 第 3 轮给出中文总结。工具名、参数、结果截断展示都打印在终端上，Agent 在想什么一目了然。

### 4.2 OpenAI 协议：AutoDL 关机了怎么办？造个假服务器

测试时 vLLM 那台机器正好关机省钱，但 OpenAI 协议路径也得验证——**写一个 30 行的 mock 服务器**：第一次请求返回一个 `tool_calls`（让它调 `web_fetch`），第二次请求检查消息历史里有 `role=tool` 的结果后返回最终文本：

```python
n_tools = sum(1 for m in body["messages"] if m["role"] == "tool")
if n_tools == 0:
    msg = {..., "tool_calls": [{"id": "call_1", "function":
           {"name": "web_fetch", "arguments": "{\"url\": \"https://example.com\"}"}}]}
else:
    msg = {"role": "assistant", "content": "OpenAI 协议工具循环正常", ...}
```

跑 `mypi --provider mock ...`，看到 mock 发的 tool_call 被执行、真实的 example.com 内容被回填、循环正常退出——**协议层验证不依赖任何真实模型**，这也正是 mock 测试的价值：把「网络/模型的不确定性」和「我代码的正确性」解耦。

![全局命令与 bash 工具](/Ai/agent/mypi-build-minimal-agent/03-global-command-bash.png)

### 4.3 CLI 与工具清单

![CLI 与工具清单](/Ai/agent/mypi-build-minimal-agent/01-cli-and-tools.png)

---

## 五、装成 mypi 全局命令的小坑

Windows 下让任意目录敲 `mypi` 生效，Git Bash 和 PowerShell 认的文件不一样：

- `~/bin/mypi`（无后缀 bash 脚本，`exec python "D:/develop/mypi/mypi.py" "$@"`）→ **Git Bash 用**
- `~/bin/mypi.cmd`（`@python "%~dp0..."`）→ **PowerShell / CMD 用**

`~/bin` 本来就在 PATH 里，两份放进去完事。只放 `.cmd` 的话 Git Bash 里 `mypi: command not found`——别问怎么知道的。

---

## 六、推上 GitHub

仓库：**[github.com/code-corey/mypi](https://github.com/code-corey/mypi)**

```
mypi/
├── mypi.py               # 核心：配置 + Agent 循环 + 双协议客户端 + REPL
├── tools.py              # 8 个工具 + TOOL_SCHEMAS + execute_tool()（第 8 个：memory）
├── mypi.cmd              # Windows 启动器
├── config.example.json   # 配置示例
├── docs/screenshots/     # 实机截图
└── requirements.txt      # requests + rich（未装 rich 自动降级纯文本）
```

clone 之后三步跑起来：

```bash
pip install requests rich
python mypi.py                # 自动生成 ~/.mypi/config.json，填上你的端点
python mypi.py "你好"          # 或敲 mypi 进入 REPL
```

---

## 七、v0.3 实录：会话、记忆与好看的界面

第一版能用，但有三个明显的不「Pi」：**任务跑完就退出没法追问**、**新开会话什么都不记得**、**界面太素**。v0.3 一次补齐，代码仍在 1000 行以内。

### 会话持久化：`~/.mypi/sessions/*.json`

每轮对话结束自动存档，文件名 = 时间戳 + 首句摘要：

```python
# 会话核心就这几十行
SESSIONS_DIR = "~/.mypi/sessions"          # 20260829-031601_帮我用bash看看.json

def save_session(history, pname, model):
    json.dump({..."history": history}, f,
              ensure_ascii=True)   # ★ 关键参数，后面有个踩坑故事
```

新增命令：`/save` 手动存、`/sessions` 列表、`/load <序号>` 恢复；`mypi -c` 直接续聊最近一次会话。更关键的一个改动：**单次任务跑完后，交互终端下自动进入连续对话**（用 `sys.stdin.isatty()` 判断——脚本/管道场景仍然跑完就退，自动化不受影响）：

```python
if args.task:
    history = run_task(...)
    save_session(...)
    if args.no_chat or not sys.stdin.isatty():
        return                 # 脚本：跑完就走
print("（已进入连续对话，/exit 退出）")
repl_loop(...)                 # 交互：接着聊
```

实测效果——任务里模型第一次 `ls` 失败后自己换了 `find | xargs wc -l`，追问它细节，它能把「自救过程」完整复述出来：

![v0.3 会话恢复与跨会话记忆](/Ai/agent/mypi-build-minimal-agent/04-sessions-memory.png)

### 跨会话记忆：第 8 个工具 `memory`

设计：`~/.mypi/memory.md` 一个文件，两处接入——

1. **新工具**：`memory(action=save/read/clear)`，模型自己决定什么值得记
2. **提示词注入**：每次会话开始把 memory.md 内容拼进系统提示词，模型「生来就知道」

```python
# tools.py —— 全部实现不到 30 行
def _memory(args):
    if action == "save":
        f.write(f"- [{datetime.now():%Y-%m-%d %H:%M}] {content}\n")
        return f"OK: 已记住（记忆共 {n} 条）"
```

实测：A 会话说「暗号是芝麻开门，代号 Corey」，**另开一个全新进程**问暗号——模型直接从记忆注入里答出来，全程无感知。

### 踩坑：管道中文 → `surrogates not allowed`

自动化测试用 `printf '记住暗号...' | mypi` 喂输入，会话保存时炸了：

```
UnicodeEncodeError: 'utf-8' codec can't encode character '\udcae' in position 3: surrogates not allowed
```

原因：管道里的 UTF-8 字节被 Windows 默认的 **GBK** 解码，产生非法代理字符（`\udcae`），一路传到 `json.dump(ensure_ascii=False)` 写文件时爆雷。修两刀：

```python
sys.stdin.reconfigure(encoding="utf-8", errors="replace")   # ① 源头治
json.dump(..., ensure_ascii=True)                            # ② 免疫兜底：非 ASCII 全转义
```

顺带修复：会话文件名里的中文 slug 也用同一套转义思路防入侵，`load_session` 加 try/except 跳过损坏文件。

### 好看的界面：引入 rich（可选降级）

Pi 那种面板边框、Markdown 渲染、加载动画，Python 有现成标准答案——`rich`。包装四个输出函数，全文只认 `HAS_RICH` 一个开关：

```python
def show_assistant(text):
    if HAS_RICH:
        console.print(Panel(Markdown(text), title="MyPi",
                            border_style="cyan"))
    else:
        print(f"\n{text}\n")    # 未安装 rich 自动降级

with spinner("🤔 思考中…"):     # 请求期间转圈
    resp = chat(provider, model, history)
```

rich 在非 TTY（管道）下自动褪色，所以截图脚本、CI 日志都不受污染。

### v0.3 踩坑速查

| # | 坑 | 解法 |
|---|-----|------|
| 9 | 管道输入中文 → GBK 代理字符 → JSON 写入崩溃 | stdin 强制 UTF-8 + `ensure_ascii=True` |
| 10 | 单任务模式跑完就退出，没法追问 | `isatty()` 判断：交互自动衔接 REPL，脚本保持原样 |
| 11 | 会话文件含中文在 Windows 上各种编码抽风 | `ensure_ascii=True` 全转义，文件内容纯 ASCII |

---

## 八、小结

一句话：**Agent 的本质 = 消息循环 + 工具调用回填，其余都是产品化**。

认知三条：

- **契约先行**：`TOOL_SCHEMAS + execute_tool` 两个名字冻结后，工具集和核心可以完全并行开发，互不等待
- **工具错误是信息不是故障**：让模型看见 `Error:` 字符串并自我纠正，好过抛异常打断循环
- **双协议的转换层要薄而完整**：内部唯一消息格式，协议差异封死在客户端的「最后一公里」

### 踩坑速查表

| # | 坑 | 解法 |
|---|-----|------|
| 1 | OpenAI `arguments` 是 JSON **字符串**，Anthropic `input` 是**对象** | 客户端层各自转换，内部统一 dict |
| 2 | Anthropic 的工具结果必须包成 user 消息里的 `tool_result` 块 | 转换层按协议包装，不透传 |
| 3 | 多轮工具对话漏了 `tool_use` 块或 id 配错对 → Anthropic 400 | assistant 消息带 `_tool_calls` 私有字段，转换时原样回放 |
| 4 | 模型吐出非法 JSON 参数 → `json.loads` 崩 | 容错包成 `{"command": raw}` 交给工具，让模型看到错误自己改 |
| 5 | DDG 搜索结果是重定向链接 | `unquote` + `parse_qs` 还原 `uddg=` 里的真实 URL |
| 6 | 中文网页乱码 | `resp.encoding = resp.apparent_encoding` 兜底 |
| 7 | Git Bash 认不得 `.cmd` | bash 脚本与 cmd 双启动器各放一份 |
| 8 | GitHub HTTPS 推送 Empty reply（GFW） | `git remote set-url origin git@github.com:...` 切 SSH |

### 后续计划（给自己挖坑）

- ~~会话持久化与恢复~~ ✅ v0.3 已实现（`-c` / `/load` / 自动存档）
- 流式输出（SSE）——把「体验优化」这层也剥一遍，rich 的 `Live` 正好接得住
- 权限确认系统：bash 命令分级，危险操作先 y/n（对齐 Pi 的 approval）
- MCP 接入：工具协议标准化之后，`execute_tool` 就是最好的 MCP 适配点
- 子代理：让 mypi 能 spawn mypi（Pi 的 subagent / team 模式）

---

## 参考资料

- [MyPi 源码](https://github.com/code-corey/mypi) — 本文全部代码
- [OpenAI Function Calling 文档](https://platform.openai.com/docs/guides/function-calling) — tools / tool_calls / role=tool 的权威定义
- [Anthropic Messages API：Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) — tool_use / tool_result 块的配对规则
- [DuckDuckGo HTML 版](https://html.duckduckgo.com/html/) — 免 Key 搜索的来源
- 本机实测环境：Windows 11 + Python 3.13 + requests 2.33；GLM 内网端点（Anthropic 协议）与本地 mock 服务器
