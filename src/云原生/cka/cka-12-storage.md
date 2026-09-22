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
description: pod 是随时会被赶走的房客，那数据住哪？这堂课搬了四次家：容器自带磁盘（盒子被扔文件陪葬）、emptyDir（同 pod 共享抽屉，pod 死照样殉葬）、hostPath（写到机器硬盘，跨 pod 活了但绑死一台机器）、最后 PVC 申请单 + StorageClass 模板 + PV 货位三件套登场——申请单递上去先 Pending 十几秒没人理（WaitForFirstConsumer 在等第一个消费者）、pod 一落地货秒造出来、文件在 pod 的 /data 和节点硬盘上双视角对上号、删 pod 数据原样复活、注销申请单货连数据物理销毁。中途学生要求全部清空从零重讲，课尾三道 CKA 风格出题暴露了审数字、字段拼写、读表看错列三个丢分重灾区。附 kind 与生产集群对照图和全部命令清单。
---

> **CKA 通过之路 · 第 13/13 篇**
> 上一篇：[《牌与书的博弈——tolerations 进阶》](/云原生/cka/cka-11-tolerations) · 下一篇：[《配置的座位——ConfigMap 与 Secret》](/云原生/cka/cka-13-configmap-secret)

---

## 写在前面

上一课结尾留了一扇门：pod 是随时可以被赶走的房客，那数据呢？数据库存的记录、用户传的图、程序写的日志——pod 死了一百次，它们得活得好好的。

这一课就搬着"数据"找座位，一共要搬四次家。课堂中段还发生了一次意外事件：学生喊停，要求把课上造过的所有东西清空、从零重讲——于是这堂课多了一段"大扫除"实录，以及一次货真价实的推倒重来。

参考资料（写作时逐字核对）：

