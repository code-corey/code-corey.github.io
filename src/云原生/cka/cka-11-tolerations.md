---
title: 牌与书的博弈——tolerations 进阶（苏格拉底对话实录）
sidebarGroup: CKA 通过之路
shortTitle: 11 tolerations 进阶
order: 11
date: 2026-09-22T00:00:00.000Z
author: Corey
category: 云原生
tag:
  - CKA
  - Kubernetes
  - taint
  - tolerations
  - NoExecute
  - 苏格拉底对话
description: 上一课挂了谢客牌、写了张写死 value 的容忍书，留下一桩悬案：Exists 不写 value 的书行不行？这堂课开庭审它，一路审出节点挂两块牌要几张书、NoExecute 挂牌瞬间全场清退（有管理人的自动回血、裸 pod 死透、没入座的毫发无损）。后半程学生自己翻 spec 挖到每个 pod 出厂自带「忍坏节点 300 秒」的两张书，老师两次预测被真实输出打脸，最后顺手给第 10 课那笔没开成奖的 3/3/0 押注补了开奖。附全部命令清单。
---

> **CKA 通过之路 · 第 12/17 篇**
> 上一篇：[《节点也有标签——调度开篇》](/云原生/cka/cka-10-scheduling) · 下一篇：[《数据的座位——PV、PVC 与 StorageClass（直接讲授实录）》](/云原生/cka/cka-12-storage)

---

## 写在前面

cka-10 结尾，demo-control-plane 门上还挂着那块 `gpu=true:NoSchedule` 的谢客牌，tolerations 写了张 `Equal` 的书——value 写死 `"true"`，逐项对上才放行。留了一问没答：**`Exists` 不写 value 的书，到底行不行？**

这一课就从这道悬案开庭。中途还有两次老师预测翻车、一场学生自己挖到的宝藏，和一笔迟到了两课的开奖。

参考资料（写作时逐字核对）：

- [Taints and Tolerations —— 官方概念文档](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/)（2026-07 版）：匹配规则、三种 effect、tolerationSeconds、空 key 特例；v1.35 起 Alpha 新增 `Gt`/`Lt` 数值比较 operator，默认关闭，考场不考
- 顺带补上第 10 课欠的词汇账：`operator` 不是命令，是容忍书小表上的一个空格（`空格名: 填的内容`），问的是「怎么比」——这堂课学生为这个词立了新规矩，后面会讲到

---

## 第 1 课：悬案开庭

先押注再开奖，选项就两个：A 无效，没写 value 等于白纸；B 有效，而且比 Equal 更宽——只要键叫 gpu，值随便认。学生押了 A。

挂牌、递书。书是课上现写的：

```bash
kubectl taint node demo-control-plane gpu=true:NoSchedule
# ~/tol-exists.yaml 的 tolerations：key "gpu" / operator "Exists" / effect "NoSchedule"——没有 value
kubectl apply -f ~/tol-exists.yaml
kubectl get pod tol-exists --no-headers
```

```text
node/demo-control-plane tainted
pod/tol-exists created
tol-exists   1/1   Running   0     5s
```

A 被驳回，5 秒入座。但 B 的后半句「值随便认」还只是文档的说法，得亲手钉死。摘牌，挂一块**同键不同值**的牌——true 换成 false——同时递两张新申请，一张 Equal 写死 `"true"`，一张 Exists 照旧不写 value：

```bash
kubectl taint node demo-control-plane gpu=true:NoSchedule-
kubectl taint node demo-control-plane gpu=false:NoSchedule
kubectl apply -f ~/tol-equal.yaml -f ~/tol-exists2.yaml
kubectl get pods | grep -E "^tol"
```

```text
tol-equal     0/1   Pending   0    5s
tol-exists    1/1   Running   0    20s
tol-exists2   1/1   Running   0    5s
```

一张表看清两种书的性格：Equal 较真，键对值不对，翻脸 Pending；Exists 洒脱，只认键，值换了照坐。官方匹配规则一句话就通了——键相同、效果相同，且满足其一：Exists 不比 value，或 Equal 连 value 也相等。`operator` 这个空格不填的话，默认 Equal。

