---
title: 卡死了谁来救？——livenessProbe 与 CrashLoopBackOff 的算法（苏格拉底对话实录）
sidebarGroup: CKA 通过之路
shortTitle: 07 livenessProbe 与 CrashLoopBackOff
order: 7
date: 2026-09-19T00:00:00.000Z
author: Corey
category: 云原生
tag:
  - CKA
  - Kubernetes
  - livenessProbe
  - CrashLoopBackOff
  - 苏格拉底对话
description: 从「卡死的容器没人管」一步步逼出 livenessProbe；从冻结的 RESTARTS 猜出翻倍退避算法，再用 7 分钟记录仪实测 5 分钟封顶；最后解开「一直失败的 pod 凭什么 READY 1/1」——学生中途三次说「看不懂」，回退拆小步的实录全部保留。
---

> **CKA 通过之路 · 第 8/17 篇**
> 上一篇：[《提前课：docker -p 就是 DNAT——iptables 与 kube-proxy》](/云原生/cka/cka-06-dnat-iptables) · 下一篇：[《慢启动的冤案——startupProbe》](/云原生/cka/cka-08-startup-probe)

---

## 写在前面

上一篇提前课回答了「名单底层怎么转发流量」，这一篇回到主线，补探针家族的第二员。上一课的 readinessProbe 管「名单」，这一课的 livenessProbe 管「生死」。

参考资料（写作时逐条核对过）：