- [Persistent Volumes —— 官方概念文档](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)（2026-06 版）：PV/PVC 生命周期、两阶段绑定、卷模式；旧的 `Recycle` 回收策略已废弃，只剩 `Retain` 和 `Delete` 可讲
- [Storage Classes —— 官方概念文档](https://kubernetes.io/docs/concepts/storage/storage-classes/)（2026-06 版）：provisioner、reclaimPolicy、volumeBindingMode
- v1.33 起 PV 删除保护（`kubernetes.io/pv-deletion-protection` finalizer）转正——本课回收实验里货不是瞬间消失而是先 `Released`，背后就是它

---

## 第一章：环境盘点——这个集群怎么来的、长什么样

正课开讲前，先花一章把脚下的地面看清。这堂课所有实验都跑在一个叫 kind 的东西造的集群上——kind 全称 Kubernetes IN Docker，Kubernetes 官方维护的工具，只干一件事：把集群的每个"节点"做成一个 Docker 容器，让你在一台 Windows 笔记本上，不买真机、不装虚拟机，几分钟得到一套能用的集群。

### 建集群的那条命令

这是第 1 课（cka-01）建集群时的实录，一条命令，当时真实输出照录：

```bash
time kind create cluster --name demo --wait 120s
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

逐参数读：`time` 不是 kind 的参数，是 shell 自带计时器（所以末尾多了 real 3m7.908s）；`create cluster` 子命令"造一个集群"；`--name demo` 给集群起名，节点容器名就从这来——demo 加角色 control-plane，等于 demo-control-plane；`--wait 120s` 最多等 2 分钟，等到控制面真正 Ready 才算完。

输出那 7 行是它内部的流水账：确认节点镜像（kindest/node:v1.37.0）→ 启动容器造"机器"→ 写证书和配置 → 在容器里拉起 apiserver、scheduler、etcd → 装 CNI 网络插件（没有它 pod 永远 Pending）→ 装默认 StorageClass（记住第 6 行，本课第四站的主角就是它）→ 把连接信息写进 ~/.kube/config。27 秒干完这七件事，从此 kubectl 一抬手就知道找谁。

### 这个集群长什么样：和生产的对照

课堂此处用 Archify 画了一张对照图（交互 HTML 在文末附图段），文字版如下。

教学环境（咱们现在用的）——四层嵌套，全是模拟：

```text
Windows 宿主机（学员笔记本）
  └─ WSL2（Windows 里的 Linux 子系统）
       └─ Docker Engine（容器运行时）
            └─ demo-control-plane ← 一个 Docker 容器，扮演了"一台机器"
                 ├─ 控制面组件（apiserver · scheduler · etcd）
                 ├─ 业务 Pod（app1、hello、share-box…）
                 └─ /data/lesson12 ← hostPath 数据落点
```

关键认知：这个"节点"本身是个 Docker 容器——hostPath 的数据，物理上最深处躺在 Docker 容器的文件系统里。这也是后文 `docker exec` 能直接钻进"节点"翻文件的原因。

生产环境（真的）——真机群，各司其职：

```text
机房 / 公有云（真机群）
  ├─ 控制节点 ×1~3（真机，跑 apiserver/scheduler/etcd）
  ├─ 工作节点 ×N（真机，跑 kubelet + Pod 容器）
  └─ 真实存储（云盘/NFS——PV 的底层）
```

三句话总结差异：模拟 vs 真机——教学环境四层嵌套全在 Windows 里，生产每台节点是独立物理机；一肩挑 vs 分工——kind 单节点既当控制又当干活，生产里控制节点只拍板、工作节点只干活；看不出 vs 看得出——单节点永远体会不到"pod 被派到另一台机器、hostPath 数据留在原机器"的分家问题，那正是本课第四站要解决的。

顺带一提真机怎么搭：几台真机的标准工具是 kubeadm（kube + administration，Kubernetes 官方的集群组装工具）——每台机器装 containerd、kubelet、kubeadm、kubectl 四件套，控制节点跑 `kubeadm init`，工作节点贴上它打印的 `kubeadm join` 命令。kind 内部跑的就是 kubeadm：钻进 demo-control-plane 看，`/etc/kubernetes/` 下的 pki 证书、manifests 四大件启动清单、admin.conf 管理员凭证，全是 kubeadm 的标准布局。学的东西和真机世界完全通用，差的只是环境规模。

### kubectl 打电话，docker exec 登门

本课会用到两条完全不同的路，先分清。kubectl：装在 WSL 里的独立小程序，自己不在集群里——每次执行都读 ~/.kube/config 电话簿（apiserver 地址加身份），发 HTTPS 请求过去，管的是活物（pod、申请单、调度）。docker exec：人真的走进 demo-control-plane 容器，翻的是文件（YAML 清单、证书、数据目录）——屋里没有总台，下不了管理指令。apiserver 起不来时电话永远打不通，只剩登门排障一条路，所以两条都得会。

地面看清了。接下来，正课从一场大扫除开始。

## 序幕：一场大扫除

重讲从清空开始。这堂课之前已经走过一轮，留下了一堆实验品：六个 pod、一张申请单、一块货、节点上两个数据目录。全部拆掉：

```bash
wsl bash -c "kubectl delete pod app1 share-box save-box load-box two-box read-box pvc-box --ignore-notfound && kubectl delete pvc data-claim --ignore-notfound && docker exec demo-control-plane sh -c 'rm -rf /data/lesson12 /data/k12 /var/local-path-provisioner/pvc-*' && rm -f /tmp/data-claim.yaml /tmp/pvc-box.yaml"
```

```text
pod "app1" deleted from default namespace
pod "share-box" deleted from default namespace
pod "load-box" deleted from default namespace
pod "two-box" deleted from default namespace
pod "read-box" deleted from default namespace
```

输出停在第五行——命令链在 pod 删除后断了，申请单还活着。补一刀：

```bash
wsl bash -c "kubectl delete pvc data-claim && docker exec demo-control-plane sh -c 'rm -rf /data/lesson12 /data/k12 /var/local-path-provisioner/pvc-*'"
```

```text
persistentvolumeclaim "data-claim" deleted from default namespace
```

有意思的是删除后第 2 秒查货，它还在：

```text
NAME                                       CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS     CLAIM
pvc-cdf99118-7769-4772-828e-cbc14e5cc3f8   1Gi        RWO            Delete           Released   default/data-claim
```

`STATUS` 从 `Bound` 变成了 `Released`（已释放）——申请单没了，货先解绑、挂个保护期，几秒后才真正销毁。这就是开头参考资料里说的删除保护 finalizer 在值夜班。再等 8 秒，`kubectl get pv` 报 `No resources found`，节点硬盘上的数据目录也空了。白板一块，开课。

---

## 第一站：pod 自带的磁盘——盒子被扔，盒里的全没

先立四个地基词，后面全课都踩在它们上面。容器：打包好、隔离运行的程序盒子，有自己的一小块文件系统。pod：Kubernetes 管理的最小工作单位，里面装一个或几个容器，性格是一次性的——升级、故障、搬家，随时销毁重造。节点：跑 pod 的机器，咱们集群里那台 demo-control-plane 其实是个 Docker 容器扮演的假机器，Kubernetes 一视同仁。kubectl：装在 WSL 里的普通小程序，通过网络给集群下指令，自己并不在集群里。

问题只有一个：程序往硬盘写文件，文件写进 pod 里会怎样？

造个实验品。`kubectl run` 创建 pod，`--image` 指定镜像（nginx 网页服务器 + alpine 超小 Linux 的打包盒），`--command -- sleep 3600` 让它睡一小时保命：

```bash
wsl bash -c "kubectl run app1 --image=nginx:alpine --command -- sleep 3600 && sleep 6 && kubectl get pod app1"
```

```text
pod/app1 created
NAME   READY   STATUS    RESTARTS   AGE
app1   1/1     Running   0          7s
```

`1/1 Running`，一个容器、就绪、运行中。往它硬盘里写个文件——`kubectl exec` 进 pod 执行命令，`date` 打印当前时间，`>` 把输出写进 `/data.txt`，`ls -la` 验货：

```bash
wsl bash -c "kubectl exec app1 -- sh -c 'date > /data.txt && ls -la /data.txt'"
```

```text
-rw-r--r-- 1 root     root            29 Sep 22 21:11 /data.txt
```

29 字节落袋。现在处决它，再建一个同名的，回去找文件：

```bash
wsl bash -c "kubectl delete pod app1 && kubectl run app1 --image=nginx:alpine --command -- sleep 3600 && sleep 6 && kubectl exec app1 -- ls -la /data.txt"
```

```text
pod "app1" deleted from default namespace
pod/app1 created
ls: /data.txt: No such file or directory
command terminated with exit code 1
```

`exit code 1` 是 `ls` 找不到文件时的正常报错退出码，不是故障。要害在前一行：文件没了。名字一样不代表是同一个盒子——Kubernetes 重造的是全新个体，好比酒店同名客人退房重开，房间已全部清空。第一站结论：容器自带的磁盘随 pod 陪葬。

---

## 第二站：emptyDir——同 pod 的共享抽屉，照样陪葬

第一个正经的卷类型登场。emptyDir 的字面意思：pod 创建时附赠一个空目录（empty dir），同 pod 里的容器都可以挂它——像合租房间里的公共抽屉。

造一个双人 pod，writer 和 reader 两个容器，挂同一个名 shared-drawer 的卷。YAML 里两处关键：每个容器的 `volumeMounts` 说"把卷接到我的 /shared 目录"，底下 `volumes` 段声明卷本体，`emptyDir: {}` 申请一个随 pod 生死的空目录：

```bash
wsl bash -c "cat > /tmp/share-box.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: share-box
spec:
  containers:
    - name: writer
      image: nginx:alpine
      command: [\"sleep\", \"3600\"]
      volumeMounts:
        - name: shared-drawer
          mountPath: /shared
    - name: reader
      image: nginx:alpine
      command: [\"sleep\", \"3600\"]
      volumeMounts:
        - name: shared-drawer
          mountPath: /shared
  volumes:
    - name: shared-drawer
      emptyDir: {}
EOF
kubectl apply -f /tmp/share-box.yaml && sleep 8 && kubectl exec share-box -c writer -- sh -c 'date > /shared/note.txt && ls -la /shared/' && kubectl exec share-box -c reader -- cat /shared/note.txt"
```

```text
pod/share-box created
total 12
drwxrwxrwx    2 root     root            4096 Sep 22 21:51 .
drwxr-xr-x 3 root     root            4096 Sep 22 21:51 ..
-rw-r--r--    1 root     root            29 Sep 22 21:51 note.txt
Tue Sep 22 21:51:08 UTC 2026
```

注意最后一条命令的 `-c reader`——指定进 reader 容器。writer 写进抽屉的 29 字节，reader 原样读出，共享成立。老规矩，杀 pod 重建再看：

```bash
wsl bash -c "kubectl delete pod share-box && kubectl apply -f /tmp/share-box.yaml && sleep 8 && kubectl exec share-box -c reader -- ls -la /shared/"
```

```text
pod "share-box" deleted from default namespace
pod/share-box created
total 8
drwxrwxrwx    2 root     root            4096 Sep 22 21:51 .
drwxr-xr-x 3 root     root            4096 Sep 22 21:51 ..
```

抽屉随 pod 重建自动出现（`total 8` 只有目录自身），里面的 note.txt 蒸发了。emptyDir 解决"同 pod 容器共享"，不解决"pod 死数据殉葬"——抽屉钉在棺材里。


---

## 第三站：hostPath——写到机器硬盘上，跨 pod 活了，但绑死一台机器

思路升级：别把文件放 pod 里了，放到 pod 外面、节点机器的硬盘上。hostPath 的字面意思：直接引用宿主机（host）上的一条路径（path）。

save-box 挂节点的 /data/lesson12 目录。`volumes` 段里 `hostPath.path` 写节点上的绝对路径，`type: DirectoryOrCreate` 表示不存在就现场创建：

```bash
wsl bash -c "cat > /tmp/save-box.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: save-box
spec:
  containers:
    - name: main
      image: nginx:alpine
      command: [\"sleep\", \"3600\"]
      volumeMounts:
        - name: machine-disk
          mountPath: /data
  volumes:
    - name: machine-disk
      hostPath:
        path: /data/lesson12
        type: DirectoryOrCreate
EOF
kubectl apply -f /tmp/save-box.yaml && sleep 8 && kubectl exec save-box -- sh -c 'echo saved-on-machine > /data/machine-file.txt && ls -la /data/' && docker exec demo-control-plane sh -c 'ls -la /data/lesson12/'"
```

```text
pod/save-box created
total 12
drwxrwxrwx 2 root root  4096 Sep 22 21:52 .
drwxr-xr-x 3 root root  4096 Sep 22 21:52 ..
-rw-r--r-- 1 root     root            17 Sep 22 21:52 machine-file.txt
total 12
drwxr-xr-x 3 root root  4096 Sep 22 21:52 .
drwxr-xrwx 2 root root  4096 Sep 22 21:52 ..
-rw-r--r-- 1 root     root            17 Sep 22 21:52 machine-file.txt
```

两段输出是同一份文件的两个视角：pod 里的 /data/machine-file.txt，和 `docker exec` 钻进节点容器看到的 /data/lesson12/machine-file.txt——17 字节，分毫不差。

现在杀 save-box，换一个跟它毫无关系的 load-box 挂同一目录来读（YAML 同构，只改 name）：

```bash
wsl bash -c "kubectl delete pod save-box && kubectl apply -f /tmp/load-box.yaml && sleep 8 && kubectl exec load-box -- cat /data/machine-file.txt"
```

```text
pod "save-box" deleted from default namespace
pod/load-box created
saved-on-machine
```

写它的 pod 尸骨已寒，无关第三人照样读到内容——数据活在本机硬盘上，跨 pod 存活。但这一站埋着致命伤：文件绑死这台机器。生产环境几十台机器，pod 在 1 号机死了、重造时被派到 2 号机，新 pod 对着自己名下的目录两眼一抹黑。单节点教学集群演示不了"失明"现场，但架构图能说清楚这件事——课堂此处插了两张图（见文末附图），左边 kind 四层嵌套全是模拟，右边生产真机各司其职。

---

## 第四站：PVC / PV / StorageClass——数据的正式户口

### 三个词，一段关系

PV（PersistentVolume，持久卷）：被集群登记在册的存储空间，寿命独立于 pod。在咱们集群里，它的物理实体就是节点硬盘上 /var/local-path-provisioner/ 目录下的一个文件夹。PVC（PersistentVolumeClaim，持久卷申请）：用户填的申请单，"我要 1G"，不管货在哪、谁造。Claim 字面就是声明、索要。StorageClass（存储类）：预先写好的造货说明书——用什么工具造、造好不要了怎么处理、什么时候造。

一句话关系：填单（PVC）→ 照模板（StorageClass）现造货（PV）→ pod 挂上货用。

### 看家底

`kubectl get sc` 查模板（sc 是 StorageClass 缩写）：

```bash
wsl bash -c "kubectl get sc"
```

```text
NAME                 PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION   AGE
standard (default)   rancher.io/local-path   Delete          WaitForFirstConsumer   false                  6d19h
```

逐列读：`standard (default)`，模板名，括号里的 (default) 表示默认模板——申请单上不写用哪个模板，自动套它。`rancher.io/local-path`，造货工具：Rancher 公司的本地路径供给器（rancher.io 是它的域名），货造在节点本地文件夹。`Delete`，回收策略：将来申请单注销，货和数据一起销毁；另一个常见值 Retain 是留着等人工处置。`WaitForFirstConsumer`，造货时机，字面"等待第一个消费者"——单子递上来先不造货，等真有 pod 来用才动手。最后 `false` 是不许事后扩容。这张表是 kind 建集群那天预埋的，六天没人动过。

### 递申请单，然后被晾着

要 1G 存储。YAML 逐字段过：`kind: PersistentVolumeClaim` 声明这是张申请单；`accessModes: ReadWriteOnce` 访问模式"读写、仅一个节点"，同一时间只许一台机器接着用，缩写 RWO；`storage: 1Gi` 要 1Gi 容量，Gi 是 1073741824 字节，Kubernetes 只认 Gi/Mi 这类二进制单位；没写 storageClassName，所以自动套默认模板 standard：

```bash
wsl bash -c "cat > /tmp/data-claim.yaml <<'EOF'
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
EOF
kubectl apply -f /tmp/data-claim.yaml && sleep 3 && kubectl get pvc data-claim && sleep 12 && kubectl get pvc data-claim"
```

```text
persistentvolumeclaim/data-claim created
NAME         STATUS    VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE
data-claim   Pending                                      standard       <unset>                 4s
NAME         STATUS    VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE
data-claim   Pending                                      standard       <unset>                 16s
```

两个时间点都是 `Pending`（待定），VOLUME 列空着——没分到货。等 12 秒毫无变化，这不是故障，是模板里 WaitForFirstConsumer 在起作用：集群在等第一个消费者。为什么这么设计？这模板造的货是"某台机器上的文件夹"，而 pod 将来被派到哪台机器现在没人知道——现在就造，万一货造在 1 号机、pod 却被派去 2 号机，白造还占地方。所以按兵不动，等 pod 落位，在 pod 所在的那台机器现造。生产用云盘、网络存储没这个纠结——所有机器都够得着；本地路径方案是因地制宜。

### 消费者一到，三表联动

造个 pod 拿着这张单子开店。YAML 里两段新面孔：`volumes` 段声明"我消费 data-claim 这张单"（persistentVolumeClaim.claimName），`volumeMounts` 段把货接到容器内的 /data 目录——挂载的字面意思，就是给远处的仓库开一扇本地的门：

```bash
wsl bash -c "cat > /tmp/pvc-box.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: pvc-box
spec:
  containers:
    - name: main
      image: nginx:alpine
      command: [\"sleep\", \"3600\"]
      volumeMounts:
        - name: storage
          mountPath: /data
  volumes:
    - name: storage
      persistentVolumeClaim:
        claimName: data-claim
EOF
kubectl apply -f /tmp/pvc-box.yaml && sleep 15 && kubectl get pod pvc-box && kubectl get pvc data-claim && kubectl get pv"
```

```text
pod/pvc-box created
NAME      READY   STATUS    RESTARTS   AGE
pvc-box   1/1     Running   0          15s
NAME         STATUS    VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE
data-claim   Bound    pvc-3e8ef02e-e2bc-41c6-a2b1-66dfc831e291   1Gi        RWO            standard       <unset>                 41s
NAME                                       CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS   CLAIM                STORAGECLASS   VOLUMEATTRIBUTESCLASS   REASON   AGE
pvc-3e8ef02e-e2bc-41c6-a2b1-66dfc831e291   1Gi        RWO            Delete           Bound    default/data-claim   standard   <unset>                          10s
```

三张表同框，机制全程现形。pod 表：pvc-box 开张。申请单表：STATUS 从 Pending 翻成 Bound（已绑定），VOLUME 列填上货的编号。货表最关键：那块货叫 pvc-3e8ef02e-e2bc-41c6-a2b1-66dfc831e291——前缀 pvc- 加申请单的内部编号（uid），自动命名，没人手写；AGE 一栏，货 10 秒，单子 41 秒，货比单子年轻 31 秒——单子递上来 31 秒无人问津，pod 一出现，货才被现造出来。WaitForFirstConsumer 的字面承诺，当场兑现。单子与货靠编号一一配对，这就是"绑定"的实质。

### 钻到节点硬盘，看货的物理实体

模板说了货是节点本地文件夹，去验收。local-path 造的货统一放在 /var/local-path-provisioner/ 下：

```bash
wsl bash -c "docker exec demo-control-plane sh -c 'ls /var/local-path-provisioner/'"
```

```text
pvc-3e8ef02e-e2bc-41c6-a2b1-66dfc831e291_default_data-claim
```

文件夹名字是"货编号_命名空间_单子名"。此刻空的——"造货"的物理实质就是建了这个文件夹。往 pod 的 /data 写点东西，再两边对表：

```bash
wsl bash -c "kubectl exec pvc-box -- sh -c 'date > /data/witness.txt && ls -la /data/'"
wsl bash -c "docker exec demo-control-plane sh -c 'ls -la /var/local-path-provisioner/pvc-*/'"
```

```text
total 12
drwxrwxrwx 2 root root  4096 Sep 22 21:22 .
drwxr-xr-x 3 root root  4096 Sep 22 21:22 ..
-rw-r--r-- 1 root     root            29 Sep 22 21:22 witness.txt
total 12
drwxrwxrwx 2 root root  4096 Sep 22 21:22 .
drwxr-xr-x 3 root root  4096 Sep 22 21:22 ..
-rw-r--r-- 1 root     root            29 Sep 22 21:22 witness.txt
```

第一段是 pod 眼里的 /data，第二段是节点硬盘上的货文件夹——witness.txt，29 字节，同一时刻，同一份文件，两扇门。

这里课堂还翻过一个小车：第二遍查看时，命令里的 `pvc-*` 忘了包进 `sh -c '...'` 的单引号，通配符被外面的 WSL 在自己的目录里展开（那边没有 pvc 开头的东西，就原样传了个字面 pvc-* 进容器去找），报了 `No such file or directory`。教训一条：`wsl bash -c "..."` 双引号里凡是想让容器端展开的通配符，必须包进容器自己的 `sh -c '...'` 单引号里。

### 终极测试：pod 死了，货呢

删掉 pvc-box，查两处：

```bash
wsl bash -c "kubectl delete pod pvc-box && kubectl get pvc data-claim && docker exec demo-control-plane sh -c 'ls /var/local-path-provisioner/'"
```

```text
pod "pvc-box" deleted from default namespace
NAME         STATUS    VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE
data-claim   Bound    pvc-3e8ef02e-e2bc-41c6-a2b1-66dfc831e291   1Gi        RWO            standard       <unset>                 2m5s
pvc-3e8ef02e-e2bc-41c6-a2b1-66dfc831e291_default_data-claim
```

消费者死亡，单子仍 Bound，节点硬盘上货文件夹原地不动——数据此刻没有任何 pod 在用，静静躺在货里。重开一家店，接同一张单：

```bash
wsl bash -c "kubectl apply -f /tmp/pvc-box.yaml && sleep 10 && kubectl get pod pvc-box && kubectl exec pvc-box -- cat /data/witness.txt"
```

```text
pod/pvc-box created
NAME      READY   STATUS    RESTARTS   AGE
pvc-box   1/1     Running   0          10s
Tue Sep 22 21:22:55 UTC 2026
```

全新 pod（AGE 10 秒），cat 出 `Tue Sep 22 21:22:55 UTC 2026`——和写入时刻分秒不差。对照第一站同款实验：app1 的 data.txt 蒸发，pvc-box 的 witness.txt 复活。数据从 pod 的生死簿上划掉了。

### 退租：Delete 策略三段式

还剩模板里没演的字段：RECLAIMPOLICY Delete。三步盯着走——先删单子，再看货，再看节点硬盘：

```bash
wsl bash -c "kubectl delete pod pvc-box && kubectl delete pvc data-claim && sleep 2 && kubectl get pv; sleep 10; kubectl get pv 2>&1; docker exec demo-control-plane sh -c 'ls /var/local-path-provisioner/'"
```

```text
pod "pvc-box" deleted from default namespace
persistentvolumeclaim "data-claim" deleted from default namespace
NAME                                       CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS     CLAIM                STORAGECLASS   VOLUMEATTRIBUTESCLASS   REASON   AGE
pvc-3e8ef02e-e2bc-41c6-a2b1-66dfc831e291   1Gi        RWO            Delete           Released   default/data-claim   standard       <unset>                          2m32s
No resources found
```

最后一行之后节点硬盘的 ls 是空输出。三段式：单子注销 2 秒后，货先从 Bound 翻成 Released（解绑，序幕里提过的删除保护在值夜班）；再过 10 秒，货从集群账本上彻底消失；节点硬盘上的文件夹连同 witness.txt 被连根拔掉。写入于 21:22 的数据，挨过了 pod 的死亡，最终随单子注销灰飞烟灭。数据的生死从此只跟申请单走——这就是回收策略四个字的含义。Retain 则相反：单子注销后货留着等人工处置，Released 状态的货不会被新申请自动分走。

---

## 结课出题：三个丢分重灾区现形

课尾三道 CKA 风格题，学生当场作答，当场核对。

第一题手写 PVC，要求名字 my-data、容量 512Mi、访问模式单节点读写。学生交卷：

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

骨架全对，最难的 ReadWriteOnce 拼写一次写对。两处失分：容量照抄了课堂例子的 1Gi，题目要的是 512Mi——CKA 最爱的陷阱就是改数字，题干 512Mi、示例全是 1Gi，看走眼就丢分；`request:` 应为 `requests:`，差一个 s，Kubernetes 的 YAML 字段名不认近义词。

第二题概念题，hostPath 和 PVC 的核心差异。学生答："hostpath 会直接放在主机上面，而且是无法维护，但是pvc是单独使用一个pv节点进行维护的"。前半句对；后半句两个问题——"PV 节点"是术语错误，节点是机器，PV 是存储空间，两个完全不同的对象；"无法维护"太含糊。核心差异一句话：hostPath 把数据绑死某台机器，pod 换机器就失明；PVC 让数据跟着单子走，pod 被派到哪台机器，都把同一块货接上。

第三题判读题，给一行 `kubectl get pv` 输出（pvc-ab12 / 1Gi / Retain / Released / CLAIM 列写着 default/data-claim），两问：申请单还在吗？新单子能分到这块货吗？学生答："不会，这个持久卷被释放了"。第二问答对——Retain 加 Released 的货不会自动再分配，要管理员手动清理数据、手动改回 Available。第一问漏答，而那正是埋的钩子：单子已经不在了。Released 的定义就是"单子已注销、货已脱钩"；CLAIM 列还写着名字，是历史记录——退租登记簿上的旧租客，人走了，记录还在。口诀：看 STATUS 列，别看 CLAIM 列。

三个失分点——审数字、字段拼写、读表看错列——全是 CKA 考场上的真实丢分方式。今天暴露，比考场上暴露便宜多了。

---

## 四站总账

| 站 | 方案 | pod 死后 | 一句话 |
|---|---|---|---|
| 1 | 容器自带磁盘 | 蒸发 | 盒子被扔，盒里的全没 |
| 2 | emptyDir | 陪葬 | 同 pod 共享的临时抽屉，钉在棺材里 |
| 3 | hostPath | 在机器上 | 活了，但绑死一台机器 |
| 4 | PVC / PV / StorageClass | 在货里 | 数据跟着单子走，pod 只是租客 |

生产环境的标准答案是第四站：填单、照模板现造货、pod 挂载、单子注销货回收。hostPath 在生产里几乎只出现在节点级守护程序的手里——普通应用没人敢用，原因第三站已经演过一半，另一半（换机器失明）看下图便知。

**附图**：课堂上用 Archify 画了两张对照图（validate 0 错 0 警、四视口 visual-check 全过的交互 HTML，主题切换、缩放可用）——

- kind 教学集群 vs 生产集群（左：Windows→WSL2→Docker→节点容器四层模拟；右：控制节点/工作节点/真实存储真机分工）。文字版对照见[《附：kind 教学集群 vs 生产集群架构图》](/云原生/cka/附-kind教学集群vs生产集群架构图)
- kubectl 打电话 vs docker exec 登门（同一个人从同一个终端出发的两条路：一条读 kubeconfig 发 HTTPS 请求管活物，一条钻进节点容器翻文件——apiserver 瘫了只有后一条能救命）

---

## 附录：本课全部命令清单（按出现顺序，可照抄复现）

### ① 序幕大扫除

```bash
kubectl delete pod app1 share-box save-box load-box two-box read-box pvc-box --ignore-not-found
kubectl delete pvc data-claim --ignore-notfound
docker exec demo-control-plane sh -c 'rm -rf /data/lesson12 /data/k12 /var/local-path-provisioner/pvc-*'
kubectl get pvc; kubectl get pv
docker exec demo-control-plane sh -c 'ls /data/ 2>&1; ls /var/local-path-provisioner/ 2>&1'
```

### ② 第一站：容器自带磁盘

```bash
kubectl run app1 --image=nginx:alpine --command -- sleep 3600
kubectl get pod app1
kubectl exec app1 -- sh -c 'date > /data.txt && ls -la /data.txt'
kubectl delete pod app1
kubectl run app1 --image=nginx:alpine --command -- sleep 3600
kubectl exec app1 -- ls -la /data.txt        # No such file or directory
```

### ③ 第二站：emptyDir 共享抽屉

```bash
cat > /tmp/share-box.yaml <<'EOF'
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
EOF
kubectl apply -f /tmp/share-box.yaml; sleep 8
kubectl exec share-box -c writer -- sh -c 'date > /shared/note.txt && ls -la /shared/'
kubectl exec share-box -c reader -- cat /shared/note.txt
kubectl delete pod share-box
kubectl apply -f /tmp/share-box.yaml; sleep 8
kubectl exec share-box -c reader -- ls -la /shared/    # 空的
```

### ④ 第三站：hostPath 机器硬盘

```bash
cat > /tmp/save-box.yaml <<'EOF'
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
EOF
kubectl apply -f /tmp/save-box.yaml; sleep 8
kubectl exec save-box -- sh -c 'echo saved-on-machine > /data/machine-file.txt && ls -la /data/'
docker exec demo-control-plane sh -c 'ls -la /data/lesson12/'
kubectl delete pod save-box
# load-box.yaml 同构，仅 name: load-box
kubectl apply -f /tmp/load-box.yaml; sleep 8
kubectl exec load-box -- cat /data/machine-file.txt     # saved-on-machine
```

### ⑤ 第四站：看家底与递单

```bash
kubectl get sc
cat > /tmp/data-claim.yaml <<'EOF'
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
EOF
kubectl apply -f /tmp/data-claim.yaml
kubectl get pvc data-claim        # Pending，等消费者
```

### ⑥ 消费者与三表联动

```bash
cat > /tmp/pvc-box.yaml <<'EOF'
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
EOF
kubectl apply -f /tmp/pvc-box.yaml; sleep 15
kubectl get pod pvc-box
kubectl get pvc data-claim        # Bound
kubectl get pv                    # 货比单子年轻 31 秒
```

### ⑦ 双视角与终极测试

```bash
docker exec demo-control-plane sh -c 'ls /var/local-path-provisioner/'
kubectl exec pvc-box -- sh -c 'date > /data/witness.txt && ls -la /data/'
docker exec demo-control-plane sh -c 'ls -la /var/local-path-provisioner/pvc-*/'
kubectl delete pod pvc-box
kubectl get pvc data-claim        # 仍 Bound
docker exec demo-control-plane sh -c 'ls /var/local-path-provisioner/'
kubectl apply -f /tmp/pvc-box.yaml; sleep 10
kubectl exec pvc-box -- cat /data/witness.txt    # 原样读出
```

### ⑧ 退租与回收

```bash
kubectl delete pod pvc-box
kubectl delete pvc data-claim
kubectl get pv                    # Released → No resources found
docker exec demo-control-plane sh -c 'ls /var/local-path-provisioner/'   # 空
```

### ⑨ 课毕清理

```bash
kubectl delete pod app1 share-box save-box load-box --ignore-not-found
kubectl get pods                  # 只剩其他课的作业
```

---

➡️ 下一篇：[《配置的座位——ConfigMap 与 Secret》](/云原生/cka/cka-13-configmap-secret)（预告）：数据有了座位，配置呢？镜像里写死的环境变量、数据库密码、nginx 配置文件——改一个字就得重新打包镜像的日子该结束了。下一课把"配置"也搬出镜像，给它发户口。
