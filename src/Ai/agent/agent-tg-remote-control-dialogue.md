---
title: "给 Claude Code 装上 Telegram 遥控器：一条消息的完整流转（师生对话完整实录）"
sidebarGroup: "Agent / 方法论"
shortTitle: "TG 遥控电脑对话实录"
order: 34
date: 2026-08-27
category: "AI"
tag:
  - "Claude Code"
  - "Telegram Bot"
  - "对话实录"
  - "Windows"
description: "一次真实的工程实录：从一句「对接一下 tg」开始，三次架构演进（定时轮询 → 事件驱动 → 无头自治），踩过批处理 GBK/CRLF、PATH 污染、PTB bootstrap_retries 三个 Windows 生产级坑，最终让 Telegram 消息在不开任何窗口的电脑上完成取件、决策、执行的完整闭环。含每条消息的逐跳流转解析。"
---

# 给 Claude Code 装上 Telegram 遥控器：一条消息的完整流转（师生对话完整实录）

## 关于本文件的格式

> 学生要求："把如何让 tg 能够远程操控我的电脑的所有过程，所有真实的，以及整个消息是怎么流转的，解释清楚。"

因此本文件是**逐字实录**：🧑‍🎓 = 学生在控制台输入的原文；🧑‍🏫 = 老师在控制台输出的原文（关键段落原样保留）；🔧 = 老师在控制台执行的操作（命令、实验、报错，原始输出一并附上）。按时间顺序编号，不删减、不重排、不编造。

唯一的加工是安全脱敏：Bot Token 与学生账号 id 打了码。这是真实密钥泄露过的教训——凡是进过聊天的 token 都该作废重建，文末会讲。

环境：Windows 10 LTSC 工作机 + Clash 代理（127.0.0.1:7897）+ Python 3.14 + Claude Code CLI（走内网 GLM 网关计费）。

---

## 对话 1（开场：四个字的需求）

**🧑‍🎓 学生：**

> 对接一下 tg

**🧑‍🏫 老师：**

四个字，但我不能猜着做。"对接 tg"有三种完全不同的做法：

1. 给已有的哪个项目加个 TG 入口？（机器上有 my-agent、my-robot 一堆实验项目）
2. 像 cc2wx 那样，让这台机器上的 Claude Code 能收到 TG 消息？
3. 别的？

🔧 **老师操作**：先侦察再提问——列出 `E:\MyGithub` 全部项目；全局 grep "telegram"（排除 venv），结论：**没有任何现成 TG 代码**，纯新开工。又翻了 `my-agent/app.py` 和 `my-robot/` 的结构确认没有顺手就能挂载的地方。

然后抛出选择题，学生的选择决定了后面一切：

**🧑‍🎓 学生：**

> 「对接 TG」具体是想接哪个东西？——**桥接 Claude Code 到 TG**
> Telegram Bot Token 已经有了吗？——`8207060763:AAE***（已脱敏）`
> 实现方式偏好？——**python-telegram-bot 库**

**🧑‍🏫 老师：**

方向定了：做一座桥，让手机上的 Telegram 能指挥这台电脑上的 Claude Code。开工前先把架构说清楚——这台机器在国内网络，Telegram 必须走 Clash 的 7897 端口出网，这会在后面变成好几个坑的根源。

---

## 对话 2（v0 架构：收发分离 + 定时取件）

**🧑‍🏫 老师：**

第一版架构是一条最简单的链路：

```
手机 Telegram ──Clash──► bot.py (PTB 长轮询) ──► inbox/*.json 落盘
                                                     │
定时唤醒(cron) ──► Claude 读 inbox ──► 处理 ──► reply.py 直调 sendMessage 回信
```

两个刻意的决定：

- **收/发分离**：bot.py 只管收，回信由另一个独立脚本 `reply.py` 直接打 API。将来就算 bot 进程挂了，回信通道照样活着。
- **桥的大脑 = 会话里的我**：用定时任务每 3 分钟醒一次来取件。这是我给自己埋的第一颗雷，后面学生会亲手拆掉它。

### 第一坑：curl 超时不等于代理坏了

🔧 **老师操作**：验证 token 和代理连通性，第一次就翻车：