- [Pod Lifecycle —— Container restarts](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)：退避算法官方原文，10s 起步、翻倍、300 秒封顶、跑满 10 分钟重置
- [Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)：探针配置官方教程
- [Liveness, Readiness and Startup Probes 概念页](https://kubernetes.io/docs/concepts/workloads/pods/probes/)

课堂路线：

> ① 卡死的容器谁来救 → ② 预测「跳得很快」，现实「35 秒一次」 → ③ 冻结的计数器与翻倍算法 → ④ READY 1/1 之谜 → ⑤ 双探针单变量对照实验

本篇还值一笔附带记录：学生中途三次说「看不懂 / 说不出来 / 有点乱了」，每次都是把问题拆到「读屏幕上的一个数字」那么小才继续——回退的实录原样保留，它和知识点一样值钱。

---

## 第 1 课：卡死的容器，谁来重启

老师开场只给了一个新情况：进程有一种坏法叫**卡死**——进程还在（**没有退出**），但任何请求都不响应。括号里那句话是关键：`restartPolicy: Always` 的重启条件是「容器退出」，而它现在不退出。

> **🧑‍🎓 学生：** 都已经卡死了，完全就失去响应了，应该是真正的重启后，才会restats+1

答对了一半：RESTARTS 这个计数器确实只在「容器真的被重启过」之后才 +1——它是**结果**，不是原因。另一半藏在「会有人来重启它」这个默认假设里。把已认识的机制全摆出来：

| 机制 | 触发条件 | 触发后的动作 |
|---|---|---|
| `restartPolicy: Always` | 容器**退出** | kubelet 重启容器，RESTARTS +1 |
| `readinessProbe` | 定期检查**失败** | 从 endpoints 名单除名，**仅此而已** |

现在：没退出（第一个触发不了）+ 检查会失败（第二个只除名）。老师问「这两个机制里，哪一个的动作是重启容器」——学生回了三个字：

> **🧑‍🎓 学生：** 看不懂你在说什么

一次给太多了，回退，一次只看一个东西：

> **🧑‍🏫 老师：** restartPolicy 重启容器有一个条件——容器退出。卡死的进程，退出没有？
>
> **🧑‍🎓 学生：** 没有
>
> **🧑‍🏫 老师：** 那第一个机制排除。readinessProbe 失败后，它重启容器了吗？（上节课的实验：名单里那个 IP 消失了）
>
> **🧑‍🎓 学生：** 也没有啊

两个机制全部排除，回到最初那道题：

> **🧑‍🎓 学生：** 那就没有人

**没有人**——卡死的容器会永远卡在集群里：名单除名、流量不来，但容器本身没人动，RESTARTS 永远是 0。学生刚刚自己推出了 k8s 的一个洞，设计者也推到了，所以补了第三个机制：

**livenessProbe（存活探针）**——字面定义：

- 触发条件：kubelet 定期检查容器，检查**连续失败**
- 动作：**重启容器**——就是 `restartPolicy` 那个让 RESTARTS +1 的重启

[官方文档](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)的原话：*"Many applications running for long periods of time eventually transition to broken states, and cannot recover except by being restarted. Kubernetes provides liveness probes to detect and remedy such situations."*

三个机制从此凑齐，各管一段：

| 进程的状态 | 谁来管 | 结果 |
|---|---|---|
| 自己退出了 | restartPolicy | 重启，RESTARTS +1 |
| 卡死/不响应 | **livenessProbe** | 重启，RESTARTS +1 |
| 暂时不能接活 | readinessProbe | 只除名，不重启 |

## 第 2 课：预测「跳得很快」，现实「35 秒一次」

老配方：nginx:alpine 监听 80，探针故意指向 **8080**——没人监听，connection refused，检查必失败。这次挂的是 `livenessProbe`（父节点在**容器**下面，缩进踩过坑的都懂）：

```yaml
spec:
  containers:
  - image: nginx:alpine
    name: live-test
    livenessProbe:
      httpGet:
        path: /
        port: 8080
```

完整创建命令（cka-05 同款三步）：

```bash
kubectl run live-test --image=nginx:alpine --port=80 --dry-run=client -o yaml > live.yaml
# 编辑 live.yaml：容器字段下加上面那段 livenessProbe
kubectl apply -f live.yaml
```


apply 前先写预测，学生原话：

> **🧑‍🎓 学生：** 我原本认为这个数字会跳得很快，因为一旦发现访问不通，就会重启

现实出分（本机逐字粘贴）：

```bash
kubectl describe pod live-test
```

```text
Liveness:  http-get http://:8080/ delay=0s timeout=1s period=10s successThreshold=1 failureThreshold=3

Warning  Unhealthy  19s (x15 over 2m39s)  Liveness probe failed:
Get "http://10.244.0.17:8080/": dial tcp 10.244.0.17:8080: connect: connection refused
Normal   Killing    19s (x5 over 2m19s)   Container live-testi failed liveness probe, will be restarted
```

**5 次 Killing 用了 2 分 19 秒——平均约 35 秒一次**，稳得像钟摆，一点也不快。为什么是 30 多秒？答案全在参数行里。老师只问了一句「`period=10s` 和 `failureThreshold=3` 怎么组合出约 30 秒」，学生自己算出来了：

> **🧑‍🎓 学生：** 每次10秒，尝试3次，如果三次都失败了，则需要再重启一下

时间线钉在黑板上：

```text
0s    检查① 失败   → RESTARTS 不动（还差 2 次）
10s   检查② 失败   → RESTARTS 不动（还差 1 次）
20s   检查③ 失败   → 失败数达到 failureThreshold=3 → Killing
21s   容器重启     → RESTARTS +1，失败计数清零，循环重新开始
```

反过来再问一个设计题：假如 k8s 设计成「失败 1 次就立刻重启」，一个健康但恰好忙了一秒的 nginx 会遭遇什么？学生的回答把最狠的一层说出来了：

> **🧑‍🎓 学生：** 就会发生反复的重启，而刚启动的时候，瞬间又被流量给打垮了，然后又重启，无限死循环中

对——重启不仅没救它还帮了倒忙：重启瞬间杀掉所有正在处理的连接，冷启动一完成全部流量又压上来。设计原则因此成立：

> **重启是破坏性动作，判定必须保守——连续失败 3 次才算真死，偶尔失败 1 次不算数（中间成功一次，失败计数清零）。**

两个真实彩蛋一并记录：

1. 事件里容器名是 `live-testi`——学生手滑多打了一个 i，`kubectl describe` 的 `spec.containers{live-testi}` 全程暴露。命名手滑没有藏身处。
2. 学生其实抢在课前自己 apply 了这个实验，老师后来重复 apply 时撞上了真实报错：

```text
The Pod "live-test" is invalid: spec: Forbidden: pod updates may not change fields other than
`spec.containers[*].image`,`spec.initContainers[*].image`,`spec.activeDeadlineSeconds`,...
```

pod 除了镜像等个别字段，**其余部分创建后不可改**——想改探针，只能删了重建。这个 Forbidden 在探针那一课见过亲戚，这次算正式认识。

## 第 3 课：冻结的计数器——CrashLoopBackOff

十分钟后再看，节奏变了。老师贴了一张 `1/1 Running` 的快照，学生说：

> **🧑‍🎓 学生：** 我没看到这个啊

都对——那是**同一个 pod 的两个不同瞬间**：Running 快照是刚重启完、容器活着的短暂窗口，学生屏幕上是等待下一次重启的漫长间隙。同一条命令连拍三张：

```bash
kubectl get pod live-test
```

```text
06:29:29   live-test   0/1   CrashLoopBackOff   7 (3m29s ago)   11m
06:29:55   live-test   0/1   CrashLoopBackOff   7 (3m54s ago)   11m
06:30:20   live-test   0/1   CrashLoopBackOff   7 (4m19s ago)   12m
```

RESTARTS 冻在 7 不动了。老师追问「等待时间是固定的还是变的」，中途学生又两次卡住（「我不懂你在说什么」「我有点乱了」），最后拆到只剩两条数据：

- 数据一（10 分钟前）：每 35 秒重启一次，RESTARTS 一路涨
- 数据二（刚才）：第 8 次到第 9 次之间隔了好几分钟

> **🧑‍🎓 学生：** 变的
>
> **🧑‍🏫 老师：** 方向是——越等越久。那猜下一问：第 9→10 次，比第 8→9 次更长还是更短？
>
> **🧑‍🎓 学生：** 应该会变得更长，应该有个算法在里面
>
> **🧑‍🏫 老师：** 算法的形状，两个候选：A 加法（每次多等固定一段）还是 B 翻倍（每次 ×2）？算一算 A 要涨多少次才够到 5 分钟，B 要几次。
>
> **🧑‍🎓 学生：** 应该是B

赌局揭晓前，挂了个每 5 秒一拍的记录仪，把换相位的时刻全录了下来（420 秒窗口，逐字抽录）：

```text
06:32:01  容器死亡 → 进入退避等待
06:37:20  等待结束，新容器起跑          ← 等了 5 分 19 秒
06:37:21  ┃ 1/1 Running  …探针正在失败
06:37:41  ┃ 21 秒后：3 次检查全失败 → 杀 → 下一任立刻起跑
06:37:48  ┃ 1/1 Running  RESTARTS 11
06:38:11  ┃ 30 秒后：又死
06:38:14  ┗ CrashLoopBackOff → 又开始等待……（记录仪下班时还在等）
```

三个实锤：

1. **B 命中**：等待一路涨到 **5 分 19 秒**——翻倍算法的顶就是 5 分钟，之后每次都等 5 分钟，不再翻。A 加法从 10 秒起步每次 +10，要 29 次才够到 5 分钟，和实测完全对不上。
2. **学生自己推导的公式回来客串**：第 10 任只活了 21 秒——检查①(0s)、②(10s)、③(20s) 三连败 → 杀。`period=10s × failureThreshold=3`，分秒不差。
3. 算法的名字，其实一直写在 STATUS 列上：

```text
CrashLoopBackOff
```

**Crash（崩）Loop（循环）+ Back（退）Off（避）——「崩溃循环·退避」。** 谜语写在脸上，谜底是算法本身。

对照[官方文档](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)，我们的实测和文档逐字吻合：

> *"After containers in a Pod exit, the kubelet restarts them with an exponential backoff delay (10s, 20s, 40s, …), that is capped at 300 seconds (5 minutes). Once a container has executed for 10 minutes without any problems, the kubelet resets the restart backoff timer for that container."*

三个数字全部对上：10 秒起步 ✓、翻倍 ✓、300 秒封顶（我们测到 5m19s，含判定与调度开销）✓。最后那句「跑满 10 分钟无故障，计时器重置」是文档送给我们的新知识：退避不是无期徒刑，好好跑十分钟就赦免。

**附：记录仪的两起真实事故**（真实报错是教材，这课的纪律同样适用于写脚本）：

1. 单引号脚本经 `wsl bash -c` 传递，`$(...)` 被外层 shell 提前展开，输出里的空格和括号把语法砸了：`bash: -c: line 1: syntax error near unexpected token '('`——改用 `bash -s <<'EOF'` 管道直通后修复。
2. 修复版本想「只在变化时打印」，但输出里的 `(42s ago)` 字段每一拍都在变，于是每 5 秒都算「变了」——90 多行全打（数据无损，设计失误）。

## 第 4 课：READY 1/1 之谜

现实里还埋着一个反常：liveness 检查每 10 秒失败一次、**永远失败**，可容器活着的窗口里 READY 是满分：

```bash
kubectl get pod live-test
```

```text
live-test   1/1   Running   8 (5m12s ago)   12m
```

> **🧑‍🎓 学生：** 不知道，是不是搞错了？

不是 bug，设计如此。继续拆小：

> **🧑‍🏫 老师：** READY 这一列，归哪个探针管？
>
> **🧑‍🎓 学生：** readiness
>
> **🧑‍🏫 老师：** live-test 的 yaml 里，你写 readinessProbe 了吗？
>
> **🧑‍🎓 学生：** 没有，我只写了livenessProbe，我现在有点搞不清了

到这里学生彻底乱了，老师停止提问，把拼图拼装给他：

- 拼图①（学生自己答的）：READY 归 readinessProbe 管
- 拼图②（学生自己说的）：live-test 没写 readinessProbe

没人检查就绪了，k8s 只剩一个最原始的判断依据——**容器在不在跑**。它在跑（Running），那 READY 给几分？读屏幕即可：

```bash
kubectl get pod live-test
```

```text
NAME        READY   STATUS    RESTARTS      AGE
live-test   1/1     Running   11 (7s ago)   19m
```

学生第一反应答了 0（按「探针在失败」推理），对着表头重读后改口「这里是1」，并且马上贴出了自己屏幕上的最新状态：

> **🧑‍🎓 学生：** 这里是1，但是我现在最新的情况是
> live-test                0/1     CrashLoopBackOff   13 (2m27s ago)   28m

两行都是真的，拼在一起恰好是完整答案：

| 瞬间 | 容器 | liveness 检查 | READY |
|---|---|---|---|
| 某一拍 | 活着（Running） | 每 10 秒失败一次 | **1/1** |
| 学生屏上 | 死了（等重启） | —— | **0/1** |

两个瞬间的唯一差别是什么？学生「说不出来」，老师再拆到念表——「第一行容器活着还是死了」——学生答「死了」（把 Running 那行也读错成死了）。最后由老师拼装收尾：

> **「探针失败」≠「容器死了」。**
> Running 那行里 nginx 进程真真切切在 80 端口服务着——只是探针去敲的是 8080 那扇没人开的门。进程活着，敲门没人应，两件事互不冲突。

整条逻辑链闭合：

1. 没写 readinessProbe → READY 没人打分 → 默认规则只有一条：**容器在跑 = 1，容器死了 = 0**
2. liveness 失败一万次也**不碰 READY**——它唯一的权力是杀容器
3. 杀完之后容器真死了 → READY 这时才**间接**变成 0

下课清点后，学生自己把这条规则说成了定律（原话上黑板）：

> **🧑‍🎓 学生：** 你的意思是如果我没有配置 readiness 那么这个READY列，只管容器活还是没活，而不管能不能连的通

并把课后题当场答对：加上永远失败的 `readinessProbe: 8080`，容器活着的窗口里 **READY = 0**。

## 第 5 课：单变量对照实验

预测对了，按铁律用现实盖章。裸 pod 改不了（第 2 课那个 Forbidden），删掉重建，两个探针**同时在场**，都指向 8080：

```yaml
spec:
  containers:
  - image: nginx:alpine
    name: live-test
    livenessProbe:
      httpGet:
        path: /
        port: 8080
    readinessProbe:
      httpGet:
        path: /
        port: 8080
```

完整命令（裸 pod 不可改，删了重建）：

```bash
kubectl delete pod live-test
kubectl apply -f live.yaml     # 双探针版
```

前 100 秒实录（每 20 秒执行一次 `kubectl get pod live-test`，逐字）：

```text
06:55:40   live-test   0/1   Running   0            20s
06:56:00   live-test   0/1   Running   1 (9s ago)   40s
06:56:20   live-test   0/1   Running   1 (30s ago)  61s
06:56:41   live-test   0/1   Running   2 (20s ago)  81s
06:57:01   live-test   0/1   Running   3 (10s ago)  101s
06:57:21   live-test   0/1   Running   3 (30s ago)  2m1s
```

第二行起，一行输出三件事同时成立：

- `Running` → 容器**活着**，nginx 正在 80 端口跑
- `0/1` → readinessProbe 失败 → 学生预测的 0，命中
- `RESTARTS` 0→3 爬升 → livenessProbe 一直在杀

而且这是一次干净的**单变量对照**：早上同一个 pod、同样失败的检查，没配 readiness 时是 `1/1 Running`，配了就是 `0/1 Running`——唯一变量就是 readinessProbe 在不在场。

## 本篇小结

- 三根开关，全由课堂推导 + 实测拼出：

| 机制 | 触发条件 | 动作 | 看哪一列 |
|---|---|---|---|
| restartPolicy | 容器自己退出 | 重启 | RESTARTS |
| livenessProbe | 检查连败 3 次 | 杀掉再重启 | RESTARTS |
| readinessProbe | 检查失败 | 名单除名 | READY |

- 退避算法：10s 起步、每次 ×2、**300 秒封顶**（实测 5m19s）；连续失败判死，成功一次清零；跑满 10 分钟无故障，整个退避计时器重置
- READY 的默认判定定律（学生版原话）：**没配 readiness 时，只管容器活还是没活，不管能不能连得通**
- 「探针失败 ≠ 容器死了」；回到开场的卡死容器：双探针下它会被**除名**（流量不再来）**同时**被**重启**（给它复活的机会）——每根开关只做一件事，k8s 靠组合完成保护

➡️ 下一篇：[《慢启动的冤案——startupProbe》](/云原生/cka/cka-08-startup-probe)
