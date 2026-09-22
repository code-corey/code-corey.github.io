---
title: 提前课：docker -p 就是 DNAT——iptables 与 kube-proxy（苏格拉底对话实录）
sidebarGroup: CKA 通过之路
shortTitle: 06 DNAT 提前课
order: 6
date: 2026-09-19T00:00:00.000Z
author: Corey
category: 云原生
tag:
  - CKA
  - Kubernetes
  - iptables
  - kube-proxy
  - DNAT
  - 苏格拉底对话
description: 「IP 进名单后流量放行」的底层原理追问。用 docker -p 映射亲手抓一条 DNAT 规则，逐字段拆解 iptables，再对照 kube-proxy 的 KUBE- 链——Service 转发没有魔法，全是内核规则。
---

> **CKA 通过之路 · 第 7/13 篇**
> 上一篇：[《READY 0/1 之谜——就绪探针与 connection refused》](/云原生/cka/cka-05-readiness-probe) · 下一篇：[《卡死了谁来救？——livenessProbe 与 CrashLoopBackOff 的算法》](/云原生/cka/cka-07-liveness-crashloopbackoff)

---

## 写在前面

第 5 篇讲完名单，我追问了一句：

> **🧑‍🎓 学生：** IP 被加入名单（流量放行）底层的原理是什么？

老师先给了完整版解释——iptables 链、三条规则逐行拆。我当场反馈：

> **🧑‍🎓 学生：** 看不懂这些。

