---
title: 配置的座位——ConfigMap 与 Secret（直接讲授实录）
sidebarGroup: CKA 通过之路
shortTitle: 13 ConfigMap Secret
order: 13
date: 2026-09-23T00:00:00.000Z
author: Corey
category: 云原生
tag:
  - CKA
  - Kubernetes
  - ConfigMap
  - Secret
description: 配置写死在镜像里，改一个字就得重新打包？两件套实录：ConfigMap（造地图→pod 环境变量注入→改地图 env 不认账、重启才换→文件挂载键变文件→kubelet 每分钟对账、版本目录+符号链接原子切换热更）；Secret（base64 形态→一条 base64 -d 当场揭穿不是加密→注入 pod 自动解码、应用无感→真正的安全是 RBAC 分权）。课尾三题暴露新丢分点：概念题停在复述没推到机制层。
---

> **CKA 通过之路 · 第 14/17 篇**
> 上一篇：[《数据的座位——PV、PVC 与 StorageClass（直接讲授实录）》](/云原生/cka/cka-12-storage) · 下一篇：[《版本的座位——滚动更新与回滚（小白重讲实录）》](/云原生/cka/cka-14-rollout)

---
> - 日期：2026-09-23
> - 学生：Corey（0 基础，直接讲授 + 小白重讲协议）
> - 环境：WSL2 Ubuntu-22.04 + kind v0.33.0 + Kubernetes v1.37.0，单节点 demo-control-plane
> - 官方文档核对新度：ConfigMap / Secret（kubernetes.io 官方概念文档 2026-06 版）；base64 语义、RBAC 分权为通用知识
> - 课前衔接：第 12 课给「数据」找了座位（PV/PVC），本课给「配置」找座位

---

## 课前检查

首先看下当前的系统中的pods都有哪些

```
❯ k get pods
NAME                     READY   STATUS             RESTARTS      AGE
hello-786dc64799-hv8hk   1/1     Running            2 (18h ago)   24h
hello-786dc64799-kgmwp   1/1     Running            2 (18h ago)   24h
hello-786dc64799-wt4rb   1/1     Running            2 (18h ago)   24h
hello-786dc64799-xvrkh   1/1     Running            2 (18h ago)   24h
hello-786dc64799-zbgj9   1/1     Running            2 (18h ago)   24h
k9s-demo                 0/1     ImagePullBackOff   0             72m
probe-test               1/1     Running            2 (18h ago)   24h
tol-equal                1/1     Running            2 (18h ago)   24h
web3-7977447bc8-2mqvr    1/1     Running            2 (18h ago)   24h
web3-7977447bc8-8vbhf    1/1     Running            2 (18h ago)   24h
web3-7977447bc8-tgsfh    1/1     Running            2 (18h ago)   24h
web3-7977447bc8-zd28t    1/1     Running            2 (18h ago)   24h
```



**命令**：

```bash
kubectl get pods --no-headers | wc -l && kubectl exec web3-7977447bc8-2mqvr -- cat /usr/share/nginx/html/index.html | head -5
```

**输出**：

```text
11
<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
<style>
```

**解释**：集群 11 个 pod 全是其他课作业，战场干净。nginx 默认首页是官方的 "Welcome to nginx!"——它就是本课的问题引子：想改欢迎语怎么办。

---

## 开场：配置是什么、问题推演

- 「配置」字面：程序运行时要读的**可变参数**——端口号、数据库地址、欢迎语、调试开关。不是代码逻辑，是随环境变化的数字和文字
- 改欢迎语的三条路：①进容器改——pod 死了重造蒸发（第 12 课第一站同款死路）；②改镜像——改一个字重新打包推仓库改部署，动整条生产线；③想要的——配置住 pod 外面的独立对象，改配置只动它
- 对照表（承第 12 课）：


|            | 第 12 课   | 第 13 课             |
| ---------- | -------- | ------------------ |
| 搬出 pod 的东西 | 数据（文件）   | 配置（参数/文件）          |
| 独立对象       | PV / PVC | ConfigMap / Secret |
| pod 怎么用    | 挂载成目录    | 环境变量 / 挂载成文件       |


