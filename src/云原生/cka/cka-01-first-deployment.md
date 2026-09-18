---
title: 从 docker run 到「我要 3 个」——kind 十分钟初体验（苏格拉底对话实录）
sidebarGroup: CKA 通过之路
shortTitle: 01 kind 初体验与自愈
order: 1
date: 2026-09-19T00:00:00.000Z
author: Corey
category: 云原生
tag:
  - CKA
  - Kubernetes
  - kind
  - Deployment
  - 苏格拉底对话
description: 用 kind 在 WSL 里 3 分钟建一个真 k8s 集群，亲手杀 pod 看它自愈、扩容、滚动更新——全部控制台输出为本机真实运行结果。
---

> **CKA 通过之路 · 第 2/9 篇**
> 上一篇：[《会 Docker 的我决定考 CKA——考试拆解、15 周计划与课堂公约》](/云原生/cka/cka-00-why-and-plan) · 下一篇：[《yaml 就是一棵树——dry-run 生成、缩进陷阱与报错定位》](/云原生/cka/cka-02-yaml-tree)

---

## 写在前面

> **🧑‍🎓 学生：** 我会 docker，那么 k8s 究竟怎么回事，给我一个最为简单的例子快速体验一下。

老师没有先讲概念，直接动手：用 [kind](https://kind.sigs.k8s.io/)（Kubernetes in Docker）在我现有的 docker 引擎上起一个真集群。选 kind 有个额外好处——**k8s 集群本身就是几个 docker 容器**，`docker ps` 就能看到，对会 docker 的人第一分钟就祛魅。至于 kind 究竟是什么、它和 kubectl 什么关系，文末补充课展开。

环境：WSL2 Ubuntu-22.04 + Docker Engine 29.1.3 + kind v0.33.0。

本篇课堂路线：

> ① 3 分钟建集群 → ② docker ps 祛魅 → ③ 「我要 3 个 nginx」 → ④ 亲手杀 pod 看自愈 → ⑤ 扩容 → ⑥ 滚动更新 → 文末补充课：kind 与 kubectl 的身世

---


## 第 1 课：3 分钟建一个真集群

老师先查了机器条件（内存 7.8G、磁盘 951G 可用、[dl.k8s.io](https://dl.k8s.io) 可达、docker 已配镜像加速），然后装了两个二进制：

```bash
# kind 从 GitHub Releases，kubectl 从 dl.k8s.io
install -m 0755 kind kubectl /usr/local/bin/
```

```text
kind v0.33.0 go1.26.7 linux/amd64
Client Version: v1.37.0
```

建集群：

```bash
kind create cluster --name demo --wait 120s
```

```text
Creating cluster "demo" ...
 • Ensuring node image (kindest/node:v1.37.0) 🖼️  ...
 ✓ Preparing nodes 📦
 ✓ Writing configuration 📜
 • Starting control-plane 🕹️  ...
 ✓ Installing CNI 🔌  ...
 ✓ Installing StorageClass 💾
 ✓ Waiting ≤ 2m0s for control-plane = Ready ⏳
 ✓ Ready after 27s 💚
Set kubectl context to "kind-demo"

real    3m7.908s
```

3 分钟 8 秒，一个真的 Kubernetes v1.37.0 就绪。

**国内网络的坑**（老师踩过）：kind 节点内部的 containerd 不走宿主 docker 的镜像加速，直连 Docker Hub 不通。宿主机能拉镜像不代表 pod 能拉。解法是在节点里手动用加速器拉再改标签：

```bash
docker exec demo-control-plane ctr --namespace=k8s.io images pull \
  --snapshotter=overlayfs docker.m.daocloud.io/library/nginx:alpine
docker exec demo-control-plane ctr --namespace=k8s.io images tag \
  docker.m.daocloud.io/library/nginx:alpine docker.io/library/nginx:alpine
```

```text
docker.io/library/nginx                         alpine    1b595815db669    28.8MB
docker.m.daocloud.io/library/nginx              alpine    1b595815db669    28.8MB
```

## 第 2 课：docker ps 祛魅——这个"节点"是个容器

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
```

```text
NAMES                IMAGE                  STATUS
demo-control-plane   kindest/node:v1.37.0   Up 2 minutes
```

再看 kubectl 眼中的集群：

```bash
kubectl get nodes -o wide
```

```text
NAME                 STATUS   ROLES           AGE   VERSION   INTERNAL-IP   OS-IMAGE                       KERNEL                             CONTAINER-RUNTIME
demo-control-plane   Ready    control-plane   86s   v1.37.0   172.27.0.2    Debian GNU/Linux 13 (trixie)   6.6.87.2-microsoft-standard-WSL2   containerd://2.3.4
```

同一个东西，两个视角。承载整个 k8s 的"节点"，就是 docker 里一个叫 `demo-control-plane` 的容器——对 k8s 而言它和一台真服务器无区别。文末补充课表格里那套组件（apiserver、etcd、kubelet……）全装在这个容器里。

## 第 3 课：「我要 3 个」和 docker run 的本质区别

老师给了第一个对比：

- `docker run`：跑一个就是一个，死了没人管
- 下面的命令：告诉 k8s「**我要 3 个 nginx，一直保持 3 个**」

```bash
kubectl create deployment web --image=nginx:alpine --replicas=3
kubectl get pods
```

```text
NAME                   READY   STATUS    RESTARTS   AGE
web-6bd469df5c-dmbwv   1/1     Running   0          13s
web-6bd469df5c-kscg8   1/1     Running   0          13s
web-6bd469df5c-mqkcr   1/1     Running   0          13s
```

每行是一个 **Pod**（k8s 最小运行单位：1 个容器 + 1 个集群内部 IP）。名字后缀 `dmbwv` 这类随机码，和容器 ID 一个意思。

## 第 4 课：亲手杀一个，看 k8s 怎么办

老师只说：把其中一个删了，删完立刻看。

```bash
kubectl delete pod web-6bd469df5c-dmbwv
kubectl get pods
```

杀掉后 2 秒：

```text
NAME                   READY   STATUS              RESTARTS   AGE
web-6bd469df5c-6z77k   0/1     ContainerCreating   0          3s
web-6bd469df5c-kscg8   1/1     Running             0          19s
web-6bd469df5c-mqkcr   1/1     Running             0          19s
```

再过 5 秒：

```text
NAME                   READY   STATUS    RESTARTS   AGE
web-6bd469df5c-6z77k   1/1     Running   0          8s
web-6bd469df5c-kscg8   1/1     Running   0          24s
web-6bd469df5c-mqkcr   1/1     Running   0          24s
```

我用 `docker rm -f` 删过很多容器——删了就是没了。这里杀了白杀，`6z77k` 顶上来了。老师追问一个细节：**新 pod 和死掉的是同一个吗？**

不是。名字变了（`dmbwv` → `6z77k`）、IP 也会变。k8s 不是"重启原来那个"（docker 才那么干），是**照着"3 个"的目标新造一个**。挂掉的 pod 像一次性纸杯：坏了直接换新的，没人修。

我的原话结论被老师记进了笔记：

> **🧑‍🎓 学生：** 当我杀死一个 pod 的时候，会自动又起来一个，不需要自己管。

## 第 5 课：改口要 5 个

```bash
kubectl scale deployment web --replicas=5
```

从 3 改到 5，它自动加 2 个；改成 1 它就减回去。

## 第 6 课：滚动更新——不停机换版本

```bash
kubectl set image deployment/web nginx=<新镜像>
kubectl rollout status deployment/web
```

```text
Waiting for rollout "web" to finish: 2 of 3 updated replicas are available...
deployment "web" successfully rolled out
```

```text
NAME                   READY   STATUS      RESTARTS   AGE
web-6bd469df5c-kscg8   0/1     Completed   0          41s
web-7447d848f8-rhxhz   1/1     Running     0          7s
web-7447d848f8-s6bd5   1/1     Running     0          17s
web-7447d848f8-xq9fl   1/1     Running     0          13s
```

注意 pod 名字中间那段：`6bd469df5c` 的旧批次正在退场，`7447d848f8` 的新批次已就位——**新起一批、杀掉一批，分批替换，全程服务不断**。

## 本篇小结

| 我敲的 | 学到的 |
|---|---|
| `kind create cluster` | 3 分钟一个真集群；节点本身是 docker 容器 |
| `create deployment --replicas=3` | 声明"要几个"，不是"跑一个" |
| `delete pod` | 杀了白杀：k8s 照目标数新造，不修旧的 |
| `scale --replicas=5` | 改个数字的事 |
| `set image` + `rollout status` | 滚动更新 = 新旧两批 pod 分批接力 |

docker 和 k8s 的全部区别浓缩成一句：**docker 是"你叫它跑，它跑一次"；k8s 是"你说了要几个，它就一直保持几个"**。下一篇就钻进那句"说了"的载体——yaml 文件。

## 补充课：kind 究竟是什么（成文补记，非课堂对话）

主线全是动手实验，现在回头把"kind 究竟是什么"补清楚。

**kind = 一个独立的命令行工具**——单个可执行文件，装完之后系统里多一条 `kind` 命令，docker 本身没有任何变化。全名 **K**ubernetes **in** **D**ocker，CNCF 官方 kubernetes-sigs 旗下的开源项目（[kind.sigs.k8s.io](https://kind.sigs.k8s.io/)）。官方对它的定位原话：给 Kubernetes 本身做测试，也适合本地开发与 CI。

它只干一件事：

> **拿你机器上已有的 docker 引擎当底座，把每个 k8s 节点做成一个 docker 容器（镜像名 `kindest/node`），在这个容器里初始化出完整的 Kubernetes。**

关键在"节点容器"不是空壳——`kindest/node` 里装着和生产集群**完全相同**的一整套组件：

| kindest/node 容器里跑着 | 职责 |
|---|---|
| kube-apiserver | 集群唯一入口，kubectl 连的就是它 |
| etcd | 集群数据库 |
| controller-manager / scheduler | 控制循环、调度 |
| kubelet | 节点代理，管理本节点的 pod |
| kube-proxy | 转发规则维护者（本系列第 7 篇的主角） |
| containerd | 节点**自己的**容器运行时——不是宿主机那个 docker |

所以本机的真实嵌套结构是：

```text
Windows
└─ WSL2 (Ubuntu-22.04)
   └─ Docker Engine 29.1.3          ← 原来就有的 docker
      └─ 容器 demo-control-plane     ← kindest/node:v1.37.0，对外 = 一个 k8s 节点
         └─ 内部 containerd          ← 节点自己的运行时
            └─ pod 里的 nginx        ← 业务容器
```

**它不是"模拟器"**：节点里的每个组件都是真实二进制、真实版本（`get nodes` 显示的 v1.37.0 就是容器的版本），行为与生产集群一致。和生产的唯一差别是节点的"身体"——生产用物理机/虚拟机，kind 用容器。这正是第 2 课里同一个东西两个视角（`docker ps` 看到容器、`kubectl get nodes` 看到节点）的原因。

同类工具对比（为什么备考选它）：

| 工具 | 节点形态 | 特点 |
|---|---|---|
| **kind** | docker 容器 | 免费、秒级建删；一个配置文件可建多节点；组件与标准版完全一致 |
| minikube | 默认虚拟机（也可容器） | 老牌本地方案，功能全但默认更重 |
| k3d | docker 容器 | 跑轻量发行版 k3s，占用更小，组件与标准版有差异 |
| 云托管集群（AKS/EKS/GKE） | 云上真机 | 最真实，但收费、慢、不能随便拆 |

CKA 备考需要"敢弄坏、随时重造"的环境（排障、升级考题都要毁集群），kind 的免费 + 可丢弃 + 多节点是决定性优势。

### 补充课追问：为什么装完 kind，kubectl 就能用了？（真实课堂对话）

> **🧑‍🎓 学生：** 我没懂，为什么安装了 kind 后，我在 ubuntu 就可以使用 kubectl 了？
>
> **🧑‍🏫 老师：** 不是 kind 附带了 kubectl——**那天其实是装了两个独立的程序**，只是一条命令装的。看本机实际证据：

```text
$ ls -l /usr/local/bin/kind /usr/local/bin/kubectl
-rwxr-xr-x 1 root root 10530942 Sep 16 10:16 /usr/local/bin/kind
-rwxr-xr-x 1 root root 61886626 Sep 16 10:16 /usr/local/bin/kubectl
```

`/usr/local/bin/` 里躺着两个独立文件，同一分钟装进去：**kind 10MB、kubectl 61MB**。安装命令 `install -m 0755 kind kubectl /usr/local/bin/` 把两个下载好的文件一起放进了这个 PATH 目录（放进去 = 命令可用）。所以不是"装 kind 送 kubectl"，是一次装了两个，记成了一个。

| | kind（10MB） | kubectl（61MB） |
|---|---|---|
| 身份 | 集群**安装工具** | 集群**客户端** |
| 干什么 | 把节点容器搭起来，用完退场 | 你敲的每条 `kubectl get pods` 都是它在跟 apiserver 通信 |
| 使用频率 | 建/删集群，一年几次 | 天天用 |

它俩怎么"接上头"的？唯一的交集在 `kind create cluster` 结束时那行 `Set kubectl context to "kind-demo"`——kind 把**连接信息写进了配置文件** `~/.kube/config`：

```text
current-context: kind-demo
    server: https://127.0.0.1:45265   ← 集群 apiserver 的地址
```

kubectl 每次执行前先读这个文件，于是"开箱即连"。**kubectl 本身不知道 kind 的存在**——它只认 kubeconfig；哪天连公司集群或云集群，改的还是这个文件（`kubectl config use-context xxx`），跟 kind 无关。

> **🧑‍🏫 老师：** 检验一下：假如现在把 kind 卸了（`rm /usr/local/bin/kind`），`kubectl get pods` 还能用吗？——此问抛出后学生尚未作答，答案由老师揭晓：**能用**。集群在 docker 容器里跑着、连接配置也在，缺的只是那个"造集群的"工具而已。

➡️ 下一篇：[《yaml 就是一棵树——dry-run 生成、缩进陷阱与报错定位》](/云原生/cka/cka-02-yaml-tree)
