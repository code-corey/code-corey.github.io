---
title: 工人的饭量——requests 与 limits（直接讲授实录）
sidebarGroup: CKA 通过之路
shortTitle: 16 requests 与 limits
order: 16
date: 2026-09-24T00:00:00.000Z
author: Corey
category: 云原生
tag:
  - CKA
  - Kubernetes
  - 资源管理
  - OOM
description: 小区食堂没人管饭量，一户大胃王能把全小区吃穷。Kubernetes 的规矩就两个数字：requests（报饭量，排座时看）和 limits（红线，跑起来后看）。本课一路实测三条墙：exec 副手吃超被 exit 137 秒杀、红线画太低在开工仪式上就被掐（RunContainerError）、/dev/shm 内存假盘自带 64Mi 盘墙挡住 dd——最后用 awk 指数翻倍纯内存猛吃，实锤 Last State: OOMKilled / Exit Code 137 / 启动死亡同一秒。附 QoS 三档（BestEffort / Burstable / Guaranteed）。全程大白话 + 命令输出逐字实录。
---

> **CKA 通过之路 · 第 17/17 篇**
> 上一篇：[《短工的座位——Job 与 CronJob（直接讲授实录）》](/云原生/cka/cka-15-job-cronjob) · 下一篇：敬请期待

---
> - 日期：2026-09-24
> - 学生：Corey（0 基础，直接讲授 + 小白重讲协议）
> - 环境：WSL2 Ubuntu-22.04 + kind v0.33.0 + Kubernetes v1.37.0，单节点 demo-control-plane
> - 教学衔接：延续「小区物业」比方（住户=pod、合同=Deployment、家具=镜像、前台=kubectl、保安=OOM killer），本课只新增两个名词：requests（报饭量）、limits（饭量红线）
> - 官方文档核对新度：Resource Management for Pods and Nodes（kubernetes.io 官方概念文档 2026-06 版）

---

## 开场疑问：小区的食堂没人管饭量会怎样？

小区（集群）有个**食堂**——就是节点这台机器的 **CPU 和内存**。所有住户（pod）都在食堂吃饭（用 CPU 算、用内存存）。

没人管饭量会怎样？一户大胃王搬进来——程序内存越吃越多，把食堂**整个吃空**。不只它自己撑死，**全小区住户跟着遭殃**（别人的内存也没了，机器卡死）。

规矩就**两个数字**，写在住户的登记表（YAML）里：

| 数字 | 学名 | 大白话 |
|---|---|---|
| **报饭量** | `requests` | 「我打算吃这么多」——食堂按**全小区报上来的总量**排座（排座位=调度：决定这户住哪台机器） |
| **饭量红线** | `limits` | 「我最多吃这么多」——真吃超了，**食堂直接端盘子**（不许再吃，甚至把人抬走） |

一句话记住分工：**requests 管排座（调度时看），limits 管动手（跑起来后看）**。

两个单位先认识字：

- 内存用 **Mi**（兆字节，第 12 课见过：50Mi、512Mi）
- CPU 用 **m**（毫核 = 千分之一个 CPU 核）——500m = 半个核，100m = 十分之一个核

---

## 实战一：给一户「大胃王」立规矩

造一户 mem-hog（hog=大胃王），登记表里第一次出现 `resources:` 段。

**命令**（先建 /tmp/mem-hog.yaml）：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: mem-hog
spec:
  containers:
    - name: main
      image: nginx:alpine
      command: ["sleep", "3600"]
      resources:            # ← 饭量规矩段（新面孔）
        requests:           # 报饭量：
          memory: 20Mi      #   内存打算用 20 兆
          cpu: 50m          #   CPU 打算用 0.05 核
        limits:             # 红线：
          memory: 50Mi      #   内存最多 50 兆——超了抬人（下面实测）
          cpu: 100m         #   CPU 最多 0.1 核