```bash
$ curl -sS -m 15 -x http://127.0.0.1:7897 "https://api.telegram.org/bot***:/***/getMe"
curl: (28) Connection timed out after 15016 milliseconds
```

15 秒超时。先别下结论"代理不通"，换个方式测——只测 TLS 握手不测业务接口：

```bash
$ netstat -ano | grep :7897 | grep LISTENING     # Clash 活着
$ curl -sS -o /dev/null -w "%{http_code} %{time_total}s\n" -m 20 -x http://127.0.0.1:7897 https://www.google.com
302 2.748762s                                     # Google 秒通
$ curl ... https://api.telegram.org               # 根路径
302 2.904879s                                     # TG 也秒通
```

所以代理是好的，坏的是**首次建链那一刻**——TLS 握手碰上慢节点，15 秒不够它握手完。这个知识点后面还会回来收费。

### Token 验证与绑定设计

加大超时后 `getMe` 通了，返回里拿到机器人身份：`@cgy_openclaw_2026_bot`。顺手查了 `getWebhookInfo`：没设 webhook、零积压，干净状态适合长轮询。

这里有个当时就被学生撞上的安全设计：bot 不认识任何人的时候，第一条消息必须是 `/start` 来绑定主人，绑定前所有文字消息一律丢弃。日志里真实发生了：

```text
[in ] 收到 /start → 写入 owner.json {"id": 8421***803, "name": "Corey C"}
[skip] 陌生人 8421***803 (Corey C)      ← 绑定前发的一句纯文本，被丢掉了
```

学生绑定前随手发的消息按设计阵亡。防的不是坏人搞笑话，防的是**任何知道 bot 用户名的人都能指挥这台电脑干活**。

### 三份源码与一个低级 bug

🔧 **老师操作**：落盘三份文件（`config.json` 放 token+代理、`bot.py` 收信端、`reply.py` 发送端），后台拉起，学生发来第一条测试消息"Hi"，回信时当场炸出一个 argparse 低级错误：

```python
parser.add_argument("text", nargs="", help="要发送的文本")   # ❌
ValueError: invalid nargs value                              # "" 不是合法值
```

合法的是 `"*"` 或 `"?"`，改成 `nargs="*"` 后回信成功：

```text
[out] 第 1/1 条 -> 8421736803
```

v0 就算通了。此时全链路：手机点发送 → 几秒内消息躺在 `inbox/20260827-143048.json` 里 → 我的定时器醒来取件 → 回复落在手机上。

---

## 对话 3（v1：学生嫌 3 分钟太慢）

**🧑‍🎓 学生：**

> 我希望的是及时回消息

**🧑‍🏫 老师：**

合理。3 分钟等待是因为"定时器巡检"这个模式天生就有平均 1.5 分钟的盲区。想要及时，就得换掉唤醒机制——不让我定时睁眼，而是**有事发生时有人来拍我**。

Claude Code 有个机制可以利用：后台任务退出时会立刻通知会话。那就做一个专职哨兵：

```bash
# watcher：死循环盯收件箱，一有文件立刻退出（退出即通知）
while true; do
  found=$(ls E:/MyGithub/tg-bridge/inbox/*.json 2>/dev/null | head -1)
  if [ -n "$found" ]; then echo "新消息: $found"; exit 0; fi
  sleep 2
done
```

再看现实中的延迟构成：TG 送达是秒级的，剩下全是我处理的工夫。事件驱动后端到端只剩"我的大脑转速"这一段。

🔧 **老师操作**：删掉 3 分钟 cron，挂上 watcher，另留一个 15 分钟低频兜底 cron 防 watcher 意外死亡漏件。上线一分钟就被实战检验——学生连发两条消息，从"你刚刚在干嘛"到叫醒我只有几秒。

---

## 对话 4（中场插曲：一次真实的发送失败）

处理"我当前有哪些会话"这条消息时，老师如实查证了一番（磁盘上活跃对话转写只有 1 个 = 我们自己；进程里 7 个 `claude.exe` 是各会话子进程+MCP 服务，不等于开了 7 个窗口）并回信，结果第一笔发送失败：

```text
httpx.ConnectError: [SSL: UNEXPECTED_EOF_WHILE_READING]
EOF occurred in violation of protocol (_ssl.c:1081)
```