ConfigMap 字面：Config（配置）+ Map（映射/键值对）。集群里的独立对象，内容是一组「名字→值」，专存**非敏感**配置。

---

## 第一站：造一张配置地图

**命令**：

```bash
kubectl create configmap my-config --from-literal=greeting=hello-from-configmap  

kubectl get configmap my-config  

kubectl describe configmap my-config
```

（create configmap=建配置地图；--from-literal=从字面量来，直接在命令行写键值对，不用先建文件，然后查看）

**输出**：

```text
configmap/my-config created
NAME        DATA   AGE
my-config   1      0s
Name:         my-config
Namespace:    default
Labels:       <none>
Annotations:  <none>

Data
====
greeting:
----
hello-from-configmap


BinaryData
====

Events:  <none>
```

**解释**：DATA 1=地图里 1 对键值；describe 的 Data 段展开内容——键 greeting，值 hello-from-configmap。**注意：值是明文印在屏幕上的**——这是下半场 Secret 的伏笔。

---

## 第二站：pod 查地图——环境变量方式

环境变量字面：操作系统给每个进程的「随身便签」，程序运行时随手可读。

**命令**（先建 /tmp/cfg-box.yaml）：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: cfg-box
spec:
  containers:
    - name: main
      image: nginx:alpine
      command: ["sleep", "3600"]
      env:
        - name: GREETING
          valueFrom:
            configMapKeyRef:
              name: my-config
              key: greeting
```

```bash
kubectl apply -f /tmp/cfg-box.yaml && sleep 8 && kubectl get pod cfg-box && echo '=== pod 里读环境变量 ===' && kubectl exec cfg-box -- sh -c 'echo $GREETING'
```

**输出**：

```text
pod/cfg-box created
NAME      READY   STATUS    RESTARTS   AGE
cfg-box   1/1     Running   0          8s
=== pod 里读环境变量 ===

```

**解释**：pod 活着但 echo 出来**一行空**——当场排查，别猜。

**排查命令**：

```bash
kubectl exec cfg-box -- env | grep -i greet; kubectl exec cfg-box -- printenv GREETING
```

**输出**：

```text
GREETING=hello-from-configmap
hello-from-configmap
```

**解释**：注入是成功的——env 列表里有 GREETING=hello-from-configmap，printenv 也出值。之前空 echo 是**老师命令转义劈了**：$GREETING 在 Git Bash → wsl bash → kubectl 多层引号传递中被外层 shell 提前展开成空，根本没到容器。与第 12 课通配符翻车同族。教训：查环境变量用 `printenv 名字`（变量名当字面量传），最稳。**k8s 本身没毛病。**

YAML 关键段解读：env.name GREETING=pod 里将出现的环境变量名；valueFrom.configMapKeyRef=值不写死，去 ConfigMap 查——name: my-config 查哪张地图，key: greeting 查哪个键。

---

## 第三站：改地图，pod 里会变吗

**命令**（--dry-run=client -o yaml | kubectl apply -f -：本地生成 YAML 不真建，再走 apply 更新——改已存在对象的惯用写法）：

```bash
kubectl create configmap my-config --from-literal=greeting=SECOND-VERSION --dry-run=client -o yaml | kubectl apply -f - && kubectl describe configmap my-config | tail -3 && echo '=== pod 里现在读到的是 ===' && kubectl exec cfg-box -- printenv GREETING
```

**输出**：

```text
Warning: resource configmaps/my-config is missing the kubectl.kubernetes.io/last-applied-configuration annotation which is required by kubectl apply. ...
configmap/my-config configured
====

