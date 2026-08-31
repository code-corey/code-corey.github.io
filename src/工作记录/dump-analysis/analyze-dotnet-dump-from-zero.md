---
title: "服务假死了,手上只有一个 dump 文件:从 0 开始把它验尸出真相"
sidebarGroup: "Dump 分析"
shortTitle: "从 0 验尸一个假死 dump"
order: 1
date: 2026-08-31
category: "工作记录"
tag:
  - ".NET"
  - "Dump 分析"
  - "线程池"
  - "性能排查"
  - "Windows"
description: "一个 576MB 的 .NET 服务假死 dump,从 minidump 格式手工解析开始,到 dotnet-dump、线程时间线、堆统计、全内存字符串扫描,一步步还原出 SQL 超时引发线程池饥饿的完整因果链。"
---

> 这次的现场是:一个跑在 Windows 服务里的 .NET WebAPI 假死了,同事甩过来一个 576MB 的 `xxx.DMP` 文件,加一句"分析一下为什么假死"。
>
> 没有日志、没有源码路径、不能上生产机。这篇文章把整个分析过程从头到尾记下来:每一步用什么工具、敲了什么命令、看到了什么、为什么能推出结论。你可以把它当成一份 .NET dump 分析的实操教材。

---

## 0. 先说清楚:dump 文件是个什么东西

程序在内存里的一切——线程在执行哪行代码、堆上有哪些对象、打开了哪些句柄——在某一瞬间被完整地拍了一张"快照",写到一个文件里,这个文件就是 dump(转储)。

它相当于案发现场的冷冻封存:进程还保持着假死那一刻的所有状态,事后可以慢慢解剖。配合分析工具,你可以看到:

- 有多少线程,每个线程的调用栈(正在执行哪条调用链)
- 托管堆里有什么对象、各有多少个
- 锁的持有关系(谁拿着锁、谁在等)
- 甚至内存里残留的字符串(日志片段、异常消息)

所以"分析假死"的本质是:在快照里找到那 200 个线程到底卡在哪。

但要先建立一个预期:dump 是**一个时刻**的切片,不是录像。它只能告诉你"拍快照那一瞬间"发生着什么。如果拍晚了,现场可能已经被破坏了——这次案例就正好踩中了这一点,后面细说。

## 1. 第一步:不装任何工具,先自己把文件拆开看看

拿到文件,我做的第一件事不是装分析器,而是看文件头。用 `xxd` 把开头几个字节转成十六进制看一眼:

![xxd 查看文件头:开头四字节 MDMP 魔数](/img/posts/dump-analysis/01-file-header.png)

开头四个字节是 `MDMP`——这是 Windows 用户态 minidump 的标准魔数。既然是标准格式,它的文件结构是公开的:开头一个 Header,跟着一张"目录表",列出所有数据流(线程表、模块表、内存、句柄表……)和各自在文件里的位置。

这一步顺手确认了一个重要事实:dotnet 工具链装起来因为网络超时失败了,但 **minidump 格式足够简单,用 Python 读二进制就能解析**。我写了个百来行的脚本,按结构体定义把 Header 和目录表读出来:

```python
import struct
f = open(DUMP_PATH, "rb")
sig, ver, nstreams, dir_rva, csum, tds, flags = struct.unpack("<IIIIIIQ", f.read(32))
# 目录表:每项 12 字节 = StreamType(4) + DataSize(4) + Rva(4)
```

跑出来的关键信息如下,完整效果见截图:

![手工解析 minidump:流目录、系统信息、200 线程、无异常流](/img/posts/dump-analysis/02-parse-minidump.png)

这里面的信息量很大,值得逐条说:

**FullMemory** 表示完整内存 dump(不是只存线程栈的迷你 dump),意味着后面可以挖堆对象、挖字符串,能做的事多得多。

**2026-08-31 11:03:43** 是抓取时间,记住它,后面推时间线全靠它。

**No Exception Stream** 是最重要的一条:如果进程是崩溃死的,头里会记录崩溃异常(比如访问违例 0xC0000005)。没有异常流,说明这是**活体挂起 dump**——进程没死,是被人发现"没响应"之后手动抓的。这直接把分析方向定成了"查阻塞",而不是"查崩溃"。

