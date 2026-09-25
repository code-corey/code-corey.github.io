---
title: 短工的座位——Job 与 CronJob（直接讲授实录）
sidebarGroup: CKA 通过之路
shortTitle: 15 Job 与 CronJob
order: 15
date: 2026-09-24T00:00:00.000Z
author: Corey
category: 云原生
tag:
  - CKA
  - Kubernetes
  - Job
  - CronJob
description: 小区里不全是长租户。「月底算一次账、每天凌晨备份一次」这类干完就走的活，用 Deployment 管会永远补人——所以 Kubernetes 有第二种合同：Job（工单，干完即止不补）和 CronJob（定时发单机，到点自动印工单）。本课延续「小区物业」一个比方从零讲通：短工上工→Completed 收工→干砸了补到上限认栽→每分钟响铃的发单机，全程大白话 + 命令输出逐字实录，课尾三题战报 2/3（五格闹钟填错位置会变成「每月 2 号」）。
---

> **CKA 通过之路 · 第 16/17 篇**
> 上一篇：[《版本的座位——滚动更新与回滚（小白重讲实录）》](/云原生/cka/cka-14-rollout) · 下一篇：[《工人的饭量——requests 与 limits（直接讲授实录）》](/云原生/cka/cka-16-requests-limits)

---
> - 日期：2026-09-24
> - 学生：Corey（0 基础，直接讲授 + 小白重讲协议）
> - 环境：WSL2 Ubuntu-22.04 + kind v0.33.0 + Kubernetes v1.37.0，单节点 demo-control-plane
> - 教学衔接：延续上一篇「小区物业」比方（住户=pod、合同=Deployment、家具=镜像、前台=kubectl），本课只新增两个名词：Job（工单）、CronJob（定时发单机）
> - 官方文档核对新度：Jobs / CronJob（kubernetes.io 官方概念文档 2026-06 版，batch/v1）

---

## 开场疑问：小区里有没有「干完就走」的工人？

上一篇的 hello，是**长租住户**——合同守着「始终保持 5 户」，住户晕倒了物业马上补新人，**永远不许空**。

但生活里还有另一种活：**干一次就完的事**——

- 月底算一次账
- 每天凌晨备份一次数据库
- 发一次报告

这种活的正确形态是：**干完就走，别赖着**。要是用长租合同（Deployment）管它——短工干完活「站那儿发呆」，或者被补成永远干不完——都不对味。

所以 Kubernetes 有第二种合同：**Job**（字面就是「一件活/工单」）——**干完即止，不补人**。

两种合同的唯一区别，一句话：

> **Deployment：住户没了→必须补。Job：活干完了→就走，不补。**

## 实战一：发一张「睡 20 秒」的工单

先看工单长什么样（YAML 逐行讲）：

```yaml
apiVersion: batch/v1     # 这份文件的「表格版本号」（batch=批处理类，v1=第1版）
kind: Job                # 类型：一张工单（前面课见过 kind: Pod / kind: Deployment）
metadata:
  name: one-job          # 工单名字：one-job
spec:
  template:              # 工单里夹着一张「住户登记表」——照着它招一个短工
    spec:
      containers:
        - name: worker
          image: nginx:alpine      # 短工用的家具（小区库房有现成的，不碰网络）
          command: ["sleep", "20"] # 活的内容：睡 20 秒（代表「一件 20 秒能干完的事」）
      restartPolicy: Never # 短工的规矩：晕了也不许原地复活（Job 的标配）
```

只有两个新面孔：`template`（工单里**夹带的住户登记表**——Job 不是住户本身，是「照此招人」的说明书）和 `restartPolicy: Never`（**不许复活**——活干完就退房；长租户才是 Always）。

发单命令（和以前发配置文件完全一样）：`kubectl apply -f 文件名`。

**命令**：

```bash
kubectl apply -f /tmp/one-job.yaml
```

**输出**：

```text
job.batch/one-job created
```

**解释**：工单挂出去了（`batch` = 批处理类，这类对象的家族名）。马上用老命令看名单——短工应该已经搬进来干活（睡 20 秒，得抓紧看）。

**命令**：

```bash
kubectl get pods
```

**输出**：

```text
NAME                     READY   STATUS             RESTARTS      AGE
hello-786dc64799-2fzvh   1/1     Running            0             22m
hello-786dc64799-dbjv5   1/1     Running            0             22m
hello-786dc64799-kfp88   1/1     Running            0             22m
hello-786dc64799-mccl5   1/1     Running            0             22m
hello-786dc64799-tgptz   1/1     Running            0             22m
k9s-demo                 0/1     ImagePullBackOff   0             36h
one-job-jth2m            1/1     Running            0             8s
probe-test               1/1     Running            9 (62m ago)   2d11h
tol-equal                1/1     Running            9 (62m ago)   2d11h
web3-7977447bc8-2mqvr    1/1     Running            9 (62m ago)   2d11h
web3-7977447bc8-8vbhf    1/1     Running            9 (62m ago)   2d11h
web3-7977447bc8-tgsfh    1/1     Running            9 (62m ago)   2d11h
web3-7977447bc8-zd28t    1/1     Running            9 (62m ago)   2d11h
```

