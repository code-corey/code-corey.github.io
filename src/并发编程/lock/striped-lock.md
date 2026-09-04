---
title: "分片锁：用 64 把锁守住无限条数据（师生对话实录）"
sidebarGroup: "锁与同步"
shortTitle: "08 分片锁"
order: 8
date: 2026-09-02
category: "并发编程"
tag:
  - "并发编程"
  - "锁"
  - "Guava"
  - "师生对话"
description: "师生对话逐字实录：从一次真实的『旧译文覆盖新译文』事故出发，讲透分片锁——synchronized(pkid) 为什么静默失效（JDK 编译器真的会告警）、哈希分片的数学、15 行手写实现与 Guava 33.4.8 的 Striped，全部实验 OpenJDK 25 本机实跑。"
---

> **锁与同步 · 第 8/8 篇**  
> 上一篇：[《CountDownLatch 与 CyclicBarrier》](/并发编程/lock/juc-15-latch-barrier)  
> 下一篇：[《并发容器 Map、List、Set 实战与原理》](/并发编程/collections/juc-16-concurrent-collections)

---

# 分片锁：用 64 把锁守住无限条数据 · 课堂实录

> **本篇说明**：这是一份师生对话的逐字实录。学生是零基础新生，老师用西蒙学习法把「分片锁」拆成大纲、用费曼技巧每次只讲一个概念、随堂做小实验。学生原话、老师原文、操作记录（建文件、跑代码）按时间顺序排列，不做事后整理。案例背景来自一次真实的多语言 CMS 改造。
>
> 实验环境：Windows + Git Bash，OpenJDK 25（build 25+36-3489，`java 文件名.java` 单文件直接运行，零依赖）；Guava 实验用 Maven Central 当前最新稳定版 33.4.8-jre（2026-09-02 查证）。实验目录在仓库外：`E:\tmp\striped-lab`，四个实验文件 `LongCacheDemo.java`、`PkidLockRace.java`、`StripedLab.java`、`StripedGuavaDemo.java`。所有控制台输出均为本机实跑，未做修饰，个别长输出注明「节选」。

---

## 【课堂实录 · 2026-09-02】

### 学生原话

> 我们需要学习的内容是 [分片锁（Striped Lock）]。你是一名全球最为顶尖的教学大师，而我是一名 0 基础的学生。请通过西蒙学习法一点点拆碎，形成你自己的教学大纲，再使用费曼技巧，给我讲解最为基本的知识块，而你每次只会给我讲解一个概念。如果我有问题，我就会提出来问你；如果没有问题，则继续讲解。在教学的过程中，要多造一些小实验进行讲解，从案例中获取知识。

### 老师开场白

同学，你好，请坐。

今天这节课我们学一个工程里「自己动手造锁」的经典模式：分片锁。它治的病——「要给无限多的东西加互斥锁」——你迟早会在真实项目里撞上。前 7 篇讲的锁都来自 JDK，这节课结束时，你会拥有自己造的第一把锁，以及决定「什么时候不自己造」的判断力。

开课前，先交代三件事。

第一，我的备课资料。装箱缓存的行为由 Java 语言规范 JLS §5.1.7 规定，从 Java 5 到现在没变过；JDK 16 起（JEP 390）编译器会主动警告「你在给值类型对象加锁」，本机 JDK 25 实测默认就会告警，稍后带你亲眼看；这个模式的现成轮子在 Guava 里，类名就叫 `Striped`，Maven Central 上当前最新稳定版是 33.4.8-jre，今天的 Guava 实验就用它真跑。

第二，我的教学方法。西蒙学习法把「分片锁」拆成四块小积木，由浅入深排成一条线，每节课只讲一个概念，讲完就做实验验证。你有问题随时举手；没问题，我们就推进。

第三，你的学习地图：

> ① 一场事故：旧译文为什么能盖掉新译文 → ② 翻车现场：synchronized (pkid) → ③ 64 把锁的完整实现：哈希数学 + 随堂实验 → ④ 生产上怎么用：Guava Striped