Events:  <none>
=== pod 里现在读到的是 ===
hello-from-configmap
```

**解释**：地图改了（configured；Warning 无害——对象当初是 create 建的，apply 自动补记账标记），**pod 里还是旧值**。原因：环境变量是 pod 启动那一刻一次性抄进去的，抄完断线。

**重建验证**：

```bash
kubectl delete pod cfg-box && kubectl apply -f /tmp/cfg-box.yaml && sleep 8 && kubectl exec cfg-box -- printenv GREETING
```

**输出**：

```text
pod "cfg-box" deleted from default namespace
pod/cfg-box created
SECOND-VERSION
```

**解释**：新个体启动时重新抄地图，读到 SECOND-VERSION——env 方式**重启换新**确认。

---

## 第四站：文件挂载——整份配置文件进 pod

规则：**地图里每个键变成目录里一个文件；键当文件名，值当文件内容**。

**命令**（先建 /tmp/cfg-file.yaml）：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: cfg-file
spec:
  containers:
    - name: main
      image: nginx:alpine
      command: ["sleep", "3600"]
      volumeMounts:
        - name: cfg-vol
          mountPath: /etc/cfg
  volumes:
    - name: cfg-vol
      configMap:
        name: my-config
```

```bash
kubectl apply -f /tmp/cfg-file.yaml && sleep 8 && echo '=== /etc/cfg 目录内容 ===' && kubectl exec cfg-file -- ls -la /etc/cfg/ && echo '=== greeting 文件内容 ===' && kubectl exec cfg-file -- cat /etc/cfg/greeting
```

**输出**：

```text
pod/cfg-file created
=== /etc/cfg 目录内容 ===
total 12
drwxrwxrwx    3 root     root            4096 Sep 22 23:15 .
drwxrwxrwx    3 root     root            4096 Sep 22 23:15 ..
drwxrwxrwx    2 root root         4096 Sep 22 23:15 ..2026_09_22_23_15_48.3666230061
lrwxrwxrwx    1 root     root           32 Sep 22 23:15 ..data -> ..2026_09_22_23_15_48.3666230061
lrwxrwxrwx    1 root     root           15 Sep 22 23:15 greeting -> ..data/greeting
=== greeting 文件内容 ===
SECOND-VERSION
```

**解释**：键变文件（/etc/cfg/greeting，内容 SECOND-VERSION）✓。目录里混进奇怪的东西——带时间戳的隐藏目录 + ..data 符号链接 + greeting 符号链接。**这不是故障，是 kubelet 埋的热更机关**：真文件放在版本目录里，greeting 只是指过去的指针。为什么绕这一手——下一站见分晓。

---

## 第五站：改地图，文件自己会变吗（热更对照实验）

**命令**：

```bash
kubectl create configmap my-config --from-literal=greeting=THIRD-VERSION --dry-run=client -o yaml | kubectl apply -f - 2>/dev/null; echo '=== 地图已改，等 70 秒（不重启 pod）===' && sleep 70 && kubectl exec cfg-file -- cat /etc/cfg/greeting && echo '=== 同一时刻，env 方式的旧 pod（也没重启）===' && kubectl exec cfg-box -- printenv GREETING
```

**输出**：

```text
configmap/my-config configured
=== 地图已改，等 70 秒（不重启 pod）===
THIRD-VERSION=== 同一时刻，env 方式的旧 pod（也没重启）===
SECOND-VERSION
```

（THIRD-VERSION 后无换行是 echo -n 效果的拼接，值完整）

**解释**：两个都没重启的 pod，文件挂载的 cfg-file **自己变了**（THIRD-VERSION），env 的 cfg-box 纹丝不动（SECOND-VERSION）。

热更机关揭底：

1. kubelet **每分钟**来 pod 对一次账：地图变了吗
2. 变了→新建一个带新时间戳的版本目录，把新文件写进去
3. 把 ..data **指针一转**指向新目录——greeting 链接跟着自动指到新内容

绕符号链接是为了**原子切换**：读者任何时刻顺链接摸到的，要么全旧要么全新，永远不会摸到写一半的文件。

诚实补充：cat 每次重新打开文件所以立刻看到新值；**常驻进程若把配置缓存在内存里**（如 nginx 启动时读走的配置），文件变了它不会自动重读——该 reload 还得 reload。热更到的是**文件**，不是进程的内存。