**解释**：名单第七行——短工上工了：门牌 `one-job-` 开头（工单名 + 随机尾巴，和 hello 的规律一样），`Running`——正在「干活」（睡这 20 秒）。

现在等 25 秒（让他睡完），再拉一次名单——重点看他变成什么样。

**命令**：

```bash
sleep 25 && kubectl get pods
```

**输出**：

```text
NAME                     READY   STATUS             RESTARTS      AGE
hello-786dc64799-2fzvh   1/1     Running            0             23m
hello-786dc64799-dbjv5   1/1     Running            0             23m
hello-786dc64799-kfp88   1/1     Running            0             23m
hello-786dc64799-mccl5   1/1     Running            0             23m
hello-786dc64799-tgptz   1/1     Running            0             23m
k9s-demo                 0/1     ImagePullBackOff   0             36h
one-job-jth2m            0/1     Completed          0             42s
probe-test               1/1     Running            9 (63m ago)   2d11h
tol-equal                1/1     Running            9 (63m ago)   2d11h
web3-7977447bc8-2mqvr    1/1     Running            9 (63m ago)   2d11h
web3-7977447bc8-8vbhf    1/1     Running            9 (63m ago)   2d11h
web3-7977447bc8-tgsfh    1/1     Running            9 (63m ago)   2d11h
web3-7977447bc8-zd28t    1/1     Running            9 (63m ago)   2d11h
```

**解释**：关键一行：

```text
one-job-jth2m   0/1   Completed   0   42s
```

三个变化，每个都值钱：

1. **STATUS 变 `Completed`**（收工）——新状态，以前只见过 Running。这是 Job 特有的正常终态：**活干完了**
2. **READY 变 `0/1`**——「该 1 人、到岗 0 人」？配着 Completed 读就通了：**人已经退房走了**，但门牌和工单**留着存档**（不是被删）。所以 0/1 在这里**不是病**
3. **最重要：没有补新人**——42 秒过去，名单里没有第二个 one-job 冒出来。对比 hello：死一户立刻补。**这就是两种合同的本质区别：Deployment 补（活没尽头），Job 不补（活干完了）**

## 看工单本身的状态

**命令**：

```bash
kubectl get jobs
```

**输出**：

```text
NAME      STATUS     COMPLETIONS   DURATION   AGE
one-job   Complete   1/1           23s        60s
```

**解释**：四个新列，都是大白话：

- **STATUS `Complete`**：工单状态=完成
- **COMPLETIONS `1/1`**：读法和 READY 一样——斜杠前=**要求**几单，斜杠后=**实际**完成几单（要求 1、完成 1）
- **DURATION `23s`**：这单干了 23 秒（20 秒睡眠 + 搬家开销）
- **AGE `60s`**：工单发出 60 秒

## 实战二：活干砸了怎么办？

刚才那张是顺利工单。但现实里短工可能失手：程序**中途出错退出**。

退房暗号的规矩（新概念，一句话）：程序退房时留个数字暗号——**0 = 活干完了走的，非 0 = 出事了走的**。`exit 1` 就是「出事了」暗号。

短工失手，工单不会立刻认栽——**派新人重试**。重试几次就放弃？写在工单上：`backoffLimit`（字面：退避上限——**最多再派几个新人**，还砸就宣布工单失败）。

发一张**注定失败**的工单做实验：睡 5 秒后留失败暗号退房，`backoffLimit: 2`（最多补派 2 个新人）：

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: fail-job
spec:
  backoffLimit: 2                    # 最多补派 2 个新人
  template:
    spec:
      containers:
        - name: worker
          image: nginx:alpine
          command: ["sh", "-c", "sleep 5; exit 1"]   # 睡5秒；然后留「出事了」暗号退房
      restartPolicy: Never