好，正式上课。

---

### 老师讲课 · 第 1 课：一场真实的「旧译文覆盖新译文」

**我们走到哪了**：第 1 站。今天只讲一个概念：为什么「同一条记录的写」必须串行。

案例是真的，来自我亲手改造的一个官网 CMS 多语言模块。内容要镜像成三种语言：主表 `content`、英文表 `content_en`、阿拉伯文表 `content_ar`，三表同主键。为了让保存接口不等大模型翻译，改造后的保存事务只发一个事件，事务提交后由异步线程池去完成「翻译 + 写镜像」。

上线前推演时我发现了竞态：运营快速连续保存同一篇内容两次，就有两个异步任务先后处理同一条记录——

```
任务1：读到主表第 5 号记录（标题 v1）→ 翻译中……
任务2：读到主表第 5 号记录（标题 v2）→ 翻译完成 → 写入 en/ar 表
任务1：翻译完成 → 写入 en/ar 表        ← 旧译文 v1 把新译文 v2 盖掉了
```

慢的那条反而后落库，旧数据把新的盖了。解法很直觉：同一条记录的镜像写必须串行。但「记录」是数据库里的行，理论上有无限多条——锁从哪来？这就是分片锁要回答的全部问题。

把直觉翻译成三条硬需求，先记在笔记本上：

| # | 需求 | 性质 |
|---|------|------|
| 1 | 同一条记录（表名 + 主键）必须互斥 | 正确性，一票否决 |
| 2 | 不同记录尽量并行 | 性能期望 |
| 3 | 锁对象内存可控、无需清理 | 工程约束 |

注意第 1 条和第 2 条的地位不平等：1 必须百分百成立，2 尽力而为。后面所有的设计取舍，都围着这句话转。

学生举手：「数据库自己有行锁啊，两条 UPDATE 同时改一行，MySQL 不会挡一下吗？」

问得好，这正是我首先要你分清的边界。数据库的行锁保证的是「单条语句原子」——两笔 UPDATE 排队执行，一行数据不会被改烂。但它管不了「读主表 → 等翻译 → 写镜像」这种横跨好几秒的业务流程的先后：两个任务各自读、各自翻、各自写，谁后提交谁覆盖。顺序这件事，必须由应用层自己管。

没问题的话，进入第 2 课——先看三个翻车的直觉方案。

---

### 老师讲课 · 第 2 课：翻车现场——synchronized (pkid)

**我们走到哪了**：第 2 站。今天只讲一个概念：synchronized 锁的是对象引用，不是值。

最直觉的写法是 `synchronized (pkid)`：主键唯一，锁住主键，同一条记录不就串行了？翻车翻得最隐蔽的正是它。

「pkid 是唯一的」说的是值的唯一；synchronized 锁的是对象引用（监视器），跟值毫无关系——两码事。Java 里 `Long` 是装箱类型，写 `Long x = 10507L` 时编译器自动装箱，而装箱有个缓存池优化。空口无凭，先做个实验。

#### 【操作记录 2-1】随堂实验：装箱缓存只认 -128 ~ 127

新建 `LongCacheDemo.java`：

```java
public class LongCacheDemo {
    public static void main(String[] args) {
        Long a = 5L, b = 5L;
        System.out.println("Long a = 5L, b = 5L;");
        System.out.println("a == b       -> " + (a == b));
        System.out.println("a.equals(b)  -> " + a.equals(b));
        System.out.println();
        Long x = 10507L, y = 10507L;
        System.out.println("Long x = 10507L, y = 10507L;");
        System.out.println("x == y       -> " + (x == y));
        System.out.println("x.equals(y)  -> " + x.equals(y));
        System.out.println();
        System.out.println("identityHashCode(x) -> " + System.identityHashCode(x));
        System.out.println("identityHashCode(y) -> " + System.identityHashCode(y));
    }
}
```

本机实跑：