Clash 在 TLS 握手阶段掐断了连接，偶发、不可预测。按协议这条消息不能归档，原地重试即可。但正确的修法是把重试固化进 `reply.py`：

```python
def send(chat_id: int, text: str, retries: int = 3) -> None:
    """经代理直发；Clash 偶发断流(SSL EOF/超时)，自动重试。"""
    for attempt in range(retries):
        try:
            resp = httpx.post(... , proxy=CONF["proxy"], timeout=60)
            ...
            return
        except Exception as err:
            last_err = err
            print(f"[warn] 第{attempt + 1}次失败: {err}")
            time.sleep(2 * (attempt + 1))    # 退避：2s、4s、6s
    raise RuntimeError(f"重试{retries}次仍失败") from last_err
```

当天就命中了一次，第二次尝试即成功。规律记下了：**经过国内代理的网络调用，重试不是优化项，是必需品。**

---

## 对话 5（灵魂拷问：关掉 Claude 之后呢）

**🧑‍🎓 学生：**

> 这个后台监听服务是一直在进行的么？当我关闭claude后，我如何继续和tg进行沟通呢

**🧑‍🏫 老师：**

这个问题问到了整座桥的地基。老实交代当时的真相：

| 组件 | 我关闭(Claude退出)后 |
|---|---|
| `bot.py` 收信 | ⚠️ 大概率被连带杀掉（它是会话的后台任务） |
| watcher | 必死——它的全部意义就是叫醒这个会话 |
| 兜底 cron | 必死（会话专属） |

也就是说当时关掉 Claude，整条链路全黑。唯一的安慰是 Telegram 服务器会把没人取的消息留约 24 小时，且 `drop_pending_updates=False`（后来改的，最初是 True——离线积压直接扔，这是个反直觉的坑：**这个参数名字面意思是"丢弃待处理更新"，挂在启动参数上，默认还不同步历史**）。

修法有三档，按野心排序：

1. **半托管**：bot.py 改成系统级常驻，消息不丢，但没人回。
2. **无头自动应答**：bot 收到消息直接拉起一个**无头模式的 Claude Code**（`claude -p`），让它自己读消息、干活、调 reply.py 回信、归档，进程干完即退。效果=不开任何窗口也 24 小时应答，还有完整的工具能力能操作这台机器。代价：要配 `--dangerously-skip-permissions`（无头模式没法弹确认框）且每条消息一次 API 调用。
3. **彻底独立**：接内网 LLM 自己聊，跟 Claude 脱钩。

**🧑‍🎓 学生：**

> 选②无头自动应答

---

## 对话 6（v2 施工：让机器自己长出大脑）

### 指令为什么要放在文件里

🔧 **老师操作**：先确认 `claude` CLI 可用（v2.1.246，模型路由映射到内网 GLM 网关——意味着无头实例的成本和交互式完全一致）。

给无头实例下达指令时有个中国 Windows 特有的坑要提前绕开：如果把中文指令当作命令行参数传给子进程，要穿过 Python → CreateProcessW → cmd 批处理 shim 三层编码转换，哪层抽风都是乱码。解法是把完整协议写成 UTF-8 文件 `dispatch_prompt.md`，传给 CLI 的 prompt 只有ASCII 一句话：

```python
WORKER_PROMPT = ("You are the tg-bridge worker. Read "
                 "E:/MyGithub/tg-bridge/dispatch_prompt.md and follow it exactly.")
```

协议内容本身倒是很朴素：列收件箱 → 校验 `from_id`（陌生人的直接删）→ 按语义回应（查询类真执行；破坏性操作不发货，先向本人二次确认）→ `reply.py` 发送 → 归档。

### 双脑竞态是怎么防住的

第二处关键改造在调度：**单线程线程池天然排队**。

```python
EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="headless")

async def on_message(update, _):
    ...
    path.write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding="utf-8")
    EXECUTOR.submit(run_headless)   # 不阻塞轮询循环；排队防并发抢件
```

如果没有这个排队，密集消息会同时拉起多个无头实例，大家在同一个 inbox 里看到同一批文件，各自都回一遍——用户收到重复轰炸。而串行化之后，第二个实例启动时第一步就是重新列收件箱，活儿已经被前一个干完了，自然空手而归。

