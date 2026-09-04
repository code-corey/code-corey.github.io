---
title: "深入 .NET 线程局部存储：ThreadLocal 与 AsyncLocal 的原理、源码与陷阱"
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
description: "从 dotnet/runtime 源码级剖析 ThreadLocal 与 AsyncLocal 的实现差异：[ThreadStatic] 槽位表、ExecutionContext 不可变 map、写时复制、变更通知与 FailFast，以及线程池脏值、GC 压力等一众陷阱。"
---

# 深入 .NET 线程局部存储：ThreadLocal 与 AsyncLocal 的原理、源码与陷阱

> 本文基于 [dotnet/runtime](https://github.com/dotnet/runtime) main 分支源码撰写（`System.Private.CoreLib`，2025 年时间线）。
> 涉及三个文件：
> - [`ThreadLocal.cs`](https://github.com/dotnet/runtime/blob/main/src/libraries/System.Private.CoreLib/src/System/Threading/ThreadLocal.cs)
> - [`AsyncLocal.cs`](https://github.com/dotnet/runtime/blob/main/src/libraries/System.Private.CoreLib/src/System/Threading/AsyncLocal.cs)
> - [`ExecutionContext.cs`](https://github.com/dotnet/runtime/blob/main/src/libraries/System.Private.CoreLib/src/System/Threading/ExecutionContext.cs)
>
> 实现细节在 .NET Framework / 早期 .NET Core 上略有不同，文中会顺带提及演进历史。

---

## 0. 先说结论

一句话概括两者的本质区别：

> **`ThreadLocal<T>` 的值跟着"物理线程"走，`AsyncLocal<T>` 的值跟着"逻辑控制流"走。**

| 维度 | `ThreadLocal<T>` | `AsyncLocal<T>` |
|---|---|---|
| 数据存在哪 | 每线程一张 `[ThreadStatic]` 槽位表（按 `T` 分组） | 当前线程的 `ExecutionContext` 里的不可变 map |
| 数据跟谁 | 物理线程（线程不死，值一直在） | 逻辑异步控制流（capture/restore 随 await 漂移） |
| `await` 之后还在吗 | ❌ 通常丢（换了物理线程就换了值） | ✅ 在（上下文随控制流恢复） |
| 写入成本 | 极低（快速路径一次字段写） | 较高（每次改变值都分配新 map + 新 EC） |
| 读取成本 | 极低（几次判空 + 一次字段读） | 低（≤4 个键直接比对，≤16 线性扫描，更多走哈希） |
| 线程池复用 | ⚠️ 脏值残留（上一个工作项的值还在） | ✅ 无残留（dispatch 完强制重置上下文） |
| 聚合所有值 | ✅ `Values`（需构造时开启） | ❌ 无任何枚举手段 |
| 清理方式 | `Dispose()` / 线程退出时 Finalizer 兜底 | 随控制流结束自动"消失"（GC 回收旧上下文） |
| 典型用途 | 每线程缓存/缓冲区/可重用对象 | 请求上下文、trace、事务、`IHttpContextAccessor` |

下面从底层机制讲到源码，最后集中列坑。

---

## 1. 第一性原理：两种"局部"到底局部在哪

### 1.1 `[ThreadStatic]`：一切的地基

`ThreadLocal<T>` 的地基是 `[ThreadStatic]` 静态字段。运行时为每个线程维护一份独立的静态字段存储，互不可见：

```csharp
[ThreadStatic]
private static StringBuilder? _sb;

// 每个线程第一次访问时各自初始化
static StringBuilder SB => _sb ??= new StringBuilder();
```

两个经典坑直接催生了 `ThreadLocal<T>`：

1. **字段初始化器只对第一个线程生效**。`[ThreadStatic] static int x = 42;` 在后续线程上读到的不是 42，而是 `default`——静态构造器只跑一次。所以每个访问点都必须判空，样板代码满天飞。
2. **没有实例语义**。`[ThreadStatic]` 只能挂在静态字段上，无法为不同对象各存一份，也无法提供 factory、枚举、释放等能力。

`ThreadLocal<T>` 的注释开门见山：

> *A class that provides a simple, lightweight implementation of thread-local lazy-initialization ... this provides an alternative to using a ThreadStatic static variable and having to check the variable prior to every access to see if it's been initialized.*

### 1.2 `ExecutionContext`：随控制流漂移的"环境数据"

异步世界里没有稳定的"当前线程"——一个逻辑操作在 `await` 前后可能运行在不同物理线程上。于是 .NET 引入了 `ExecutionContext`（执行上下文）：**一束随逻辑控制流漂移的环境数据（AsyncLocal 值、变更通知、流抑制标志）**。

它的流动规则：

- **捕获（Capture）**：在控制流分叉点（`Task.Run` 排队、注册 await 继续、`new Thread(...).Start()`、`Timer` 构造……）对当前上下文做一次快照；
- **恢复（Restore/Run）**：快照在未来某个执行点（可能在另一个线程上）被恢复到线程字段 `Thread.CurrentThread._executionContext` 上；
- 执行完毕后，运行时再把线程**重置回默认上下文**。

`AsyncLocal<T>` 就是寄居在这套机制之上的：它的"值"实际上是**当前线程 `ExecutionContext` 里 map 中以该 `AsyncLocal` 对象为键的那一项**。

记住这个模型，后面的源码全都顺理成章。

---

## 2. `ThreadLocal<T>` 源码解剖

### 2.1 数据结构总览

先看全貌。`ThreadLocal<T>` 有三类状态：

```csharp
public class ThreadLocal<T> : IDisposable
{
    // 每线程、每 T 一份：该线程上所有 ThreadLocal<T> 实例的槽位表
    [ThreadStatic]
    private static LinkedSlotVolatile[]? ts_slotArray;

    // 线程退出后负责解链清理的助手（见 2.6）
    [ThreadStatic]
    private static FinalizationHelper? ts_finalizationHelper;

    // 本实例的全局唯一 ID 的"按位反码"（~id），用于区分 id=0 与未初始化/已释放
    private int _idComplement;

    private Func<T>? _valueFactory;
    private volatile bool _initialized;
    private bool _trackAllValues;

    // 本实例持有的双向链表（哑头结点），串联"所有线程上属于本实例的值"
    private LinkedSlot? _linkedSlot = new LinkedSlot(null);

    // 全局 ID 管理器与全局锁
    private static readonly IdManager s_idManager = new IdManager();
    private static readonly Lock s_idManagerLock = new Lock();
}
```

三张图看清它们的关系：

```
ThreadLocal<T> 实例 (id=3)
│
│  _linkedSlot (哑头)
│      │  _next/_previous 双向链表：串联所有线程上属于本实例的结点
│      ▼
│   哑头 ⇄ LinkedSlot(线程B) ⇄ LinkedSlot(线程A) ⇄ ...
│              │ _value="B的值"        │ _value="A的值"
│              │ _slotArray ──────┐    │ _slotArray ──┐
│              ▼                 │    ▼              │
│                            线程 B 的 ts_slotArray │ 线程 A 的 ts_slotArray
│                            [0][1][2][3]...      [0][1][2][3]...
│                                              ↑ id=3 槽位回指 LinkedSlot
```

- **线程侧**：每个线程对每个封闭泛型类型 `ThreadLocal<T>` 只有一张 `ts_slotArray`，槽位下标 = 实例 ID。`LinkedSlotVolatile` 是只含一个 `volatile LinkedSlot? Value` 的包装结构，让数组访问带 volatile 语义。
- **实例侧**：`_linkedSlot` 哑头带出一个**双向链表**，串起所有（线程 × 本实例）的值——`Values` 属性和 `Dispose` 靠它横跨线程。
- **回指**：每个 `LinkedSlot` 记着 `_slotArray`（所属线程的表），`Dispose` 靠它精准清空各线程的槽位。

注意 `ts_slotArray` 是 `ThreadLocal<T>` 的静态字段——**按封闭类型分组**：`ThreadLocal<string>` 和 `ThreadLocal<object>` 各有一套互不相干的表与链表。

### 2.2 `_idComplement`：一个精巧的哨兵技巧

```csharp
// Slot ID of this ThreadLocal<> instance. We store a bitwise complement of the ID (that is ~ID),
// which allows us to distinguish between the case when ID is 0 and an incompletely initialized object...
private int _idComplement;
```

构造时：`_idComplement = ~s_idManager.GetId(trackAllValues)`； Dispose 时：`_idComplement = 0`。

于是读取时 `int id = ~_idComplement`：

- 正常实例：`id >= 0`（id=0 的实例得 0，**不与任何异常态混淆**）；
- 已 Dispose 或构造中途异常：`id == -1`。

一个字段同时解决了三个判定：是否已释放、构造器是否抛过异常、以及多线程下与 `Dispose` 竞争时的安全检查。到处可见的 `ObjectDisposedException.ThrowIf(id < 0, this)` 就是这么来的。

ID 由全局 `IdManager` 分配：`_nextIdToTry` 单调递增，`Dispose` 后的 ID 进入 `_freeIds` 列表**复用**（复用时的竞态由 `s_idManagerLock` + 写槽位前再查 `_initialized` 双重防护，源码注释对此有详细说明）。

### 2.3 `Value` 读取：五连判的快速路径

```csharp
public T Value
{
    get
    {
        LinkedSlotVolatile[]? slotArray = ts_slotArray;
        LinkedSlot? slot;
        int id = ~_idComplement;

        if (slotArray != null          // 1. 本线程建过槽位表吗？
            && id >= 0                 // 2. 实例没被 Dispose 吧？
            && id < slotArray.Length   // 3. 表装得下这个 ID 吗？
            && (slot = slotArray[id].Value) != null  // 4. 本线程给这个实例建过槽吗？
            && _initialized            // 5. 拿到槽之后再确认一次没被 Dispose（防竞争）
            )
        {
            return slot._value;
        }
        return GetValueSlow();
    }
    ...
}
```

快速路径**无锁、无分配**：读 `[ThreadStatic]` 表 + 边界检查 + 一次 volatile 字段读。第 5 步与注释里的内存序说明很值得品：volatile 读 `slotArray[id]` 保证 `_initialized` 的检查不会乱序到槽位读取之前——保证绝世不可能把值读到"另一个复用了同 ID 的实例"的槽里。

第 3 步解释了表的扩张策略：表按需增长，大小为 `BitOperations.RoundUpToPowerOf2(min)`（首个实例用时表长仅 1）。**你创建的第 N 个 `ThreadLocal<T>` 实例决定了每个线程至少需要 ⌈N⌉ 向上取 2 的幂个槽**——同类型实例越多，每线程表越大（这也是一种隐性内存开销）。

### 2.4 慢路径与工厂语义

`GetValueSlow` 承担首次初始化：

```csharp
private T? GetValueSlow()
{
    int id = ~_idComplement;
    ObjectDisposedException.ThrowIf(id < 0, this);

    Debugger.NotifyOfCrossThreadDependency();   // 告诉调试器：这里有跨线程依赖，别傻等

    T value;
    if (_valueFactory == null)
    {
        value = default!;
    }
    else
    {
        value = _valueFactory();

        if (IsValueCreated)   // 工厂执行期间值已被创建 => 递归调用，抛异常
        {
            throw new InvalidOperationException(SR.ThreadLocal_Value_RecursiveCallsToValue);
        }
    }
    Value = value;   // 写回（会走 SetValueSlow 建槽）
    return value;
}
```

三个重要语义从这里读出来：

1. **懒初始化**：没被访问的线程永远不会执行 factory。
2. **工厂异常不缓存**：`_valueFactory()` 抛异常时直接向上传播，槽位**没有建立**——下次访问会**重新执行 factory**。这与 `Lazy<T>` 默认模式（异常被缓存）完全不同。
3. **递归防护**：factory 里再访问 `Value` 会触发 `InvalidOperationException`（内层递归先把槽建好了，外层返回时 `IsValueCreated` 已为 true），而不是无限循环或栈溢出。

建槽在 `SetValueSlow` 中完成：建表/扩容（扩容需在全局锁下把旧表中各结点的 `_slotArray` 回指修正到新表）、首次使用某槽时 `CreateLinkedSlot` 把新结点**头插**进实例的双向链表（同样在全局锁下，防 `Dispose` 竞争）。

> 性能小结：快速路径就是"一次 TLS 读 + 一次下标访问 + 一次字段读"；真正的锁与分配只发生在每个（线程 × 实例）的第一次访问、以及表扩容时。

### 2.5 `Values`：横跨线程的枚举

```csharp
private List<T>? GetValuesAsList()
{
    ...
    var valueList = new List<T>();
    for (linkedSlot = linkedSlot._next; linkedSlot != null; linkedSlot = linkedSlot._next)
    {
        valueList.Add(linkedSlot._value!);
    }
    return valueList;
}
```

实例侧双向链表的用武之地：一条链走遍所有线程的值。注意两点：

- 必须**构造时**传 `trackAllValues: true`，之后 `Values` 才可用（否则 `InvalidOperationException`），没有事后开关；
- 返回的是快照副本（`List`），且新结点头插，**顺序不代表线程顺序**。

这是 `ThreadLocal` 相对 `AsyncLocal` 的一个独家能力：`AsyncLocal` 从任何公开 API 都无法枚举"当前上下文里到底有哪些值"。

### 2.6 清理：`Dispose` 与线程退出的兜底

`Dispose` 的实现正是双向链表 + `_slotArray` 回指的闭环：

```csharp
protected virtual void Dispose(bool disposing)
{
    lock (s_idManagerLock)
    {
        int id = ~_idComplement;
        _idComplement = 0;              // 之后再访问：id == -1 → ObjectDisposedException
        ...
        for (LinkedSlot? linkedSlot = _linkedSlot._next; linkedSlot != null; linkedSlot = linkedSlot._next)
        {
            LinkedSlotVolatile[]? slotArray = linkedSlot._slotArray;
            if (slotArray == null) continue;   // 该线程已退出，表已随 FinalizationHelper 释放
            linkedSlot._slotArray = null;
            // 同时清掉线程表里的槽位与值，两者都可被 GC
            slotArray[id].Value!._value = default;
            slotArray[id].Value = null;
        }
    }
    _linkedSlot = null;
    s_idManager.ReturnId(id, _trackAllValues);   // ID 归还池子供复用
}
```

如果忘了 `Dispose`？实例的 finalizer（`~ThreadLocal() => Dispose(false)`）会在 GC 时兜底归还 ID 并解链——**前提是实例本身已不可达**。若实例被静态字段等长期持有又从不 Dispose，那么**每个碰过它的存活线程都会一直钉住自己的值**。

那线程退出呢？靠 `ts_finalizationHelper`：线程建表时会顺手把表包进一个 `[ThreadStatic]` 的 `FinalizationHelper`。线程死亡后其静态字段不可达，helper 在下一次 GC 的终结队列里运行 finalizer，把表中各槽位对应的 `LinkedSlot` 从实例链表上**摘除**（对未开启 `trackAllValues` 的实例）或仅断开回指（对开启了的实例），从而释放表与值。一个相当优雅的"死后清理"设计。

---

## 3. `AsyncLocal<T>` 源码解剖：站在 ExecutionContext 的肩膀上

### 3.1 `AsyncLocal<T>` 本体薄得出奇

```csharp
public sealed class AsyncLocal<T> : IAsyncLocal
{
    private readonly Action<AsyncLocalValueChangedArgs<T>>? _valueChangedHandler;

    public T Value
    {
        get
        {
            object? value = ExecutionContext.GetLocalValue(this);
            if (typeof(T).IsValueType && value is null)
            {
                return default;
            }
            return (T)value!;
        }
        set
        {
            ExecutionContext.SetLocalValue(this, value, _valueChangedHandler is not null);
        }
    }

    void IAsyncLocal.OnValueChanged(object? previousValueObj, object? currentValueObj, bool contextChanged)
    {
        ...
        _valueChangedHandler(new AsyncLocalValueChangedArgs<T>(previousValue, currentValue, contextChanged));
    }
}
```

**它自己不存任何值**。`AsyncLocal` 实例仅仅是一个"键"（实现 `IAsyncLocal` 供非泛型的 `ExecutionContext` 回调），值一律存在当前线程的 `ExecutionContext` 里。整个类型的全部智能，都在 `ExecutionContext` 侧。

### 3.2 `ExecutionContext`：三个字段撑起一片天

```csharp
public sealed partial class ExecutionContext : IDisposable, ISerializable
{
    internal static readonly ExecutionContext Default = new ExecutionContext();
    internal static readonly ExecutionContext DefaultFlowSuppressed =
        new ExecutionContext(AsyncLocalValueMap.Empty, new IAsyncLocal[0], isFlowSuppressed: true);

    private readonly IAsyncLocalValueMap? m_localValues;              // 值：不可变 map
    private readonly IAsyncLocal[]? m_localChangeNotifications;       // 注册了变更通知的键
    private readonly bool m_isFlowSuppressed;                         // SuppressFlow 标志
    private readonly bool m_isDefault;
}
```

读值就一行（`GetLocalValue`）：

```csharp
internal static object? GetLocalValue(IAsyncLocal local)
{
    ExecutionContext? current = Thread.CurrentThread._executionContext;
    if (current == null) return null;
    current.m_localValues.TryGetValue(local, out object? value);
    return value;
}
```

真正的重头戏是**写入**与**流动**。先看流动：运行时在控制流分叉点捕获上下文（`Capture()`，注意 `m_isFlowSuppressed` 时返回 null——**流被抑制就什么都不带**），在未来某点通过 `Run`/`Restore` 恢复：

```csharp
internal static void RestoreChangedContextToThread(Thread currentThread,
    ExecutionContext? contextToRestore, ExecutionContext? currentContext)
{
    // 直接原子替换线程字段
    currentThread._executionContext = contextToRestore;
    if ((currentContext != null && currentContext.HasChangeNotifications) ||
        (contextToRestore != null && contextToRestore.HasChangeNotifications))
    {
        // 有注册通知的 AsyncLocal，逐个对比新旧值并回调
        OnValuesChanged(currentContext, contextToRestore);
    }
}
```

`ExecutionContext.Run` 是所有 await 继续、线程池工作项执行都要经过的极热函数：换上下文 → 跑回调 → **把旧上下文原样换回来**（用 `ExceptionDispatchInfo` 保证异常抛出前先恢复上下文）。线程池的派发循环更干脆（`RunFromThreadPoolDispatchLoop` / `ResetThreadPoolThread`）：每个工作项执行完，**无条件把 EC 与 SynchronizationContext 重置回默认**，并触发相应通知。

> 这一段就是"线程池上 `AsyncLocal` 不脏、`ThreadLocal` 会脏"的源码级解释：前者每次派发都强制清场，后者对 `[ThreadStatic]` 世界一无所知。

### 3.3 不可变 map 的七个层级

值存储 `IAsyncLocalValueMap` 是一棵按元素数分层的继承树（定义在 `AsyncLocal.cs` 底部）：

| 元素数 | 实现 | 结构 |
|---|---|---|
| 0 | `EmptyAsyncLocalValueMap` | 全局单例 |
| 1~4 | `OneElement` / `TwoElement` / `ThreeElement` / `FourElement` | 固定字段，引用比对线性查找 |
| 5~16 | `MultiElementAsyncLocalValueMap`（`MaxMultiElements = 16`） | `KeyValuePair[]` 数组线性扫描 |
| >16 | `ManyElementAsyncLocalValueMap` | **手写不可变链式哈希**（`_keyValues` + `int[] _buckets` + `int[] _next`，哈希用 `RuntimeHelpers.GetHashCode(key) & (bucketCount - 1)`，桶数 `RoundUpToPowerOf2(len*1.5)`） |

核心约束是**不可变（persistent data structure）**：任何 `Set` 都不修改旧 map，而是返回新 map。这是整个异步流安全性的根基——

- 旧上下文（可能已被捕获、被别的线程读取）永远不会被篡改；
- 子流与父流可以各自分叉演化，互不干扰；
- 因此 `CreateCopy()` 敢直接 `return this`（注释：*since CoreCLR's ExecutionContext is immutable, we don't need to create copies*。对比 .NET Framework 时代的可变实现 + 真拷贝，这是 .NET Core 的一次重大重构）。

顺带一提，源码里还留着有趣的复制粘贴注释小 bug（`ThreeElement` 的删除分支注释写着 "downgrading to a one-element map"，实际代码是降到 `TwoElement`）——读原始源码的乐趣之一。

### 3.4 `SetLocalValue`：一次赋值的完整旅程

```csharp
internal static void SetLocalValue(IAsyncLocal local, object? newValue, bool needChangeNotifications)
{
    ExecutionContext? current = Thread.CurrentThread._executionContext;

    object? previousValue = null;
    bool hadPreviousValue = false;
    if (current != null)
    {
        hadPreviousValue = current.m_localValues.TryGetValue(local, out previousValue);
    }

    if (previousValue == newValue)
    {
        return;   // ★ 值没变：零分配直接返回（引用比较）
    }

    // ★ 写时复制：从旧 map 派生新 map（不碰旧的）
    IAsyncLocalValueMap newValues = current != null
        ? current.m_localValues.Set(local, newValue, treatNullValueAsNonexistent: !needChangeNotifications)
        : AsyncLocalValueMap.Create(local, newValue, treatNullValueAsNonexistent: !needChangeNotifications);

    // ★ 首次赋值时登记变更通知（克隆/扩展通知数组）
    if (needChangeNotifications) { ... }

    // ★ 替换线程字段；值清空且未抑制流时退回默认上下文（null）
    Thread.CurrentThread._executionContext =
        (!isFlowSuppressed && AsyncLocalValueMap.IsEmpty(newValues)) ? null
        : new ExecutionContext(newValues, newChangeNotifications, isFlowSuppressed);

    // ★ 同线程赋值：立即同步通知，contextChanged = false
    if (needChangeNotifications)
    {
        local.OnValueChanged(previousValue, newValue, contextChanged: false);
    }
}
```

一次"改值"的代价清单：至少 **1 个新 map**（`MultiElement` 是数组全拷贝；`ManyElement` 换已有键时聪明地共享 `_buckets/_next` 只克隆值数组，插入/删除则重建）+ **1 个新 ExecutionContext 对象**，外加一次线程字段的写入屏障。这就是"`AsyncLocal` 写贵"的精确来源——也是为什么 ASP.NET Core 内部用它传递 `HttpContext` 引用时，选的是"**一个固定 AsyncLocal + 一个可变 holder 对象**"的方案：上下文里永远只有那一项，改的是 holder 内容而不是 map。

`SetLocalValue` 还有两处魔鬼细节：

1. **`default(T)`（引用类型的 null）≈ 删除**。`treatNullValueAsNonexistent: true` 时写 null 会把键从 map 里摘掉（map 还会逐级降级：Two→One→Empty，Empty 时线程字段退回 null）。但**注册了变更通知的 AsyncLocal 例外**——源码注释解释得很清楚：此时必须显式存一个 null 占位，用来标记"这个键已经注册过通知"，否则无法区分"从未赋值"与"赋值为 null"。
2. `previousValue == newValue` 的短路是 `object?` 引用比较：对值类型 T，装箱后比较的是引用，`al.Value = 1` 连续赋两次装箱整数也可能各分配一次。要省，请确保赋的是同一个 boxed/引用值。

### 3.5 变更通知：两条触发路径与一颗核弹

`valueChangedHandler` 有两个触发点，语义不同：

```csharp
// 路径一：同线程 Set（见上）—— contextChanged: false
local.OnValueChanged(previousValue, newValue, contextChanged: false);

// 路径二：上下文恢复/重置 —— contextChanged: true
OnValuesChanged(currentContext, contextToRestore);
```

路径二发生在 `ExecutionContext.Run`、`Restore`、线程池派发后清理等**上下文切换点**：对两侧上下文里**所有注册过通知的键**做差集比对，值有变化的逐个回调。注意三点：

- 回调发生在**执行恢复动作的那个线程**上——可能是与赋值时完全不同的线程。`IHttpContextAccessor` 正是利用这一点：它的 `AsyncLocal` 持有一个可变 holder，切换发生时在回调里同步维护 thread-static 镜像，让同步代码也能便宜地拿到 `HttpContext`。
- 通知数组 `m_localChangeNotifications` 只在**第一次赋值**时把该键登记进去（包括赋 null 的占位场景），之后随上下文快照一起流动。
- **最狠的一条**，异常处理是这个：

```csharp
catch (Exception ex)
{
    Environment.FailFast(
        SR.ExecutionContext_ExceptionInAsyncLocalNotification,
        ex);
}
```

在**上下文恢复路径**里抛出的 handler 异常**不可捕获**，直接 `FailFast`，进程当场退出。因为此时回调正运行在运行时的上下文切换骨架里（线程池派发循环、await 基础设施内部），没有任何用户代码栈可以承接这个异常。在 handler 里写业务逻辑 / 让它抛异常，是生产事故的经典配方。

### 3.6 流动规则速查（结合源码）

- `await`：继续点捕获当前 EC，恢复时原样带回——**`ConfigureAwait(false)` 只影响 `SynchronizationContext`/`TaskScheduler` 的恢复，完全不阻断 ExecutionContext 流动**。想真切断只有 `ExecutionContext.SuppressFlow()`（`Capture()` 见到 `m_isFlowSuppressed` 直接返回 null）。
- `Task.Run(...)` / `ThreadPool.QueueUserWorkItem`：捕获发生在**排队那一刻**，之后你再改 AsyncLocal，子任务看到的是旧快照。
- `new Thread(...).Start()`、`Timer` 构造：同样在起点捕获。
- 线程池工作项结束：`ResetThreadPoolThread` 强制归零，不污染下一个工作项。

---

## 4. 一个程序看懂两者差异

```csharp
var tl = new ThreadLocal<string>(() => $"created@T{Environment.CurrentManagedThreadId}");
var al = new AsyncLocal<string>();

al.Value = "A";                      // 进入当前逻辑控制流
var _ = tl.Value;                    // 当前物理线程初始化

Console.WriteLine($"before: T{Environment.CurrentManagedThreadId} tl={tl.Value} al={al.Value}");

await Task.Delay(200);               // 恢复时大概率换了一个线程池线程

Console.WriteLine($"after : T{Environment.CurrentManagedThreadId} tl={tl.Value} al={al.Value}");
// 典型输出：
// before: T1  tl=created@T1  al=A
// after : T4  tl=created@T4  al=A      ← ThreadLocal 换线程"丢"了（factory 重跑），AsyncLocal 稳如老狗
```

`ThreadLocal` 的"丢"其实更危险：如果你的 factory 昂贵（比如创建非托管缓冲区、DbContext），**一个逻辑操作可能在不同物理线程上初始化出多份**，而且旧那份直到线程退出才释放。

---

## 5. 坑，都在这里

### 5.1 `ThreadLocal` 的坑

**坑 1：线程池脏值（最阴的一击）**

线程池线程跨工作项复用，而 `[ThreadStatic]` 状态没人帮你清。上一个请求写的值，会在无关的下一个请求里"诈尸"：

```csharp
var tl = new ThreadLocal<string?>();

for (int i = 0; i < 100; i++)
{
    ThreadPool.QueueUserWorkItem(_ =>
    {
        if (tl.Value is null) tl.Value = $"first-set-by-{i}";
        else Console.WriteLine($"#{i} sees stale: {tl.Value}");  // 会打印！
    });
}
```

用户身份、租户 ID、请求上下文这类数据一旦放 `ThreadLocal`，就是跨请求数据泄漏的温床。线程池回调里必须 `tl.Value = default` 显式清场（注意 `ThreadLocal` **没有** `ClearValue` 这类 API，这是它 API 面上反复被吐槽的一点）。

**坑 2：忘了 Dispose 的钉扎**

实例活着，链表就活着；链表活着，所有触碰过它的线程的值就被钉住。特别是 `static readonly ThreadLocal<T>` + 线程池这种"线程几乎不死"的组合。用完即弃的场景请 `Dispose`（它会把所有线程的槽位与值一并解开，ID 还能复用）。

**坑 3：factory 的异常语义与重入**

- 异常**不缓存**，每次访问都重试 factory——若 factory 有副作用（计数、开文件），会重复发生；
- factory 里访问同一个 `Value` 会得到 `InvalidOperationException`（源码里的 `ThreadLocal_Value_RecursiveCallsToValue`），不是栈溢出，但也足够莫名其妙。

**坑 4：异步代码里用 ThreadLocal 做"逻辑操作"状态**

await 换线程 → 值换了一份（或 factory 重跑）→ "为什么这个请求初始化了三次？"。只要代码里有 await，`ThreadLocal` 的语义就不再是"本次操作的"，而是"本物理线程的"。

**坑 5：`Values` 需要构造时开启，且快照里可能有已死线程的值**

`trackAllValues: false`（默认）时 `Values` 直接抛异常；开启后，线程退出时其值**仍留在 `Values` 快照里**（`FinalizationHelper` 对 tracking 实例只断开表回指、不摘链表结点——这是刻意的语义，但容易误读为"存活线程集合"）。

### 5.2 `AsyncLocal` 的坑

**坑 1：写即分配——高频写 = GC 灾难**

每次"改值"（引用比较后发现不同）都分配新 map + 新 EC。在循环里、每请求几十次地写 `AsyncLocal`，等于给 GC 上供。正确姿势：**上下文里放少量稳定的键；需要变化的聚合状态放一个可变容器对象进去，改容器不改 map**（`IHttpContextAccessor` 的 holder 就是教科书做法）。

**坑 2：子流写不回传**

```csharp
var al = new AsyncLocal<int>();
al.Value = 1;
await Task.Run(() => al.Value = 2);   // 子流自己的 map 链上改
Console.WriteLine(al.Value);           // 1 —— 父流的原上下文从未被碰过（COW 的必然结果）
```

`AsyncLocal` 是**单向随控制流下行**的，不是全局变量。想"在任务里收集结果回传"，请用返回值/并发容器，别指望 AsyncLocal。

**坑 3：捕获时机**

```csharp
var al = new AsyncLocal<string?>();
var task = Task.Run(() => Console.WriteLine(al.Value ?? "<null>"));
al.Value = "set-after-queue";          // 捕获发生在 Task.Run 排队时，晚了
await task;                            // 打印 <null>
```

同理：中间件里在 `await next()` 之后再写 AsyncLocal，不影响已经分叉出去的日志写盘、后台任务。

**坑 4：`ConfigureAwait(false)` 不阻断、`SuppressFlow` 才阻断**

```csharp
al.Value = "flows";
await Task.Yield().ConfigureAwait(false);
Console.WriteLine(al.Value);           // "flows" —— ConfigureAwait 与 EC 无关

using (ExecutionContext.SuppressFlow())
{
    await Task.Run(() => Console.WriteLine(al.Value ?? "<null>"));  // <null>，真断了
}
```

大量"我以为 ConfigureAwait(false) 会隔离上下文"的事故，都源于混淆了 `SynchronizationContext` 和 `ExecutionContext`。

**坑 5：handler 里抛异常 = 进程 FailFast（恢复路径不可捕获）**

```csharp
var al = new AsyncLocal<string?>(_ => throw new Exception("boom"));
```

赋值路径（`contextChanged:false`）的异常还能被调用方 try 住；一旦异常发生在上下文恢复/线程池清理路径（`OnValuesChanged` 内），源码里就是 `Environment.FailFast`——没有 catch 的机会。handler 里只做轻量、无抛出的状态镜像维护（这是 `IHttpContextAccessor` 的用法），别做 IO、别做断言。

**坑 6：null/`default(T)` 是删除，不是存储**

`al.Value = null` 会把键从 map 摘除（注册了通知的例外，见 3.4）。所以你无法用 null 值表达"存在但为空"的语义；读回 null 也无法区分"没设过"与"设了 null"。需要可空语义，用包装类型（如 `AsyncLocal<Box?>`）。

**坑 7：值是引用，流动的是引用**

AsyncLocal 流动拷贝的是引用。往 `AsyncLocal<List<int>>` 里放个 List，整条控制流共享同一个对象——一处 `Add`，处处可见。这既是零拷贝流动的性能来源，也是"隐蔽的可变共享"事故来源。

**坑 8：后台线程里读，可能什么都没有**

线程池会在工作项结束后重置上下文；fire-and-forget 任务、自定义线程、终结器线程上读 AsyncLocal 得到的是它们自己上下文里的值（多半是空）。"为什么日志里 TraceId 是空的？"——八成是值在错误的时机设置、或读的线程不在预期控制流里。

### 5.3 共同误区

- **把两者当"线程安全的字典"用**：它们都不是集合，无法枚举、无法按需遍历（ThreadLocal 的 `Values` 仅限实例自身，且要构造时开启）。
- **在库代码里无脑引入**：每多一个 AsyncLocal，进程内每个携带它的上下文快照都多一个键；每多一个 `ThreadLocal<T>` 实例，每线程的槽位表都可能扩容。框架代码对这类"每实例固定成本"是锱铢必较的。
- **忘了语义模型**：纠结"为什么值不对"之前，先问自己——我要的局部性是**物理线程**（ThreadLocal）还是**逻辑控制流**（AsyncLocal）？选错了模型，怎么调都是错。

---

## 6. 选型建议

**用 `AsyncLocal`，当值属于"一次逻辑操作/一个请求/一个事务"**：

- 链路追踪 ID、租户、语言环境、当前 `TransactionScope`（.NET Core 的 `Transaction.Current` 正是 AsyncLocal 流动的）、日志 scope（`ILogger.BeginScope`）、`Activity.Current`。
- 这类场景下 await 漂移是常态，只有 ExecutionContext 流动模型能活。

**用 `ThreadLocal` / `[ThreadStatic]`，当值属于"物理线程本身"**：

- 每线程的可重用缓冲区、StringBuilder、非托管内存块、RNG 实例等**与控制流无关的硬件性/性能性资源**。
- 使用守则：进线程池回调先判"是否是我的"再写、用完置默认、长生命周期实例记得 `Dispose`。
- 高频重缓存场景也可以考虑直接 `[ThreadStatic]` + 数组池（`ThreadLocal` 的对象头/链表/间接层并非零成本），但请接受它的一切样板代码。

**性能直觉表**：

| 操作 | ThreadLocal | AsyncLocal |
|---|---|---|
| 读 | ~1 次 TLS 读 + 数组寻址 | 1 次字段读 + map 查找（≤4 直接比对 / ≤16 线性 / >16 哈希） |
| 写（值变化） | 1 次字段写 | 新 map + 新 EC 分配 + 写屏障（值相同则零成本短路） |
| 首次接触 | 建表/建槽 + 全局锁（一次性） | 首个键时建 EC（一次性） |
| 隐性成本 | 每线程槽位表 ∝ 实例数；忘清理钉扎内存 | 上下文快照随键数变胖；通知数组随注册数变胖 |

---

## 7. 结语

把两个类型的源码摆在一起看，会发现 .NET 团队在同一块地基上砌了两栋完全不同的房子：

- `ThreadLocal<T>` 围绕 `[ThreadStatic]` 精雕细琢——哨兵反码 ID、volatile 槽位表、实例级双向链表、终结器兜底——把"每线程一份、懒初始化、可枚举、可释放"四件事做到了无锁快速路径；
- `AsyncLocal<T>` 则彻底放弃了自己的存储，把一切押注在**不可变的 ExecutionContext + 写时复制 map** 上，用每次写入多一点分配的代价，换来了"值随控制流漂移、快照永不串台"的异步世界正确性。

理解了这对模型——**物理线程 vs 逻辑控制流**——90% 的"灵异问题"（脏值、值丢失、初始化多次、TraceId 为空、进程莫名崩溃）都能在写下第一行代码前就规避掉。

## 参考源码

- [ThreadLocal.cs (dotnet/runtime)](https://github.com/dotnet/runtime/blob/main/src/libraries/System.Private.CoreLib/src/System/Threading/ThreadLocal.cs)
- [AsyncLocal.cs (dotnet/runtime)](https://github.com/dotnet/runtime/blob/main/src/libraries/System.Private.CoreLib/src/System/Threading/AsyncLocal.cs)
- [ExecutionContext.cs (dotnet/runtime)](https://github.com/dotnet/runtime/blob/main/src/libraries/System.Private.CoreLib/src/System/Threading/ExecutionContext.cs)
- [Microsoft.AspNetCore.Http 的 HttpContextAccessor](https://github.com/dotnet/aspnetcore/blob/main/src/Http/Http/src/HttpContextAccessor.cs)（AsyncLocal + 可变 holder + 通知镜像的标准范例）