```console
$ java LongCacheDemo.java
Long a = 5L, b = 5L;
a == b       -> true
a.equals(b)  -> true

Long x = 10507L, y = 10507L;
x == y       -> false
x.equals(y)  -> true

identityHashCode(x) -> 252651381
identityHashCode(y) -> 1514840818
```

三个事实：5 在缓存池里，两个 5 是同一个对象，`a == b` 为 true；10507 超出范围，各自装箱成两个对象，`x == y` 为 false，但 `x.equals(y)` 为 true——值相等，引用不同；最后一行 identityHashCode 一个 252651381、一个 1514840818，两个对象铁证如山。

这是 JLS §5.1.7 规定的确定性行为：装箱缓存只保证 -128 ~ 127。顺带一提，Integer 的缓存上界可以用 `-XX:AutoBoxCacheMax` 往大调，但 Long 的缓存是写死的——我们加了这个参数重跑，10507 依然拆成两个对象，别指望它。

致命之处在于：我们要防的恰恰是两次独立请求，每次请求的主键都是从各自的报文里装箱出来的新对象——你手里的 `pkid` 看着值一样，实则是两个不同的监视器。锁静默失效，等于没锁。

学生举手：「这么大的坑，编译器也不吭一声吗？」

反转来了——还真会吭声，就是声音太小容易被淹没。这个实验做的时候，编译输出跳出来四条警告，原样贴给你。

#### 【操作记录 2-2】随堂实验：synchronized (pkid) 的真实竞态

新建 `PkidLockRace.java`，核心是第一组：模拟两次独立保存请求，各自装箱出主键（值相同、对象不同），两个线程先后进入各自的 `synchronized` 块：

```java
Long pk1 = Long.valueOf(10507L);   // 第 1 次保存请求带来的主键
Long pk2 = Long.valueOf(10507L);   // 第 2 次保存请求带来的主键

Thread t1 = new Thread(() -> {
    synchronized (pk1) {
        // 进入后先干活 300ms 再退出
    }
});
Thread t2 = new Thread(() -> {
    Thread.sleep(100);             // 确保 t1 已经先进去
    synchronized (pk2) {
        // 此刻 t1 还在里面吗？
    }
});
```

先编译，警告真的来了（节选，共 4 条同类警告）：

```console
$ javac -Xlint:all PkidLockRace.java
PkidLockRace.java:21: warning: [identity] attempt to synchronize on an instance of a value-based class
            synchronized (pk1) {
            ^
PkidLockRace.java:29: warning: [identity] attempt to synchronize on an instance of a value-based class
            synchronized (pk2) {
            ^
（第三组实验的两行也有同类警告，略）
4 warnings
```

「尝试在一个值类型类的实例上加锁」——这是 JDK 16 起 JEP 390 加的警告，本机 JDK 25 不加任何参数也会给（我们第一次直接 `java PkidLockRace.java` 跑的时候就跳了这四条）。但说真的，要不是盯着编译日志，谁看得见呢。

再运行，看三组对照的真实输出：

```console
$ java PkidLockRace
======== 第一组：两次独立请求，各自装箱出主键 ========
pk1.equals(pk2) -> true   （值相同）
pk1 == pk2      -> false  （对象不同）
[  10 ms] t1 进入临界区，开始翻译...
[ 111 ms] t2 进入临界区（此刻 t1 还在里面！）
[ 344 ms] t1 写完镜像，退出临界区
>> t2 在 t1 还没出来时就进去了：锁静默失效

======== 第二组：对照组，同一个锁对象 ========
[ 345 ms] t3 进入临界区，开始翻译...
[ 646 ms] t3 写完镜像，退出临界区
[ 646 ms] t4 进入临界区（t3 已离开，互斥成立）

======== 第三组：主键值 <= 127，不同表被冤枉排队 ========
[ 647 ms] menu:5 拿到锁，干活 300ms
[ 950 ms] news:5 才进得来 —— 两条毫无关系的记录排了同一把锁
```

逐组读：

