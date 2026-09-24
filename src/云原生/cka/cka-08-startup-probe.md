---
title: 慢启动的冤案——startupProbe（苏格拉底对话实录）
sidebarGroup: CKA 通过之路
shortTitle: 08 startupProbe 与慢启动
order: 8
date: 2026-09-19T00:00:00.000Z
author: Corey
category: 云原生
tag:
  - CKA
  - Kubernetes
  - startupProbe
  - livenessProbe
  - 苏格拉底对话
description: 一个健康的慢启动应用，被 livenessProbe 以「启动太慢」的罪名反复处决。先试 initialDelaySeconds 平反——一根旋钮伺候不了两个主人；然后学生在课堂上自己发明了 startupProbe，再用双实验对照盖章。外加白捡一个知识点：Killing 之后还有 30 秒宽限期。
---

> **CKA 通过之路 · 第 9/14 篇**
> 上一篇：[《卡死了谁来救？——livenessProbe 与 CrashLoopBackOff 的算法》](/云原生/cka/cka-07-liveness-crashloopbackoff) · 下一篇：[《名单的另一半——label 与 selector》](/云原生/cka/cka-09-label-selector)

---

## 写在前面

上一篇 livenessProbe 管住了「卡死的容器」，结尾留了个名字：startupProbe，专治「启动慢被 liveness 误杀」。这一篇就是那桩案子——学生先预测冤案，再试旧工具平反失败，然后**自己把 startupProbe 发明了出来**，最后两个实验对照盖章。

参考资料（写作时逐字核对）：

- [Configure Liveness, Readiness and Startup Probes —— Protect slow starting containers](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)：startup 探针官方机制与 30×10=300s 示例
- [Pod Lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)：terminationGracePeriodSeconds 默认 30 秒宽限

课堂路线：

> ① 一桩冤案（预测） → ② initialDelaySeconds 平反未遂 → ③ 发明题：学生造出 startupProbe → ④ 双实验对照 → ⑤ 到底怎么配 + 预算算术

---

## 第 1 课：一桩冤案

新角色很典型：老旧 Java 应用，进程一起来就慢悠悠初始化——加载配置、预热缓存——**要整整 90 秒**才在 80 端口开始服务。这次探针端口**没配错**：应用最终真会在 80 服务，livenessProbe 也查 80，参数全是默认值（`delay=0s`、`period=10s`、`failureThreshold=3`）。

> **🧑‍🏫 老师：** t=30 秒时，kubelet 会做什么？这个健康的慢应用，能活着等到 t=90s 开始服务的那一刻吗？
>
> **🧑‍🎓 学生：** 因为配置了liveness 超过30秒了，就会被重启，所以这个服务永远起不来了

判决书学生自己念出来了，行刑时刻表：

```text
t=0s    检查① connection refused（80 还没人听——应用在初始化，这不是病）
t=10s   检查② refused
t=20s   检查③ refused → 连败 3 次 → Killing
t=21s   重启 → 初始化从零开始 → 又要 90 秒 → 又被杀……
```

应用完全健康，只是慢——但它永远活不到 t=90s。每轮重启重演同一出戏，退避等待逐轮翻倍：CrashLoopBackOff，罪名是「启动太慢」。

## 第 2 课：initialDelaySeconds 平反未遂

describe 参数行里有一根现成的旋钮：

```text
Liveness:  http-get http://:8080/  delay=0s  timeout=1s  period=10s  ...
```

> **🧑‍🏫 老师：** 那个 `delay=0s`——改成 `delay=120s`，检查时间表会怎么变？
>
> **🧑‍🎓 学生：** 那么就是先等120秒后，然后再开始每次10秒的检查，失败3次则判定为重启

对——容器先安静跑 120 秒，时间到才开始「每 10 秒一查、连败 3 次杀」。应用 t=90s 已开始服务，t=120s 第一次检查就通过。**冤案平反，应用活了下来。**

但这根旋钮有个坏味道：120 是拍脑袋的魔法数字。老板随即带来两条硬性要求：

- **① 冷启动容忍**：周一加载大缓存，启动最长可能 5 分钟；平常 90 秒
- **② 卡死红线**：应用**启动完成之后**卡死，必须 30 秒内发现并处理