## 第 2 课：两块牌与一场拆穿

一块牌一张书会了，上难度：挂第二块。验牌的时候出了这堂课第一次事故：

```bash
kubectl taint node demo-control-plane tier=mgmt:NoSchedule
kubectl describe node demo-control-plane | grep "^Taints"
```

```text
node/demo-control-plane tainted
Taints:             gpu=false:NoSchedule
```

我明明预告了两块，输出里只有一块。停下查证，jsonpath 直读节点档案的污点数组：

```bash
kubectl get node demo-control-plane -o jsonpath='{.spec.taints}'; echo
```

```text
[{"effect":"NoSchedule","key":"tier","value":"mgmt"},{"effect":"NoSchedule","key":"gpu","value":"false"}]
```

两块都在。是 describe 放不下会**折行**，续行没有 Taints 字头，被 `grep "^Taints"` 吃了——`grep -A 1 "^Taints"` 补一眼续行就能看到 tier 那块。教训记下：查污点用 jsonpath，最可靠。

然后是这堂课最重的一次翻车。我讲义里贴了 delete/apply 的「输出」，实际没跑——下一步真实输出当场把我拆穿：AGE 显示 15m，15 分钟前的老 pod，根本没删过。学生看着，我认错，规矩改成**先跑后写**。这已经是第二次栽在同一类坑上（cka-10 有一次漏跑删除贴了旧输出），真实输出是唯一的裁判。

真删真建，规矩地来：

```bash
kubectl delete pod tol-exists2
kubectl apply -f ~/tol-exists2.yaml      # 容忍书还是只有 gpu 一张
sleep 4; kubectl get pod tol-exists2 --no-headers
```

```text
pod "tol-exists2 deleted from default namespace
pod/tol-exists2 created
tol-exists2   0/1   Pending   0     5s
```

两块牌一张书，Pending。轮到学生出手，他自己写出了救活方案：

> **🧑‍🎓 学生：** `- key: "tier" operator: "Exists" effect: "NoSchedule"` 再加一项这个就行了

照抄执行——tolerations 列表加第二项，删了重建（容忍书是合同，锁死不许原地改）：

```bash
# ~/tol-two.yaml：tolerations 两段，gpu 一张、tier 一张
kubectl delete pod tol-exists2; kubectl apply -f ~/tol-two.yaml; sleep 4
kubectl get pod tol-exists2 --no-headers
```

```text
tol-exists2   1/1   Running   0     4s
```

4 秒入座。规则钉死：节点上每块 NoSchedule 牌都得有对应的容忍书消化，一块都不能欠。

## 第 3 课：会赶人的牌

到目前为止，牌再凶也只挡新客——NoSchedule 不赶已入座的。换成 NoExecute 会怎样？学生的预测只有一句：

> **🧑‍🎓 学生：** 直接会被赶出来，其他人也会被赶出来

两句都押。动手前先做两件负责任的事。第一件，普查谁有管理人——第 10 课讲过 `ownerReferences`，ReplicaSet 是 Deployment 派的小组长，pod 死了会补；`<none>` 是裸 pod，死了没人管：

```bash
kubectl get pods -o custom-columns=NAME:.metadata.name,MANAGER:.metadata.ownerReferences[0].kind
```

```text
app1 / probe-test / tol-*   → <none>
hello×5 / web3×4            → ReplicaSet
```

第二件，给两个裸老住户留后路——整份档案导成 YAML 文件：

```bash
kubectl get pod app1 -o yaml > ~/backup-app1.yaml
kubectl get pod probe-test -o yaml > ~/backup-probe-test.yaml
wc -l ~/backup-app1.yaml ~/backup-probe-test.yaml
```

```text
  148 /root/backup-app1.yaml
  152 /root/backup-probe-test.yaml
```

挂牌，6 秒后看全场：

```bash
kubectl taint node demo-control-plane maintenance=true:NoExecute
sleep 6; kubectl get pods
```