ConfigMap 阶段小结：


|       | 环境变量（env）      | 文件挂载（volume）       |
| ----- | -------------- | ------------------ |
| 适合    | 零散参数（端口、开关）    | 整份文件（首页、conf）      |
| 形态    | 进程的随身便签        | 目录里的文件（键=文件名）      |
| 地图更新后 | 旧 pod 不认账，重启才换 | kubelet 约 1 分钟自动同步 |
| 底层机关  | 启动时一次性抄写       | 版本目录+符号链接原子切换      |


---

## 第六站：Secret——给敏感配置的座位

回顾：describe configmap 把值明文印屏幕上——欢迎语无所谓，**数据库密码**不能这么裸奔。

Secret 字面：英文原义「秘密」。结构和 ConfigMap 一模一样（独立对象、键值对、env/文件挂载两种消费方式），两点不同：①定位专存敏感数据（密码、令牌、证书）；②值不是明文，是 **base64**（字面：把任意字节变成 64 个安全字符组合的表示法——A-Z、a-z、0-9、+、/，计算机界的「转写系统」）。

**命令**：

```bash
kubectl create secret generic db-secret --from-literal=username=admin --from-literal=password=Passw0rd123 && kubectl get secret db-secret && kubectl get secret db-secret -o yaml
```

（generic=通用类型；另有 docker-registry 存镜像仓库凭证、tls 存证书等专用类型）

**输出**：

```text
secret/db-secret created
NAME        TYPE     DATA   AGE
db-secret   Opaque   2      0s
apiVersion: v1
data:
  password: UGFzc3cwcmQxMjM=
  username: YWRtaW4=
kind: Secret
metadata:
  creationTimestamp: "2026-09-23T02:39:44Z"
  name: db-secret
  namespace: default
  resourceVersion: "705949"
  uid: 35817485-b3a3-476a-988c-1e93e11c0d8a
type: Opaque
```

**解释**：TYPE Opaque=「不透明的」，通用 Secret 默认类型（字面看不透；实际含义=自定义键值对类型）。data 段值变了形态——结尾 `=` 是 base64 填充记号，一眼可认。

---

## 第七站：当场揭穿——base64 不是加密

概念区分：**编码**（encoding）是人人都能源的转写，不需要钥匙；**加密**（encryption）是没有密钥就还原不了。base64 属于前者。

**命令**：

```bash
echo 'UGFzc3cwcmQxMjM=' | base64 -d && echo '' && echo 'YWRtaW4=' | base64 -d
```

（base64 -d：d=decode 解码）

**输出**：

```text
Passw0rd123
admin
```

**解释**：一条命令，密码原文当场还原——base64 的「保密」是皇帝的新衣。Secret 的真正意义：**防的不是人肉 base64，是权限分层**——集群可以规定某账号「能读 ConfigMap、不许读 Secret」（RBAC），把敏感和非敏感的阀门分开。真正防偷看靠：etcd 落盘加密、外部密钥库（Vault）、严格控制谁能 get secret。一句话：**base64 是转写，不是锁。**

---

## 第八站：pod 消费 Secret——和 ConfigMap 同构

**命令**（先建 /tmp/sec-box.yaml）：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: sec-box
spec:
  containers:
    - name: main
      image: nginx:alpine
      command: ["sleep", "3600"]
      env:
        - name: DB_USER
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: username
        - name: DB_PASS
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: password
```

```bash
kubectl apply -f /tmp/sec-box.yaml && sleep 8 && kubectl exec sec-box -- printenv DB_USER && kubectl exec sec-box -- printenv DB_PASS
```

**输出**：

```text
pod/sec-box created
admin
Passw0rd123
```

**解释**：明文进了 pod。关键点破：base64 只存在于**存储层**（etcd），kubelet 注入 pod 时**自动解码还原**——应用读到的就是原文，程序不需要也不该知道 base64 的存在。YAML 对照：昨天 configMapKeyRef，今天 secretKeyRef——只换对象类型，姿势全同。

---

## 结课出题与核对（原文）

**第 1 题（手写 Pod YAML：web-cfg，nginx:alpine，APP\_MODE 来自 ConfigMap app-settings 的键 mode）**

学生原文：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web-cfg
spec:
  containers:
    - image: nginx:alpine
      name: web-cfg
      env:
        - name: APP_MODE
          valueFrom:
            configMapKeyRef:
              name: app-settings
              key: mode
```

