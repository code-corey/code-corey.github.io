---
title: 数据的座位——PV、PVC 与 StorageClass（直接讲授实录）
sidebarGroup: CKA 通过之路
shortTitle: 12 PV PVC 存储卷
order: 12
date: 2026-09-23T00:00:00.000Z
author: Corey
category: 云原生
tag:
  - CKA
  - Kubernetes
  - PV
  - PVC
  - StorageClass
  - emptyDir
  - hostPath
description: pod 是随时会被赶走的房客，数据住哪？四站搬家实录：容器自带磁盘（pod 死文件陪葬）、emptyDir（同 pod 共享抽屉，照样殉葬）、hostPath（跨 pod 活了但绑死一台机器）、PVC/StorageClass/PV 三件套（申请单先 Pending 等第一个消费者，pod 落地货秒造，删 pod 数据复活，注销申请单货连数据物理销毁）。课堂中途全部清空从零重讲，课尾三道 CKA 风格出题暴露审数字、字段拼写、读表看错列三个丢分重灾区。
---

> **CKA 通过之路 · 第 13/13 篇**
> 上一篇：[《牌与书的博弈——tolerations 进阶》](/云原生/cka/cka-11-tolerations) · 下一篇：[《配置的座位——ConfigMap 与 Secret》](/云原生/cka/cka-13-configmap-secret)

---

> - 日期：2026-09-22 ~ 09-23
> - 学生：Corey（0 基础，直接讲授 + 小白重讲协议）
> - 环境：WSL2 Ubuntu-22.04 + kind v0.33.0 + Kubernetes v1.37.0，单节点 demo-control-plane
> - 本课特殊事件：中途用户要求「全部清空、从 0 重讲」——课上做了一次大扫除（删除本课全部 pod/PVC/PV/节点目录），第四站为重讲版；前三站实验为收官时补跑复刻版，输出全部真实
> - 官方文档核对新度：PV/PVC（2026-06 版，Recycle 已废弃，只讲 Retain/Delete；v1.33 起 PV 删除保护 finalizer 稳定）

---

## 课前大扫除（重置实验环境）

用户指令：「先所有今天的这次课所需的所有东西全部清空，重新再来」。

**命令**：

```bash
wsl bash -c "kubectl delete pod app1 share-box save-box load-box two-box read-box pvc-box --ignore-not-found && kubectl delete pvc data-claim --ignore-notfound && docker exec demo-control-plane sh -c 'rm -rf /data/lesson12 /data/k12 /var/local-path-provisioner/pvc-*' && rm -f /tmp/data-claim.yaml /tmp/pvc-box.yaml"
```

**输出**：

```text
pod "app1" deleted from default namespace
pod "share-box" deleted from default namespace
pod "load-box" deleted from default namespace
pod "two-box" deleted from default namespace
pod "read-box" deleted from default namespace
```

（链在 pod 删除后中断，PVC 残留，补刀：）

**命令**：

```bash
wsl bash -c "kubectl delete pvc data-claim && docker exec demo-control-plane sh -c 'rm -rf /data/lesson12 /data/k12 /var/local-path-provisioner/pvc-*'"
```

**输出**：

```text
persistentvolumeclaim "data-claim" deleted from default namespace
```

**复验**：

```bash
wsl bash -c "kubectl get pvc; kubectl get pv; docker exec demo-control-plane sh -c 'ls /data/ 2>&1; ls /var/local-path-provisioner/ 2>&1'"
```

```text
=== 申请单 PVC ===
No resources found in default namespace.
=== 货 PV ===（删除 2 秒时）
pvc-cdf99118-7769-4772-828e-cbc14e5cc3f8   1Gi   RWO   Delete   Released   default/data-claim   standard   <unset>   7h57m
（再等 8 秒）
No resources found
=== 节点目录 ===（两个 ls 均空输出）
```

**解释**：PVC 删除后 PV 不是瞬间消失，先进入 `Released`（已释放）状态，数秒后被彻底回收——这是删除保护机制在起作用，避免误删瞬间不可逆。集群回到白板：无本课 pod、无 PVC、无 PV、节点无实验目录。

---

## 第一站：pod中的数据跟着容器走，无法持久化

**命令**：

```bash
kubectl run app1 --image=nginx:alpine --command -- sleep 3600 && sleep 6 && kubectl get pod app1
```

（kubectl run=创建 pod；--image 用哪个镜像：nginx 网页服务器+alpine 超小 Linux；--command -- sleep 3600=执行"睡 3600 秒"保活）

