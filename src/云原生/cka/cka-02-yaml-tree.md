---
title: yaml 就是一棵树——dry-run 生成、缩进陷阱与报错定位（苏格拉底对话实录）
sidebarGroup: CKA 通过之路
shortTitle: 02 yaml 树模型与报错定位
order: 2
date: 2026-09-19T00:00:00.000Z
author: Corey
category: 云原生
tag:
  - CKA
  - Kubernetes
  - YAML
  - Deployment
  - 苏格拉底对话
description: kubectl --dry-run=client -o yaml 生成草稿、缩进差两格引发的两种报错、「两个空格还是一个 Tab」、以及用报错里的字段路径定位 yaml 错误的通用方法——全部真实对话与真实报错。
---

> **CKA 通过之路 · 第 3/14 篇**
> 上一篇：[《从 docker run 到「我要 3 个」——kind 十分钟初体验》](/云原生/cka/cka-01-first-deployment) · 下一篇：[《把配置和密码放进容器——ConfigMap 与 Secret》](/云原生/cka/cka-03-configmap-secret)

---

## 写在前面

上一篇全用命令行。这一篇老师把同一条命令翻译成文件，然后我在缩进上摔了两跤——两跤都摔出了可以复用的排查方法。参考资料：[kubectl 命令参考](https://kubernetes.io/docs/reference/kubectl/)、[Managing Kubernetes Objects declaratively](https://kubernetes.io/docs/concepts/cluster-administration/manage-deployment/)。

课堂路线：

> ① dry-run 生成两种草稿 → ② Deployment 究竟是什么 → ③ 生成→文件→编辑→apply 闭环 → ④ 树模型与"两个 name" → ⑤ 缩进两格的事故与字段路径定位法

---

## 第 1 课：--dry-run=client -o yaml——考试里用得最多的技巧

两个参数，一行解释：

| 参数 | 作用 |
|---|---|
| `--dry-run=client` | 只在本机生成内容，**不向集群发送任何请求** |
| `-o yaml` | 输出格式改成 yaml |

组合效果：**不执行创建，只把"本来会创建的东西"打印在屏幕上**。

先生成 Pod 草稿：

```bash
k run nginx-test --image=nginx:alpine --dry-run=client -o yaml
```

老师只让我观察两件事，然后问了一个问题：

> **🧑‍🏫 老师：** `kind:` 的值是什么？有没有 `replicas` 字段？

```yaml
apiVersion: v1
kind: Pod          # ← 是 Pod，不是 Deployment
metadata:
  labels:
    run: nginx-test
  name: nginx-test
spec:
  containers:
  - image: nginx:alpine
    name: nginx-test
```

`replicas` **不存在**。再生成 Deployment 草稿对比：

```bash
k create deployment web2 --image=nginx:alpine --replicas=3 --dry-run=client -o yaml
```

这次 `kind: Deployment`，`spec.replicas: 3` 出现了。原因（[官方文档：Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)）：

- `kind: Pod` 的定义 = 1 个容器本身，没有"数量"概念
- `replicas` 是 Deployment 的属性——上一篇杀 pod 秒复原的逻辑就藏在它身上

顺带验证 dry-run 确实没创建东西：`k get pods` 数量没变，也没有叫 `nginx-test` 的 pod。

## 第 2 课：Deployment 究竟是什么

看懂两种草稿的差别后我提了那个关键问题：

> **🧑‍🎓 学生：** 我还是不太理解这里的 deployment，究竟是什么？

老师给了拆到底的定义——**Deployment = 一行数据 + 一段程序**：

1. **一行数据**：存在集群数据库（etcd）里的一条记录，字段就是 yaml 里那些：用哪个 image、要几个副本、叫什么名字
2. **一段程序**：master 上有个常驻程序，其中处理 Deployment 记录的循环持续执行固定逻辑：

```text
读取记录里的 replicas（比如 5）
↓
数一下实际活着的 pod 数量（比如 3）
↓
3 < 5，创建 2 个 pod
↓
回到第一步，永远重复
```

上一篇做过的三个实验，全是这一个循环的三次触发：

| 我的操作 | 循环看到的 | 循环做的 |
|---|---|---|
| yaml 改 replicas 3→5 再 apply | 记录=5，实际=3 | 创建 2 个 |
| delete pod 杀一个 | 记录=5，实际=4 | 创建 1 个 |
| set image 换镜像 | 换成新批次记录 | 逐个换 pod（滚动更新） |

**你维护数据，系统维护现实**——这句就是 k8s 的声明式本质。

## 第 3 课：生成 → 文件 → 编辑 → apply

考场的标准动作四步：

```bash
k create deployment web3 --image=nginx:alpine --replicas=2 \
  --dry-run=client -o yaml > web3.yaml
```

用记事本把 `replicas: 2` 改成 `4`，然后：

```bash
k apply -f web3.yaml        # deployment.apps/web3 created
k apply -f web3.yaml        # deployment.apps/web3 configured（第二次改文件后再 apply）
```

两个输出词的差别：**created = 从无到有；configured = 已存在、按文件调整了差异**。

我第一次跑翻了个车：预期 4 个 pod 只出了 2 个——`kubectl get deployment web3` 显示 `2/2`，说明**集群里的记录就是 2**，问题在文件没改成功（记事本没保存）。修正后 `configured` → `4/4`。排障闭环：发现结果不对 → 查数据定位 → 修正 → 验证。

## 第 4 课：yaml 就是一棵树——两个 name 的谜题

有一天老师直接把一份完整的 Pod yaml 丢给我让我逐行读，我读到了两行一模一样的：

```yaml
metadata:
  labels:
    run: probe-test
  name: probe-test        # ← 第 6 行：缩进 2 格
spec:
  containers:
  - image: nginx:alpine
    name: probe-test      # ← 第 14 行：缩进 4 格
```

> **🧑‍🏫 老师：** 两行都是 `name: probe-test`，它们分别是谁的名字？

答案是**路径**决定的，不是文本决定的：

- 第 6 行的父节点是 `metadata:` → 路径 `metadata.name` → **Pod 的名字**（`get pods` 的 NAME 列、`delete pod` 用的都是它）
- 第 14 行的父节点是容器列表项 → 路径 `spec.containers[0].name` → **容器的名字**（多容器 pod 里 `logs`/`exec` 要用 `-c` 区分）

文本恰好相同纯属 `k run` 的命名习惯，是两个不相干的字段。判定规则一句话，无例外：

> **某行的父节点 = 往上找第一个比它缩进更靠左的行；同一列 = 兄弟。**

整棵树：

```text
Pod 根
├─ apiVersion / kind
├─ metadata
│   ├─ labels.run
│   └─ name                ← Pod 的名字
└─ spec
    ├─ containers[]
    │   ├─ image
    │   ├─ name            ← 容器的名字
    │   └─ readinessProbe.httpGet.{path, port}
    ├─ dnsPolicy
    └─ restartPolicy
（status 由系统自填，写了也会被覆盖）
```

另外几行的速查：`resources: {}` = 没设 CPU/内存限制；`dnsPolicy: ClusterFirst` = 容器 DNS 先走集群内部；`restartPolicy: Always` = 容器退出后总是重启（**注意这是 kubelet 在同一 pod 内重启容器，RESTARTS 计数器就是它；和 Deployment 补新 pod 是两码事**）。

## 第 5 课：缩进两格的事故——两种报错与一个通用定位法

### 事故一：值该是对象，我写成了字符串

给 pod 加 `envFrom` 引用 ConfigMap 时，我把名字直接写在冒号后面：

```yaml
envFrom:
- configMapRef: app-config      # ❌ 冒号后直接跟名字 = 值是字符串
```

apply 的报错：

```text
Error from server (BadRequest): error when creating "...": Pod in version "v1" cannot be
handled as a Pod: json: cannot unmarshal string into Go struct field
EnvFromSource.spec.containers.envFrom.configMapRef of type v1.ConfigMapEnvSource
```

### 事故二：该是子字段，我放成了同级

给探针找位置时贴错了 `name` 行下面，差两格：

```yaml
metadata:
  name: probe-test
  readinessProbe:      # ❌ 2 格缩进 → 父节点成了 metadata
    httpGet:
      path: /
      port: 8080
```

```text
Error from server (BadRequest): ... strict decoding error: unknown field "metadata.readinessProbe"
```

两种报错，一个通用的定位法，老师原话：

> **所有 `unknown field "xxx.yyy"` 和 `cannot unmarshal ... into ... field xxx` 报错：报错里的字段路径 = 你的字段实际落点。照着路径去文件里找，一找一个准。**

第二种报错用解析器验证，YAML 实际读到的结构是：

```text
envFrom = [{'configMapRef': None, 'name': 'app-config'}]   # configMapRef 空，name 成了平级野字段
```

正确写法（名字作为 `name:` 子字段，缩进比 `configMapRef` 深一级）：

```yaml
envFrom:
- configMapRef:
    name: app-config
```

### 事故三：两个空格还是一个 Tab

修缩进时我问了个问题，值得所有初学者看一遍：

> **🧑‍🎓 学生：** 究竟是两个空格，还是一个 Tab？

> **🧑‍🏫 老师：** 两个空格，永远不要用 Tab。YAML 语法禁止 Tab 字符做缩进——不是风格建议，是规范规定。k8s 生成的草稿全是每级 2 空格，编辑生成稿时保持一致：下一级 = 当前行加 2 个空格。记事本里按 Tab 键插入的就是 Tab 字符，缩进时只按空格键。

### YAML 核心规则（一条顶全部）

- 冒号后面**同行直接跟内容** → 值是**字符串/数字**
- 冒号后面**换行、下一行缩进** → 值是**对象**（由子字段组成）
- 值该是哪种类型由 k8s 的定义决定，写错就在 apply 时收到上面那些报错

## 附：自助验证工具 k explain

猜不准某字段该放哪、有哪些合法子字段，不用搜网页，直接问集群：

```bash
k explain pod.spec.containers
```

输出列出容器的全部合法子字段（`image`、`name`、`envFrom`、`readinessProbe`……）。想看探针的子字段就 `k explain pod.spec.containers.readinessProbe`。考场上这比翻文档快。

## 本篇小结

- `--dry-run=client -o yaml`：生成草稿改字段，不从零手写
- Deployment = 一行数据 + 一段对比循环；你维护数据，系统维护现实
- 读 yaml 先还原成树；**字段含义由路径决定，不由文本决定**
- 报错里的字段路径 = 实际落点；缩进永远 2 空格、禁 Tab

➡️ 下一篇：[《把配置和密码放进容器——ConfigMap 与 Secret》](/云原生/cka/cka-03-configmap-secret)