> **🧑‍🎓 学生：** 冷启动容忍，我觉得就应该设置5分钟，但是卡死红线这个，如果系统卡死了，也就是readniess不通，就被移除IP了，如何30秒内发现？不知道了

想借 readiness 逃生——被学生自己的分工表挡了回去：readiness 除名只是「不再给流量」，是止血；卡死的容器依然没人重启。红线要的是「发现并**处理**」，处理 = 重启 = liveness 的活。**名单归 readiness，生死归 liveness。**

把矛盾钉成算术：delay=300 保住了周一，但平常日 t=90s 启动完成、t=100s 卡死时，liveness 要到 t=300s 才睁眼，t=330s 才动手——红线 30 秒，超了 7 倍。反过来设 90 秒，周一立刻重演冤案。

> 一根 delay 旋钮伺候不了两个主人：启动阶段要宽容，启动之后要狠辣。

## 第 3 课：发明题

> **🧑‍🏫 老师：** 把设计权给你。你会设计成几根探针？各管哪个阶段？什么时候换岗？
>
> **🧑‍🎓 学生：** 那我应该得设置不同的探针了，启动的时候有一类，启动完成后新的探针来接管，各管各的阶段

学生刚刚自己发明了它——k8s 里真实存在，名字就是 **startupProbe**。[官方文档](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)一句话和这个发明逐字吻合：

> *"Once the startup probe has succeeded once, the liveness probe takes over to provide fast response to container deadlocks."*
> （startup 探针成功一次之后，liveness 接管，恢复对卡死的快速死刑。）

完整机制：

| 阶段 | 谁在岗 | 参数性格 | 结果 |
|---|---|---|---|
| 启动期（0 ~ 起来为止） | **startupProbe** | 宽容：`failureThreshold × periodSeconds` = 启动预算 | 预算内失败不杀；一直不成功 → 预算耗尽后杀，交给 restartPolicy |
| 启动完成之后 | livenessProbe 接管 | 狠辣：`3 × 10s` | 卡死 30 秒内处决 |

两条红线同时满足：周一冷启动有 5 分钟预算，平常日卡死 30 秒内处理——**不用再拍任何魔法数字**。

## 第 4 课：双实验对照

用 `sh -c "sleep 90 && exec nginx -g 'daemon off;'"` 假扮慢 Java 应用（nginx:alpine 前先睡 90 秒）。

### 实验一：冤案复现（slow-a，liveness 默认参数）

完整创建命令（`--command --` 后面整段是假扮慢应用的启动命令）：

```bash
kubectl run slow-a --image=nginx:alpine \
  --command -- sh -c "sleep 90 && exec nginx -g 'daemon off;'" \
  --dry-run=client -o yaml > slow-a.yaml
# 编辑 slow-a.yaml：容器字段下加 livenessProbe（httpGet :80，全默认参数）
kubectl apply -f slow-a.yaml
kubectl describe pod slow-a
```

```text
Warning  Unhealthy  25s (x3 over 45s)  Liveness probe failed:
Get "http://10.244.0.19:80/": dial tcp 10.244.0.19:80: connect: connection refused
Normal   Killing    25s               Container app failed liveness probe, will be restarted
```

死刑时间表分毫不差：3 次失败 → Killing（t≈31s）。但真实数据冒出一个**预测之外的知识点**——Killing 下令后快照里 `RESTARTS 0`、容器还活着。用同一条命令连续取证：

```bash
kubectl get pod slow-a
```

```text
slow-a   1/1   Running   1 (31s ago)   92s     ← t=61s 死刑已执行，sleep 重演
slow-a   1/1   Running   6 (96s ago)   7m37s   ← 退场前：7 分半被杀 6 次，冤案循环播放
```

> **Killing ≠ 立刻死。** kubelet 先发温和信号（SIGTERM），默认给 **30 秒宽限期**（`terminationGracePeriodSeconds`）清理现场；不理会就强杀（SIGKILL）。我们的 `sh → sleep` 不理会 TERM，于是死刑精确执行于 t=61s（31s 下令 + 30s 宽限）——算术严丝合缝。

### 实验二：平反（slow-b，+ startupProbe 300 秒预算）

同一个慢应用，加上 `startupProbe: failureThreshold: 30, periodSeconds: 10`：