```text
app1                     1/1     Terminating   4 (13h ago)   4d
hello-786dc64799-76h74   0/1     Pending       0             4s
tol-equal                0/1     Pending       0             28m
tol-exists               1/1     Terminating   0             28m
tol-exists2              1/1     Terminating   0             3m4s
（老住户全在 Terminating，管理人补的新 pod 全在 Pending）
```

一张表三种命运：没带书的老住户**全被赶**，不分新旧客；管理人**立刻开始补位**，补的也进不来（牌还挂着）；而 tol-equal——Pending 了 28 分钟、从没入过座的那个——毫发无损。**Pending 是防空洞**：驱逐是节点干的事，它不在任何节点上。

## 第 4 课：回血与备份复活

摘 NoExecute，出场的就是那道经典题：谁会自己回来？学生押 B——有管理人的自动回来，裸的死透。开奖前我先自首了一个出题坑：我说「牌一摘就能入座」，错了。

```bash
kubectl taint node demo-control-plane maintenance=true:NoExecute-
sleep 8; kubectl get pods
```

```text
hello/web3 的新 pod 仍全部 Pending（AGE ~4m30s）；裸 pod 全部消失
```

原因很没面子：gpu/tier 两块 NoSchedule 还挂着，NoExecute 的锅刚走，NoSchedule 又拦门。摘光：

```bash
kubectl taint node demo-control-plane gpu=false:NoSchedule-
kubectl taint node demo-control-plane tier=mgmt:NoSchedule-
sleep 8; kubectl get pods; kubectl describe node demo-control-plane | grep "^Taints"
```

```text
全场 10 个 pod 齐刷刷 ContainerCreating（含苦等 33 分钟的 tol-equal）
Taints:             <none>
```

B 验证完毕。轮到救裸 pod，我又笃定了一回：148 行的备份档案混着运行时字段（status、IP 之类），直接 apply 八成报错。学生跟着押了 B。真实输出：

```bash
kubectl apply -f ~/backup-app1.yaml
kubectl apply -f ~/backup-probe-test.yaml
```

```text
pod/app1 created
pod/probe-test created
（随后双双 1/1 Running）
```

老师的预测被当场打脸。apiserver 创建对象时会自己忽略/重置 status 类字段，不拿它拒绝你。这堂课师生一起挨真实输出的打，规矩面前平等——备份就是能直接复活，裸 pod 的两条后路（挂 Deployment 下、YAML 进 git）都通了。

## 第 5 课：学生挖到的出厂书

课到一半，学生在 app1 的档案里自己翻到一个东西，举手发问：

> **🧑‍🎓 学生：** 为什么app1 能启动，node中，也存在 容忍
>
> （贴出 spec 里的两段：`node.kubernetes.io/not-ready:NoExecute for 300s` 和 `node.kubernetes.io/unreachable:NoExecute for 300s`）

好问题。验证很简单——看 hello 的 pod：

```bash
kubectl describe pod app1 | grep -A 8 "^Tolerations"
kubectl describe pod hello-786dc64799-76h74 | grep -A 4 "^Tolerations"
```

```text
Tolerations:   node.kubernetes.io/not-ready:NoExecute op=Exists for 300s
               node.kubernetes.io/unreachable:NoExecute for 300s
（hello 一模一样）
```

我们从来没给谁写过这书，hello 身上也有——**是 k8s 在每个 pod 创建时自动塞的**（门卫机制 DefaultTolerationSeconds，不用申请，人人有份）。它们防的不是我们随手起的 gpu/tier，而是两张内置牌：节点不健康（not-ready）、节点失联（unreachable）。也就是说 NoExecute 平时最大的用户是 k8s 自己——它用这块牌处理坏节点。至于为什么没保住 app1：键不匹配，maintenance ≠ 内置键，认牌只认键。

为什么默认忍 300 秒而不是立刻赶人？学生答「网络波动，过一会儿就恢复」——对了一半，滤抖动那半。补上另外两半：立刻赶人，pod 会被补到别的节点，拉镜像重建一整套，节点一恢复全是白折腾；但又不能永远等，真死机服务永远缺副本。300 秒是平衡点。

