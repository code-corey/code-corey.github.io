---
title: "ThreadLocal 与 AsyncLocal 对话课：从三个翻车实验到 dotnet/runtime 源码"
sidebarGroup: ".NET 并发源码"
shortTitle: "ThreadLocal vs AsyncLocal"
order: 1
date: 2026-09-04
category: ".NET"
tag:
  - ".NET"
  - "源码阅读"
  - "ThreadLocal"
  - "AsyncLocal"
  - "ExecutionContext"
  - "并发"
description: "一堂 0 基础也能跟上的对话课：从全局变量翻车、[ThreadStatic] 初始化器坑、线程池脏值诈尸到通知 FailFast 崩进程，10 个真跑的实验串起 ThreadLocal 与 AsyncLocal 的源码差异。"
---

> **第 1 篇 · .NET 并发源码系列**（本系列计划 10 篇以上，这是开篇）

本文是一堂完整的师生对话课逐字稿。学生是 0 基础，老师从最简单的现象讲起，一路讲到 dotnet/runtime 源码。文中所有代码都是课堂上真实运行过的，输出原样贴出（.NET 10.0.400，Windows）。

实验工程就一个控制台项目：

```text
H:\develop\tls-lab\Lab\
├── Lab.csproj
└── Program.cs        ← 每个实验一个方法，用命令行参数选择跑哪个
```

---

## 开场白

> **老师**：好，上课。今天咱们聊两个长得很像的兄弟：`ThreadLocal<T>` 和 `AsyncLocal<T>`。名字里都带个 Local，都能存"局部"的数据，但它们解决的问题完全不同。搞混它们的人，轻则日志里 TraceId 莫名其妙是空的，重则用户 A 的数据串到用户 B 的请求里，直接生产事故。
>
> 我不打算一上来就甩定义。咱们反过来，先做实验、先翻车、先困惑，然后再去源码里找答案。今天全程就回答一个问题——
>
> **你存的值，到底跟着谁走？**
>
> 记住这句话，一节课都在讲它。准备好了吗？

> **学生**：准备好了。不过老师，我连"局部"这个词都没完全明白，方法里的局部变量叫局部，这俩怎么也叫局部？

> **老师**：问得好，就从这开始。

---

## 第 1 节 先翻车：所有线程共用一个抽屉

> **老师**：你写代码的时候，把一个变量声明成 `static`，它存在哪？

> **学生**：存在……类上面？整个程序只有一份。

> **老师**：对，整个进程就一份。现在问题来了：如果有 4 个线程同时往这一份变量上加数，会发生什么？咱们真跑一下，眼见为实。新建一个控制台项目，代码就这么点：

```csharp
static int _counter = 0;

static void Main()
{
    _counter = 0;
    var threads = new List<Thread>();
    for (int t = 0; t < 4; t++)
    {
        var th = new Thread(() =>
        {
            for (int i = 0; i < 100_000; i++)
            {
                _counter++;          // 每个线程都往同一个字段上加
            }
            Console.WriteLine($"线程{Environment.CurrentManagedThreadId} 干完了，我看到的 _counter = {_counter}");
        });
        threads.Add(th);
        th.Start();
    }
    foreach (var th in threads) th.Join();
    Console.WriteLine($"最终 _counter = {_counter}（期望 400000）");
}
```

> 跑一次看看：

```text
$ dotnet run
线程7 干完了，我看到的 _counter = 134720
线程5 干完了，我看到的 _counter = 134720
线程6 干完了，我看到的 _counter = 134720
线程4 干完了，我看到的 _counter = 134720
最终 _counter = 134720（期望 400000）
```

> **学生**：啊？跑了 40 万次加法，最后才 13 万？数都去哪了？

> **老师**：`_counter++` 这句话看着是一步，实际上是三步：把值从内存读进寄存器、寄存器加一、写回内存。两个线程同时"读"到了同一个旧值，各自加一，各自写回——其中一个的加法就被覆盖了，凭空消失。这叫竞争条件。
>
> 但注意，我今天不是要教你加锁。你想想，假设这个场景换一下：不是"大家共同攒一个总数"，而是"每个线程想要自己的工作 buffer，互不干扰"——用加锁合适吗？

> **学生**：不合适吧？我根本不想跟别人共享，锁反而让大家都排起队来，纯属内耗。

> **老师**：没错。共享是问题的来源，那干脆别共享——**每个线程自己一份，别人碰不到**。这个思路就叫线程局部存储，Thread Local Storage，TLS。

---

## 第 2 节 地基材料：[ThreadStatic]，好用但有暗坑