核对：**满分**。三层嵌套（valueFrom→configMapKeyRef→name/key）一处不错，还主动补了容器 name。对比第 12 课丢分点（审题、requests 拼写）全避开。

**第 2 题（base64 能解码，分成两个对象还有什么意义）**

学生原文：「他们的用处不一样，configmap是普通的用法，secret用作于秘钥」

核对：半分。方向对但停在**复述定义**，没答到机制层。推一层：只有一个对象类型则权限一刀切——能读配置的必然能读密码；分成两个对象集群才能**区别对待**：RBAC 可规定只能 get configmap 不能 get secret；审计分开记；Secret 有专用类型（docker-registry/tls）和专用挂载方式（内存文件系统不落节点盘）。口诀：**分成两个座位，才能给其中一个座位单独上门锁。**

**第 3 题（改了 ConfigMap，env 旧值、cat 挂载文件新值，为什么）**

学生原文：「因为他们使用的方式不一样，如果使用的env方式链接配置的时候，name就是旧值，但是如果是文件mount的方式，则会立即生效」

核对：基本满分。机制答对（env 一次性抄写 vs 文件挂载走挂载目录）。一个词失准：文件挂载不是「立即生效」，是「**约 1 分钟内生效**」——kubelet 按周期（默认每分钟）对账同步，实验等了 70 秒才见 THIRD-VERSION。表述要精确：周期同步、分钟级。（未提不扣分的一层：文件变≠进程读到新值，常驻进程缓存配置需 reload；本题场景是 cat。）

**战报：2.5 / 3**。第 12 课丢分点全清。新丢分点：**概念题别停在复述，往机制层推一步。**

---

## 本课总账


|        | ConfigMap  | Secret                |
| ------ | ---------- | --------------------- |
| 存什么    | 非敏感配置      | 敏感配置（密码/令牌/证书）        |
| 存储形态   | 明文         | base64 转写（不是加密）       |
| pod 消费 | env / 文件挂载 | env / 文件挂载（姿势完全同构）    |
| 注入后    | 原文         | 原文（自动解码，应用无感）         |
| 真正的安全  | —          | RBAC 分权、etcd 加密、外部密钥库 |


学完一对等于会两个——「配置对象 + 注入机制」这套骨架在 K8s 里复用。

## 课毕状态

- 本课实验对象全部清理：cfg-box / cfg-file / sec-box 已删；configmap my-config、secret db-secret 已删；/tmp/cfg-box.yaml、/tmp/cfg-file.yaml、/tmp/sec-box.yaml 已删
- 保留的其他课对象：configmap app-config、secret db-cred（5 天前作业）、kube-root-ca.crt（系统自带，每命名空间自动生成）、hello×5、web3×4、probe-test、tol-equal
- 新面孔（非本课产物，待用户表态）：pod/k9s-demo 处于 ImagePullBackOff（镜像拉取失败，用户 64 分钟前自建，疑似练 k9s 时所建，镜像名拼写或仓库可达性问题；可留下节课当真实排障教材）
- 下一课预告：cka-14《版本的座位——滚动更新与回滚》（Deployment 改镜像不停机换血、rollout 全家桶、一条命令回到昨天）


---

➡️ 下一篇：《版本的座位——滚动更新与回滚》（预告）：数据和配置都有了座位，应用自己的版本呢？改镜像如何不停机换血、rollout 全家桶怎么用、发坏了如何一条命令回到昨天——下一课把"版本"也搬进座位体系。