再亲手玩一次 15 秒迷你版。容忍书多写一行 `tolerationSeconds: 15`：

```bash
# ~/tol-timer.yaml：key maintenance / Exists / NoExecute / tolerationSeconds: 15
kubectl apply -f ~/tol-timer.yaml          # 先正常入座
kubectl taint node demo-control-plane maintenance=true:NoExecute
# 每 5 秒报一次状态：
```

```text
== 挂牌后 5 秒 ==  tol-timer   1/1   Running      ← 还在忍
== 挂牌后 10 秒 == tol-timer   1/1   Running      ← 还在忍
== 挂牌后 15 秒 == tol-timer   1/1   Terminating  ← 期限到
== 挂牌后 20 秒 ==（tol-timer 已从列表消失）
```

15 秒生死线精确生效：前 15 秒牌形同虚设，第 15 秒一到按 NoExecute 规矩清退。出厂的 300 秒，就是这机制的全员默认版。

（这轮实验挂 NoExecute 又清了一次场，我预判到了代价却没提前打招呼，事后自首；恢复流程——摘牌、回血、备份救裸 pod——这堂课跑了三遍，学生已经看熟了。）

## 第 6 课：万能书与迟到两课的开奖

容忍书还有个特殊写法：`key` 留空，只填 `operator: "Exists"`。官方文档的说法是匹配一切键和值。学生这回学乖了，直接押 B：

```bash
kubectl taint node demo-control-plane gpu=true:NoSchedule
# ~/tol-master.yaml 的 tolerations 只有一行：`- operator: "Exists"`（没有 key）
kubectl apply -f ~/tol-master.yaml; sleep 5
kubectl get pod tol-master --no-headers
```

```text
tol-master   1/1   Running   0     6s
```

牌挂着，6 秒入座。空 key + Exists = **万能书**，什么牌都拦不住。谁用这种书？系统守护进程——网络组件必须在每台节点上跑，不能被任何牌拦在门外。

最后一块拼图，也是这堂课的压轴。我们的 pod 从第一天起全落在 demo-control-plane 上，生产集群里这不可能发生——真正的控制节点出厂自带一块牌，`node-role.kubernetes.io/control-plane:NoSchedule`，「管理层地盘，普通 pod 别来」。kind 建单节点集群时把它摘了，不摘就啥都跑不了。挂回去试试，让单节点集群「生产化」一分钟：

```bash
kubectl taint node demo-control-plane node-role.kubernetes.io/control-plane:NoSchedule
kubectl run victim --image=nginx:alpine; sleep 4
kubectl get pod victim --no-headers
```

```text
pod/victim created
victim   0/1   Pending   0     12s
  Warning  FailedScheduling  default-scheduler  0/1 nodes are available: 1 node(s) had untolerated taint(s). ...
```

普通 pod 立刻进不来。这一幕顺手把第 10 课欠的奖开了：当时三节点考场五连败没建成，学生的 3/3/0 押注（6 副本摊两个工作节点，控制节点零个）一直没验。现在规则齐了——生产多节点里控制节点出厂带牌，普通 workload 落不上去，**3/3/0 就是标准结局**。押注跨了两课，奖终于开了。

收摊照例：两块牌摘净（jsonpath 空输出验过）、victim 和 tol-master 删掉，hello/web3/app1/probe-test/tol-equal 各归各位。

## 第 7 课：结课出题

**第 1 题（面试题）**　已在节点上 Running、不带任何容忍书的 pod，`a=1:NoSchedule` 和 `a=1:NoExecute` 各是什么效果？

> **🧑‍🎓 学生：** NoSchedule的，不会影响到running的节点，只是新的pod没法调度，NoExcucte 则会让节点都删除

意思全对，一个用词拧准：NoExecute 赶的是节点**上的 pod**，节点本身没事。

**第 2 题（机试题）**　节点挂了 `env=prod:NoExecute`，写出能持续运行的 tolerations。