> **老师**：.NET 给的最原始工具是个特性，叫 `[ThreadStatic]`。往静态字段上一贴，这个字段就从"全进程一份"变成"每线程一份"。写法：

```csharp
[ThreadStatic]
static int _perThread = 42;   // 想让每个线程都从 42 开始
```

> **学生**：看着挺直观。`= 42` 就是给每人发的初始值嘛。

> **老师**：你猜新线程读这个字段，是多少？

> **学生**：42 啊，初始化器写着的。

> **老师**：跑一下：

```csharp
static void Main()
{
    Console.WriteLine($"主线程读 _perThread = {_perThread}");
    var th = new Thread(() =>
        Console.WriteLine($"新线程读 _perThread = {_perThread}（不是 42！）"));
    th.Start();
    th.Join();
}
```

```text
$ dotnet run
主线程读 _perThread = 42
新线程读 _perThread = 0（不是 42！）
```

> **学生**：等等？！42 呢？新线程的 42 跑哪去了？

> **老师**：这就是 `[ThreadStatic]` 最大的暗坑。`= 42` 这种字段初始化器，本质上是在**静态构造函数**里执行的，而静态构造函数**整个进程只跑一次**——跑在第一个碰它的线程上，也就是主线程。所以这个 42 只"发"给了主线程那一份。
>
> 其余线程呢？它们的那份字段是运行时 newly 分配的，直接就是默认值 0。

> **学生**：懂了，初始化器只对第一个线程生效。那每个线程想要初始值怎么办？

> **老师**：只能在每次读的时候自己判断：

```csharp
[ThreadStatic]
static StringBuilder? _sb;

// 每个访问点都得这么写
static StringBuilder SB => _sb ??= new StringBuilder();
```

> 这种判空样板代码到处贴，烦不烦？而且 `[ThreadStatic]` 只能挂在静态字段上——你要是想要"每个对象各有一套线程数据"，它做不了。还缺 factory、缺统一释放、缺"把所有线程的值捞出来看看"的能力。
>
> 于是官方说：我给你封装一个吧。这就是 `ThreadLocal<T>`。

---

## 第 3 节 ThreadLocal<T>：给地基装上门面

> **老师**：`ThreadLocal<T>` 用起来是这样：

```csharp
var tl = new ThreadLocal<string>(() =>
    $"buffer@T{Environment.CurrentManagedThreadId}");
Console.WriteLine($"主线程: {tl.Value}");
Console.WriteLine($"主线程再读: {tl.Value}（同一个，不再新建）");

var th = new Thread(() =>
    Console.WriteLine($"工作线程: {tl.Value}（自己的一份）"));
th.Start();
th.Join();
tl.Dispose();
```

```text
$ dotnet run
主线程: buffer@T2
主线程再读: buffer@T2（同一个，不再新建）
工作线程: buffer@T4（自己的一份）
```

> **学生**：传了个 lambda 进去，然后每个线程第一次读 `Value` 的时候各自执行一遍，得到各自的值。

> **老师**：对，这就是**懒初始化**——谁先用谁触发，没碰过它的线程永远不会执行那个 factory。刚才 `[ThreadStatic]` 的三个烦恼一次解决：
>
> 1. 初始化不再依赖静态构造，每个线程自己来，工厂说了算；
> 2. 判空样板收进库里了，你只管读 `Value`；
> 3. 它是实例，所以可以建好几个互不干扰的 `ThreadLocal<string>`，还带 `Dispose()` 和 `Values`。
>
> 顺带说一句，那个 factory 抛异常的语义也值得记一笔：**异常不会被缓存**，下次再访问 `Value`，factory 会重新执行。这跟 `Lazy<T>` 默认模式（异常缓存住）不一样。

> **学生**：等等，`Values` 是干嘛的？

> **老师**：把"所有线程上这个实例的值"捞成一个 List 出来。注意两个限制：构造的时候要传 `trackAllValues: true` 才有，事后开不了；而且线程退出后，它的值还会留在快照里，别把 `Values` 当"活线程名单"用。

> **学生**：听起来 ThreadLocal 挺完善的，那还要 AsyncLocal 干嘛？

> **老师**：别急。它马上要在异步世界里翻个跟头。但在翻跟头之前，咱们先打开它的源码看看它是怎么干的——这一段会让你后面判断问题特别有底气。

### 源码开胃菜：ThreadLocal 是怎么存值的

> 老师说：咱们看 dotnet/runtime 里 `ThreadLocal.cs` 的骨架（简化过的）：

