---
title: READY 0/1 之谜——就绪探针与 connection refused（苏格拉底对话实录）
sidebarGroup: CKA 通过之路
shortTitle: 05 就绪探针与排障
order: 5
date: 2026-09-19T00:00:00.000Z
author: Corey
category: 云原生
tag:
  - CKA
  - Kubernetes
  - ReadinessProbe
  - 排障
  - 苏格拉底对话
description: 一个永远 READY 0/1、重启 0 次的 pod：用 describe 的事件读出探针默认参数，用 connection refused vs timeout 分清"没人听"和"路不通"，用 endpoints 除名闭环理解就绪探针存在的意义。
---

> **CKA 通过之路 · 第 6/17 篇**
> 上一篇：[《流量转发名单——Service 与 endpoints》](/云原生/cka/cka-04-service-endpoints) · 下一篇：[《提前课：docker -p 就是 DNAT——iptables 与 kube-proxy》](/云原生/cka/cka-06-dnat-iptables)

---

## 写在前面

上一篇的悬念：名单收 pod 除了 label 匹配还有什么条件。本篇的主角是同一个 Service 名单实验里一个故意做坏的 pod——它 Running 却永远 `READY 0/1`。参考资料：[Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)。

课堂路线：

> ① 两个 1 的含义（我答错了） → ② 8080 实验：永远 0/1 → ③ describe 读出探针默认参数 → ④ 修好：Forbidden 报错与字段定位 → ⑤ connection refused vs timeout → ⑥ endpoints 除名闭环

---

## 第 1 课：先问我"1/1 是什么"

老师开场只给了一行输出，问两个数分别是什么：

```text
NAME         READY   STATUS    RESTARTS   AGE
probe-test   1/1     Running   0          5m
```

> **🧑‍🎓 学生：** 第一个 1 表示容器数量，第二个 1 表示显示数量？不知道，我猜的。
>
> **🧑‍🏫 老师：** 后半句错了。`1/1` = **通过就绪检查的容器数 / 容器总数**。左边是"检查通过"，不是"存在"。这节课就造一个 0/1 的 pod，让左边这个数字归零。

## 第 2 课：8080 实验——永远 READY 0/1

实验对象制作三步（完整命令，nginx 实际监听 80，探针故意指向 8080）：

```bash
# 1. 生成草稿存成文件（第 3 篇的标准动作）
k run probe-test --image=nginx:alpine --port=80 --dry-run=client -o yaml > probe.yaml

# 2. 编辑 probe.yaml：在容器字段下加探针（加进去的段落见下）
# 3. 创建
k apply -f probe.yaml
```

第 2 步加进 probe.yaml 的探针段（注意 `readinessProbe` 与容器的 `name` 同级，挂在容器字段下）：

```yaml
spec:
  containers:
  - image: nginx:alpine
    name: probe-test
    readinessProbe:
      httpGet:
        path: /
        port: 8080        # ← 故意写错
```

> **🧑‍🏫 老师：** 先预测：pod 会是什么状态？（a）Running（b）CrashLoopBackOff（c）一直 ContainerCreating

我选了 b——容器坏了当然崩。apply 之后用同一条命令看两次（隔两分钟）：

```bash
k get pods
```

第 1 次（14 秒时）：

```text
NAME         READY   STATUS    RESTARTS   AGE
probe-test   0/1     Running   0          14s
```

第 2 次（2 分 13 秒时）：

```text
NAME         READY   STATUS    RESTARTS   AGE
probe-test   0/1     Running   0          2m13s
```

**Running、0/1、RESTARTS 恒为 0**。预测错在哪：nginx 容器本身好好的（它监听 80），崩的不是容器，是"就绪检查"一直不过。这个组合就是 readiness 探针失败的标准长相，看到即可判定：

- `Running` = 容器进程活着
- `0/1` = 就绪检查没通过
- `RESTARTS 0` = 没人重启它（重启是另一种探针的职责，后续课讲）

## 第 3 课：describe——事件里藏着一切

```bash
k describe pod probe-test
```

两段关键输出。Events 尾部：

```text
Events:
  Type     Reason     Age                  From     Message
  ----     ------     ----                 ----     -------
  Warning  Unhealthy  2m1s (x29 over 5m4s) kubelet  Readiness probe failed:
            HTTP request failed with status code 404
```

（另一次实验的变体：`Get "http://10.244.0.16:8080/": dial tcp 10.244.0.16:8080: connect: connection refused`——连不上时的原文，第 5 课拆。）

