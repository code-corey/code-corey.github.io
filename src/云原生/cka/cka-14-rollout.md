---
title: 版本的座位——滚动更新与回滚（小白重讲实录）
sidebarGroup: CKA 通过之路
shortTitle: 14 滚动更新与回滚
order: 14
date: 2026-09-24T00:00:00.000Z
author: Corey
category: 云原生
tag:
  - CKA
  - Kubernetes
  - Deployment
  - 滚动更新
description: 软件要升级，怎么不停服务地换新版本；换坏了，怎么一条命令退回去。本课三易其稿：第一版术语密度过高，学生（0 基础）喊停；最终以「小区物业」一个比方从零讲通——住户（pod）→合同（Deployment）→家具（镜像）→轮流换（滚动更新）→撤销（undo），全程 3 个名词、5 条命令。含 rollout status 秒挂假成功看名单拆穿、deployment 手敲拼错的真实报错，课尾三题战报 2/3。
---

> **CKA 通过之路 · 第 15/17 篇**
> 上一篇：[《配置的座位——ConfigMap 与 Secret（直接讲授实录）》](/云原生/cka/cka-13-configmap-secret) · 下一篇：[《短工的座位——Job 与 CronJob（直接讲授实录）》](/云原生/cka/cka-15-job-cronjob)

---
> - 日期：2026-09-23 ~ 09-24
> - 学生：Corey（0 基础，直接讲授 + 小白重讲协议）
> - 环境：WSL2 Ubuntu-22.04 + kind v0.33.0 + Kubernetes v1.37.0，单节点 demo-control-plane
> - 本课特殊事件：三易其稿。第一版按常规进度讲 Deployment / ReplicaSet / 模板哈希，学生反馈「各种命令讲解得听不懂」；按小白重讲协议推倒重来，只留一个「小区物业」比方、3 个名词、5 条命令，一次一步走通。本文即最终讲通版的全过程实录
> - 官方文档核对新度：Deployment 滚动更新与回滚（kubernetes.io 官方概念文档 2026-06 版）

---

## 本章地图：整章就讲一件事

一句话：**软件要升级，怎么做到不停服务地换新版本；换坏了，怎么一条命令退回去。**

整章五步，每一步都是上一步留下的疑问：

| 步 | 要回答的疑问 | 新名词（仅 1 个） | 新命令（仅 1 条） |
|---|---|---|---|
| 1 | 小区里现在住着谁？ | pod（住户） | `kubectl get pods` |
| 2 | hello 为什么恰好 5 户？谁定的？ | Deployment（合同） | `kubectl get deployments` |
| 3 | 换版本 = 换什么？ | 镜像（家具） | （只讲概念，不跑） |
| 4 | 5 户怎么换才不停服务？ | 滚动更新（轮流换） | `kubectl set image` + `rollout status` |
| 5 | 换坏了怎么办？ | 回滚（撤销） | `kubectl rollout undo` |

工具只有一件：`kubectl`——**物业前台电话**。想了解小区任何事，打给前台问。

---

## 第 1 步：小区里住着谁？

背景一句话：我们有一个 Kubernetes 集群——把它想成一个**小区**。小区里跑着的每个程序（比如一个网站）是**一户住户**，住户的学名叫 **pod**。

第 1 条命令，人话：「前台，给我一份住户名单」：

```bash
kubectl get pods
```

```text
NAME                     READY   STATUS             RESTARTS      AGE
hello-786dc64799-6vn8c   1/1     Running            0             31m
hello-786dc64799-dh9rr   1/1     Running            0             31m
hello-786dc64799-dx7nb   1/1     Running            0             31m
hello-786dc64799-p9h8z   1/1     Running            0             31m
hello-786dc64799-rw5xc   1/1     Running            0             31m
k9s-demo                 0/1     ImagePullBackOff   0             35h
probe-test               1/1     Running            9 (37m ago)   2d11h
tol-equal                1/1     Running            9 (37m ago)   2d11h
web3-7977447bc8-2mqvr    1/1     Running            9 (37m ago)   2d11h
web3-7977447bc8-8vbhf    1/1     Running            9 (37m ago)   2d11h
web3-7977447bc8-tgsfh    1/1     Running            9 (37m ago)   2d11h
web3-7977447bc8-zd28t    1/1     Running            9 (37m ago)   2d11h
```

名单挑 3 列关键的读：

