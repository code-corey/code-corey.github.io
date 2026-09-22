---
title: 名单的另一半——label 与 selector（苏格拉底对话实录）
sidebarGroup: CKA 通过之路
shortTitle: 09 label 与 selector
order: 9
date: 2026-09-19T00:00:00.000Z
author: Corey
category: 云原生
tag:
  - CKA
  - Kubernetes
  - label
  - selector
  - Service
  - 苏格拉底对话
description: kubectl expose 里没写过一个 pod 名字或 IP，Service 的转发名单却精确收编了该收的 pod——悬案一节课告破：pod 胸口贴 label，Service 手里攥 selector，expose 的 selector 是从 deployment 身上抄来的。撕标签实验证明：健康的 pod 身份不对照样出局；外加一位「影子同学」在同集群做同款实验的真实碰撞。
---

> **CKA 通过之路 · 第 10/11 篇**
> 上一篇：[《慢启动的冤案——startupProbe》](/云原生/cka/cka-08-startup-probe) · 下一篇：[《节点也有标签——调度开篇》](/云原生/cka/cka-10-scheduling)

---

## 写在前面

cka-04 埋过一桩悬案：`kubectl expose` 创建 Service 时，命令里**没有任何一个 pod 名字、任何一个 IP**，可 endpoints 名单精确收编了该收的 pod。cka-05 又留了半个悬念：readiness 探针只是名单的「体检关」。这一课把整个谜底挖出来——**label 与 selector**。

参考资料（写作时逐字核对）：