**输出**：

```text
pod/app1 created
NAME   READY   STATUS    RESTARTS   AGE
app1   1/1     Running   0          7s
```

**命令**：

```bash
kubectl exec app1 -- sh -c 'date > /data.txt && ls -la /data.txt'
```

（exec=进 pod 的容器执行命令；date 打印时间；`>` 写入文件；ls -la 列详情）

（`--` 是**分隔符**，表示它后面的内容不再是 `kubectl` 自己的参数，而是要**传给容器内部执行的命令**）

（`sh -c '...'` 在容器里启动一个 `sh`（Shell），并用 `-c` 参数让它执行引号里的整段脚本。）

**输出**：

```text
-rw-r--r-- 1 root     root            29 Sep 22 21:11 /data.txt
```

**命令**：

```bash
kubectl delete pod app1 && kubectl run app1 --image=nginx:alpine --command -- sleep 3600 && sleep 6 && kubectl exec app1 -- ls -la /data.txt
```

（`--command`：表示后面跟的是**要覆盖容器默认启动命令**的完整命令）

（`--`：分隔符，后面 `sleep 3600` 是传给容器的命令）

**输出**：

```text
pod "app1" deleted from default namespace

pod/app1 created

ls: /data.txt: No such file or directory
command terminated with exit code 1
```

**解释**：exit code 1 是 ls 找不到文件的正常报错退出码。同名 pod ≠ 同一个体——k8s 重造的是全新容器，酒店同名客人退房重开，房间已清空。**结论：容器自带磁盘随 pod 陪葬。**

---

## 第二站：emptyDir——同 pod 的共享抽屉，照样陪葬

**命令**：

首先我们新建一个 /tmp/share-box.yaml

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: share-box
spec:
  containers:
    - name: writer
      image: nginx:alpine
      command: ["sleep", "3600"]
      volumeMounts:
        - name: shared-drawer
          mountPath: /shared
    - name: reader
      image: nginx:alpine
      command: ["sleep", "3600"]
      volumeMounts:
        - name: shared-drawer
          mountPath: /shared
  volumes:
    - name: shared-drawer
      emptyDir: {}
```

在这个YAML里面，我们定义了一个share-box的Pod，包含了两个容器

- writer 负责写的容器
- reader 负责读的容器

```bash
kubectl apply -f /tmp/share-box.yaml && sleep 8 && kubectl exec share-box -c writer -- sh -c 'date > /shared/note.txt && ls -la /shared/' && kubectl exec share-box -c reader -- cat /shared/note.txt
```

（一个 pod 两个容器，都挂名 shared-drawer 的卷；volumes 段 emptyDir: {} = 申请一个随 pod 生死的空目录）

（这里的 -c writer 也就是在 writer容器中执行）

**输出**：

```text
pod/share-box created
total 12
drwxrwxrwx    2 root     root            4096 Sep 22 21:51 .
drwxr-xr-x 3 root     root            4096 Sep 22 21:51 ..
-rw-r--r--    1 root     root            29 Sep 22 21:51 note.txt
Tue Sep 22 21:51:08 UTC 2026
```

下面再来验证一下当我们删除了pod之后，再重新创建pod的话，数据是否依旧存在

**命令**：

```bash
kubectl delete pod share-box && kubectl apply -f /tmp/share-box.yaml && sleep 8 && kubectl exec share-box -c reader -- ls -la /shared/
```

**输出**：

```text
pod "share-box" deleted from default namespace
pod/share-box created
total 8
drwxrwxrwx    2 root     root            4096 Sep 22 21:51 .
drwxrwxrwx    2 root     root            4096 Sep 22 21:51 ..
```

**解释**：抽屉（/shared 目录）随 pod 重建自动出现，但里面空了——note.txt 蒸发。**结论：emptyDir 解决"同 pod 容器共享"，不解决"pod 死数据殉葬"。**

---

## 第三站：hostPath——写到机器硬盘上，跨 pod 活了，但绑死一台机器

**命令**：

```yaml
## /tmp/save-box.yaml
apiVersion: v1
kind: Pod
metadata:
  name: save-box
spec:
  containers:
    - name: main
      image: nginx:alpine
      command: ["sleep", "3600"]
      volumeMounts:
        - name: machine-disk
          mountPath: /data
  volumes:
    - name: machine-disk
      hostPath:
        path: /data/lesson12
        type: DirectoryOrCreate