容器段落里还有一行被低估的输出——探针的**全部默认参数**：

```text
    Readiness: http-get http://:8080/ delay=0s timeout=1s period=10s #success=1 #failure=3
```

| 参数 | 默认值 | 含义 |
|---|---|---|
| delay | 0s | 容器启动后立刻开始查（v1.37 已无旧版 0 号延迟问题） |
| timeout | 1s | 每次探测超过 1 秒算失败 |
| period | 10s | 每 10 秒查一次 |
| #success | 1 | 连续成功 1 次算就绪 |
| #failure | 3 | **连续失败 3 次算未就绪**——所以刚 apply 那 30 秒是"还没攒够 3 次失败"的窗口 |

上面 `x29 over 5m4s` = 5 分钟里失败了 29 次，10 秒一次，对得上 period。

## 第 4 课：修好它——Forbidden 报错插曲

改探针端口 8080 → 80。第一次 apply 报错：

```text
Error from server (Forbidden): error when creating "probe.yaml": pods "probe-test" is forbidden:
Spec is immutable and a probe may only be added post-creation if it was initially set
```

第 3 篇结论重现：**裸 Pod 不可变**，探针事后加/改都不行，只能删了带新 yaml 重建：

```bash
k delete pod probe-test
k apply -f probe.yaml
```

```text
NAME         READY   STATUS    RESTARTS   AGE
probe-test   1/1     Running   0          42s
```

`1/1` 回来了——这次左边的 1 有了实感：**探针通过**。

## 第 5 课：connection refused vs timeout——我猜错的那次

老师指着报错原文问：`connection refused` 是什么意思？

> **🧑‍🎓 学生：** 8080 有防火墙，没有门。
>
> **🧑‍🏫 老师：** 恰恰相反。防火墙丢弃数据包的表现是**等很久然后 timeout**；refused 是"秒回"的明确拒绝——**机器说：这个端口上没有程序在听**。

| 报错 | 谁回应 | 速度 | 含义 |
|---|---|---|---|
| connection refused | 目标机器主动回 | 毫秒级 | **路是通的，端口没人听**（程序没起/端口写错/还没启动完） |
| connection timeout | 没人回应 | 秒级超时 | **包根本没到**（防火墙丢包/路由不通/IP 不存在） |

本案例 nginx 监听 80、探针敲 8080——8080 上没有任何程序，所以秒回 refused。排障速记：**refused 查端口，timeout 查网络**。

## 第 6 课：闭环——名单除名，流量不走

就绪探针失败的后果，回到第 5 篇的名单：

```bash
k expose pod probe-test --port=80
k get endpoints probe-test     # 0/1 期间
```

```text
NAME         ENDPOINTS   AGE
probe-test   <none>      30s
```

**容器 Running，却不在转发名单里**——发给 Service 的流量不会到它。修复成 1/1 后：

```text
NAME         ENDPOINTS         AGE
probe-test   10.244.0.16:80    2m
```

两个状态对照，就绪探针的存在理由完整了：

> 名单收人的条件 = **label 匹配 ∧ 就绪探针通过**。程序活着（Running）不等于能干活（Ready）——没就绪的 pod 不接流量，修好了自动回名单，全程无人操作。

## 自测（考试原题风格）

1. `READY 0/1` + `RESTARTS 0` + Running 持续 10 分钟 → 判定哪个探针失败？答：readiness（liveness 失败会重启、RESTARTS 涨）
2. 报错 `connection refused` 端口 8080，程序监听 80 → 改探针端口
3. 探针写进 metadata 报 `unknown field` → 字段路径定位法（第 3 篇）
4. `Readiness: ... #failure=3` → 连续 3 次失败才除名（period 10s）
5. Service endpoints `<none>` 两查 → label/selector 一致性 + pod Ready
6. describe 里事件排障三件套 → Events 的 Reason、计数、From（kubelet）

## 本篇小结

- `READY` 左数 = 通过就绪检查的容器数；0/1 + Running + RESTARTS 0 = readiness 失败标准长相
- describe 的 Readiness 行 = 探针全部默认参数；Events = 失败原因原文
- refused（秒回）查端口；timeout（干等）查网络
- 就绪探针的产出不是"重启"，是**进出名单**——没就绪不接流量

➡️ 下一篇：[《提前课：docker -p 就是 DNAT——iptables 与 kube-proxy》](/云原生/cka/cka-06-dnat-iptables)
