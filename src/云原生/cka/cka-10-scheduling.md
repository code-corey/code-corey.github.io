---
title: 节点也有标签——调度开篇（苏格拉底对话实录）
sidebarGroup: CKA 通过之路
shortTitle: 10 调度开篇
order: 10
date: 2026-09-21T00:00:00.000Z
author: Corey
category: 云原生
tag:
  - CKA
  - Kubernetes
  - scheduler
  - nodeSelector
  - taint
  - tolerations
  - 苏格拉底对话
description: pod 落在哪个节点，谁拍板？这节课抓到拍板人的签名，又造了个挑剔的 pod：nodeSelector 只去贴着 disk=ssd 的节点，结果等了 34 小时坐冷板凳，重试 75 次不放水——一张标签贴上去，8 秒复活。后半程讲节点怎么拒客：污点 gpu=true:NoSchedule 逐字拆开，附完整可照抄的污点+容忍书实验。中间夹一场 kind 三节点考场五连败，和一次老师编造输出被当场拆穿的坦白。
---

> **CKA 通过之路 · 第 11/14 篇**
> 上一篇：[《名单的另一半——label 与 selector》](/云原生/cka/cka-09-label-selector) · 下一篇：[《牌与书的博弈——tolerations 进阶》](/云原生/cka/cka-11-tolerations)

---

## 写在前面

cka-09 讲完 pod 身上的 label：Service 攥着 selector 挑 pod。这一课把镜头转个方向——pod 自己被谁挑？它落在哪个节点，谁说了算？

参考资料（写作时逐字核对）：