```
（hostPath.path=节点机器上的目录；type: DirectoryOrCreate=不存在就建）

```bash
kubectl apply -f /tmp/save-box.yaml && sleep 8 && kubectl exec save-box -- sh -c 'echo saved-on-machine > /data/machine-file.txt && ls -la /data/' && docker exec demo-control-plane sh -c 'ls -la /data/lesson12/'
```
（我们在容器内部往挂载的目录添加文件，然后跑到node节点中，看看数据来了没有）

**输出**：

```text
pod/save-box created

total 12
drwxrwxrwx 2 root root  4096 Sep 22 21:52 .
drwxr-xr-x 3 root root  4096 Sep 22 21:52 ..
-rw-r--r-- 1 root     root            17 Sep 22 21:52 machine-file.txt

total 12
drwxrwxrwx 3 root root  4096 Sep 22 21:52 .
drwxrwxrwx 2 root root  4096 Sep 22 21:52 ..
-rw-r--r-- 1 root     root            17 Sep 22 21:52 machine-file.txt
```

（两段输出：pod 的 /data 与节点的 /data/lesson12 是同一目录的两个视角）

接着我们再来验证一下，删除pod之后，数据是否能够回的来

**先对当前的pod进行删除**：
```bash
kubectl delete pod save-box
```
然后再重新添加一个格式一样的文件
```yaml
## /tmp/load-box.yaml
apiVersion: v1
kind: Pod
metadata:
  name: load-box
spec:
  containers:
    - name: main
      image: nginx:alpine
      command: ["sleep", "3600"]
      volumeMounts:
        - name: machine-disk
          mountPath: /data
  volumes:
    - name: machine-disk
      hostPath:
        path: /data/lesson12
        type: DirectoryOrCreate
```

**命令**：
```bash
kubectl apply -f /tmp/load-box.yaml && sleep 8 && kubectl exec load-box -- cat /data/machine-file.txt
```

**输出**：

```text
pod "save-box" deleted from default namespace
pod/load-box created
saved-on-machine
```

**解释**：save-box 已死，与它毫无关系的 load-box 挂同一 hostPath 读到了文件。**结论：数据活在本机硬盘上，跨 pod 存活。**但埋下致命伤：文件绑死这台机器——多节点生产环境里 pod 重造可能被派到另一台机器，新 pod 对着空目录两眼一抹黑。这正是第四站要解的题。

---

## 第四站：PVC / PV / StorageClass

### 概念（字面）

- **PV（PersistentVolume，持久卷）＝货**：被集群登记在册的存储空间，寿命独立于 pod。本集群里物理实体=节点硬盘 /var/local-path-provisioner/ 下一个文件夹
- **PVC（PersistentVolumeClaim，持久卷申请）＝申请单**：用户填的单子，"我要 1G"，不管货在哪谁造
- **StorageClass（存储类）＝造货模板**：预先写好的说明书——用什么工具造（provisioner）、不要了怎么处理（reclaimPolicy）、什么时候造（volumeBindingMode）
- 一句话：**填单（PVC）→ 照模板（StorageClass）现造货（PV）→ pod 挂载使用**

### ① 看家底

**命令**：

```bash
kubectl get sc
```

（sc 就是 **StorageClass的简写**）

**输出**：

```text
NAME                 PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION   AGE
standard (default)   rancher.io/local-path   Delete          WaitForFirstConsumer   false                  6d19h
```

**解释**：kind 建集群时预埋的默认模板。(default)=PVC 不指定模板自动套它；

rancher.io/local-path=Rancher 公司的本地路径供给器，货造在节点本地文件夹；

Delete=单子注销货和数据一起销毁（另一常见值 Retain=留着等人工处置）；

WaitForFirstConsumer=等第一个消费者（真有 pod 用）才造货。

### ② 递申请单，观察 Pending

**命令**：

```yaml
##/tmp/data-claim.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-claim
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
```

```bash
kubectl apply -f /tmp/data-claim.yaml && sleep 3 && kubectl get pvc data-claim && sleep 12 && kubectl get pvc data-claim
```
（创建好这个PVC后，睡一段时间，再观察它的状态是什么）

**输出**：

```text
persistentvolumeclaim/data-claim created
NAME         STATUS    VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE
data-claim   Pending                                      standard       <unset>                 4s
NAME         STATUS    VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE
data-claim   Pending                                      standard       <unset>                 16s
```

**解释**：accessModes ReadWriteOnce=同一时间只许一个节点读写（RWO）；
1Gi=1073741824 字节（k8s 只认 Gi/Mi 二进制单位）；
没写 storageClassName 所以套默认模板。
两次查看均 Pending、VOLUME 空——不是故障，是 WaitForFirstConsumer 在等消费者：货是"某台机器上的文件夹"，pod 会被派到哪台机器现在未知，先造可能造错机器，等 pod 落位再在 pod 所在机器现造。

### ③ 造消费者，三表联动

**命令**：

```yaml
## /tmp/pvc-box.yaml
apiVersion: v1
kind: Pod
metadata:
  name: pvc-box