```

```bash
kubectl apply -f /tmp/mem-hog.yaml && sleep 6 && kubectl get pod mem-hog
```

**输出**：

```text
pod/mem-hog created
NAME      READY   STATUS    RESTARTS   AGE
mem-hog   1/1     Running   0          6s
```

**解释**：大胃王上工，规矩已立。现在实测红线是不是真的——进他屋里让他真吃超 50 兆。

---

## 实战二：喂他吃 100 兆——副手死了，户主没事

勺子叫 `dd`（数据搬运工：从甲地搬数据到乙地）。关键在**目的地**：`/dev/shm`——一块**用内存假扮的硬盘**，写进去的东西不落盘、直接占内存，是喂大胃王最快的勺子。

**命令**：

```bash
kubectl exec mem-hog -- sh -c 'dd if=/dev/zero of=/dev/shm/big bs=1M count=100'; kubectl get pod mem-hog
```

（exec 进 mem-hog 屋 · if=/dev/zero 从「零发生器」取货（无限个 0）· of=/dev/shm/big 倒进内存盘 · bs=1M count=100 共 100 兆。红线 50Mi，冲到 100Mi）

**输出**：

```text
command terminated with exit code 137
NAME      READY   STATUS    RESTARTS   AGE
mem-hog   1/1     Running   0          26s
```

**解释**：结果比「整户被抬」更精采，藏着两个新知识。

**① exit code 137 = 必杀令的编号**。拆开：137 = 128 + 9，其中 9 是 **SIGKILL**（Linux 的「必杀信号」——不许还手、立刻死）。谁开的枪？**内核里的食堂保安**（学名 OOM killer——Out Of Memory，内存超线时的抬人保安）。红线是真的：刚冲过 50 兆，保安当场动手。

**② 但名单上 mem-hog 还是 1/1 Running、RESTARTS 0——户主没事**。想清楚谁在吃饭：exec 进去的 dd 是个**临时副手**——吃饭的是副手，保安抬走的也是副手；**户主（sleep 3600）压根没吃饭**，还安稳坐在屋里。这一户没死，死的只是请进去吃饭的临时工。

---

## 实战三：让户主亲自吃——线画太低，开工仪式就被掐

想看「整户被抬走」（OOMKilled 状态），得让**户主自己**吃超。新建 hog2，把户主入住当天要干的事（command）直接写成「先吃 100 兆，吃完睡觉」，红线 50Mi：

**命令**（先建 /tmp/hog2.yaml）：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: hog2
spec:
  containers:
    - name: main
      image: nginx:alpine
      command: ["sh", "-c", "dd if=/dev/zero of=/dev/shm/big bs=1M count=100; sleep 3600"]
      #       ↑ 户主亲自干：先倒 100 兆进内存盘，然后睡觉
      resources:
        limits:
          memory: 50Mi      # 红线照旧 50 兆
```

```bash
kubectl apply -f /tmp/hog2.yaml && sleep 10 && kubectl get pod hog2 && echo '=== 保安案底（Events）===' && kubectl describe pod hog2 | tail -8
```

**输出**：

```text
pod/hog2 created
NAME   READY   STATUS              RESTARTS     AGE
hog2   0/1     RunContainerError   1 (9s ago)   10s
=== 保安案底（Events）===
  Type     Reason     Age               From               Message
  ----     ------     ----             ----               -------
  Normal   Scheduled  10s               default-scheduler  Successfully assigned default/hog2 to demo-control-plane
  Normal   Pulled     9s (x2 over 10s)  kubelet            spec.containers{main}: Container image "nginx:alpine" already present on machine and can be accessed by the pod
  Normal   Created    9s (x2 over 9s)   kubelet            spec.containers{main}: Container created
  Normal   Started    9s                kubelet            spec.containers{main}: Container started
  Warning  Failed     9s               kubelet            spec.containers{main}: Error: failed to create containerd task: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: container init was OOM-killed (memory limit too low?)
  Warning  BackOff    8s               kubelet            spec.containers{main}: Back-off restarting failed container main in pod hog2_default(351a4290-b633-4058-a7ae-0f5c283dfc75)
```

**解释**：意外收获——这次没到吃饭环节，**开工仪式上就被掐了**。STATUS 是新面孔 RunContainerError，案底签名：

```text
container init was OOM-killed (memory limit too low?)
```

大白话：**50 兆的线画得太低**——nginx 这套家具光「开箱安装」（容器启动、程序初始化）就不够用，保安在开工仪式进行中就把户主抬走了。保安还留了句 `(memory limit too low?)`——**线是不是画低了？**——runtime 亲自提示。

**两种死法的区别**（都记住）：

- **OOMKilled**：容器**跑起来之后**吃超被杀（饭桌上被抬）
- **RunContainerError**：容器**还没启动完**就被杀（开工仪式上被抬）——案底里带 `OOM-killed` 字样的就是它

---