### 进程必须脱离会话的进程树

第三处是 Windows 特供：如果 bot.py 还是用会话里的 `run_in_background` 拉起，它会作为会话的后代进程，会话一关照样团灭。正确姿势是用 PowerShell 把它生出去，父进程跟终端无关：

```powershell
Start-Process -FilePath '...\Python314\python.exe' `
  -ArgumentList '-X','utf8','E:\MyGithub\tg-bridge\bot.py' `
  -WindowStyle Hidden `
  -RedirectStandardOutput 'E:\MyGithub\tg-bridge\bridge.log' `
  -RedirectStandardError  'E:\MyGithub\tg-bridge\bridge.err.log'
```

---

## 对话 7（连环翻车实录：三个 Windows 生产级坑）

这一段没有一句话是顺利的，每个报错都是真的。

### 第 1 坑：新进程无声死亡

分离进程上线几分钟后例行体检：`tasklist | grep python` —— **0 个**。追日志，`bridge.err.log` 里躺着 285 行堆栈，最后一句：

```text
telegram.error.TimedOut: Timed out
```

还是 Clash。启动那一刻 handshake 没握过去，PTB 直接整进程退场。当时的止血手段是造一个看护壳，逻辑简单粗暴：死了就拉起来。

**第 2 坑当场就来：批处理的字符集地雷**。看护壳脚本第一版为了友好写了中文注释，结果一运行满屏乱码报错：

```text
'…都拉起来。这是无头模式的保命环。cd' 不是内部或外部命令…
'timeerrorlevel？秒后重启' 不是内部或外部命令…
```

眼熟的会发现第二行错得毫无道理。真相有两层叠加：

- 中文 Windows 的 cmd 按 **GBK** 解析 .cmd 文件，而我写的文件是 UTF-8——字节流被错误解码后，注释里的某些字节恰好吞掉了换行符，把注释和下一行的 `cd` 粘成了一个天书命令；
- 即便改掉中文，`.cmd` 文件的换行也必须是 **CRLF**（`\r\n`），Unix 风格的 `\n` 在 label 跳转等场景会让解析器行为诡异。

修复铁律：**批处理要么纯 ASCII 注释，要么显式 CRLF 落盘**（文本编辑器的"另存为 ANSI/换行符 CRLF"，或写完后 `sed -i 's/$/\r/'` 补齐）。

**第 3 坑紧跟其后：PATH 污染**。脚本里的延时用的 `timeout /t 5`，结果撞上了 Git Bash 的 PATH——从 bash 环境派生的 shell 里，Git 自带的 GNU coreutils `timeout` 排在系统前面，接收 `/t 5` 这种 cmd 语法当然拒收：

```text
timeout: invalid time interval '/t'
Try 'timeout --help' for more information.
```

经典 workaround 换成了谁都劫持不了的 `ping -n 6 127.0.0.1 >nul`。看护壳终版（可以看出现代的批处理已经浑身是防弹衣）：

```bat
@echo off
rem tg-bridge watchdog: restart bot.py whatever happens
cd /d E:\MyGithub\tg-bridge
:loop
"C:\...\Python314\python.exe" -X utf8 bot.py >> bridge.log 2>> bridge.err.log
echo [%DATE% %TIME%] bot.py exited rc=%ERRORLEVEL%, restarting >> bridge.log
ping -n 6 127.0.0.1 >nul
goto loop
```

### 第 4 坑才是根因：PTB 的 bootstrap_retries

看护壳上线后确实自愈了几次（日志里留下真实的复活记录）：

```text
[2026/08/27 下午 03:24:57.27] bot.py exited rc=1, restarting
[tg-bridge] 长轮询启动 @cgy_openclaw_2026_bot …
[2026/08/27 下午 03:28:25.28] bot.py exited rc=1, restarting
[tg-bridge] 长轮询启动 @cgy_openclaw_2026_bot …
```

但病根还没除——不能一辈子靠壳续命。顺着堆栈细看崩溃点不是想象中的消息收发，而是**启动期的引导调用** `_baserequest.post`（初始化时的 delete_webhook 请求），并且反射查签名证实 `run_polling` 对外暴露的重试参数只有一个 `bootstrap_retries`，默认值为 **0**——引导阶段只要碰上一次网络抖动就整个放弃。