```csharp
public class ThreadLocal<T> : IDisposable
{
    // 每线程、每 T 一份：该线程上所有 ThreadLocal<T> 实例的槽位表
    [ThreadStatic]
    private static LinkedSlotVolatile[]? ts_slotArray;

    // 本实例的全局唯一 ID 的"按位反码"（~id）
    private int _idComplement;

    private Func<T>? _valueFactory;
    private volatile bool _initialized;

    // 本实例的双向链表（哑头结点），串联"所有线程上属于本实例的值"
    private LinkedSlot? _linkedSlot = new LinkedSlot(null);
}
```

> **学生**：它自己内部还是用了 `[ThreadStatic]`！绕了一圈？

> **老师**：对，地基还是那块地基——`ts_slotArray`，一个数组。但它做了几件聪明事：
>
> **第一件，槽位表。** 每个 `ThreadLocal<T>` 实例构造时从全局管理器领一个编号 id。每个线程的 `ts_slotArray` 里，下标 id 的位置存的就是"这个线程在这份实例上的值"。
>
> 所以你每建一个 `ThreadLocal<string>` 实例，全进程每个碰到过它的线程的表里都会多一个槽。同一个类型的实例越多，每张表越长——这是一种隐性内存开销，记住这个。
>
> **第二件，读值的快速路径是无锁的。** 看 `Value` 的 getter（简化）：

```csharp
get
{
    LinkedSlotVolatile[]? slotArray = ts_slotArray;
    LinkedSlot? slot;
    int id = ~_idComplement;

    if (slotArray != null                        // 1. 本线程建过表吗？
        && id >= 0                               // 2. 实例没被 Dispose 吧？
        && id < slotArray.Length                 // 3. 表装得下这个 id 吗？
        && (slot = slotArray[id].Value) != null  // 4. 本线程建过这个槽吗？
        && _initialized)                         // 5. 再确认一次没被 Dispose
    {
        return slot._value;
    }
    return GetValueSlow();   // 慢路径：建表建槽、跑 factory
}
```

> **学生**：五个 if 连着写……最后那个 `_initialized` 为什么又查一遍？第 2 步不是查过了吗？

> **老师**：问到点子上了。第 2 步和第 4 步之间，可能另一个线程刚好对实例调了 `Dispose()`。第 5 步是在拿到槽**之后**再确认一次，把竞争窗口关死。而第 1、5 步能这么配合，靠的是 `slotArray[id].Value` 是 volatile 读，内存序上保证了检查不会乱序。这是教科书级的双重检查写法，值得抄进你的笔记。
>
> **第三件，`_idComplement` 这个小把戏。** 它存的是 id 的按位反码 `~id`。为什么要反着存？因为 id 可以是 0，而"构造函数还没跑完"和"已经 Dispose 了"也都用 0 这个默认值表示——如果直接存 id，0 就分不清是"合法的 0 号实例"还是"没初始化"。存反码之后：正常实例 `~_idComplement >= 0`（0 号实例也得到 0，不混淆），异常态得到 -1。一个 int 同时当三件事用：判释放、判构造异常、防竞争。
>
> **第四件，双向链表。** 每个槽位结点同时挂在实例的 `_linkedSlot` 链表上。`Dispose()` 的时候顺着链表走一遍，把每个线程表里的槽清空，id 还给管理器复用。要是忘了 Dispose，线程退出的时候还有个 `FinalizationHelper` 在 GC 时兜底解链——但那只是兜底，线程池线程几乎不死，兜底兜不到，值就一直钉在内存里。所以规矩是：**用完要 Dispose**。

> **学生**：好家伙，一个小小的 ThreadLocal 内部这么多机关。

> **老师**：这才一半。接下来看它在异步世界里的翻车现场。

---

## 第 4 节 await 一来，值没了？

> **学生**：老师，我一直有个疑问：async/await 不就是"开个后台线程干活"吗？跟线程有什么关系？

> **老师**：恰恰相反——async/await 的设计目标之一就是**不**固定线程。`await` 之前的代码可能跑在 T2 线程上，`await` 等待结束之后，延续的部分大概率被调度到另一个线程池线程上继续跑。线程会换人，但你的**逻辑操作**还是同一个。
>
> 这句话对 ThreadLocal 意味着什么？它的值跟着**物理线程**走。线程一换人，你读到的就是另一个线程的那份——可能还没初始化，factory 重新跑一遍。咱们来实测：

```csharp
var tl = new ThreadLocal<string>(() =>
    $"created@T{Environment.CurrentManagedThreadId}");
var al = new AsyncLocal<string>();   // 先别管它是什么，看表演

al.Value = "请求A的TraceId";
var _ = tl.Value;                    // 当前物理线程初始化

Console.WriteLine($"await 前: 线程T{Environment.CurrentManagedThreadId} tl={tl.Value} al={al.Value}");

await Task.Delay(200);               // 等待期间当前线程被释放，恢复时换个线程

Console.WriteLine($"await 后: 线程T{Environment.CurrentManagedThreadId} tl={tl.Value} al={al.Value}");
```