## 实战四：抬线到 80 兆——他又活了？盘墙真相

修法：把线抬高一点——高到能完成开工（约需几十兆），又低于 100 兆饭量。取 80Mi 重发：

**命令**（改 limits.memory: 80Mi 后重发）：

```bash
kubectl apply -f /tmp/hog2.yaml && sleep 12 && kubectl get pod hog2 && echo '=== 保安案底（Events）===' && kubectl describe pod hog2 | tail -6
```

**输出**：

```text
pod "hog2" deleted from default namespace
pod/hog2 created
NAME   READY   STATUS    RESTARTS   AGE
hog2   1/1     Running   0          13s
=== 保安案底（Events）===
  Type    Reason     Age   From               Message
  ----    ------     ----  ----               -------
  Normal   Scheduled  13s               default-scheduler  Successfully assigned default/hog2 to demo-control-plane
  Normal   Pulled     12s (x2 over 13s)  kubelet            spec.containers{main}: Container image "nginx:alpine" already present on machine and can be accessed by the pod
  Normal   Created    12s (x2 over 12s)  kubelet            spec.containers{main}: Container created
  Normal   Started    12s (x2 over 12s)  kubelet            spec.containers{main}: Container started
```

**解释**：咦——他又活了，1/1 Running，保安没动手。剧本没走成，**别猜，当庭查证**：看那 100 兆到底倒进去多少。

**查证命令**：

```bash
kubectl exec hog2 -- ls -la /dev/shm/big
```

**输出**：

```text
-rw-r--r-- 1 root root 67108864 Sep 24 14:48 /dev/shm/big
```

**解释**：数字对质，真相大白——**盘里只倒进去 64 兆，不是 100 兆**（67108864 = 64 × 1024 × 1024）。哪来的墙？**这块「内存假盘」自己有容量**：容器里的 /dev/shm 默认就 64 兆大。dd 倒到 64 兆时**盘满了**（报 no space 退场），压根没冲到 80 兆的红线。保安没动手，因为真没超线。

复盘这口锅的三轮，每轮撞的墙都不同：

| 轮 | 红线 | 结果 | 撞的什么墙 |
|---|---|---|---|
| 1 | 50Mi | 开工仪式被掐（RunContainerError） | 线**太低**——nginx 开箱安装就要吃掉大半 |
| 2 | 80Mi | 活着，啥事没有 | 线**太高**——64Mi 的**假盘容量墙**先挡住了 dd |
| 3 | 要做的 | 目标：OOMKilled | 得**绕开盘**，直接在内存里吃 |

---

## 实战五：换武器 awk——纯内存猛吃，实锤 OOMKilled

新勺子 awk（镜像里自带的小计算器）：`awk 'BEGIN{while(1){s=s s "x"}}'`——死循环，每圈把字符串 s **翻倍**：1 字→2 字→4 字→8 字……十几圈就几百兆，**纯内存变量、不落任何盘**。线还是 80Mi，这回没有盘墙护着。

**命令**（command 换成 awk 指数膨胀后重发）：

```yaml
command: ["sh", "-c", "awk 'BEGIN{while(1){s=s s \"x\"}}'; sleep 3600"]
resources:
  limits:
    memory: 80Mi
```

```bash
kubectl apply -f /tmp/hog2.yaml && sleep 8 && kubectl get pod hog2 && echo '=== 保安案底 ===' && kubectl describe pod hog2 | tail -5
```

**输出**：

```text
pod/hog2 created
NAME   READY   STATUS             RESTARTS   AGE
hog2   0/1     CrashLoopBackOff   1 (7s ago)   9s
=== 保安案底 ===
  Normal   Scheduled  9s               default-scheduler  Successfully assigned default/hog2 to demo-control-plane
  Normal   Pulled     7s (x2 over 8s)  kubelet            spec.containers{main}: Container image "nginx:alpine" already present on machine and can be accessed by the pod
  Normal   Created    7s (x2 over 8s)  kubelet            spec.containers{main}: Container created
  Normal   Started    7s (x2 over 8s)  kubelet            spec.containers{main}: Container started
  Warning  BackOff    5s (x2 over 6s)  kubelet            spec.containers{main}: Back-off restarting failed container main in pod hog2_default(59556aab-09fa-4d13-8cbc-ac80ee191b14)
```