第一组，锁失效实锤。t1 在 10ms 进入临界区，要干到 344ms；t2 在 111ms 就闯进去了——此刻 t1 还在里面。两把不同的锁，等于没有互斥。而且它编译不报错、运行不报错、单线程测试全绿，比崩溃难发现得多。

第二组，对照组证明实验本身没问题。同一个锁对象，t4 乖乖等到 t3 在 646ms 出来才进——互斥成立。说明第一组的问题不在实验设计，就在「两个 Long 对象」。

第三组是个附带的小发现。假如主键恰好 ≤ 127，`Long.valueOf(5L)` 两次拿到的是缓存池里同一个对象——锁「意外地」生效了，但生效得过宽：menu 表的 5 号和 news 表的 5 号是两条毫无关系的记录，也被这把全局共享的缓存对象锁在了一起，还会和进程里任何其他锁同一个 `Long` 的代码互相干扰。

学生举手：「那换个思路，锁 selectById 查出来的行对象行不行？」

也不行，坑的形状一样。每次 `selectById` 都返回新对象，两次查询拿到两个不同的监视器，同样锁不住——你锁的是「这一次查询的结果」，不是「这一条记录」。

学生举手：「那我把锁对象记在 Map 里呢？`ConcurrentHashMap<key, Object>`，key 是表名 + 主键？」

方向完全正确——这就是「规范锁」思想：锁对象不再依赖值的装箱行为，而是我们自己管理。但这条路有个绕不开的坎：键随记录无限增长，你得回答「这把锁什么时候能删」。引用计数？弱引用？过期清理？每种方案都是一堆新代码和新 bug。先别恋战，记住这个方向，第 3 课我们用 15 行把它做对。

（还有一种 `"menu:5".intern()` 锁字符串的写法，intern 池保证同值同对象，能工作，但字符串池是进程级全局命名空间，行为依赖池实现，公认反模式，知道有这回事就行。）

---

### 老师讲课 · 第 3 课：换一个问法——64 把锁 + 确定性哈希

**我们走到哪了**：第 3 站。今天只讲一个概念：用「同键必同锁」替代「每条记录一把锁」。

上个方案卡在「锁对象无限增长」。现在换个角度想需求——我们其实不需要「每条记录一把锁」，只需要「同一条记录永远抢到同一把锁」。

于是做法是：预先造 64 把固定锁，用哈希把无限多个（表名, 主键）分配到这 64 把锁上。

生活化类比：洗车行只有 64 个工位，调度规则是「按车牌号哈希分配工位」。同一辆车今天来明天来，永远被分到同一个工位（确定性）；两辆不同的车可能被分到同一个工位（碰撞），那就排个队——只是慢一点，不会出错。

拿第 1 课的三条需求验收：

| 需求 | 满足情况 |
|------|---------|
| 同记录互斥 | 哈希是确定性函数，同键每次算出同一个锁 |
| 不同记录并行 | 大概率分到不同锁，偶尔碰撞只是短暂排队 |
| 内存可控 | 恒定 64 个对象，几 KB，永不清理 |

碰撞的本质你要想透：用并行度换内存。64 把锁守无限条数据，靠的就是接受「无害的碰撞」——碰撞只损性能（偶尔排队），不损正确性（该互斥的照样互斥）。

先看完整实现，一共 15 行，玄机全在 `stripe()` 的两行里，我们逐行拆：

```java
private static final int STRIPE_COUNT = 64;

private static final Object[] STRIPES = buildStripes();

private static Object[] buildStripes() {
    Object[] stripes = new Object[STRIPE_COUNT];
    for (int i = 0; i < STRIPE_COUNT; i++) {
        stripes[i] = new Object();   // 纯粹当监视器用，无任何数据
    }
    return stripes;
}

private static Object stripe(String tableName, Long pkid) {
    int hash = 31 * tableName.hashCode() + Long.hashCode(pkid);
    return STRIPES[hash & (STRIPE_COUNT - 1)];
}
```