```bash
# slow-b.yaml = 同一个应用 + startupProbe（完整 yaml 见第 5 课）
kubectl apply -f slow-b.yaml
kubectl get pod slow-b
kubectl describe pod slow-b
```

```text
slow-b   1/1   Running   0     116s

Warning  Unhealthy  25s (x9 over 105s)  Startup probe failed:
Get "http://10.244.0.20:80/": dial tcp 10.244.0.20:80: connect: connection refused
```

t≈90s nginx 起来，下一次检查通过，事件归于沉默。对照表：

| | slow-a（无 startup） | slow-b（学生发明版） |
|---|---|---|
| 启动期失败 | 3 次 → 杀 | **9 次，无人动手** |
| t=116s | 已死 1 次，sleep 重演 | `Running 0`，nginx 已在服务 |
| 谁在值班 | liveness（3 次动手） | startupProbe（预算 30 只花到 9） |

> **🧑‍🏫 老师：** 收题——连败 9 次，为什么 slow-b 没被杀？
>
> **🧑‍🎓 学生：** 因为启动的时候，归startupProbe管，这里还没有超时

## 第 5 课：到底怎么配（课后学生追问「你没说」）

三员同框的原装 yaml，逐行注解：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: slow-b
spec:
  containers:
  - name: app
    image: nginx:alpine
    command: ["sh", "-c", "sleep 90 && exec nginx -g 'daemon off;'"]
    startupProbe:              # ← 和 livenessProbe 平级，缩进在【容器】下面
      httpGet:                 #    检查方式三选一：httpGet / tcpSocket / exec
        path: /                #    ——和另外两员完全同款机制
        port: 80
      failureThreshold: 30     # 预算次数 ┐
      periodSeconds: 10        # 查询间隔 ┘ 30 × 10 = 300 秒启动预算
    livenessProbe:             # startup 成功一次后，它接班
      httpGet:
        path: /
        port: 80
      failureThreshold: 3      # 狠辣模式：30 秒内判死
      periodSeconds: 10
```

配置心法三句：

1. **预算是一道乘法**：`failureThreshold × periodSeconds ≥ 应用最坏启动时间`，别背数字，现场算
2. **检查方式三员通用**：会一个 httpGet，三个探针就都会配
3. **配了 startupProbe 就别再配 initialDelaySeconds**——它俩是同一个问题的两代答案，新的就是来取代旧的

考场记不清字段名，问集群（cka-02 教过的自助工具）：`k explain pod.spec.containers.startupProbe`。

预算算术当堂验过一遍（应用最坏 8 分钟启动，period 用默认 10s，`failureThreshold` 至少多少）：

> **🧑‍🎓 学生：** 24
>
> **🧑‍🏫 老师：** 拆小——8 分钟 = 多少秒？
>
> **🧑‍🎓 学生：** 8*60
>
> **🧑‍🏫 老师：** 480。每 10 秒查一次，预算要盖住 480 秒——至少多少？
>
> **🧑‍🎓 学生：** 48

**480 ÷ 10 = 48** ✓。首答 24 错在没换算单位，拆到那一步立刻就通了——这个瞬间照例保留。生产上习惯再放宽（比如 50）留冷启动余量。

## 本篇小结

- 探针家族三员到齐：

| 探针 | 值班阶段 | 参数性格 | 失败后果 |
|---|---|---|---|
| startupProbe | 启动期（成功一次即退役） | 宽容：预算 = `failureThreshold × periodSeconds` | 预算耗尽才杀 |
| readinessProbe | 全生命周期 | 就事论事 | 只除名，不杀（READY 列） |
| livenessProbe | startup 退役后接管 | 狠辣：`3 × 10s` | 杀（RESTARTS 列） |

- initialDelaySeconds 的死穴：一根旋钮伺候不了「启动宽容 / 启动后狠辣」两个主人
- Killing ≠ 立刻死：默认 30 秒宽限期（`terminationGracePeriodSeconds`），TERM 不理才 KILL——slow-a 的死刑时刻 t=61s 精确验证
- 本篇最值的一笔：startupProbe 是学生先发明、后认识的——官方文档只是盖章

➡️ 下一篇：[《名单的另一半——label 与 selector》](/云原生/cka/cka-09-label-selector)