spec:
  containers:
    - name: main
      image: nginx:alpine
      command: ["sleep", "3600"]
      volumeMounts:
        - name: storage
          mountPath: /data
  volumes:
    - name: storage
      persistentVolumeClaim:
        claimName: data-claim
```

```bash
kubectl apply -f /tmp/pvc-box.yaml && sleep 15 && kubectl get pod pvc-box && kubectl get pvc data-claim && kubectl get pv
```

（volumes 段声明"我消费 data-claim 这张单"；volumeMounts 把货接到容器 /data 目录）

**输出**：

```text
pod/pvc-box created

NAME      READY   STATUS    RESTARTS   AGE
pvc-box   1/1     Running   0          15s

NAME         STATUS    VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE
data-claim   Bound    pvc-3e8ef02e-e2bc-41c6-a2b1-66dfc831e291   1Gi        RWO            standard   <unset>                 41s

NAME                                       CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS   CLAIM                STORAGECLASS   VOLUMEATTRIBUTESCLASS   REASON   AGE
pvc-3e8ef02e-e2bc-41c6-a2b1-66dfc831e291   1Gi        RWO            Delete           Bound    default/data-claim   standard   <unset>                          10s
```

**解释**：pod 一出现：PVC Pending→Bound（VOLUME 列填上货编号）；PV 现造出现（`AGE 10s < PVC 41s`，货比单子年轻 31 秒——WaitForFirstConsumer 兑现）；单子与货靠编号 pvc-3e8ef02e-... 一一配对，这就是"绑定"。货名=前缀 pvc- + 单子的内部编号（uid），自动命名。

### ④ 货的物理实体 + 双视角写读

**命令**：

```bash
docker exec demo-control-plane sh -c 'ls /var/local-path-provisioner/'
```

**输出**：

```text
pvc-3e8ef02e-e2bc-41c6-a2b1-66dfc831e291_default_data-claim
```

**解释**："造货"的物理实质=在节点硬盘建了文件夹，名=货编号_命名空间_单子名。此刻空的，还没人放东西。

**命令**：

```bash
kubectl exec pvc-box -- sh -c 'date > /data/witness.txt && ls -la /data/'
docker exec demo-control-plane sh -c 'ls -la /var/local-path-provisioner/pvc-*/'
```

**输出**：

```text
total 12
drwxrwxrwx 2 root     root            4096 Sep 22 21:22 .
drwxr-xr-x 3 root     root            4096 Sep 22 21:22 ..
-rw-r--r-- 1 root     root            29 Sep 22 21:22 witness.txt

total 12
drwxrwxrwx 2 root     root            4096 Sep 22 21:22 .
drwxr-xr-x 3 root     root            4096 Sep 22 21:22 ..
-rw-r--r-- 1 root     root            29 Sep 22 21:22 witness.txt
```

**解释**：pod 的 /data/witness.txt 与节点货文件夹里的 witness.txt——同一文件两扇门。挂载的字面意思：把别处的存储接到自己目录树上。

### ⑤ 终极测试：pod 死了，货呢

**命令**：

```bash
kubectl delete pod pvc-box
kubectl get pvc data-claim
docker exec demo-control-plane sh -c 'ls /var/local-path-provisioner/'
```

**输出**：

```text
pod "pvc-box" deleted from default namespace

NAME         STATUS    VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE
data-claim   Bound    pvc-3e8ef02e-e2bc-41c6-a2b1-66dfc831e291   1Gi        RWO            standard   <unset>                 2m5s