```text
$ dotnet run
await 前: 线程T2 tl=created@T2 al=请求A的TraceId
await 后: 线程T5 tl=created@T5 al=请求A的TraceId
```

> **学生**：看到了！tl 从 `created@T2` 变成 `created@T5`——线程从 T2 换到 T5，ThreadLocal 的 factory 又跑了一遍，值"丢"了。但 al 那个 AsyncLocal，还是"请求A的TraceId"，稳如老狗。

> **老师**：这就是两个类型最核心的分野，回到开场那句话——
>
> **`ThreadLocal<T>` 的值跟着物理线程走，`AsyncLocal<T>` 的值跟着逻辑控制流走。**
>
> 而且注意，ThreadLocal 这种"丢"比看着更危险。如果 factory 很贵——比如建一块非托管缓冲区、建一个 DbContext——同一个逻辑操作在不同物理线程上会各自初始化出好几份，旧的那份还得等线程退出才释放。

> **学生**：那 AsyncLocal 凭什么能活着飘过 await？它把值藏哪了？

> **老师**：这就得请出今天真正的主角了。

---

## 第 5 节 ExecutionContext：跟着"逻辑操作"走的环境

> **老师**：先打个比方。你上大学，一节课在 301 教室上，下一节去 505 教室。**你换了教室，但你的书包始终背在你身上**——笔记、水杯、学生卡都在包里，到哪都能用。
>
> 异步世界里也一样：逻辑操作就是"你"，物理线程就是"教室"。await 之后线程换了教室，但有一个"书包"跟着逻辑操作一起走。这个书包就叫 `ExecutionContext`，执行上下文。
>
> 里面装什么？AsyncLocal 的值、变更通知的登记表、还有几个流控制标志。

> **学生**：那"跟着走"是怎么实现的？总得有个时刻把包递过去吧。

> **老师**：两个动作。
>
> **捕获（Capture）**：在控制流分叉的时刻——`Task.Run` 排队的那一瞬间、注册 await 延续的那一瞬间、`new Thread(...).Start()` 的那一刻——对当前书包拍个快照。
>
> **恢复（Restore）**：快照跟着工作项走，未来在某个线程上执行时（可能是别的线程），先把快照里的内容恢复到那个线程身上，再执行你的代码。执行完，运行时再把线程重置回空书包，免得污染下一个工作项。

> **学生**：所以 AsyncLocal 的值不在 ThreadLocal 那种表里，而是在这个书包里？

> **老师**：完全正确。看 `AsyncLocal.cs` 的源码，你会怀疑人生——它薄得离谱：

```csharp
public sealed class AsyncLocal<T> : IAsyncLocal
{
    private readonly Action<AsyncLocalValueChangedArgs<T>>? _valueChangedHandler;

    public T Value
    {
        get => (T)ExecutionContext.GetLocalValue(this)!;   // 去当前线程的书包里找
        set => ExecutionContext.SetLocalValue(this, value, ...);
    }
}
```

> 它自己**一个字节的数据都不存**。整个对象就是个"钥匙"——读的时候拿钥匙去当前线程的 `ExecutionContext` 里翻；写的时候让 `ExecutionContext` 更新。数据全在书包里，钥匙本身没有份量。

> **学生**：那我读 `al.Value` 的时候，运行时具体在干嘛？

> **老师**：就一行：`Thread.CurrentThread._executionContext` 拿到当前书包，在里面的 map 里按这把钥匙查值。 map 没查到就返回 null。
>
> 写入就有意思了，这是 AsyncLocal 所有性能特征的来源，值得单独讲。

---

## 第 6 节 写一次值，运行时干了五件事

> **老师**：`ExecutionContext.SetLocalValue` 的完整流程（简化）：

```csharp
internal static void SetLocalValue(IAsyncLocal local, object? newValue, bool needChangeNotifications)
{
    ExecutionContext? current = Thread.CurrentThread._executionContext;

    object? previousValue = null;
    bool hadPreviousValue = false;
    if (current != null)
        hadPreviousValue = current.m_localValues.TryGetValue(local, out previousValue);

    if (previousValue == newValue)
        return;   // ★ 值没变：零分配直接返回

    // ★ 写时复制：从旧 map 派生新 map，绝不修改旧的
    IAsyncLocalValueMap newValues = current != null
        ? current.m_localValues.Set(local, newValue, ...)
        : AsyncLocalValueMap.Create(local, newValue, ...);

    if (needChangeNotifications) { /* ★ 首次赋值时登记变更通知 */ }

    // ★ 换掉线程身上的书包（空了就退回 null）
    Thread.CurrentThread._executionContext =
        AsyncLocalValueMap.IsEmpty(newValues) ? null
        : new ExecutionContext(newValues, newChangeNotifications, isFlowSuppressed);

    if (needChangeNotifications)
        local.OnValueChanged(previousValue, newValue, contextChanged: false);  // ★ 同线程立即通知
}
```