- **READY**：到岗人数。`1/1` 该来 1 人到了 1 人（健康）；`0/1` 一人没到（出事）
- **STATUS**：状态。`Running`=正常干活
- **AGE**：入住多久

从名单里看一个事实：门牌以 `hello` 开头的住户**恰好 5 户**，而且都是 `1/1 Running`（全员健康）。

旁注：表里还有一户 `k9s-demo` 是 `0/1`、状态 `ImagePullBackOff`——家具快递收不到、人开不了工，卡 35 小时了。本章不管它，只当个反面参照（它就是下一篇排障课的教材）。

---

## 第 2 步：hello 为什么恰好 5 户？谁在管这个数？

你就算半夜偷偷删掉一户 hello，过几秒它又会变回 5 户。**一定有个东西在背后守着「5」这个数。**

它是 **Deployment**（中文「部署」，字面：**一份合同**）。合同上写着：*「hello 这种住户，小区里必须始终保持 5 户——少了你补，多了你裁。」*

它躺在集群的账本里，不干活、只守约。物业照着合同办事：住户死了补新人，多了赶走。

第 2 条命令，人话：「前台，把小区现有的合同清单给我看」：

```bash
kubectl get deployments
```

（名词换了：上次问 pods 住户，这次问 deployments 合同。）

```text
NAME    READY   UP-TO-DATE   AVAILABLE   AGE
hello   5/5     5            5           8d
web3    4/4     4            4           7d1h
```

清单里两份合同：

- `hello   5/5`——合同要 5 户，实际 5 户，履约中
- `web3    4/4`——要 4 户，实际 4 户

READY 列 `5/5` 读法：斜杠前=合同要的数，斜杠后=实际到岗数，两边相等=履约正常。

第 1 步名单里「恰好 5 户」之谜解了：**合同定的，物业照办**。你删一户，物业 30 秒内补一户——这就是为什么 hello 永远是 5 户。

---

## 第 3 步：换版本 = 换什么？（只讲概念，不跑命令）

合同上除了户数，还写着一条：**住户家里用哪套家具**。

- **家具**的学名叫**镜像**（image）——住户家里**全套家当打包箱**：床、灶台、锅碗（程序、运行环境）整箱从**家具店**（镜像仓库，网上最大的叫 Docker Hub）发来
- hello 现在用的家具是 **nginx alpine 款**（28.8MB，精简打包）
- 好消息：小区**库房**里恰好还存着另一款——**nginx latest 款**（63.4MB，完整打包）。两款都是「网站服务器」，功能一样，版本不同

（库房清单的依据：课前用 `docker exec demo-control-plane crictl images` 盘点过节点本地镜像，两款 nginx 都在，IMAGE ID 不同——真正不同的两个版本。这也是为什么本课换版本实验不碰网络就能做：这台节点到 Docker Hub 的网络不通，现场拉新镜像会卡死。）

**软件升级 = 改合同里的家具条款。** 合同一改，物业就会去执行。怎么执行的——第 4 步的疑问：**5 户人家，怎么换家具才能不停服务？**

---

## 第 4 步：5 户怎么换家具才不停服务？

先想笨办法：

- **全停换**：5 户全搬走、再全搬进来。中间整个小区没人服务——不行
- **轮流换**：先让 1 户搬新家具进来，新住户能干活了，**再**让 1 户旧的搬走；就这样一进一出，任何时刻小区里始终有人值班

第二种就是**滚动更新**（rolling update）——「滚动」=像传送带一样，新的进、旧的出，轮到换完为止。Kubernetes 换版本**默认就这么干**，不用你操心顺序，你只需要做一件事：**改合同**。

### 第 3 条命令：改合同（换家具条款）

```bash
kubectl set image deployment/hello nginx=nginx:latest
```

人话翻译：**「把 hello 这份合同改一下：nginx 那个房间（容器）的家具，换成 nginx latest 款。」**

| 命令段 | 人话 |
|---|---|
| `kubectl set image` | 前台，我要改家具条款 |
| `deployment/hello` | 改 hello 那份合同 |
| `nginx=nginx:latest` | 房间名（容器叫 nginx）**=** 新家具型号（nginx latest 款） |

```text
deployment.apps/hello image updated
```

回执一行：`image updated`——合同改好了。物业（Kubernetes）立刻开始照新合同换人。