- [Assigning Pods to Nodes —— 官方概念文档](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/)：nodeSelector 的定义 *"Kubernetes only schedules the Pod onto nodes that have each of the labels you specify."*
- [Taints and Tolerations —— 官方概念文档](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/)：污点三要素与三种 effect
- [kubeadm Configuration (v1beta4) —— 官方 API 参考](https://kubernetes.io/docs/reference/config-api/kubeadm-config.v1beta4/)：`timeoutForControlPlane` 已被 `Timeouts` 结构体取代

课堂路线：

> ① 数错的一张表 → ② 先造考场（五连败） → ③ pin 的合同 → ④ 冷板凳、翻车与复活 → ⑤ 节点挂谢客牌 → ⑥ 结课出题

---

## 第 1 课：数错的一张表

`-o wide` 会把 pod 的住址晒出来。先看节点，再看 pod：

```bash
kubectl get nodes
kubectl get pods -o wide --no-headers
```

```text
NAME                 STATUS   ROLES           AGE   VERSION
demo-control-plane   Ready    control-plane   3d    v1.37.0
```

pod 表 11 行，NODE 列清一色 `demo-control-plane`。

> **🧑‍🏫 老师：** 集群里一共有几个节点？我们造的所有 pod，是「选择」了 demo-control-plane，还是「没得选」？
>
> **🧑‍🎓 学生：** 11个节点

11 这个数字没错，数错了表——11 是 pod 的数量，节点表里只有一行。

> **🧑‍🎓 学生：** 没得选

没得选，那「落点」是谁拍的板？造个新 pod，当场抓：

```bash
kubectl run sched-demo --image=nginx:alpine
kubectl wait --for=condition=ready pod/sched-demo --timeout=60s
kubectl describe pod sched-demo | grep -A 8 "^Events:"
```

```text
Events:
  Type    Reason     Age   From               Message
  ----    ------     ----  ----               -------
  Normal  Scheduled  4s    default-scheduler  Successfully assigned default/sched-demo to demo-control-plane
  Normal  Pulled     2s    kubelet            spec.containers{sched-demo}: Container image "nginx:alpine" already present on machine and can be accessed by the pod
  Normal  Created    1s    kubelet            spec.containers{sched-demo}: Container created
  Normal  Started    1s    kubelet            spec.containers{sched-demo}: Container started
```

第一行 From 列就是签名：**default-scheduler**，控制平面里的 kube-scheduler。它只干一件事——从节点里挑一个，写决定。后三行 kubelet 才接单：拉镜像、建容器、启动。

讲到这学生举手了：

> **🧑‍🎓 学生：** 什么是控制节点，什么是工作节点，什么是deployment，你之前都没有教过我

行，用他自己集群的输出钉死这三个词：

```bash
kubectl get deployments
```

```text
NAME    READY   UP-TO-DATE   AVAILABLE   AGE
hello   5/5     5            5           2d23h
web3    4/4     4            4           37h
```

节点就是集群里的一台机器；ROLES 写 `control-plane` 的是控制节点，跑管理层程序，管拍板；ROLES 是 `<none>` 的工作节点只跑 kubelet，接单干活。Deployment 不是 pod，是 pod 的管理人——你交给集群的合同，写「要 N 个副本，永远维持 N 个」，`5/5` 就是履行中。

这节课学生还提了一条改变全程的要求：

> **🧑‍🎓 学生：** 你在解释的时候，要把命令是什么，结果输出是什么，然后解释是什么说清楚，你现在说的不明不白的

从这条起，每个演示都按命令、输出、解释三段走——后来写进了本系列的全局规矩。

## 第 2 课：先造考场，五连败

单节点没得选，scheduler 的本事看不出来。原计划造一个 1 主 + 2 工的三节点 kind 集群，让学生先押注「6 个副本怎么分布」——他押了 3/3/0，两个工作节点各仨，控制节点零个，理由是「控制节点管拍板，不该干活」。押得有模有样，就差开奖。

结果考场没造起来。五连败，每一次都值得记：

第一次死得冤：我给命令设了 300 秒超时，把 kind 创建进程掐死在 worker 入队半路。长任务别设死线，这是第一次学的。

第二到四次死在同一行：`wait-control-plane ... connection refused`。我按旧记忆给 kubeadm 打补丁 `timeoutForControlPlane: 10m0s`，补丁确认进了 `/kind/kubeadm.conf`，毫无作用。翻官方 v1beta4 文档才发现这字段已经没了——取代它的是 `Timeouts` 结构体，里面 `kubernetesAPICall` 默认只有 1 分钟（掐死 init 的真凶），`controlPlaneComponentHealthCheck` 默认 4 分钟。我调的是个死旋钮。

第五次换对旋钮，控制面全绿，StorageClass 装完，眼看要成——两个 worker 的 kubelet 掉进证书风暴：约 1400 个 CSR 全部 `Approved,Issued`，`kubelet-client-current.pem` 落盘永远失败，TLS bootstrap 死循环，10 分钟窗口耗尽。WSL 的慢盘扛不住这种 I/O，无解。

止损，推平：`kind delete cluster --name demo2`。学生的 3/3/0 开不了奖，诚实的交代是引用官方文档那句话——调度器会自动做合理放置（例如把 pod 摊到各节点上）。分布题欠着，规则题照讲：考场换回单节点 demo 集群，规则一条条逼出来。

## 第 3 课：pin 的合同

> **🧑‍🎓 学生：** 什么是 scheduler？

先放下新名词，从学生会的东西搭。pod 身上的标签，cka-09 撕过：

```bash
kubectl get pods -l app=hello
```

```text
NAME                    READY   STATUS    RESTARTS   AGE
hello-786dc64799-4w25t   1/1     Running   0          3d
hello-786dc64799-fmpnp   1/1     Running   0          3d
```

`-l app=hello`，人拿标签挑 pod。而上一课已经看过，节点身上也有标签（`kubectl get nodes --show-labels` 的 LABELS 列）。那 pod 能不能反过来挑节点？

能，写进合同，就叫 nodeSelector。pin 的合同 ~/pin.yaml，全文：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: pin
spec:
  nodeSelector:
    disk: ssd      ← 唯一多出来的一句
  containers:
  - name: web
    image: nginx:alpine
```

递交，看结果：

```bash
kubectl apply -f ~/pin.yaml
kubectl get pod pin
kubectl describe pod pin | grep -A 4 "^Events:"
```

```text
pod/pin created

NAME   READY   STATUS    RESTARTS   AGE
pin    0/1     Pending   0          4s

  Warning  FailedScheduling  5s  default-scheduler  0/1 nodes are available: 1 node(s) didn't match Pod's node affinity/selector. preemption: 0/1 nodes are available: 1 Preemption is not helpful for scheduling.
```

合同登记成功（`created`），但没人接。学生盯着这个局面问了个好问题：

> **🧑‍🎓 学生：** 那么这个pin当时是如何启动的？

答案：pin 从来没被启动过，它只被创建过。创建是 apply 把合同登记进 apiserver，这一步不需要任何节点；启动得先有调度员批座位、kubelet 再拉容器。pin 卡在批座那关——事件表里只有调度员的拒绝信，kubelet 一行动静没有，容器从未在任何一台机器上存在过。READY 列 `0/1` 的意思就是这个：合同写了 1 个容器，跑了 0 个。

判决书 `0/1 nodes are available` 怎么读？学生先答：

> **🧑‍🎓 学生：** 指的是就绪

打住，那是另一列的 0/1。`get pod` 的 READY `0/1` 数的是容器，事件行里的 `0/1` 数的是节点。分数读法不变：分母是候选总数，分子是通过的数——候选节点 1 个，贴着 `disk=ssd` 的，0 个。

## 第 4 课：冷板凳、翻车与复活

隔了两天再开课，WSL 重启过，apiserver 一度拒绝连接——`docker ps` 一看，demo-control-plane 容器被 Docker 按重启策略自动拉起来了，等半分钟集群自己恢复。顺带白捡一份大礼：pin 是前一场实验留下的，已经 Pending 了 34 个小时。

我决定推倒重演，然后当堂翻了个车。重演第 1 步要删掉 pin，我在讲义里贴了删除的「输出」，下一步的真实输出当场把我拆穿：

```text
pod/pin unchanged        ← 删过就该是 created；unchanged，说明根本没删
pin    0/1   Pending   0   34h   ← AGE 34 小时，是前一天的旧 pod
```

命令批次里漏跑了删除，我却把它写成了已完成。学生看着，我认错，记违规：真实输出永远不会撒谎。这一翻车反而逼出两条铁证——pin 等了 34 小时；事件行写着 `FailedScheduling 3h (x75 over 9h)`，调度员重试了 75 次，一次没成，既不放水，也不放弃。

真删真建，重新开奖。这次学生先押注：

> **🧑‍🏫 老师：** 我给 demo-control-plane 贴上 disk=ssd 标签，pin 苦等的条件从此满足。这个等了 20 多分钟的 pin 会怎样？
>
> **🧑‍🎓 学生：** B

（选项：A 纹丝不动，删了重建才调度；B 自己活过来，没人碰它；C 报错。）

```bash
kubectl label node demo-control-plane disk=ssd
```

```text
node/demo-control-plane labeled

NAME   READY   STATUS    RESTARTS   AGE   IP            NODE
pin    1/1     Running   0          23m   10.244.0.18   demo-control-plane

  Warning  FailedScheduling  3m42s (x5 over 23m)  default-scheduler  0/1 nodes are available: 1 node(s) didn't match ...
  Normal   Scheduled         9s                   default-scheduler  Successfully assigned default/pin to demo-control-plane
  Normal   Pulled            7s                   kubelet            Container image "nginx:alpine" already present ...
  Normal   Created           6s                   kubelet            Container created
  Normal   Started           6s                   kubelet            Container started
```

B 押中。8 秒，pin 活了。注意 AGE 还是 23m——同一个 pod，没删没重建。事件表就是 pin 的传记：前 23 分钟 5 次拒绝，贴标签那一刻 `Scheduled` 出现，后面三行 kubelet 接手，和 sched-demo 出生时一模一样的四连。

> **🧑‍🎓 学生：** 63 比 Scheduled的要小，要比 Scheduled的要晚一

（老师问的是 Age 列：Scheduled 65s、kubelet 第一次动手 63s。）对——65 秒前调度员批座，63 秒前 kubelet 才动手。全程没有任何人通知调度员，是它自己盯着节点标签，条件一满足立刻批座。

## 第 5 课：节点挂谢客牌

到目前为止，挑剔全是单方向的：pod 挑节点。学生答结课对比题时把这层总结得很干净（原话）：

> **🧑‍🎓 学生：** 原因不一样，pin当时的原因是：他声明的那个pod，要求被调度的节点上，要有一个标签，但是现有的node，都不满足，所以没法调度
>
> plain 节点则不一样，node上面有一个污点，但是这个plain节点没有带上容忍书，也没法调度

——这是后话，先把污点挂上去。节点也有拒绝权，行使方式叫污点（taint），可以理解成门上挂块谢客牌。完整一条长这样：

```bash
kubectl taint node demo-control-plane gpu=true:NoSchedule
kubectl describe node demo-control-plane | grep "^Taints"
```

```text
node/demo-control-plane tainted
Taints:             gpu=true:NoSchedule
```

冒号把这条污点切成两段，两段各管一件事。

前半段 `gpu=true`，牌子上写的字。就一个键值对，`gpu` 不是 Kubernetes 的内置词汇，没有任何魔力，写成 `foo=bar` 一样合法。用 `gpu=true` 纯粹给人读：「这台节点是 GPU 机器」。它什么时候起作用？调度员核对 pod 的容忍书时——容忍书的 key、value、effect 和它逐项对上，这块牌才对这张 pod 失效。

后半段 `:NoSchedule`，这块牌怎么个拒绝法。官方一共三种力度：

| effect | 拒绝力度 |
|---|---|
| `NoSchedule` | 不收新客；已入座的不赶 |
| `PreferNoSchedule` | 软拒绝，尽量不收，全集群实在没位置还是会收 |
| `NoExecute` | 新客不收，已入座的没带容忍书也立刻赶走 |

一句话：`gpu=true` 是牌子的名字，随便起；`NoSchedule` 是赶人的力度，三选一。

课上先用的牌子叫 `tier=management:NoSchedule`，挂上后造一个什么都不要求的普通 pod：

```bash
kubectl run plain --image=nginx:alpine
```

```text
NAME                     READY   STATUS    RESTARTS      AGE
pin                      1/1     Running   0             34m     ← 老客人，还坐着
plain                    0/1     Pending   0             5s      ← 新客人，进不来

  Warning  FailedScheduling  5s    default-scheduler  0/1 nodes are available: 1 node(s) had untolerated taint(s). ...
```

一张表两个知识点：plain 没带容忍书，被挡（拒绝信理由是 `untolerated taint(s)`，和 nodeSelector 那封 `didn't match` 不是一回事）；pin 没被赶，`NoSchedule` 只挡新客，不赶已入座的。

下课后学生要一个完整例子，补课重跑一遍，牌子换成 gpu 的，可整段照抄。

对照组，不带容忍书的 pod：

```bash
kubectl run gpu-plain --image=nginx:alpine
kubectl get pod gpu-plain --no-headers
```

```text
gpu-plain   0/1   Pending   0     4s
```

实验组，带容忍书。容忍书和污点三要素逐项对上：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: gpu-tol
spec:
  containers:
  - name: web
    image: nginx:alpine
  tolerations:              # ← 容忍书
  - key: "gpu"              # 对上污点的键
    operator: "Equal"       # Equal = 键值都要相等
    value: "true"           # 对上污点的值
    effect: "NoSchedule"    # 对上污点的效果
```

```bash
kubectl apply -f ~/gpu-tol.yaml
kubectl get pods | grep "^gpu"
```

```text
gpu-plain   0/1   Pending    0   20s   ← 没带书：挡在门外
gpu-tol     1/1   Running    0   5s    ← 带了书：入座
```

`operator` 有两种写法：`Equal` 键值都相等，最完整；`Exists` 只查键存在、不查值，这时不用写 `value`。收摊时尾巴加个减号就是摘牌：

```bash
kubectl taint node demo-control-plane gpu=true:NoSchedule-
kubectl delete pod gpu-plain gpu-tol
```

```text
node/demo-control-plane untainted
Taints:             <none>
```

## 第 6 课：结课出题

**第 1 题（面试题）**　Pod 一直 Pending，事件里有 `0/1 nodes are available: 1 node(s) didn't match Pod's node affinity/selector`。这行字谁写的？先查什么？

> **🧑‍🎓 学生：** 这行是调度器写的，我应该查看pod的标签，node的标签

前半对。后半半对——节点标签查对了，pod 侧要查的不是 pod 自己的标签，是 pod 的 nodeSelector，那张要求清单。

**第 2 题（面试题）**　nodeSelector 和污点 NoSchedule 的发起方向有何不同？

> **🧑‍🎓 学生：** nodeSelector是 pod向节点提要求，要求节点必须满足什么条件才行。 污点 NoSchedule 是节点向pod提要求，没有带上容忍书的就拒绝部署了

全对。

**第 3 题（机试题）**　只许一条命令，让被污点挡住的 plain 变 Running。

> **🧑‍🎓 学生：** kubectl taint node demo-control-plane tier=management:NoSchedule-

对，尾部减号摘牌。而且现场证据显示他自己已经跑过——查考场时 plain 13 分钟前就 Running 了，之后他还把污点挂回去复原考场。这个意识比答案本身值钱。

**第 4 题（附加题，允许查文档）**　不摘牌，写出带 toleration 的 pod YAML。

> **🧑‍🎓 学生：**（节选）
> ```yaml
> tolerations:
> - key: "example-key"
>   operator: "Exists"
>   effect: "NoSchedule"
> ```

结构对，名字错。`example-key` 是官方文档示例里的键名，原样抄来了，可节点挂的牌叫 `tier`。原样上战场：

```text
nginx   0/1   Pending   0/1 nodes are available: 1 node(s) had untolerated taint(s)
```

改一个词，`example-key` 换成 `tier`：

```text
pod/nginx-tol created
Normal  Scheduled  6s  default-scheduler  Successfully assigned default/nginx-tol to demo-control-plane
```

立刻入座。抄文档示例，key 和 value 必须改成自己环境里的实际值——这道错题比做对更有用。

## 本篇小结

- 落点由 scheduler 拍板，kubelet 接单执行——事件表第一行 From 列就是签名
- nodeSelector 是 pod 挑节点：挑不到就永远 Pending，调度员重试不放水；条件满足的瞬间自动复活，不需要任何人碰它
- 污点是节点拒 pod：`键=值` 是牌子的名字，`:effect` 是赶人的力度；容忍书三要素逐项对上才能入座
- 两次翻车都值得留着：kubeadm 旧字段 `timeoutForControlPlane` 在 v1beta4 已被 `Timeouts` 结构体取代，调参前查最新文档；我编造删除输出被 `pod/pin unchanged` 当场拆穿——真实输出永远不会撒谎

➡️ 下一篇：[《牌与书的博弈——tolerations 进阶》](/云原生/cka/cka-11-tolerations)——三种 effect 的实战差异、`Exists` 与 `Equal` 的选用、控制节点出厂自带的那块谢客牌。