> **学生**：等一下，"写时复制"？我改个值，不是直接改吗，怎么是复制一份新的？

> **老师**：这是整个设计里最深的一步棋，我问你：刚才说捕获是"拍快照"，如果快照和原件是**同一个** map，那我捕获之后又改了值，会发生什么？

> **学生**：快照也跟着变了……那"快照"就不快照了。

> **老师**：对。所以 map 是**不可变的**——任何"修改"都不碰旧 map，而是基于旧 map 造一个新 map 返回。旧的继续给已捕获的快照用。好处一连串：
>
> - 已捕获的上下文永远不会被篡改；
> - 父流和子流可以各自演化，互不干扰；
> - 所以 `CreateCopy()` 敢直接 `return this`，因为根本不需要拷贝。
>
> 这个 map 的实现按元素个数分了层：0 个用全局单例；1~4 个是固定字段、引用比对；5~16 个是数组线性扫；超过 16 个才上真哈希表。日常请求里就两三个键，读取就是几次引用比对，非常快。

> **学生**：听着读很快，那写呢？

> **老师**：写就是代价所在。每一次"值真的变了"的写入，至少分配**一个新 map + 一个新 ExecutionContext 对象**。在循环里、每请求几十次地写 AsyncLocal，GC 会很有意见。
>
> 所以 ASP.NET Core 给你打了个样：`IHttpContextAccessor` 内部是**一个固定的 AsyncLocal + 一个可变的 holder 对象**。书包里永远只有那一项，要变的是 holder 里的内容，不是 map 的键值——写再多也不分配新 map。

> **学生**：原来如此，那 AsyncLocal 是不是就该省着用？

> **老师**：省着用，但别怕用。它的定位是"随请求流动的低频环境数据"：TraceId、租户、事务、日志 scope。键要少而稳，值能装进一个可变容器就装容器。这两个原则记住，后面选型一节还要用。

---

## 第 7 节 实战与陷阱集中营

> **老师**：概念都齐了。现在进入实验环节，这节全是真实的坑，咱们一个一个踩过去。

### 7.1 正常流动：值能一路飘

> 先确认正常情况，AsyncLocal 设了值，跨过 await，子方法里能读到：

```csharp
static AsyncLocal<string?> s_trace = new();

static async Task Main()
{
    s_trace.Value = "req-001";
    Console.WriteLine($"入口: trace={s_trace.Value}");
    await DoWorkAsync();
    Console.WriteLine($"入口再看: trace={s_trace.Value}");

    static async Task DoWorkAsync()
    {
        await Task.Delay(50);
        Console.WriteLine($"子方法: trace={s_trace.Value}");
    }
}
```

```text
$ dotnet run
入口: trace=req-001
子方法: trace=req-001
入口再看: trace=req-001
```

> **学生**：一路都在，很正常。

> **老师**：好，正常会了，开始不正常。

### 7.2 坑一：子流写不回传

```csharp
static AsyncLocal<int> s_num = new();

static async Task Main()
{
    s_num.Value = 1;
    await Task.Run(() =>
    {
        s_num.Value = 2;   // 在子流自己的上下文链上改
        Console.WriteLine($"子任务里: {s_num.Value}");
    });
    Console.WriteLine($"父流里:   {s_num.Value}");
}
```

```text
$ dotnet run
子任务里: 2
父流里:   1
```

> **学生**：咦？子任务明明改成 2 了，外面怎么还是 1？

> **老师**：写时复制的必然结果。`Task.Run` 排队那一刻捕获了快照；子任务在快照的基础上写 2，造的是**子流自己的新 map**；父流身上挂的还是原来那个旧 map，从头到尾没被碰过。AsyncLocal 是单向随控制流**下行**的，不是全局变量。想在任务里收集结果回传？老老实实用返回值或者并发容器。

> **学生**：明白了，"下行单行道"。

### 7.3 坑二：捕获时机，排队那一刻就定终身

> **老师**：既然捕获发生在排队那一刻，那下面这段代码会打印什么？

```csharp
static AsyncLocal<string?> s_msg = new();

static async Task Main()
{
    var task = Task.Run(() => Console.WriteLine($"  子任务读到的: {s_msg.Value ?? "<null>"}"));
    s_msg.Value = "set-after-queue";     // 排完队才赋值，晚了
    await task;
}
```