## 2. 第二步:从模块表认出这是个什么程序

323 个模块里挑关键看,立即能拼出技术栈(效果见下图):

![模块表:coreclr 9 / Topshelf / librdkafka / SqlClient.SNI](/img/posts/dump-analysis/03-modules.png)

注意这不是 IIS 的 w3wp,而是 **Topshelf 宿主的 Windows 服务进程,里面自己跑了一个 Kestrel Web 服务**,同时还在用 Kafka 和 SQL Server。200 个线程对这个形态的进程来说偏多,值得警惕。

> 这一步的小技巧:不认识的原生 DLL,搜一下名字就知道是什么组件。`librdkafka`、`SNI` 这类名字在后面排查"卡在哪个依赖上"时非常有用——先混个脸熟。

## 3. 第三步:请出正规军 dotnet-dump

手工解析只能看结构,要看**托管代码层面**谁卡住了,得用 .NET 官方的 SOS 引擎。装一个:

```bash
dotnet tool install -g dotnet-dump
dotnet-dump analyze xxx.DMP
```

进去之后它是一个交互式命令行,先看安装和常用命令长什么样:

![安装 dotnet-dump 与五个常用命令](/img/posts/dump-analysis/04-dotnet-dump-install.png)

第一个要看的永远是 `clrstack -all`。输出很长(200 个线程),我的做法是全部落盘再统计:

```bash
dotnet-dump analyze xxx.DMP --command "clrstack -all" > _clrstack_all.txt
```

主线程一切正常,但另外 163 个线程的栈像是一个模子里刻出来的:

![clrstack -all:主线程正常,163 个线程全停在同一处](/img/posts/dump-analysis/05-clrstack.png)

也就是说:**没有任何一个线程在执行业务代码**。整个服务像一家 163 个员工全体靠墙站着、一个客户都没有的空店。

紧接着用 `threadpool` 和 `syncblk` 两个命令排除两个最常见的嫌疑人:

![threadpool:163 个线程全空闲;syncblk:无任何锁竞争](/img/posts/dump-analysis/06-threadpool-syncblk.png)

**锁死锁这个最常见的嫌疑人,直接排除。**

这里很多人会问:线程全空闲、没锁竞争、CPU 才 17%,那它到底"死"在哪?问得好——这就是本次分析的第一个转折点:**不能只看快照的这一瞬间,得看它是怎么走到这一瞬间的。**

## 4. 第四步:dumpasync,看看异步的世界里有什么悬着

现在的 .NET 服务大量用 async/await,同步栈全空闲不代表异步链没问题。`dumpasync` 把堆上所有未完成的 await 状态机按等待关系拼成"异步调用栈",94 条等待链的构成见下图:

![dumpasync:94 条等待链,Apollo 长轮询 + 69 个空闲 keep-alive 连接](/img/posts/dump-analysis/07-dumpasync.png)

69 个空闲 HTTP 连接偏多,但这只是背景噪音,不是元凶。此刻依然没有业务请求挂在半路。

## 5. 第五步:关键一击——线程创建时间线

转机来自一个朴素的念头:**163 个线程不是天生就有的,是慢慢创建出来的。它们是"什么时候"、以"什么节奏"出生的?**

minidump 里正好有一个 ThreadInfoList 流,每个线程都带创建时间。这数据 SOS 不直接展示,我回到 Python 解析器,把每个线程的 `CreateTime` 和进程启动时间做差,按时间排序,结果一眼就能看出问题:

![线程创建时间线:每秒 1 个,持续 8 分钟](/img/posts/dump-analysis/08-thread-timeline.png)

**每秒一个,持续八分钟。** 这是 .NET 线程池"饥饿注入"的教科书特征。

解释一下这个机制:线程池检测到"队列里持续有任务、但现有线程迟迟干不完"时,不会一口气开几百个线程,而是**最多每秒补 1 个新线程**(避免线程爆炸)。所以看到"每秒 +1,持续 N 分钟",就可以断定:**这 N 分钟里,一直有工作项把线程占死**。线程们不是在空转,是每次醒来接了活就陷进去,线程池只好不停招新人。