```

（`sh -c "一串命令"` = 开个小壳子把一串命令连着跑；`sleep 5; exit 1` = 先睡 5 秒，然后失败退房。）

**命令**（发单，等 55 秒看战况——初始 1 人 + 补派 2 人，每人 5 秒干活 + 中间歇脚）：

```bash
kubectl apply -f /tmp/fail-job.yaml && sleep 55 && kubectl get pods && echo '=== 工单状态 ===' && kubectl get jobs
```

**输出**：

```text
job.batch/fail-job created
NAME                     READY   STATUS             RESTARTS      AGE
fail-job-jsbg8           0/1     Error              0             40s
fail-job-n7zsn           0/1     Error              0             56s
fail-job-zwckr           0/1     Error              0             15s
hello-786dc64799-2fzvh   1/1     Running            0             24m
hello-786dc64799-dbjv5   1/1     Running            0             24m
hello-786dc64799-kfp88   1/1     Running            0             24m
hello-786dc64799-mccl5   1/1     Running            0             24m
hello-786dc64799-tgptz   1/1     Running            0             24m
k9s-demo                 0/1     ImagePullBackOff   0             36h
one-job-jth2m            0/1     Completed          0             2m19s
probe-test               1/1     Running            9 (64m ago)   2d11h
tol-equal                1/1     Running            9 (64m ago)   2d11h
web3-7977447bc8-2mqvr    1/1     Running            9 (64m ago)   2d11h
web3-7977447bc8-8vbhf    1/1     Running            9 (64m ago)   2d11h
web3-7977447bc8-tgsfh    1/1     Running            9 (64m ago)   2d11h
web3-7977447bc8-zd28t    1/1     Running            9 (64m ago)   2d11h
=== 工单状态 ===
NAME       STATUS     COMPLETIONS   DURATION   AGE
fail-job   Failed     0/1           56s        56s
one-job    Complete   1/1           23s        2m19s
```

**解释**：两个看点。

名单里 fail-job 有三户，全 `Error`——三个失败者全留档，看 AGE 就知道出场顺序：

```text
fail-job-n7zsn   56s   ← 第1个（最初派的）
fail-job-jsbg8   40s   ← 第2个（补派1）
fail-job-zwckr   15s   ← 第3个（补派2）
```

一个砸了、歇一会儿再派一个（时间差就是歇脚间隔）——**派了 3 个，砸了 3 个**。

工单清单宣布认栽：

```text
fail-job   Failed   0/1   56s
one-job    Complete 1/1   23s
```

`Failed 0/1`：要求 1 单、完成 0 单。初始 1 人 + 补派 2 人（正好 `backoffLimit: 2`）全砸——**工单标记失败，不再派**。一成一败同框对照，这就是 Job 的全部命运：`Complete`（成）或 `Failed`（败）。留档的好处：排查时三个 Error 户全在，每次失败的现场都能查。

## 实战三：定时发单机 CronJob

还差最后一块拼图：「每天凌晨 3 点备份一次」这种活——总不能每天半夜人肉发单。

**CronJob** = **定时发单机**：你定个闹钟（比如「每分钟」），它到点**自动照模板发一张 Job**。三层关系：

> CronJob（闹钟）→ 到点自动生成 Job（工单）→ 工单招短工（Pod）

闹钟的写法是**五颗星**：`* * * * *`——五个位置从左到右是 **分 / 时 / 日 / 月 / 周**，每颗星填 `*`（每）就是「每分钟」。

发一台每分钟响一次的发单机（短工的活：说一声 working 再睡 10 秒）：

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: cron-job
spec:
  schedule: "* * * * *"        # 闹钟：每分钟
  jobTemplate:                 # 工单模板：到点照这个印一张 Job
    spec:
      template:
        spec:
          containers:
            - name: worker
              image: nginx:alpine
              command: ["sh", "-c", "echo working; sleep 10"]
          restartPolicy: Never
```

**命令**（发单，等 70 秒让它响一次铃，看工单清单和发单机清单）：

```bash
kubectl apply -f /tmp/cron-job.yaml && sleep 70 && kubectl get jobs && kubectl get cronjobs
```

**输出**：

```text
cronjob.batch/cron-job created
NAME                STATUS     COMPLETIONS   DURATION   AGE
cron-job-29837677   Complete   1/1           13s        61s
cron-job-29837678   Running    0/1           1s         1s
fail-job            Failed     0/1           2m32s      2m32s
one-job             Complete   1/1           23s        3m55s
NAME       SCHEDULE    TIMEZONE   SUSPEND   ACTIVE   LAST SCHEDULE   AGE
cron-job   * * * * *   <none>     False     1        1s              70s
```

**解释**：等待的 70 秒跨了两个整分钟边界，所以铃响了两次——**两张子工单同框**：

```text
cron-job-29837677   Complete   1/1   13s   61s   ← 第1张子工单：已干完
cron-job-29837678   Running    0/1   1s    1s    ← 第2张子工单：正在干
```

名字 = `cron-job-` + **一串数字**（时间编码）——不是你起的，**发单机自己起的名**，每分钟印一张、名字自动+1。

发单机清单逐列：