`buildStripes()` 没什么好说的：启动时造 64 个普通 Object，一辈子不增不减。戏肉在 `stripe()`。

第一行，把（表名, 主键）揉成一个指纹：

```java
int hash = 31 * tableName.hashCode() + Long.hashCode(pkid);
```

拿真实数字走一遍 `(menu, 5)`：

`"menu".hashCode()` 算出来是 3347807，`Long.hashCode(5L)` 就是 5，合并得 `31 × 3347807 + 5 = 103782022`。

`31 * a + b` 是经典的散列合并公式——`Objects.hash(a, b)` 和 record 自动生成的 `hashCode` 内部都是它。乘 31 是为了把前一个数的比特「错开」再叠加后一个，让不同组合尽量得到不同指纹。

为什么必须带上表名？menu 表的 5 号和 news 表的 5 号是两条不同的记录，只用主键做哈希会让它们永远锁在一起——不损正确性，但白白排队。

第二行，把指纹撒到 64 把锁上：

```java
return STRIPES[hash & (STRIPE_COUNT - 1)];
```

`64 - 1 = 63`，二进制是 `111111`。`hash & 63` 只保留低 6 位，结果必然落在 0 ~ 63，正好当数组下标。

为什么用 `&` 而不是 `% 64`？两个原因。

一是负数安全。Java 的 `%` 对负数返回负数，`-5 % 64` 等于 `-5`，而 `hashCode()` 完全可能为负，`STRIPES[-5]` 直接越界。`& 63` 只取低 6 位，符号位天然丢弃，任何 int 进来结果都非负。

二是快，`&` 是单条 CPU 指令。这正是 `HashMap` 定位数组的同款手法：`(n - 1) & hash`。

但有个前提：`STRIPE_COUNT` 必须是 2 的幂，`N - 1` 的二进制才是全 1 掩码。这就是常量选 64 而不是 60、100 的原因。

空口无凭，全部上机验证。

#### 【操作记录 3-1】随堂实验：哈希数学逐项实算

`StripedLab.java` 里先只跑数学部分：

```console
$ java StripedLab
======== 一、哈希数学 ========
"menu".hashCode()  = 3347807
"news".hashCode()  = 3377875
Long.hashCode(5L)  = 5
Long.hashCode(-5L) = 4
31 * "menu".hashCode() + Long.hashCode(5L) = 103782022

-5 % 64        = -5
-7 & 63        = 57
103782022 & 63 = 6
```

对照刚才讲的：`%` 对负数返回负数（`-5 % 64 = -5`，做下标必炸）；`-7 & 63 = 57`，负数经 `&` 一律变非负；`(menu, 5)` 的指纹 103782022 落在下标 6。

#### 【操作记录 3-2】随堂实验：谁和谁共享同一把锁

接着跑七条记录的分锁结果：

```console
(menu,5  ) -> lock[6]
(menu,5  ) -> lock[6]
(menu,6  ) -> lock[7]
(menu,99 ) -> lock[36]
(news,5  ) -> lock[18]
(news,2  ) -> lock[15]
(menu,-5 ) -> lock[5]
```

读给你听：`(menu,5)` 算两次必然同锁——串行性全部押在这一个性质上，而它由哈希的确定性保证，跟线程、跟时间都无关；`(menu,6)`、`(menu,99)` 各占各的锁；`(news,5)` 落在 18 号锁，和 menu 表的 5 号互不干扰——这就是带表名的好处；连负主键都稳稳落进数组，不炸。

#### 【操作记录 3-3】随堂实验：同键串行，异键并行

最后跑时间线。三个任务：任务 1 和任务 2 是「运营连点两次保存」产生的同记录任务（menu:5），任务 3 是另一条记录（menu:6），每个任务锁内模拟翻译 500ms：