于是退回四行模型，再从我会的 docker 重新爬坡。这个"爬坡过程"本身值得记录：**看不懂不丢人，退小步、换锚点、重上同一座山**。参考资料：[Virtual IPs and Service Proxies](https://kubernetes.io/docs/concepts/services-networking/service/#virtual-ips-and-service-proxies)、[iptables 教程](https://wiki.archlinux.org/title/iptables)。

课堂路线：

> ① 四行模型（保底版本） → ② docker -p 实验：抓一条真 DNAT → ③ 逐字段拆规则 → ④ 对照 kube-proxy 的规则 → ⑤ 名单→规则→流量全链 → ⑥ IPVS 30 秒版

---

## 第 1 课：先带走四行——看不懂完整版的保底版

```text
名单（endpoints）= 一份数据，写着"流量转给谁"
        ↓ 每台机器上的 kube-proxy 盯着它
名单变了 → 系统里的转发规则自动跟着变
        ↓
IP 进名单 → 包被转送到你的 pod（放行）
IP 出名单 → 没有通往它的转发规则（不给流量）
```

一句话：**名单变 → 转发规则自动跟着变 → 流量跟着变，全程没人手动操作**。"转发规则"长什么样，就是下面爬坡的内容。

## 第 2 课：docker -p 就是 DNAT——从我会的东西下手

老师点破一个我用了多年却没意识到的事实：`docker run -p 18080:80` 的端口映射，底层就是一条 DNAT 规则。实验（WSL 里）：

```bash
docker run -d --name nat-demo -p 18080:80 nginx:alpine
iptables -t nat -S | grep 18080
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:18080
```

```text
-A DOCKER ! -i docker0 -p tcp -m tcp --dport 18080 -j DNAT --to-destination 172.17.0.2:80
HTTP 200
```

curl 通了（HTTP 200），而且**内核里正好有一条规则**，把"目的地端口 18080"的包改写为"目的地 172.17.0.2:80"（容器 IP）。docker 的端口映射没有任何魔法：**docker daemon 在内核里写了一条改写目的地 的规则**。

## 第 3 课：逐字段拆一条 iptables 规则

```text
-A DOCKER ! -i docker0 -p tcp -m tcp --dport 18080 -j DNAT --to-destination 172.17.0.2:80
```

| 字段 | 含义 |
|---|---|
| `-A DOCKER` | 追加到名为 DOCKER 的链（链 = 规则列表，docker daemon 建的） |
| `! -i docker0` | 条件①：包不是从 docker0 网卡进的（排除容器互访，只管外部进来的） |
| `-p tcp` | 条件②：TCP 协议 |
| `--dport 18080` | 条件③：目的地端口 = 18080 |
| `-j DNAT` | 动作：条件全中 → 改写包的目的地（DNAT） |
| `--to-destination 172.17.0.2:80` | 改写为：目的地 = 容器 IP 172.17.0.2、端口 80 |

读成一句话：**外面进来的、目的地端口 18080 的 TCP 包 → 目的地改写成 172.17.0.2:80**。

iptables 的三层结构，一次记够：

```text
表(table)  → 按职能分的规则大类。nat 表管地址改写（DNAT 在这）；filter 表管放行/丢弃
  链(chain) → 每个表里的规则列表，挂在包路径的环节上（PREROUTING/FORWARD/…，DOCKER 是 docker 自建的）
    规则     → 条件 + 动作（上面拆的那行）
```

## 第 4 课：kube-proxy 写的规则——同一套把戏

先取两个事实：Service 的虚拟 IP、pod 的 IP（后面规则里都会出现）：

```bash
k get svc probe-test -o wide
k get pod probe-test -o wide
```

```text
NAME         TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE     SELECTOR
probe-test   ClusterIP   10.96.113.42   <none>        80/TCP    6h56m   run=probe-test

NAME         READY   STATUS    RESTARTS   AGE   IP            NODE
probe-test   1/1     Running   0          21h   10.244.0.16   demo-control-plane
```

再进 k8s 节点（它是个 docker 容器，第 2 篇讲过）看内核里的真实规则：

```bash
docker exec demo-control-plane iptables-save | grep probe-test
```

```text
-A KUBE-SERVICES -d 10.96.113.42/32 -p tcp --dport 80 -j KUBE-SVC-XXX
-A KUBE-SVC-XXX --comment "default/probe-test -> 10.244.0.16:80" -j KUBE-SEP-XXX
-A KUBE-SEP-XXX -j DNAT --to-destination 10.244.0.16:80
```

三条一串：目的地是 ClusterIP（10.96.113.42:80）的包 → 跳链 → 跳链 → **DNAT 到 pod IP**。和 docker 的规则对比：

| | docker `-p 18080:80` | k8s Service |
|---|---|---|
| 谁写规则 | docker daemon | kube-proxy（每个节点都跑一个） |
| 匹配条件 | 目的地端口 18080 | 目的地 = ClusterIP:port |
| DNAT 去向 | 固定一个容器 IP | **名单里的 pod IP**（动态增删） |
| 名单 5 个 IP 时 | 无此场景 | 5 条终点链，轮询命中 = 负载均衡的底层 |

第 5 篇"IP 进名单 = 流量放行"的完整原理，落到内核就是一行增量：**kube-proxy 多写一条 DNAT 规则**。名单空 = 没有 DNAT 目标 = 包无路可走（这就是"不给流量"的物理形态——没人拦截，只是没有路）。

## 第 5 课：全链条——从探针通过到包到达

```text
pod 就绪（探针通过）
  → 控制器把 IP 写进名单（etcd 里的数据）
    → 每个节点的 kube-proxy 看到名单变化
      → kube-proxy 写入 DNAT 规则（iptables 命令）
        → 发往 ClusterIP 的包，目的地被改写成 pod IP，送达
```

## 第 6 课：IPVS——30 秒版

kube-proxy 干这活有两种模式（生产常见 IPVS）：

- **iptables 模式**：规则是线性列表，包要逐条比对——服务多了之后每个包都要扫很多条规则，性能下降
- **IPVS 模式**：内核专门的负载均衡引擎，查表方式是哈希 + 内置调度算法（轮询/最少连接等），服务多时性能稳定

对考试的完整要求就三条：知道有两种模式及名字；会查当前模式 `k -n kube-system get cm kube-proxy -o yaml | grep mode`（空值/iptables = iptables 模式，ipvs = IPVS 模式）；原理层面都是"按名单转发，实现方式不同"。

顺带拆了那条查询命令本身——**kube-proxy 的配置就存在一个普通 ConfigMap 里**（第 4 篇学的对象），k8s 自己也用自己那套机制管理配置：

| 片段 | 意思 |
|---|---|
| `-n kube-system` | 在 kube-system 命名空间找（k8s 系统组件都在这） |
| `get cm` | 查 ConfigMap（cm 是官方缩写） |
| `kube-proxy` | 对象名 = 组件配置文件名 |
| `-o yaml` | 完整内容输出 |

## 写在组块末尾

这 7 篇走完的路：一条 `docker run` 的旧经验 → 集群与自愈 → yaml 与声明式 → 配置注入 → 名单与 Service → 就绪探针 → 内核转发规则。每一步的结论都来自我本机的真实输出，每个"不知道，我猜的"都被实验纠正——这就是备考组块 A 的全部地基。下一篇起新组块：livenessProbe、调度与网络。

（实验残留清理：`docker rm -f nat-demo`。）

## 本篇小结

- docker `-p` 端口映射 = docker daemon 写的一条 DNAT 规则——你早就在用 DNAT
- iptables 三层：表 → 链 → 规则（条件+动作）；nat 表管地址改写
- Service 转发 = kube-proxy 照名单写 DNAT 规则；名单空 = 没有规则 = 无路可走
- 多 IP 轮询命中 = 负载均衡的底层；IPVS = 换个查表更快的引擎

➡️ 下一篇：[《卡死了谁来救？——livenessProbe 与 CrashLoopBackOff 的算法》](/云原生/cka/cka-07-liveness-crashloopbackoff)