### 第 4 条命令：看换装直播

```bash
kubectl rollout status deployment/hello
```

人话翻译：「前台，**hello 的换装行动（rollout）进行到哪一步了（status）**？给我直播，直到换完再挂电话。」

```text
deployment "hello" successfully rolled out
```

直播 **0.8 秒就报「换装成功」**——太快了，快得可疑。搬 5 户人家怎么可能不到 1 秒？

**别只信一句回执，去名单上亲眼验证**（用第 1 步学过的命令）：

```bash
kubectl get pods
```

```text
NAME                     READY   STATUS             RESTARTS      AGE
hello-6dfd5c9ff9-2wxxx   1/1     Running            0             25s
hello-6dfd5c9ff9-c9djz   1/1     Running            0             23s
hello-6dfd5c9ff9-dnd4c   1/1     Running            0             25s
hello-6dfd5c9ff9-hx77v   1/1     Running            0             25s
hello-6dfd5c9ff9-n7hdk   1/1     Running            0             23s
k9s-demo                 0/1     ImagePullBackOff   0             35h
probe-test               1/1     Running            9 (39m ago)   2d11h
tol-equal                1/1     Running            9 (39m ago)   2d11h
web3-7977447bc8-2mqvr    1/1     Running            9 (39m ago)   2d11h
web3-7977447bc8-8vbhf    1/1     Running            9 (39m ago)   2d11h
web3-7977447bc8-tgsfh    1/1     Running            9 (39m ago)   2d11h
web3-7977447bc8-zd28t    1/1     Running            9 (39m ago)   2d11h
```

名单揭穿真相——**换装真发生了，而且已完成**：

- **门牌全换了**：从 `hello-786dc64799-xxx` 变成 `hello-6dfd5c9ff9-xxx`
- **AGE 全是 23~25 秒**：全是刚搬进来的新住户（敲改合同命令那一刻开始搬的）
- **全部 1/1 Running**：新住户全部到岗

两个大白话结论：

1. **门牌前缀 = 家具批型号**。物业给每版家具配置编一个批次号（那串 `6dfd5c9ff9`），同批住户门牌同前缀。名单上「版本换了」的样子 = **门牌前缀变了**
2. **回执会说谎，名单不会**。直播 0.8 秒报「成功」是因为挂电话太快——物业的进度板还没翻新页，读到的是上一行旧记录。真实验证要看名单（AGE 和门牌做证）。这教训值钱：**所有「已完成」，都用 get pods 验**

---

## 第 5 步：换坏了怎么办？（撤销）

做个假设：这批 latest 款家具搬进来当晚，发现新款有毛病（比如网站打不开）。

笨办法：再改一次合同改回去——行，但你得记得旧型号叫什么、写对每个字。
聪明办法：物业留了个**撤销键**——「上次那步，退回去」。

### 第 5 条命令：撤销

```bash
kubectl rollout undo deployment/hello
```

人话翻译：**「hello 这份合同的上一次改动，撤销（undo）。」**——等于 Word 里按 Ctrl+Z。

```text
Warning: resource deployments/hello was previously managed with 'kubectl apply'. Rolling back will not update the kubectl.kubernetes.io/last-applied-configuration annotation, which may cause unexpected behavior on future 'kubectl apply' operations. Consider using 'kubectl apply' with your previous configuration file instead.
deployment.apps/hello rolled back
```

回执两行：

- 第一段 `Warning: ...`——**提醒小票，不是报错**。大白话：*「这份合同以前是用『apply 登记』方式管的，这次撤销没同步更新那本登记簿的最后一页，以后用 apply 再改时可能小别扭。」*——记账层面的提醒，撤销照常执行了
- 关键行：`deployment.apps/hello rolled back`——**已退回**

老规矩，回执不作数，**名单验证**（看门牌前缀变没变回旧批次）：

```bash
kubectl get pods
```

```text
NAME                     READY   STATUS             RESTARTS      AGE
hello-786dc64799-2fzvh   1/1     Running            0             8s
hello-786dc64799-dbjv5   1/1     Running            0             9s
hello-786dc64799-kfp88   1/1     Running            0             9s
hello-786dc64799-mccl5   1/1     Running            0             8s
hello-786dc64799-tgptz   1/1     Running            0             9s
k9s-demo                 0/1     ImagePullBackOff   0             35h
probe-test               1/1     Running            9 (40m ago)   2d11h
tol-equal                1/1     Running            9 (40m ago)   2d11h
web3-7977447bc8-2mqvr    1/1     Running            9 (40m ago)   2d11h
web3-7977447bc8-8vbhf    1/1     Running            9 (40m ago)   2d11h
web3-7977447bc8-tgsfh    1/1     Running            9 (40m ago)   2d11h
web3-7977447bc8-zd28t    1/1     Running            9 (40m ago)   2d11h
```