```text
$ dotnet run
  子任务读到的: <null>
```

> **学生**：null！赋值发生在排队之后，子任务带的还是赋值前的空快照。

> **老师**：对。日常对应的翻车场景是：中间件里在 `await next()` **之后**才写 AsyncLocal——而日志写盘、后台任务早就分叉出去了，什么都收不到。规矩：**要在分叉之前把上下文摆好**。

### 7.4 坑三：线程池脏值，最阴的一击

> **老师**：这个坑是 ThreadLocal 的招牌。先讲原理：线程池的工作线程是**复用**的，干完一个工作项接着干下一个。`[ThreadStatic]` 的世界运行时根本不知道它的存在，没人帮你清场。上一个工作项写的值，就那样留在物理线程上，等着下一个无关的工作项来"继承"。
>
> 咱们模拟 50 个工作项，每个先判断"我是不是设过值"，没设过才写：

```csharp
static ThreadLocal<string?>? s_user;

static void Main()
{
    s_user = new ThreadLocal<string?>();
    var seenStale = new List<string>();
    var gate = new ManualResetEventSlim(false);
    int done = 0;

    for (int i = 0; i < 50; i++)
    {
        int n = i;   // 闭包捕获拷贝，避免读到循环结束后的 i
        ThreadPool.QueueUserWorkItem(_ =>
        {
            if (s_user.Value is null)
            {
                s_user.Value = $"user-set-by-job-{n}";
            }
            else
            {
                lock (seenStale) seenStale.Add($"job-{n} 看到了脏值: {s_user.Value}");
            }
            if (Interlocked.Increment(ref done) == 50) gate.Set();
        });
    }
    gate.Wait();
    Console.WriteLine($"50 个工作项里，读到别人残留值的有 {seenStale.Count} 个：");
    foreach (var line in seenStale.Take(3)) Console.WriteLine("  " + line);
    s_user.Dispose();
}
```

```text
$ dotnet run
50 个工作项里，读到别人残留值的有 44 个：
  job-6 看到了脏值: user-set-by-job-5
  job-9 看到了脏值: user-set-by-job-3
  job-10 看到了脏值: user-set-by-job-1
```

> **学生**：44 个读到了别人的值！job-10 干活的时候看到的是 job-1 设的"user-set-by-job-1"——它俩八竿子打不着啊。
>
> 对了老师，我插一句，你第一版代码里是不是有 bug？我记得刚才输出全是"job-50"，50 个工作项哪来的 job-50？

> **老师**：好眼力，这段插曲值得讲。第一版我直接在 lambda 里用了循环变量 `i`，而 `for` 循环的 `i` 是**一个**变量，所有 lambda 捕获的都是它同一个——等 lambda 真正执行时循环早跑完了，`i` 全是 50。要拷贝一份 `int n = i` 到循环体里才安全。闭包捕获的是变量本身，不是值，这个坑跟 ThreadLocal 无关，但同样经典。

> **学生**：学到了。那这个脏值问题在生产里严重吗？

> **老师**：严重到可以上事故报告。想象你把"当前用户 ID"放进了 ThreadLocal，一个请求把用户 A 写进去，处理完没清；下一个无关请求恰好复用这个线程，一读——读出了用户 A 的身份。**跨请求数据泄漏**。
>
> 而 AsyncLocal 完全没有这个问题，为什么？还记得吗，线程池派发循环里每个工作项执行完，运行时会**无条件把 ExecutionContext 重置回空**。书包装不装、装什么，都是随控制流显式带过来的，工作项结束就清空。一个是没人管的后患，一个是制度化的清场。
>
> 顺带吐槽：ThreadLocal 连个 `ClearValue` API 都没有，你想手动清场都别扭，只能 `tl.Value = default`。

### 7.5 坑四：ConfigureAwait(false) 切不断上下文

> **学生**：老师，我听过一个说法："await 后面加 `ConfigureAwait(false)` 就不继承上下文了"，是不是真的？

> **老师**：把两个"上下文"搞混了。`ConfigureAwait(false)` 影响的是 **SynchronizationContext / TaskScheduler** 要不要回到原调度器——跟 **ExecutionContext** 一毛钱关系没有。AsyncLocal 的值照样流动。不信你回去把第 4 节实验里 `await Task.Delay(200)` 改成 `await Task.Delay(200).ConfigureAwait(false)`，`al` 照样是"请求A的TraceId"。
>
> 真想切断流动只有一个办法：`ExecutionContext.SuppressFlow()`。抑制期间捕获直接返回空，快照里什么都没有。

