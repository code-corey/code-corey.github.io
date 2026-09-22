---
title: 流量转发名单——Service 与 endpoints（苏格拉底对话实录）
sidebarGroup: CKA 通过之路
shortTitle: 04 Service 与 endpoints
order: 4
date: 2026-09-19T00:00:00.000Z
author: Corey
category: 云原生
tag:
  - CKA
  - Kubernetes
  - Service
  - Endpoints
  - 苏格拉底对话
description: pod 生生死死 IP 一直变，谁来当稳定入口？expose 出一个 Service，围观 endpoints 名单随杀 pod 实时增删——外加一次 WSL 睡醒后 Unknown 状态的真实排障。
---

> **CKA 通过之路 · 第 5/11 篇**
> 上一篇：[《把配置和密码放进容器——ConfigMap 与 Secret》](/云原生/cka/cka-03-configmap-secret) · 下一篇：[《READY 0/1 之谜——就绪探针与 connection refused》](/云原生/cka/cka-05-readiness-probe)

---

## 写在前面

上一篇结尾的问题：pod 删了重建、扩容缩容、滚动更新，IP 每次都变——客户端总不能每次都改地址。答案就是 Service。参考资料：[Service 官方文档](https://kubernetes.io/docs/concepts/services-networking/service/)、[用 Service 暴露应用](https://kubernetes.io/docs/tutorials/services-networking/expose-intro/)。

课堂路线：

> ① 痛点实验：IP 会变 → ② expose 一个 Service → ③ 名单（endpoints）随杀 pod 实时变化 → ④ 名单谁在维护 → ⑤ WSL 睡醒 Unknown 插曲 → ⑥ 悬念：名单凭什么收人

---

## 第 1 课：痛点——pod 的 IP 靠不住

上一篇的 app1 有个集群内 IP（10.244 开头）。老师让我做一件事：

> **🧑‍🏫 老师：** 删掉 app1 重建，然后 describe 看新 IP。

完整操作（先看旧 IP，再删、重建、再看）：

```bash
k get pod app1 -o wide          # 重建前：IP 是 10.244.0.5
k delete pod app1
k apply -f app1.yaml
k get pod app1 -o wide          # 重建后：IP 变了
```

```text
NAME   READY   STATUS    RESTARTS   AGE   IP            NODE
app1   1/1     Running   0          15s   10.244.0.9    demo-control-plane
```

IP 从 `10.244.0.5` 变成了 `10.244.0.9`。**pod 的 IP 生命周期 = pod 本身**——自愈是新造一个（新 IP），滚动更新是新批次（新 IP），扩容是新成员（新 IP）。任何"把 IP 写死"的访问方式在 k8s 里都活不过一次重启。

## 第 2 课：expose——给一批 pod 一个固定入口

```bash
k expose deployment web3 --port=80 --target-port=80
k get svc
```

```text
NAME         TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE
kubernetes   ClusterIP   10.96.0.1      <none>        443/TCP   2d
web3         ClusterIP   10.96.72.219   <none>        80/TCP    5s
```

一条命令造出的 Service 核心信息：

- **CLUSTER-IP `10.96.72.219`**：一个固定不变的虚拟 IP，集群内任何 pod 都能用它访问 web3 这批 pod。它不附着在任何网卡上（底层原理见第 7 篇），但地址从创建起不再变
- **它怎么知道"这批 pod"是谁**：expose 时按 deployment 的 label 自动带出了 selector

```bash
k get svc web3 -o yaml | grep -A3 selector
```

```yaml
selector:
  matchLabels:
    app: web3
```

## 第 3 课：endpoints——流量转发名单

Service 只是入口，真正"名单"在另一个对象里：

```bash
k get endpoints web3
```

```text
NAME   ENDPOINTS                                           AGE
web3   10.244.0.10:80,10.244.0.11:80,10.244.0.12:80 + 2 more...
```

4 个副本 = 名单 4 个 IP。老师当场实验：杀一个 pod，名单立刻少一个、又补回一个：

```bash
k delete pod web3-6d8d76cbb-xxxxx
k get endpoints web3
```

```text
web3   10.244.0.10:80,10.244.0.13:80,10.244.0.12:80 + 1 more...
```

我的原话提问：

> **🧑‍🎓 学生：** 为什么只有一条？——第一次看 endpoints 时我以为它是一行地址。老师说**这是列表截断显示**，`+ 2 more...` 表示后面还有 2 个，`k get endpoints web3 -o wide` 或 `-o yaml` 能看全。

**发往 ClusterIP 的流量，实际被转发到名单里的某个 IP:80**。杀 pod：旧 IP 出名单、新 IP 进名单，全程 ClusterIP 不动。这就是"稳定入口"的机制——不神秘，就是一份实时名单 + 转发。

## 第 4 课：名单谁在维护

> **🧑‍🏫 老师：** 猜一下：你 delete pod 那一刻，是谁把名单改了？

不是 Service 自己。答案和第 3 篇 Deployment 的循环同款——**k8s 里一切"自动"都是控制循环**（[Service & Endpoints 控制器](https://kubernetes.io/docs/concepts/services-networking/service/#endpoints)）：

```text
控制循环 A（Deployment 控制器）：pod 挂了 → 补一个新 pod
控制循环 B（Endpoints 控制器）：盯着所有 pod 的 IP 和 label
    → IP 变了 / 新 pod 的 label 匹配 selector → 名单实时增删
```

selector 是两者的连接点：**label 匹配 selector 的 pod，其 IP 自动进名单；不匹配的自动出名单**。这也解释了 Service 的一个经典排障点——`endpoints` 显示 `<none>`，先查两件事：pod 的 label 和 svc 的 selector 是否一致、pod 是否 Ready（下一篇主角）。

## 第 5 课：插曲——WSL 睡醒后 pod 全变 Unknown

一次真实事故：第二天回来 `k get pods`：

```text
NAME                   READY   STATUS    RESTARTS      AGE
app1                   0/1     Unknown   0             20h
web3-6d8d76cbb-2nwjb   0/1     Unknown   2 (31m ago)   20h
...
```

排障链（老师引导、我操作）：

1. `k get nodes` → 节点 `NotReady` → 问题在节点，不在 pod
2. WSL 里 `docker ps` → `demo-control-plane` 容器不在运行——**Windows 休眠把 WSL 整个关了**，承载节点的容器随之消失
3. `docker start demo-control-plane` → 节点 Ready → pod 陆续恢复，RESTARTS 计数上涨（kubelet 重启了容器）

kind 集群睡死是 WSL2 的特性不是 bug：**集群节点 = WSL 里的 docker 容器，WSL 停 = 全集群停机**。恢复命令记下来：`wsl -d Ubuntu-22.04 -u root -- docker start demo-control-plane`。CKA 考试环境是云端 VM，无此问题；但"从 node 状态入手排障"的链路是通用考点。

## 第 6 课：留给下一篇的悬念

老师收官一问：

> **🧑‍🏫 老师：** 名单收不收一个 pod，除了 label 匹配，还有一个条件是什么？提示：一个容器刚启动 0.5 秒，nginx 还没起来，流量转给它会怎样？

下一篇就用一个永远 `READY 0/1` 的 pod，把这个条件——就绪探针——完整拆开。

## 本篇小结

| 概念 | 一句话 |
|---|---|
| Service | 固定虚拟 IP + selector 圈定的一批 pod |
| endpoints | 转发名单：发往 ClusterIP 的流量实际去向，随 pod 生灭实时增删 |
| 控制循环 | 名单的自动维护者；label 匹配 = 进名单 |
| 排障 | endpoints `<none>` → 查 label/selector 一致性、查 pod Ready |
| kind+WSL | WSL 停 = 集群停；恢复：docker start demo-control-plane |

➡️ 下一篇：[《READY 0/1 之谜——就绪探针与 connection refused》](/云原生/cka/cka-05-readiness-probe)