```console
======== 三、时间线：同键串行，异键并行 ========
[  25 ms] 任务1 (menu:5) 到达，冲向 lock[6]...
[  26 ms] 任务1 (menu:5) 拿到 lock[6]，开始翻译...
[ 120 ms] 任务2 (menu:5) 到达，冲向 lock[6]...
[ 120 ms] 任务3 (menu:6) 到达，冲向 lock[7]...
[ 121 ms] 任务3 (menu:6) 拿到 lock[7]，开始翻译...
[ 527 ms] 任务1 (menu:5) 写完镜像，释放 lock[6]
[ 527 ms] 任务2 (menu:5) 拿到 lock[6]，开始翻译...
[ 622 ms] 任务3 (menu:6) 写完镜像，释放 lock[7]
[1030 ms] 任务2 (menu:5) 写完镜像，释放 lock[6]
```

三件事同时得到了证明：任务 2 在 120ms 到达，一直等到 527ms 任务 1 放手才进去——同记录串行，旧译文不可能再覆盖新译文；任务 3 在 121ms 直接拿锁开跑，和任务 1 完全重叠——不同记录并行，谁也不挡谁；64 把锁全程各司其职，没人清理，没人泄漏。

使用姿势就是一把普通的 synchronized：

```java
synchronized (stripe(tableInfo.getTableName(), pkid)) {
    // 锁内重读主表 → 拿到的必然是最新已提交数据
    // 翻译、写镜像……
}
```

学生举手：「我们场景里锁内要等大模型翻译，一等等好几秒，锁这么久真的行吗？」

这问题问到了锁的粒度。想清楚这把锁锁的是什么：是「这一条记录的写权」，等锁的只有同一条记录的后续任务——而「让它们排队」恰恰就是需求本身。64 把锁各管各的，全局吞吐不受影响。真正要避免的是锁内再去拿别的分片锁（锁叠加），两把锁交叉等待就是死锁的温床——一个方法只拿一把锁，这个约定要焊死。

---

### 老师讲课 · 第 4 课：生产上别手写——Guava Striped

**我们走到哪了**：第 4 站。今天只讲一个概念：这个模式常用到什么程度——常用到 Guava 给它建了一个类。

`com.google.common.util.concurrent.Striped`，用法：

```java
private static final Striped<Lock> STRIPES = Striped.lock(64);

Lock lock = STRIPES.get(tableName + ':' + pkid);
lock.lock();
try {
    // 临界区（return 提前退出也没关系，finally 保证解锁）
} finally {
    lock.unlock();
}
```

#### 【操作记录 4-1】随堂实验：真跑 Guava 33.4.8 的 Striped

下载 Maven Central 当前最新稳定版 guava-33.4.8-jre.jar，新建 `StripedGuavaDemo.java`：

```java
import com.google.common.util.concurrent.Striped;
import java.util.concurrent.locks.Lock;

public class StripedGuavaDemo {

    static final Striped<Lock> STRIPES = Striped.lock(64);

    public static void main(String[] args) {
        System.out.println("menu:5 第 1 次 get -> " + id(STRIPES.get("menu:5")));
        System.out.println("menu:5 第 2 次 get -> " + id(STRIPES.get("menu:5")));
        System.out.println("menu:5 第 3 次 get -> " + id(STRIPES.get("menu:5")));
        System.out.println("news:5      get    -> " + id(STRIPES.get("news:5")));
        System.out.println("stripes.size()     -> " + STRIPES.size());

        Lock lock = STRIPES.get("menu:5");
        lock.lock();
        try {
            System.out.println("拿到分片锁，临界区干活……");
        } finally {
            lock.unlock();
            System.out.println("finally 里 unlock —— 提前 return 也不会漏解锁");
        }
    }

    static String id(Lock l) {
        return l.getClass().getSimpleName() + "@" + Integer.toHexString(System.identityHashCode(l));
    }
}
```

本机实跑：

```console
$ java -cp ".;guava.jar;failureaccess.jar" StripedGuavaDemo
menu:5 第 1 次 get -> PaddedLock@61bbe9ba
menu:5 第 2 次 get -> PaddedLock@61bbe9ba
menu:5 第 3 次 get -> PaddedLock@61bbe9ba
news:5      get    -> PaddedLock@5e2de80c
stripes.size()     -> 64
拿到分片锁，临界区干活……
finally 里 unlock —— 提前 return 也不会漏解锁
```