pvc-3e8ef02e-e2bc-41c6-a2b1-66dfc831e291_default_data-claim
```

**解释**：消费者死亡，单子仍 Bound、货文件夹原地不动——数据此刻无 pod 使用，静静躺在货里。

接下来再来验证一下，重新创建pod后，数据是否能够找到的回来

**命令**：

```bash
wsl bash -c "kubectl apply -f /tmp/pvc-box.yaml && sleep 10 && kubectl get pod pvc-box && kubectl exec pvc-box -- cat /data/witness.txt"
```

**输出**：

```text
pod/pvc-box created
NAME      READY   STATUS    RESTARTS   AGE
pvc-box   1/1     Running   0          10s
Tue Sep 22 21:22:55 UTC 2026
```

**解释**：全新 pod（AGE 10s）cat 出写入时刻分秒不差的内容——数据跨 pod 复活。对照第一站 app1 的 data.txt 蒸发：**数据从 pod 的生死簿上划掉了**。

### ⑥ 回收：Delete 策略三段式

**命令**：

```bash
wsl bash -c "kubectl delete pod pvc-box && kubectl delete pvc data-claim && sleep 2 && kubectl get pv; sleep 10; kubectl get pv 2>&1; docker exec demo-control-plane sh -c 'ls /var/local-path-provisioner/'"
```

**输出**：

```text
pod "pvc-box" deleted from default namespace
persistentvolumeclaim "data-claim" deleted from default namespace
（2 秒时）
NAME                                       CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS     CLAIM                STORAGECLASS   VOLUMEATTRIBUTESCLASS   REASON   AGE
pvc-3e8ef02e-e2bc-41c6-a2b1-66dfc831e291   1Gi        RWO            Delete           Released   default/data-claim   standard   <unset>                          2m32s
（10 秒后）
No resources found
（节点硬盘）
（空输出）
```

**解释**：单子注销→货先 Released（解绑，防误删的保护期）→数秒后从账本消失→节点硬盘文件夹连同 witness.txt 物理销毁。**数据的生死只跟单子（PVC）走**——这就是回收策略。另一常见值 Retain=货留着等人工处置，Released 状态的货不会被新 PVC 自动绑定（出题第 3 题考点）。

---

## 结课出题与核对（原文）

**第 1 题（手写 PVC，要求 my-data / 512Mi / RWO）**

学生原文：

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-data
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    request:
      storage: 1Gi
```

核对：结构全对、ReadWriteOnce 拼写正确；两处失分——①容量照抄示例 1Gi，题目是 512Mi（CKA 陷阱=改数字）；②`request:` 应为 `requests:`（复数，YAML 字段差一个字母都不认）。

**第 2 题（hostPath 与 PVC 核心差异）**

学生原文：「hostpath 会直接放在主机上面，而且是无法维护，但是pvc是单独使用一个pv节点进行维护的」

核对：hostPath 放主机上 ✓；「无法维护」含糊、「PV 节点」术语错误（节点=机器，PV=存储卷，不同对象）。核心差异一句话：**hostPath 把数据绑死某台机器，pod 换机器就失明；PVC 让数据跟着单子走，pod 到哪都接同一块货。**

**第 3 题（判读 PV 输出，pvc-ab12 / 1Gi / Retain / Released / default/data-claim）**

学生原文：「不会，这个持久卷被释放了」

核对：②问（新单能分到吗）答对——不会，Retain+Released 不自动再分配，需管理员手动清理并改 Available。①问（单子还在吗）漏答——**单子已不在**：Released 的定义就是单子已注销；CLAIM 列写着的 default/data-claim 是历史记录（退租登记簿上的旧租客名）。口诀：**看 STATUS 列，别看 CLAIM 列**。

---

## 四站总账

| 站 | 方案 | pod 死后 | 一句话 |
| --- | --- | --- | --- |
| 1 | 容器自带磁盘 | 蒸发 | 盒子被扔，盒里的全没 |
| 2 | emptyDir | 陪葬 | 同 pod 共享的临时抽屉 |
| 3 | hostPath | 在机器上 | 活了，但绑死一台机器 |
| 4 | PVC/PV/StorageClass | 在货里 | 数据跟着单子走，pod 只是租客 |

## 课毕状态

- 本课实验对象全部清理（app1/share-box/save-box/load-box/pvc-box 已删；PVC/PV 已回收；节点 /data/lesson12、/var/local-path-provisioner/ 已清空）
- 保留的其他课作业：hello×5、web3×4、probe-test、tol-equal
- 临时 yaml（/tmp/share-box.yaml、/tmp/save-box.yaml、/tmp/load-box.yaml）留在 WSL，供博客文章复现参考，下次开课前清理

---

➡️ 下一篇：[《配置的座位——ConfigMap 与 Secret》](/云原生/cka/cka-13-configmap-secret)（预告）：数据有了座位，配置呢？镜像里写死的环境变量、数据库密码、nginx 配置文件——改一个字就得重新打包镜像的日子该结束了。下一课把"配置"也搬出镜像，给它发户口。