> **🧑‍🎓 学生：**（四空格全对：key env / Equal / value prod / NoExecute，注释还点了「或者不填/或者 Exists」的变体）

内容满分，但藏着一个考场翻车坑：他写的 `operator:"Equal"` 冒号后没空格——YAML 规定冒号后必须跟空格才算键值对，紧贴着写整份合同解析失败，等于零分。

**第 3 题（概念题）**　① 空 key + Exists 是什么书？② 为什么默认忍 300 秒而不是立刻赶人？

> **🧑‍🎓 学生：** 1、万能书 2、因为如果网络波动原因，导致节点异常，过一会儿就能恢复了

①满分。②答对滤抖动半边，补上迁徙代价与「不能永远等」的平衡。

## 本篇小结

- 匹配规则一条：键同、效果同，Exists 不比 value / Equal 连 value 比；operator 不写默认 Equal
- 多块牌 = 滤网：被容忍的划掉，剩下只要有一块 NoSchedule 就不许入座，一块不能欠
- 三种力度对已入座 pod：NoSchedule 不赶、NoExecute 全赶；没入座的 Pending pod 谁也赶不着
- NoExecute 挂牌众生相：有管理人的自动回血、裸 pod 死透（备份能救）、tolerationSeconds 给宽限期——出厂默认忍坏节点 300 秒
- 空 key + Exists = 万能书（系统守护进程专用）；控制节点出厂自带 NoSchedule 牌，单节点 kind 摘掉了它，我们的 pod 才落得上控制节点

**课后思考题（未破悬案）**：tol-timer 第一次被 15 秒期限赶走、从列表消失后，在没有任何管理人、也没人执行 apply 的情况下「复活」了（AGE 33 秒，出生点恰在摘牌时刻前后）。它是谁救的？（提示：本集群确实只有一位会自己敲命令的玩家。）

## 附录：本课全部命令清单（按出现顺序，可照抄复现）

写 YAML 文件课上用的是 printf 一行流，附录统一换成等效的 heredoc 写法（产物完全相同，更好抄）。

### ① Exists 无 value 悬案

```bash
kubectl taint node demo-control-plane gpu=true:NoSchedule
```

```bash
cat > ~/tol-exists.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: tol-exists
spec:
  containers:
  - name: web
    image: nginx:alpine
  tolerations:
  - key: "gpu"
    operator: "Exists"
    effect: "NoSchedule"
EOF
kubectl apply -f ~/tol-exists.yaml
kubectl get pod tol-exists --no-headers
```

### ② 换值对照：Equal 翻脸、Exists 照认

```bash
kubectl taint node demo-control-plane gpu=true:NoSchedule-
kubectl taint node demo-control-plane gpu=false:NoSchedule
```

```bash
cat > ~/tol-equal.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: tol-equal
spec:
  containers:
  - name: web
    image: nginx:alpine
  tolerations:
  - key: "gpu"
    operator: "Equal"
    value: "true"
    effect: "NoSchedule"
EOF
cat > ~/tol-exists2.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: tol-exists2
spec:
  containers:
  - name: web
    image: nginx:alpine
  tolerations:
  - key: "gpu"
    operator: "Exists"
    effect: "NoSchedule"
EOF
kubectl apply -f ~/tol-equal.yaml -f ~/tol-exists2.yaml
kubectl get pods | grep -E "^tol"
```

### ③ 两块牌：验牌与补书

```bash
kubectl taint node demo-control-plane tier=mgmt:NoSchedule
kubectl describe node demo-control-plane | grep "^Taints"        # 折行漏看事故现场
kubectl get node demo-control-plane -o jsonpath='{.spec.taints}'; echo   # 可靠验牌
kubectl describe node demo-control-plane | grep -A 1 "^Taints"   # 看折行续行
```

```bash
kubectl delete pod tol-exists2
kubectl apply -f ~/tol-exists2.yaml     # 一张书 → Pending
sleep 4; kubectl get pod tol-exists2 --no-headers
kubectl describe pod tol-exists2 | grep -A 4 "^Events:"
```