- `SCHEDULE * * * * *`——闹钟设置：每分钟
- `SUSPEND False`——闹钟开着（改成 True 就是暂停不发）
- `ACTIVE 1`——手头 1 张子工单在跑
- `LAST SCHEDULE 1s`——上次响铃 1 秒前

三层链条全部肉眼验完：**闹钟（CronJob）每分钟响 → 自动印工单（Job，名字带时间）→ 工单招短工（Pod）干活**。

## 本课收官：小区里的四种合同

| 合同 | 一句话 | 不补人的条件 |
|---|---|---|
| **Deployment** | 长租合同：始终保持 N 户 | 永远补（活没有尽头） |
| **Job** | 一张工单：干完即走 | 活干完就不补；干砸补到 backoffLimit 上限，然后认栽 |
| **CronJob** | 定时发单机：到点自动印一张 Job | 每张子工单各自「干完即走」 |

课毕打扫。注意：**发单机不关，它会永远每分钟发一张单**——删除命令本身就是「关闹钟」。

**命令**：

```bash
kubectl delete cronjob cron-job && kubectl delete job one-job fail-job && rm -f /tmp/one-job.yaml /tmp/fail-job.yaml /tmp/cron-job.yaml && echo '=== 删完看还有谁 ===' && kubectl get jobs && kubectl get cronjobs
```

**输出**：

```text
cronjob.batch "cron-job" deleted from default namespace
job.batch "one-job" deleted from default namespace
job.batch "fail-job" deleted from default namespace
=== 删完看还有谁 ===
No resources found in default namespace.
No resources found in default namespace.
```

**解释**：打扫干净，还带出一个隐藏知识点：删发单机是**连坐式**的——`cron-job` 一删，它印的两张子工单（连同短工档案）一并消失；工单全清，名单空空。

---

## 结课出题与核对（原文）

**第 1 题（Deployment 和 Job，本质区别就一条——是什么）**

学生原文：「deployment是招的长期工，job只是单次的短工」

核对：**满分**，再往上推一层——「长期工 vs 单次短工」抓住了现象，机制层的**那一条**是**补人规则**：Deployment 住户没了**必须补**（活没尽头）；Job 干完**不补**（干砸了补，但补到上限就认栽）。记机制不记现象，换皮也认得。

**第 2 题（每天凌晨 2:00 备份一次，用哪种合同、闹钟五格填什么）**

学生原文：「0 0 2 * *」

核对：**0.5 分，位置错一位，意思全变**。手指头点着数（分 / 时 / 日 / 月 / 周）：

| 位置 | 分 | 时 | 日 | 月 | 周 |
|---|---|---|---|---|---|
| 学生的 `0 0 2 * *` | 0 | 0 | **2** | * | * |
| 正解 `0 2 * * *` | 0 | **2** | * | * | * |

逐位翻译学生版本：分=0、时=0、日=2 → *每月 2 号的半夜 0 点*——一个月才跑一次，还挑在 2 号。正解：分=0、时=2、其余=每 → **每天 2:00**。教训：填之前**手指头先点五下**：分、时、日、月、周——点一个填一个。

**第 3 题（判读：my-job Failed 0/1，名单里 my-job 开头 4 户全 Error，最可能发生了什么）**

学生原文：「定时任务报错了」

核对：**0.5 分，两个漏**。**漏一：认错了合同**——「定时任务」=CronJob，但名字 `my-job` 直接就叫工单（Job）；真要是发单机印的子工单，名字会是「发单机名+时间戳」格式（像 `cron-job-29837677`）。**名字会自报身份**。**漏二：4 个 Error 户没解读**——那是重试的**留档**：初始 1 人 + 补派 3 人 = 4 个全砸（推得 backoffLimit 大概是 3），重试烧完，工单宣布 `Failed 0/1`。完整答案一句话：**这工单的活连续失败 4 次（1 初始 + 3 重试），重试上限到了，认栽**。

**战报：2 / 3**。丢分点归档：①五格闹钟先点格再填数；②判读先认合同（看名字），再读证据（几户 Error = 重试几次）。

---

## 课毕状态

- 本课实验对象全部清理：cron-job（发单机，含两张子工单）、one-job、fail-job 已删；/tmp 三份 YAML 已删
- hello 停在 alpine 旧版 5 户全员健康；web3×4、probe-test、tol-equal 全程没动
- k9s-demo 仍卡 ImagePullBackOff（家具快递收不到 36 小时+）——留作下一篇排障课的真实教材

---

➡️ 下一篇预告：《工人的饭量——requests 与 limits》。小区食堂没人管饭量，一户大胃王能把全小区吃穷——两个数字立规矩：requests（报饭量，排座时看）、limits（红线，超了保安动手）。全程实测三种死法：开工仪式被掐、饭桌上被抬、起来就死的循环。（那户卡了 36 小时的 k9s-demo，排障课再收拾它。）