修复一行搞定：

```python
app.run_polling(
    allowed_updates=["message"],
    drop_pending_updates=False,
    bootstrap_retries=10**6,   # 启动期遇 Clash 抖动无限重试
)
```

配合早前放宽的 `.read_timeout(30).connect_timeout(30).get_updates_read_timeout(75)`，以及外层的看护壳，三层防御凑齐后再没崩过。soak 测试 40 秒观察窗里进程稳定，err 行数不再增长。

---

## 对话 8（实弹验收：三条消息的两波处理）

最后一环要真人真枪验一遍。老师往主人的 TG 发了一条邀请，等来了三连发。全程围观日志：

```text
[in ] 20260827-153341-8421736803.json <- Corey C: 哈咯
[wkr] 启动无头 Claude 处理收件箱 …
[in ] 20260827-153401-8421736803.json <- Corey C: 哈哈哈哈        ← 实例还在冷启动，第二条到了
[in ] 20260827-153432-8421736803.json <- Corey C: 你是谁          ← 第三条也进来了
[wkr] 完成 rc=0  处理完成：2 条消息（均来自主人，闲聊问候）已合并回复发送成功，inbox 已清空并归档至 archive/
[wkr] 启动无头 Claude 处理收件箱 …                                 ← 排队中的第二个实例接棒
[wkr] 完成 rc=0  已处理 1 条消息（from_id 校验通过）：回复"你是谁"已发送，文件已归档
[wkr] 启动无头 Claude 处理收件箱 …                                 ← 多投递的那次任务空跑
[wkr] 完成 rc=0  inbox 为空，无待处理消息，结束。
```

三波全绿：密集消息合并处理没问题、串行排队没抢件、多出来的队列任务优雅空手而归。验收通过，从此这座桥不再依赖任何一个打开的窗口。

---

## 对话 9（课后追问：这条消息究竟是怎么"来"的）

**🧑‍🎓 学生：**

> 复盘 bot.py 源码的时候卡在一个更底层的问题上：手机上按下发送，`on_message(update)` 里就凭空有了这个 update——这条消息究竟是怎么到我机器上的？是 Telegram 推给我的吗？

**🧑‍🏫 老师：**

问到了地基的下面。答案有点反直觉：从头到尾没有任何东西被"推"给你。你的机器上一直挂着一个 HTTP 请求，是 Telegram 服务器把攒到的消息"递"回来的——拉模式，准确说叫长轮询（long polling）。整条路一跳一跳看：

```
你的手机                Telegram 云端            你这台机器
   │                        │                       │
   │ ① 按下发送             │                       │
   │   MTProto 加密上行      │                       │
   ├───────────────────────►│                       │
   │                        │ ② 发现收件方是 bot：    │
   │                        │    包成 Update JSON    │
   │                        │    排进该 bot 专属队列   │
   │                        │   （约保留 24h）        │
   │                        │                       │
   │                        │ ③ bot.py 早就卡在      │
   │                        │    getUpdates 请求上   │
   │                        │◄──────────────────────┤
   │                        │ ④ 消息一到，立刻把      │
   │                        ├──────────────────────►│
   │                        │    Update JSON 作为    │
   │                        │    HTTP 响应体返回      │ ⑤ PTB 反序列化 →
   │                        │                       │   Update 对象 →
   │                        │                       │   分发 on_message()
```

第①跳，手机 → TG 云。消息发到的是 Telegram 的数据中心，不是你的机器。此刻你机器上其实什么都没发生——这就是 bot.py 死 5 秒也不丢消息的原因：消息本来就不在你这儿，在云端排队。

第②跳，服务器侧入队。TG 看到这条对话的收件方是个 bot 账号（@BotFather 领来的那个），把消息包成 Update JSON 塞进它的专属队列。开这扇门的钥匙就是 config.json 里的 token——谁拿到 token 谁就能取走队列里的消息，所以它必须 gitignore，泄露过就得作废重建（文末安全清单第一条）。

第③④跳是主角。bot.py 并不是"每隔几秒问一次有没有新消息"，而是发出这样一个请求然后挂着不动：