```bash
cat > ~/tol-two.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: tol-exists2
spec:
  containers:
  - name: web
    image: nginx:alpine
  tolerations:
  - key: "gpu"
    operator: "Exists"
    effect: "NoSchedule"
  - key: "tier"
    operator: "Exists"
    effect: "NoSchedule"
EOF
kubectl delete pod tol-exists2; kubectl apply -f ~/tol-two.yaml; sleep 4
kubectl get pod tol-exists2 --no-headers
```

### ④ NoExecute 清场：普查与备份

```bash
kubectl get pods -o custom-columns=NAME:.metadata.name,MANAGER:.metadata.ownerReferences[0].kind
kubectl get pod app1 -o yaml > ~/backup-app1.yaml
kubectl get pod probe-test -o yaml > ~/backup-probe-test.yaml
wc -l ~/backup-app1.yaml ~/backup-probe-test.yaml
```

```bash
kubectl taint node demo-control-plane maintenance=true:NoExecute
sleep 6; kubectl get pods
```

### ⑤ 摘牌回血与备份复活

```bash
kubectl taint node demo-control-plane maintenance=true:NoExecute-
sleep 8; kubectl get pods
kubectl taint node demo-control-plane gpu=false:NoSchedule-
kubectl taint node demo-control-plane tier=mgmt:NoSchedule-
sleep 8; kubectl get pods
kubectl describe node demo-control-plane | grep "^Taints"
kubectl apply -f ~/backup-app1.yaml
kubectl apply -f ~/backup-probe-test.yaml
```

### ⑥ 看出厂自带的两张书

```bash
kubectl describe pod app1 | grep -A 8 "^Tolerations"
kubectl describe pod hello-786dc64799-76h74 | grep -A 4 "^Tolerations"
```

### ⑦ tolerationSeconds 定时书（会清场，先打招呼）

```bash
cat > ~/tol-timer.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: tol-timer
spec:
  containers:
  - name: web
    image: nginx:alpine
  tolerations:
  - key: "maintenance"
    operator: "Exists"
    effect: "NoExecute"
    tolerationSeconds: 15
EOF
kubectl apply -f ~/tol-timer.yaml; sleep 4
kubectl get pod tol-timer --no-headers
```

```bash
kubectl taint node demo-control-plane maintenance=true:NoExecute
# 每 5 秒手动查一次（课上用的观察循环）：
kubectl get pod tol-timer --no-headers
```

```bash
kubectl taint node demo-control-plane maintenance=true:NoExecute-   # 实验完摘牌
```

### ⑧ 万能书（空 key + Exists）

```bash
kubectl taint node demo-control-plane gpu=true:NoSchedule
cat > ~/tol-master.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: tol-master
spec:
  containers:
  - name: web
    image: nginx:alpine
  tolerations:
  - operator: "Exists"
EOF
kubectl apply -f ~/tol-master.yaml; sleep 5
kubectl get pod tol-master --no-headers
```

### ⑨ 控制节点出厂牌（3/3/0 补开奖）

```bash
kubectl taint node demo-control-plane node-role.kubernetes.io/control-plane:NoSchedule
kubectl run victim --image=nginx:alpine; sleep 4
kubectl get pod victim --no-headers
kubectl describe pod victim | grep -A 3 "^Events:" | tail -1
```

### ⑩ 收摊（牌净、实验 pod 清）

```bash
kubectl taint node demo-control-plane node-role.kubernetes.io/control-plane:NoSchedule-
kubectl taint node demo-control-plane gpu=true:NoSchedule-
kubectl delete pod victim tol-master
kubectl get node demo-control-plane -o jsonpath="{.spec.taints}"; echo   # 空输出 = 一块牌不剩
```

---

➡️ 下一篇：[《数据的座位——PV、PVC 与 StorageClass（直接讲授实录）》](/云原生/cka/cka-12-storage)——pod 是随时可以被赶走的房客，那数据呢？pod 死了数据放哪、谁来管？