### 7.6 坑五：变更通知的"同一把刀，两个刀鞘"

> **老师**：AsyncLocal 构造时可以传一个回调，值变化时通知你。但触发路径有**两条**，语义不一样：

```csharp
static AsyncLocal<string?> s_ctx = new(args =>
    Console.WriteLine($"  通知: [{args.PreviousValue ?? "null"}] -> [{args.CurrentValue ?? "null"}] ThreadContextChanged={args.ThreadContextChanged}"));

static async Task Main()
{
    Console.WriteLine("(1) 同线程赋值：");
    s_ctx.Value = "a";
    s_ctx.Value = "b";
    Console.WriteLine("(2) await 后上下文恢复：");
    await Task.Yield();
    Console.WriteLine("(3) 结束");
}
```

```text
$ dotnet run
(1) 同线程赋值：
  通知: [null] -> [a] ThreadContextChanged=False
  通知: [a] -> [b] ThreadContextChanged=False
(2) await 后上下文恢复：
  通知: [b] -> [null] ThreadContextChanged=True
(3) 结束
```

> **学生**：前两条是我在同线程赋值，`ThreadContextChanged=False`。第三条 `[b] -> [null]` 是怎么回事？我没写过 null 啊！

> **老师**：那条是运行时发的。`Task.Yield` 的延续作为线程池工作项执行，**执行完**运行时强制重置上下文——从 `[b]` 重置到空，这个变化触发了通知，`ThreadContextChanged=True`。
>
> 所以两条路径是：
>
> - **路径一**：你自己 `al.Value = x`，同线程、同步、`contextChanged=false`；
> - **路径二**：上下文恢复或重置的时刻（await 延续换线程、线程池清场），运行时对比新旧书包里所有登记过的键，值有变的逐个回调，`contextChanged=true`。
>
> 注意第二个细节：第三条通知发生在**执行恢复动作的那个线程**上，可能跟你赋值的线程完全不同。`IHttpContextAccessor` 就是靠这条路径，在回调里同步维护一个 thread-static 镜像，让同步代码也能便宜地拿到 HttpContext。

> **学生**：那这个回调里能不能写点业务逻辑？

> **老师**：**不能。**这是今天最重的一条警告，我直接给你演示翻车：

```csharp
static AsyncLocal<string?> s_boom = new(_ => throw new Exception("boom"));

static void Main()
{
    try
    {
        s_boom.Value = "x";      // 路径一：同线程赋值
    }
    catch (Exception e)
    {
        Console.WriteLine($"同线程赋值：异常被 catch 住了：{e.Message}");
    }

    Console.WriteLine("排队一个工作项（它结束后上下文被重置，将触发通知）...");
    ThreadPool.QueueUserWorkItem(_ =>
    {
        Console.WriteLine("  工作项执行完，准备退场");
    });
    Thread.Sleep(1000);
    Console.WriteLine("如果看到这行说明没崩");
}
```

```text
$ dotnet run
同线程赋值：异常被 catch 住了：boom
排队一个工作项（它结束后上下文被重置，将触发通知）...
Process terminated.
An exception was not handled in an AsyncLocal<T> notification callback.
   at System.Environment.FailFast(...)
   at System.Threading.ExecutionContext.OnValuesChanged(...)
   at System.Threading.ExecutionContext.RunForThreadPoolUnsafe(...)
   at System.Threading.QueueUserWorkItemCallback.Execute()
   at System.Threading.ThreadPoolWorkQueue.Dispatch()
   at System.Threading.PortableThreadPool+WorkerThread.WorkerThreadStart()
   …（栈继续，直到线程入口）
```

> **学生**：！！进程直接死了？！catch 呢？

> **老师**：没有 catch。同线程赋值路径抛的异常还能被你 try 住；但路径二的回调运行在**运行时的上下文切换骨架里**——线程池派发循环内部——外面没有任何用户代码栈可以承接异常。源码里的处理方式简单粗暴：

```csharp
catch (Exception ex)
{
    Environment.FailFast(
        SR.ExecutionContext_ExceptionInAsyncLocalNotification,
        ex);
}
```

> `FailFast`，进程当场终止，evtlog 里留一条，连 `finally` 都不跑。所以通知回调里只准做轻量的状态镜像维护，别做 IO、别做断言、更别抛异常。这是生产事故的经典配方。

### 7.7 坑六：null 不是存储，是删除

> **学生**：等等，刚才 7.6 的输出我还想到一个问题——你说过写 null 有讲究？