```text
GET https://api.telegram.org/bot<TOKEN>/getUpdates?timeout=50
（出网经 Clash 7897——api.telegram.org 国内直连不通）
```

服务器收到后不立刻回，把请求挂住最多 50 秒：这 50 秒内消息到了，立刻响应返回 Update 数组；一直没消息，就到点返回空数组 `[]`。PTB 拿到响应、处理完，马上再发下一个 getUpdates，循环往复。效果上像推送，本质是一条永不松手的出站 HTTP 连接。

看懂这个，main() 里两个原本费解的配置就有了答案：

- `get_updates_read_timeout(75)`：等 50 秒是协议设计，不是网络故障。客户端超时必须设得比它长，否则会把正常等待误判成断线。
- 为什么不用 webhook？Bot API 另有一路：给 TG 一个 HTTPS 回调地址，消息到了它主动 POST 你。但那要求你的机器有公网可达的地址——家里/公司的机器在 NAT 后面，做不到。长轮询只要出站连接，配个 Clash 就能在任何内网跑。

第⑤跳，JSON → 对象 → 分发。服务器返回的原始报文长这样（已脱敏）：

```json
{
  "update_id": 871234567,
  "message": {
    "message_id": 42,
    "from": {"id": 8421***803, "first_name": "Corey C"},
    "chat": {"id": 8421***803, "type": "private"},
    "date": 1787815980,
    "text": "哈咯"
  }
}
```

PTB 把它反序列化成 Update 对象——代码里的 `update.effective_user`、`update.message.text` 就是从这几个字段来的。然后按注册的两条规则分发：`CommandHandler("start")` 接 `/start`；`MessageHandler(filters.TEXT & ~filters.COMMAND)` 接"是文本且不是 `/` 开头"的消息。这也顺带解释了 `/start` 为什么不会进 on_message：被 `~filters.COMMAND` 排除了。

还有一个看不见但很关键的机制：ack 确认。每成功取走一批 Update，PTB 下次请求会自动带上 `offset=update_id+1`，意思是"这些我收到了，下次从这之后给"。两个推论：

- 取走即确认，同一条消息不会被处理两次；
- 没人取的消息会一直躺在队列里——bot.py 死掉期间积压的，重启后第一轮 getUpdates 全部捞回。`drop_pending_updates=False` 能做到"离线补收"，底层就是这个机制在工作。

最后一个真会咬人的坑：同一时间只允许一个消费者用同一个 token 做 getUpdates。两个进程同时轮询，Telegram 直接回 409 Conflict，还会互相把消息抢走。所以哪天想自己 curl 一下 getUpdates 看原始报文，先把 bot.py 停了再试。更优雅的偷看法：在 on_message 里临时加一行 `print(update.to_json())`，下条消息过来，bridge.log 里躺着的就是完整原始 JSON——留作课后小实验。

---

## 压轴：一条消息的完整流转（终版架构逐步拆解)

这是整个故事最值得留下来的一节。一条"哈咯"从手机出发到收到回复，一共走了这些跳：

```mermaid
flowchart TD
    A["📱 手机点发送<br/>Telegram 客户端"] -->|"① MTProto 加密上行"| B["☁️ Telegram DC<br/>消息落地, 等 bot 取"]
    B -->|"② getUpdates 长轮询返回<br/>⬅ 出网经 Clash 7897"| C["🐍 bot.py (常驻)<br/>on_message 回调"]
    C -->|"③ 校验 from_id<br/>防陌生人"| D["💾 inbox/*.json<br/>UTF-8 落盘"]
    D -->|"④ executor.submit()<br/>单线程排队"| E["🤖 无头 claude -p<br/>--dangerously-skip-permissions"]
    E -->|"⑤ 先读 dispatch_prompt.md<br/>建立行为协议"| F["📂 Read inbox 消息<br/>ls/read/grep 本机任意资源"]
    F -->|"⑥ 按语义行动:<br/>闲聊·查询·真执行"| G["📤 reply.py<br/>POST sendMessage 经 Clash"]
    G -->|"⑦ API 落库"| B
    B -->|"⑧推送下行"| A
    E -->|"⑨ mv inbox/*.json archive/"| H["🗄️ archive/<br/>全过程可追溯"]
    I["🐕 run-bridge.cmd 看护壳"] -.->|"bot.py 一死 5 秒内拉起"| C
    J["💡 看门狗补位<br/>离线期间消息留在 Telegram 24h<br/>重启后 drop_pending_updates=False 全量补收"] -.-> B
```