那 163 个新线程为什么现在是"空闲"的?说明在 dump 前的一小段时间里,把线程占死的东西突然全部结束了(或者是客户端全部放弃了)。又是切片的局限性——但方向已经完全变了:**问题发生在 10:55 到 11:03 之间,要找的是"什么东西把 163 个线程轮流占死了"。**

顺手还看了进程的累计 CPU(MiscInfo 流):运行 2.75 天,内核态 12,774 秒、用户态 1,756 秒。**内核时间是用户态的 7 倍**,这是大量阻塞式系统调用(线程反复睡去唤醒、socket 操作)长期积累的痕迹——这个服务平时就在"同步阻塞 IO"的模式下工作,佐证了上面的推断。

## 6. 第六步:翻堆统计,找"案发残留物"

如果 SQL 或 HTTP 慢过,堆上会留下"案发残留物"——超时错误对象、超时计时器,它们还没来得及被 GC 回收。`dumpheap -stat` 按类型汇总全堆:

```bash
dotnet-dump analyze xxx.DMP --command "dumpheap -stat" > _heapstat.txt
```

在几万行统计里 grep `SqlClient` 相关类型,挖到了这次分析最硬的一条证据(下图就是当时终端里的样子):

![堆统计:116 个 SQL 超时错误对象 + 310 条物理连接](/img/posts/dump-analysis/09-sql-timeout-heap.png)

`TimeoutErrorInternal` 只有在 SQL **连接/命令超时**的执行路径上才会创建。堆里躺着 116 个,意味着 dump 前不久刚发生过一轮**成规模的 SQL Server 超时**。时间窗口正好和线程注入的八分钟对得上。

顺带一提,84 个 PoolKey 说明配置了 84 个不同的连接串标识(多个库),`Max Pool Size=1500` 的配置也暗示这个系统历史上被连接池问题折腾过。

## 7. 第七步:全内存字符串扫描,把"黑匣子"抠出来

576MB 的 FullMemory dump 里,除了结构化数据,还有一大块金矿:**还没被 GC 的字符串**。应用的日志消息、异常文本、序列化过的 JSON 响应,都可能在里面。

思路很直接:遍历 dump 的全部内存段(按 Memory64List 的映射),用关键词的 UTF-16LE 编码做字节搜索——.NET 字符串在内存里就是 UTF-16:

```python
pat = "Unexpected end of request content".encode("utf-16-le")
idx = chunk.find(pat, start)
```

扫完 548MB,几秒钟出结果,相当于从内存里做了一次"日志恢复":

![字符串扫描结果:客户端断连日志 + 出站调用被取消](/img/posts/dump-analysis/10-string-scan.png)

最有价值的是残留的应用日志(log4net 缓冲)——5 条,全部同一个错误:

```
[2026-08-31 11:03:15] 请求URL:POST /ProjectInfo/Search
堆栈:Microsoft.AspNetCore.Server.Kestrel.Core.BadHttpRequestException:
      Unexpected end of request content.
      at Http1ContentLengthMessageBody.ReadAsyncInternal(...)
```

这个异常的含义要精确理解:客户端把请求头发过来了,但**在服务端去读请求体之前就把连接断了**。什么客户端会这么干?等响应等到超时、主动放弃的那种。时间戳 11:03:11 / 11:03:15 / 11:03:23——就在抓 dump 前 20~30 秒。

**残留的异常对象文本**:

```
System.IO.IOException: Unable to read data from the transport connection:
由于线程退出或应用程序请求,已中止 I/O 操作。
---> System.Net.Sockets.SocketException (995)
   at System.Net.Http.HttpConnection.SendAsync(...)
```

出站 HTTP 调用收到 995(OperationAborted),典型的"上游请求被取消,socket 读被中止"——和客户端断连是同一件事的两面。

**残留的业务数据**:task-api 在 11:01:05 还返回了正常的 JSON(说明这个出站依赖当时是活的);Apollo 长轮询的完整 URL;Kafka 的 broker 地址。排除法又清掉了两个嫌疑人。

> 隐私提醒:这种全内存扫描一定会扫到连接串和密码。分析报告里要脱敏,dump 文件本身也要按敏感数据管理。

## 8. 把整条因果链拼起来

到这里证据闭环了,把时间顺序摆出来:

```
10:55 前后   SQL Server 某库变慢(具体哪个库要 DBA 对时确认)
    ↓
/ProjectInfo/Search 这类请求的处理链被拖慢
(SqlSugar 同步查询,一个请求占死一个线程池线程)
    ↓
线程池进入饥饿注入:每秒补 1 线程,8 分钟补了 ~150 个,全部陷进去
    ↓
新请求大量排队,响应远超客户端超时阈值
    ↓
调用方(3 个内网 IP 高频轮询)超时断连
   → 服务端读到半个请求,抛 Unexpected end of request content
   → 出站调用收到 995 被级联取消
    ↓
nginx/上游全部超时,健康检查失败 → 对外完全无响应 = 「假死」
    ↓
11:03 之后 SQL 恢复(或请求被放弃完)→ 现场归于死寂
    ↓
11:03:43 抓 dump —— 抓到的是风暴过后的空场
```

回头看第五步留下的那个问题:dump 里为什么一切正常?因为**抓晚了**。假死的真实现场(163 个线程全部阻塞在 SQL 上)只存在于 11:03:24 之前,dump 里的 116 个超时对象和几条残留日志,是从切片里往外窥探历史痕迹的唯一窗口。

## 9. 复盘:这次的完整工具箱

按使用顺序列一下,也是我建议的分析顺序:

1. **xxd / 手工解析文件头**:确认 dump 类型(活体 vs 崩溃)、抓取时间、是否 FullMemory。别跳过,这步决定后面所有方向。
2. **模块表**:认出进程形态(Topshelf 服务自托管 Kestrel)、关键原生依赖(librdkafka、SNI)。
3. **dotnet-dump analyze**:`clrstack -all` → `threadpool` → `syncblk` → `dumpasync` → `dumpheap -stat`,五连,前两个看"现在",后两个看"悬着的",最后一个看"残留"。
4. **自写 Python 解析 ThreadInfoList**:线程创建时间线。这一步是全场的胜负手——SOS 不直接给这个数据,但 minidump 格式是公开的,几百行 Python 就能挖出来。
5. **全内存字符串扫描**:UTF-16LE 关键词搜索,抠残留日志和异常文本,相当于从内存里做"日志恢复"。
6. **堆统计找残留对象**:TimeoutErrorInternal 这类"只有错误路径才创建"的类型,数量就是案发强度的直接证据。

如果重来一遍,我会提醒自己三件事:

- 假死分析,`clrstack -all` 全空闲 ≠ 没问题,下一步一定是**时间线**(线程创建时间、线程 CPU 时间)而不是继续翻栈。
- dump 是切片。**抓 dump 的时机比分析技术更重要**——发现假死第一时刻抓,配合 `dotnet-counters monitor`(盯 `threadpool-queue-length`)边观察边抓。
- 排除法的价值不亚于定位法。Kafka 正常、task-api 正常、Apollo 正常、无锁竞争——每排除一个,元凶的范围就缩小一圈。

## 10. 修复建议(给当时那个服务)

按优先级:

1. 让 DBA 对时排查 8/31 10:19 和 10:55–11:03 两个窗口的 SQL 阻塞链、慢查询、锁等待——这是根因侧。
2. 业务查询改异步,或者至少给所有 SQL/HTTP 调用加短硬超时(3–10s),别让一个请求无限期占死线程。
3. 热点轮询接口加 30–60 秒内存缓存——那 3 个 IP 用几乎不变的参数高频轮询,缓存能把 DB 压力砍掉一个数量级。
4. 应急手段:`ThreadPool.SetMinThreads(200, 200)`,先让线程池在风暴来临时不需要每秒挤牙膏。治标,但能买命。
5. 接入 `dotnet-counters` / `dotnet-monitor` 常态观测线程池队列长度,下次在饥饿发生的第一分钟就能发现,而不是等到"假死"。

---

以上就是一个 576MB 的 dump 从"拆文件头"到"完整因果链"的全过程。核心思路其实只有一句话:**结构化的工具(SOS)告诉你现在,手工解析格式和全内存扫描帮你还原历史。** 两边对上,真相就出来了。

(分析过程中产出的脚本和中间产物:`_parse_dump.py` / `_parse_threads.py` / `_parse_timeline.py` / `_scan_strings.py` / `_extract_stacks.py`,都在 dump 同目录下,可复用。)