读输出：同 key 三次 get 拿到的都是同一个 `PaddedLock@61bbe9ba`——「同键必同锁」Guava 替你保证了；不同 key 是另一个实例；`size()` 实话实说 64。顺带一个有意思的细节：Guava 返回的不是裸的 ReentrantLock，而是内部加了字节填充的 `PaddedLock`——用空间换掉 CPU 伪共享，轮子造得比我们讲究。

生产代码里我把手写版换成了它，净删约 20 行。几个变体按需选：

| 工厂方法 | 特点 |
|----------|------|
| `Striped.lock(n)` | 预创建 n 把 `ReentrantLock`（强引用），最常用 |
| `Striped.lazyWeakLock(n)` | 惰性创建 + 弱引用，锁可被 GC，适合超大 n |
| `Striped.readWriteLock(n)` / `Striped.semaphore(permits, n)` | 同样思想分片读写锁 / 信号量 |

学生举手：「那到底手写还是引依赖？」

我的判断标准就一条：项目里已有 Guava，毫不犹豫用 `Striped`；就为这一个类引依赖，15 行手写也一点不丢人。我的项目里本地仓库本来就有 Guava，所以换了。

---

### 收束课：这个思想无处不在

**我们走到哪了**：最后一站，不新增概念，把眼界打开。

分片锁不是孤立技巧，它是「固定资源池 + 哈希分配」这个通用模式在互斥场景的投影，你已经见过它的三个亲戚：

JDK 7 的 ConcurrentHashMap 用 `Segment[]` 分段锁，每段一把 ReentrantLock——分片锁最著名的应用（JDK 8 换成了 CAS + 锁单桶头节点，粒度更细的另一条路线）；LongAdder 让热点计数不争一个 `base`，分散到 `Cell[]` 数组上，汇总再求和——把「争一把锁」改成「分片记各自账」；数据库和缓存的分片，用一致性哈希把 key 分到有限节点——同样的哈希分配，粒度换成了机器。

共同点一句话：键空间无限，资源有限，用确定性哈希做映射，用接受碰撞换免维护。

最后留个心法给你：下次发现「要给无限多的东西加锁」时，先问自己——要的到底是「每样东西一把锁」，还是「同一样东西永远同一把锁」？大多数时候是后者，那就只需要 64 把锁。

### 老师板书 · 本课小结

| 决策点 | 结论 |
|--------|------|
| 为什么不 `synchronized(pkid)` | 锁认引用不认值；两次请求的 Long 是两个对象，锁静默失效（JDK 的 `[identity]` 警告在提示这件事） |
| 为什么不锁行对象 / 动态锁表 / intern | 行对象每次新建；锁表无限增长难清理；intern 是全局命名空间反模式 |
| 正确性靠什么 | 哈希的确定性：同键必同锁 |
| 碰撞怎么办 | 接受：只损并行度，不损正确性 |
| 分片数怎么选 | 2 的幂；越大并行越好、内存越多，小规模写入 64 足够 |
| 手写还是 Guava | 已有 Guava 用 `Striped.lock(n)`；否则 15 行手写不丢人 |

### 留给学生的思考题

1. 如果把 `STRIPE_COUNT` 写成 60，程序不会报错也不会越界，但有个隐性大坑。提示：`60 - 1 = 59 = 0b111011`，这个掩码缺了两个 1。想想 64 个下标里实际能被分到的有几个？（答案方向：掩码上每个 0 位都会让一批下标永远取不到。）
2. 主键从数字换成 String 类型的 UUID，`stripe()` 第一行该怎么改？提示：看看 `Objects.hash(...)` 的签名。

---

（本系列完结：锁与同步全部 8 篇至此收官。➡️ 下一篇进入新系列：《并发容器 Map、List、Set 实战与原理》。）