- [Labels and Selectors —— Kubernetes 官方概念文档](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/)：原文定调 *"The label selector is the core grouping primitive in Kubernetes."*
- [Service —— 官方概念文档](https://kubernetes.io/docs/concepts/services-networking/service/)：selector 与 endpoints 机制

课堂路线：

> ① 一桩悬案（看实物） → ② describe 找到名单的另一半 → ③ 撕标签实验（撞上影子同学） → ④ 收大题：进名单的两个条件 → ⑤ 全案重演，结案

---

## 第 1 课：一桩悬案

开场先把悬案念一遍——cka-04 那天跑过的命令：

```bash
kubectl expose deployment hello --port=80 --type=NodePort
```

> **🧑‍🏫 老师：** 这条命令里没有任何 pod 的名字、没有任何 IP——Service 的名单是从哪来的？它怎么知道该收谁？
>
> **🧑‍🎓 学生：** 这条命令我都忘记是用来干什么的了

忘了正常——不上课，直接看实物。集群里那个 Service 还活着，而且这次多看一样新东西：pod 的**标签列**。完整命令三连（注意第三条多了 `--show-labels`）：

```bash
kubectl get svc hello
kubectl get endpoints hello
kubectl get pods --show-labels
```

```text
NAME    TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)   AGE
hello   ClusterIP   10.96.142.196   <none>        80/TCP    2d20h

NAME    ENDPOINTS                                                 AGE
hello   10.244.0.12:80,10.244.0.13:80,10.244.0.3:80 + 2 more...   2d20h

NAME                       READY   STATUS    ...   LABELS
hello-786dc64799-fmpnp     1/1     Running   ...   app=hello,pod-template-hash=786dc64799
hello-786dc64799-h2mqt     1/1     Running   ...   app=hello,pod-template-hash=786dc64799
（web3 的 4 个、app1、probe-test 一个都没进名单）
```

> **🧑‍🏫 老师：** 被收进名单的 5 个 pod，身上都贴着什么共同的东西？没被收编的为什么没有？
>
> **🧑‍🎓 学生：** 贴着app=hello这个标签

这就是 **label（标签）**——贴在 pod 身上的键值对。

## 第 2 课：名单的另一半

标签贴在 pod 身上，是被动的——它自己不找 Service。Service 那边必然写着另一半：一条**主动挑人的规则**。看它自己的自白书：

```text
$ kubectl describe svc hello
Name:                     hello
Selector:                 app=hello      ← 就是它
Type:                     ClusterIP
IP:                       10.96.142.196
```


完整命令（撕标签 → 看名单）：

```bash
kubectl label pod hello-786dc64799-fmpnp app-      # 标签名后加减号 = 撕掉
kubectl get endpoints hello                        # 撕完立刻看
```


> **🧑‍🎓 学生：** 这个pod会照常跑，名单 endpoints 会变成几个 IP，这个不懂怎么看

「不懂怎么看」——拆小成纯算术：名单现在 5 个，撕掉 1 个的标签，它不再匹配 selector，被踢出名单，剩几个？

> **🧑‍🎓 学生：** 那名单应该只剩下4个了

## 第 3 课：撕标签——撞上影子同学

完整实验命令（撕标签 → 看名单 → 贴回 → 再看）：

```bash
kubectl label pod hello-786dc64799-fmpnp app-       # 撕掉 app 标签
kubectl get endpoints hello                         # 撕完立刻看
kubectl label pod hello-786dc64799-fmpnp app=hello  # 贴回
kubectl get endpoints hello                         # 再看
```

第一轮实验的输出，乱得像闹鬼：

```text
=== 1. 撕掉 fmpnp 的 app=hello 标签 ===
label "app" not found.
pod/hello-786dc64799-fmpnp not labeled      ← 标签"本来就不在"？！

=== 2. 名单（撕完立刻看）===
hello   10.244.0.13:80,10.244.0.21:80,10.244.0.3:80 + 2 more...
                                    ↑ 陌生 IP，开场名单里没有它

=== 4. 把标签贴回去之后 ===
hello   10.244.0.12:80,10.244.0.13:80,10.244.0.21:80 + 3 more...   ← 6 个？！
```

预测说 5→4，实测 5→6。两种可能：机制错了，或者**实验室里进了别人**。取证三连（`-l` 按标签筛 pod、jsonpath 展开 `+N more` 里的完整名单、看 deployment 副本数）：

```bash
kubectl get pods -l app=hello -o wide
kubectl get endpoints hello -o jsonpath='{.subsets[0].addresses[*].ip}'; echo
kubectl get deployment hello
```

```text
=== 全部 app=hello 的 pod ===
恰好 5 个，全部贴着 app=hello
=== 名单完整 IP ===
10.244.0.3 / .4 / .6 / .12 / .13        ← 陌生 IP .21 已消失
=== deployment 副本数 ===
5/5
```

真相：**有位「影子同学」和我们在同一个集群做同一个实验**——他先撕了 fmpnp 的标签（所以我的撕标签命令报 not found），还放了个贴着 `app=hello` 的临时 pod（IP `.21`）在名单里充数，做完就删了。hello pod 身上那 6 次重启也都发生在 9 小时前，不是本课堂的手笔。

剥掉干扰项，学生的预测其实**全程命中**：fmpnp 没标签的那一刻，名单里确实没有它；pod 全程 `Running`。影子同学退场后干净重演一遍：

```text
fmpnp 的 IP = 10.244.0.12

名单 BEFORE：.3  .4  .6  .12  .13        （5 个）
    ↓ kubectl label pod fmpnp app-       （撕标签）
名单 AFTER ：.3  .4  .6  .13             （4 个 ← .12 精确出局 ✓）
pod 状态   ：1/1 Running  6 (9h ago)      （照常跑，重启数不增 ✓）
    ↓ kubectl label pod fmpnp app=hello   （贴回）
名单 FINAL ：.12 归位，回到 5 个 ✓
```

一个细节：贴回标签后的第一张快照里名单**还是 4 个**——endpoints 控制器传播需要一拍，复查已归位。这提醒我们：名单是控制器异步维护的，不是标签命令同步改的。顺带白捡一个字段：`notReadyAddresses`——名单的「候补席」，readiness 没过的 pod 躺在这里，体检通过才转正。

## 第 4 课：收大题——进名单的两个条件

把 cka-05 和本课合起来：

> **🧑‍🏫 老师：** 一个 pod 要出现在 Service 的名单里，必须**同时**满足哪两个条件？
>
> **🧑‍🎓 学生：** 首先是要标签一致，并且容器要启动成功才行

第一个条件满分。第二个差半格——cka-05 的 nginx 容器启动明明成功了（`Running`），凭什么进不了名单？

> **🧑‍🎓 学生：** 探针探测成功

到位。定格：

| 条件 | 精确说法 | 谁证明的 |
|---|---|---|
| ① 身份对 | pod 标签匹配 Service 的 **selector** | 本课撕标签实验：健康 pod，身份不对照样出局 |
| ② 身体行 | **readiness 探针通过**（READY 1/1） | cka-05：Running 但探错口，照样出局 |

名单要的是「名册对得上 + 体检过得了」，缺一不可。

## 第 5 课：全案重演

只剩最后一环：`expose` 命令里也没写过 `app=hello`，Service 的 selector 又是哪来的？

> **🧑‍🎓 学生：** 这里的几个概念不懂，你先把整个案例演示一遍

好——从零开始，全新应用 `web`，一步不跳。完整命令五连：

```bash
kubectl create deployment web --image=nginx:alpine --replicas=3          # ① 起步
kubectl get pods --show-labels                                            # ② 看标签
kubectl get deployment web -o jsonpath='{.spec.selector.matchLabels}{"\n"}{.spec.template.metadata.labels}{"\n"}'   # ③ 看 deployment 两处
kubectl expose deployment web --port=80                                   # ④ expose
kubectl get svc web -o jsonpath='{.spec.selector}'; echo                  # ④ 看 Service 的 selector
kubectl get endpoints web -o wide                                         # ⑤ 看名单
```

按序输出（关键列逐字）：

```text
=== ① create deployment（和 cka-01 一模一样的起步命令）===
deployment.apps/web created

=== ② pod 出生自带的标签（我没写过一个字）===
web-6bd469df5c-c9lg9   1/1  Running   app=web,pod-template-hash=6bd469df5c
web-6bd469df5c-rnwfs   1/1  Running   app=web,pod-template-hash=6bd469df5c
web-6bd469df5c-vgrgp   1/1  Running   app=web,pod-template-hash=6bd469df5c

=== ③ deployment 身上写着两处 app=web ===
第一处 selector.matchLabels：{"app":"web"}   ← deployment 用它认领 pod
第二处 template.labels：     {"app":"web"}   ← pod 的出厂标签

=== ④ expose → Service 的 selector ===
{"app":"web"}                                ← 抄 deployment 的

=== ⑤ 名单（selector 扫标签的结果）===
10.244.0.23  10.244.0.24  10.244.0.25       ← 恰好 3 个 pod 的 IP
```

完整故事线：

```text
kubectl create deployment web        ← 你只打了这一行
     │
     ├─ deployment 自动写两处 app=web：
     │    selector（我认领 pod）+ template.labels（pod 出厂自带）
     ▼
3 个 pod 出生，胸口贴着 app=web
     │
kubectl expose deployment web
     │
     └─→ Service 的 selector = app=web 【抄 deployment 的】← 悬案结案
             ▼
     扫描全 namespace 的 pod 标签 → 中标签者进名单
```

> **🧑‍🏫 老师：** 结案陈词，一句话：Service 的 selector 是从谁身上抄来的？
>
> **🧑‍🎓 学生：** 从 deployment身上抄来的

## 本篇小结

- **贴纸式组织法**：标签贴在资源身上，selector 写在管理者身上，谁配对谁进名单——[官方文档](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/)称 selector 为 k8s 的「核心分组原语」
- 四个概念各就各位：

| 概念 | 身份 | 一句话 |
|---|---|---|
| Deployment | pod 的管理人 | 身上写两处 `app=web`：selector 认领 pod，template 给 pod 发标签 |
| Pod label | 贴在 pod 胸口 | 出生自带，撕了 = 开除出名单 |
| Service selector | Service 的挑人规则 | expose 时从 deployment 抄来的 |
| endpoints 名单 | selector 扫标签的结果 | 流量照它转发，动态增减 |

- 考场提速技能：`kubectl get pods -l app=web`——`-l` 筛选贯穿所有资源（get/delete/describe 都吃），本课演示里它已反复出场
- 两个进阶脚注（考场够用，进阶再学）：①selector 有等值（`=`/`!=`）与集合（`in`/`notin`/`exists`）两型，**Service 只支持等值型**；集合型 `matchExpressions` 是 Deployment/Job 等的资源规格。②本课多处警告 `v1 Endpoints is deprecated in v1.33+`——现役对象是 EndpointSlice，考纲写 endpoints，命令行用法不变
- 本课最戏剧的一笔：影子同学同集群同实验的真实碰撞——预测与实测对不上时，先别怀疑机制，先取证（jsonpath 展开完整名单）排除干扰

➡️ 下一篇：[《节点也有标签——调度开篇》](/云原生/cka/cka-10-scheduling)