**解释**：目标达成——0/1 CrashLoopBackOff，RESTARTS 1：**户主死了，物业在反复给他办复活**。但 CrashLoopBackOff 只说明「反复死」，**死因实锤**还得翻案卷中段（Last State 段——上一次怎么死的）。

**翻案卷命令**：

```bash
kubectl describe pod hog2 | grep -B 2 -A 5 'Last State'
```

**输出**：

```text
      Started:      Thu, 24 Sep 2026 22:50:21 +0800
      Finished:     Thu, 24 Sep 2026 22:50:21 +0800
    Last State:     Terminated
      Reason:       OOMKilled
      Exit Code:    137
      Started:      Thu, 24 Sep 2026 22:50:07 +0800
      Finished:     Thu, 24 Sep 2026 22:50:07 +0800
    Ready:          False
```

**解释**：三行铁证：

- **Reason: OOMKilled**——官方死因：内存超线被保安抬走
- **Exit Code: 137**——死法编号：128+9，必杀令 SIGKILL（与实战二副手 dd 同款死法）
- **Started = Finished 同一秒**（22:50:07→22:50:07）——awk 指数翻倍太快，一秒内冲满 80 兆。上面一段 22:50:21 那次也是起来就死——程序不变，每次复活还是猛吃、还是撞线，物业退避加时地反复拉人。这就是 CrashLoopBackOff 的完整因果：**不是病，是症状**——起来就死的循环。

---

## 彩蛋：物业给住户贴的服务等级（QoS）

登记表上写没写饭量规矩，物业会贴不同的**服务等级标签**（QoS，服务质量）。三档：

- **BestEffort**（尽力而为）：没写 requests 也没写 limits——食堂紧张时**最先牺牲**
- **Burstable**（可爆发）：写了但 requests ≠ limits——中间档
- **Guaranteed**（有保证）：requests = limits（报多少限多少）——食堂紧张时**最受保护**

**命令**：

```bash
kubectl describe pod hog2 | grep 'QoS Class' && kubectl describe pod mem-hog | grep 'QoS Class'
```

**输出**：

```text
QoS Class:                   Burstable
QoS Class:                   Burstable
```

**解释**：两户都被贴 Burstable——mem-hog 报 20 限 50（报≠限）；hog2 只限 80。hog2 若补上报 80Mi（=限 80Mi），就升级 Guaranteed。

---

## 本课总账

| 概念 | 一句话 |
|---|---|
| `requests` | 报饭量——**排座时看**（决定住哪台机器） |
| `limits` | 红线——**跑起来看**（超线保安动手） |
| `OOMKilled` / 137 | 内存超线被 SIGKILL 抬走（128+9=137） |
| `RunContainerError` | 线太低，开工仪式就被掐 |
| `CrashLoopBackOff` | 症状不是病：起来就死的循环 |
| QoS 三档 | BestEffort（裸奔）/ Burstable（报≠限）/ Guaranteed（报=限，最保命） |

隐藏知识点白捡：**容器里的内存假盘 /dev/shm 默认只有 64Mi**——它是盘墙不是线墙，dd 撞它不会惊动保安。

---

## 结课出题（三题已出，学生作答待收，核对段待回填）

**第 1 题（概念）**：requests 和 limits 各管什么？分别在**什么时刻**起作用？

**第 2 题（判读）**：同事甩来一段 describe：

```text
Last State:  Terminated
  Reason:    OOMKilled
  Exit Code: 137
```

这三行各说明什么？137 这个数字怎么拆？

**第 3 题（排障）**：线上有个 pod 反复 CrashLoopBackOff，案卷 Last State 是 OOMKilled。修法有**两个方向**——分别是什么？（提示：想想锅可能在谁身上）

---

## 课毕状态

- 本课实验对象全部清理：mem-hog、hog2 已删；/tmp/mem-hog.yaml、/tmp/hog2.yaml 已删
- 名单回到课前 12 户：hello×5（alpine 旧版）、web3×4、probe-test、tol-equal 全程没动
- k9s-demo 仍卡 ImagePullBackOff（家具快递收不到 36 小时+）——留作下一篇排障课的真实教材

---

➡️ 下一篇预告：《家具快递收不到——镜像拉取排障》。名单上那户 `0/1 ImagePullBackOff` 卡了 36 小时的 k9s-demo，正是最好的反面教材：镜像名拼错和仓库连不上，报错长得不一样——`describe` 看事件流，三分钟定位。