> **老师**：对。对引用类型写 `al.Value = null`，默认情况下是把键**从 map 里摘掉**（map 还会逐级缩水，缩到空时线程身上直接退回空书包）。所以你没法用 null 表达"存在但为空"，读回 null 也分不清"从没设过"和"设了 null"。需要这个语义就包一层，比如 `AsyncLocal<Box?>`。
>
> 顺带还有个值类型的细节：赋值前的"值没变就短路"用的是 `object` 引用比较。`al.Value = 1` 连赋两次，装箱后是两个不同对象，短路失效，照样分配。真在意 GC，赋同一个引用。

### 7.8 坑七：值是引用，流动的是引用

> **老师**：最后一个坑，最隐蔽。AsyncLocal 流动拷贝的是**引用**，不是对象。你往 `AsyncLocal<List<int>>` 里放一个 List，整条控制流上所有代码拿到的都是**同一个 List 对象**——一处 `Add`，处处可见。用得好是零拷贝的快；用不好，就是隐蔽的可变共享事故。拿到手之后要改，请先想清楚这对象是不是只有你在用。

---

## 第 8 节 选型与总结

> **学生**：老师，一节课下来坑真多。最后给个"一句话判断"吧，我什么场景用哪个？

> **老师**：就问自己一个问题：**这个值属于"一次逻辑操作"，还是属于"物理线程本身"？**
>
> 值属于一次请求、一个事务、一次业务操作——TraceId、租户、语言环境、事务、日志 scope——**用 AsyncLocal**。因为 await 漂移是常态，只有跟着控制流走的数据才能活下来。
>
> 值属于物理线程本身——每线程一个 StringBuilder、一块复用缓冲区、一个 RNG 实例——这类"硬件性"资源**用 ThreadLocal 或 `[ThreadStatic]`**。但要守三条纪律：进线程池回调先判断"是不是我的"再用；用完置回默认；长生命周期实例记得 Dispose。
>
> 给你一张速查表收尾：

| 维度 | `ThreadLocal<T>` | `AsyncLocal<T>` |
|---|---|---|
| 值跟着谁 | 物理线程 | 逻辑控制流 |
| await 之后 | ❌ 换线程就丢 | ✅ 稳定流动 |
| 存在哪 | 每线程的 `[ThreadStatic]` 槽位表 | 线程身上的 ExecutionContext 不可变 map |
| 读 | 极快，无锁 | 快，≤4 键引用比对 |
| 写 | 一次字段写 | 新 map + 新 EC 分配（值没变则短路） |
| 线程池复用 | ⚠️ 脏值残留，无人清场 | ✅ 派发完强制重置 |
| 枚举所有值 | ✅ `Values`（构造时开启） | ❌ 无任何手段 |
| 典型用途 | 每线程缓存/缓冲区 | 请求上下文/trace/事务/`IHttpContextAccessor` |

> **学生**：懂了。最后一个问题——今天这些源码细节会不会过几年就变了？

> **老师**：会变细节，不变模型。`ThreadLocal` 的槽位表和反码 id 这类实现随时可能重写；但"**物理线程 vs 逻辑控制流**"这两个模型是整个 .NET 异步体系的地基，只会越来越稳固。源码我建议照着这个版本读：dotnet/runtime main 分支的 `ThreadLocal.cs`、`AsyncLocal.cs`、`ExecutionContext.cs` 三个文件。
>
> 90% 的"灵异问题"——脏值、值丢失、初始化多次、TraceId 为空、进程莫名崩溃——在你写下第一行代码前，用这两个模型想一遍就能规避掉。
>
> 下课。下节课我们把 `ExecutionContext` 的不可变 map 掰开揉碎，一行行走读它的七个层级和那个手写哈希表——比今天这节更深。

## 参考源码

- [ThreadLocal.cs (dotnet/runtime)](https://github.com/dotnet/runtime/blob/main/src/libraries/System.Private.CoreLib/src/System/Threading/ThreadLocal.cs)
- [AsyncLocal.cs (dotnet/runtime)](https://github.com/dotnet/runtime/blob/main/src/libraries/System.Private.CoreLib/src/System/Threading/AsyncLocal.cs)
- [ExecutionContext.cs (dotnet/runtime)](https://github.com/dotnet/runtime/blob/main/src/libraries/System.Private.CoreLib/src/System/Threading/ExecutionContext.cs)
- [HttpContextAccessor.cs (dotnet/aspnetcore)](https://github.com/dotnet/aspnetcore/blob/main/src/Http/Http/src/HttpContextAccessor.cs)（AsyncLocal + 可变 holder + 通知镜像的标准范例）

---

➡️ **下一篇预告**：《ExecutionContext 源码课：不可变 map 的七个层级与手写哈希表》——顺着今天第 6 节没展开的部分，把 `AsyncLocalValueMap` 一行行走读到底。