逐步说人话：

1. **手机 → Telegram 云**：这跳是国内网络真正的"物理隔离带"，MTProto 协议被墙，必经代理。这就是后面每一跳都要挂着 `proxy=http://127.0.0.1:7897` 的原因——别以为配置一次就万事大吉，收 (`getUpdates_proxy`) 和发 (`proxy`) 在 PTB 里是两个独立的 HTTP 客户端，得各配各的。
2. **Telegram 云 → bot.py**：长轮询本质是"服务器你别挂电话"——客户端发一个可能 50 秒才返回的 HTTPS 请求，有新消息立刻回来，没消息就等到超时空手而归再来一遍。这比 webhook 省一个公网地址和一个证书，代价是要永远保持一个进程在线。
3. **校验与落盘**：`from_id != owner_id` 的消息直接扔（先绑后通的 `/start` 机制保证这个名单只有一个 id）。校验过了写 JSON 文件——为什么不放内存？因为**消费者是一个随时会被拉起的新进程**，只有文件系统能当它们之间的共享内存。
4. **排队**：`max_workers=1` 是故意的。并行处理同一批文件 = 重复回复 + 文件系统竞争，宁等勿抢。
5. **读协议**：无头实例和交互式窗口是两种人格——窗口版有我这几十轮上下文，无头版脑子里只有系统提示词。所以它的"入职培训材料"必须在 `dispatch_prompt.md` 里自包含：我是谁、主人是谁、什么该干什么不该干、失败了怎么办。
6. **真执行**：这是无头方案区别于普通聊天 bot 的分水岭——它可以 `ls` 你整个盘、读你的项目代码、跑你的构建命令。便利和风险在这里是同一枚硬币：`--dangerously-skip-permissions` 意味着没有任何弹窗拦截，唯一的防线就是②那道 from_id 校验和 dispatch_prompt 里的软约束。私人设备 + 个人承担后果的场景可以接受，放到公司机器前请三思并把允许的工具清单收紧。
7. **回信与归档**：回信走独立的 `reply.py`（自带 3 次退避重试），发成功后才移动 json 到 archive——**顺序不能反**，否则发失败的消息会被当成已处理吞掉。
8. **看护三件套**：进程崩了看护壳 5 秒拉起；引导期抖动 `bootstrap_retries` 无限重试；整机重启也不怕——没人消费的消息在 Telegram 服务器能躺约 24 小时，下次启动会一并补收。

---

## 尾声：一天之内的三次演进

| 版本 | 唤醒机制 | 端到端延迟 | Claude 关掉后 | 大脑所在地 |
|---|---|---|---|---|
| v0 | cron 每 3 分钟巡检 | 最长约 3 分钟 | 全线停摆 | 交互会话 |
| v1 | 文件监视哨兵退出即通知 | 约 2~30 秒 | 全线停摆 | 交互会话 |
| v2 | 消息直达无头实例 | 冷启动一次约 20~60 秒 | **照常运行** | 每条消息现拉的新实例 |

一点后见之明：v0 时代就觉得"寿命绑定会话"不好，但没有第一次拖延症的痛就没有第三次的彻底告别。架构演进常常不是聪明人的一次设计，而是被真实用户的需求一步步逼出来的。

**安全清单（复制这套东西前必读）**：

1. Token 泄露过就该去 @BotFather 作废重建——本文的 token 在写作时已建议重建；
2. `/start` 绑定名单机制必须保留，它是唯一挡住"全世界都能遥控你家电脑"的硬闸门；
3. `--dangerously-skip-permissions` 是把双刃剑，dispatch_prompt 里的"破坏性操作二次确认"是君子协定级别的软约束；
4. 任何一环报错先怀疑代理，再怀疑代码——在这个网络环境下，前者命中率远高于后者。

（全文完 · 实录时间 2026-08-27 下午 · 下一站可以聊聊怎么把这个桥的无头实例接到 Skills 渐进披露体系上，让它像 my-agent 一样自己学着长大）