名单为证——**撤销成功**：

- 门牌前缀**变回** `hello-786dc64799-...`（旧批次回来了）
- AGE 8~9 秒：又是 5 户新搬入的住户，**用的旧款家具**
- 全员 `1/1 Running`

为什么撤销这么快（9 秒搬完 5 户）？大白话：**旧家具没被扔掉**。物业从不清掉上一版的登记和家具——撤销 = 照着上一版的登记重新搬一遍，库房里全是现成的。这就是敢放心发新版的底气：**出事按撤销键，几秒回昨天。**

---

## 本章收官：五步逻辑链 + 五条命令

**逻辑链**：小区有住户（pod）→ 户数由合同（Deployment）守 → 合同写着家具型号（镜像）→ 改合同就轮流换人（滚动更新）→ 换坏按 Ctrl+Z（回滚）

| 命令 | 人话 |
|---|---|
| `kubectl get pods` | 前台，给我住户名单 |
| `kubectl get deployments` | 前台，给我合同清单 |
| `kubectl set image deployment/hello nginx=nginx:latest` | 改 hello 合同：家具换 latest 款 |
| `kubectl rollout status deployment/hello` | 直播 hello 换装进度 |
| `kubectl rollout undo deployment/hello` | 撤销 hello 上次改动 |

**一条铁律**：回执会说谎，名单不会——任何「已完成」，用 `get pods` 验。

---

## 结课出题与核对（原文）

**第 1 题（命令翻译）**：`kubectl set image deployment/web3 nginx=nginx:latest`——这条命令的人话是什么？

学生原文：「把web3的镜像改成最新版」

核对：**满分**。五个部件（改家具 / web3 合同 / nginx 房间 / 换 / latest 款）全读对了。

**第 2 题（一条命令退回旧版）**

学生原文：`kubectl rollout undo deloyment/web3`

核对：思路对，手上拼错一个字母——`deloyment`（漏了 p），正解 `deployment`。kubectl 不会猜你的意思，拼错直接拒收。当场演示真实报错：

```bash
kubectl rollout undo deloyment/web3
```

```text
error: the server doesn't have a resource type "deloyment"
```

报错说的不是「找不到 web3」，而是「没有 deloyment 这种**类型**」——类型拼错和名字拼错报的是不同的错，这是排障线索。命令以 code 1 失败退出，撤销没发生。**0.5 分**——丢在最冤的地方：CKA 机试现场没有自动补全，`deployment` 十个字母要手敲对。

**第 3 题（撤销为什么只要 9 秒）**

学生原文：「因为旧版本还没有完全下线」

核对：答偏了，**0.5 分**。拆开两个概念：

- 「没下线」= 旧住户还在线干活——那是换装**进行到一半**时的画面
- 但撤销发生时：新住户**已经全员上岗**，旧住户全下线走了

凭什么撤销还快？因为物业从不清扫上一版留下的两样东西：①**旧登记表**（上一版的完整配置记录）；②**旧家具**（上一版的镜像，还在库房）。撤销 = 照着留存的旧登记重新招人搬进来。**快不是因为「人还在」，是因为「档案和家具都没扔」。**

**战报：2 / 3**。丢分点两条：①`deployment` 手敲拼写——机试杀手；②概念题答「果」之前先对齐「因」。

---

## 课毕状态

- hello 最终停在 alpine 旧版 5 户全员健康（实验来回换过两轮：alpine→latest→撤销回 alpine）
- web3、probe-test、tol-equal 全程没动
- k9s-demo 仍卡 ImagePullBackOff（家具快递收不到 35 小时+）——留作后续排障课的真实教材

---

➡️ 下一篇预告：《短工的座位——Job 与 CronJob（直接讲授实录）》。长租合同之外还有别的活法：一单干完即走的 Job（干砸了补到上限认栽）、到点自动印工单的 CronJob——小区里的合同家族就此集齐。
