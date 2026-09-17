---
title: 网关高可用从 0 到大厂形态——keepalived、VIP 漂移与 LVS 接入层
sidebarGroup: 负载均衡与高可用
shortTitle: 01 keepalived+VIP 漂移与 LVS
order: 1
date: 2026-09-16T00:00:00.000Z
category: Linux
tag:
  - Linux
  - keepalived
  - LVS
  - VIP
  - 高可用
  - APISIX
description: 从"网关挂了全公司断网"这个单点问题出发，在两台容器上从 0 部署 keepalived + VIP 漂移，实测三幕故障演练；拆开四层与七层的区别，用内核 IPVS 实测 LVS 轮询分流、后端宕机翻车与扩容；最后对比公司两台同机形态与大厂 LVS 接入层分层形态，附完整配置模板与生产检查表。
---

> **负载均衡与高可用 · 第 1 篇**（开篇）
> 下一篇：系列完结（规划中：《keepalived 脑裂与仲裁》《LVS DR 模式与公网接入》）

---

## TL;DR

- 网关是全公司流量的单点，救它的标准答案就一招：**至少两台 + VIP 漂移**，keepalived 就是干这个的
- keepalived **不转发任何数据**，它只决定一块"门牌"（VIP）钉在谁的网卡上；接电话的永远是那台机器上监听 `0.0.0.0:9080` 的网关进程
- LVS 是 Linux **内核**自带的四层分流引擎，全部配置就是"一张纸条"：VIP + 算法 + 后端名单；裸奔的 LVS 不做健康检查，所以生产上由 keepalived 全权打理
- 公司两台网关用"同机形态"（每台 keepalived + APISIX）就是最优解；网关扩到 3 台以上或要扛公网大流量，才值得拆出 LVS 接入层

---

## 一、问题定义：一台网关就是全公司的单点

假设你给公司上了 API 网关，所有前端都把 baseURL 指向它。某天这台机器的内存条坏了——重启、更换、恢复路由，运气不好要折腾一下午。这一下午里，全公司的系统全挂：不是挂一个服务，是挂所有服务。

这是典型的单点问题。解法听起来朴素：**再买一台，两台干一样的活**。但立刻冒出一个新问题——

> 前端到底连哪台的 IP？

连 A，A 挂了照样断；连 B 同理。让前端记两个 IP 自己切换？每个前端都得改代码、每个用户都得刷新。这个问题的工程答案，就是本文的主角：**VIP（Virtual IP，虚拟 IP）**。

---

## 二、VIP：一块会搬家的大门牌

先把最容易想歪的地方说清楚：VIP 不是什么虚拟的空气，它就是**一个普通的 IP 地址**，特殊之处只有一个——**同一时刻只允许绑在一台机器的网卡上**。谁的网卡上挂着它，全网络的流量就流向谁。

我在实验室里起了两台容器当"真机"（KA1 = 172.67.0.21，KA2 = 172.67.0.22），给 KA1 跑上 keepalived 后，看它的网卡：

```text
$ ip -4 addr show eth0
    inet 172.67.0.21/24 brd 172.67.0.255 scope global eth0
    inet 172.67.0.20/24 scope global secondary eth0    ← VIP 钉在这里
```

而同一时刻 KA2 的网卡上**没有**这个地址：

```text
$ ip -4 addr show eth0        # 在 KA2 上执行
    inet 172.67.0.22/24 brd 172.67.0.255 scope global eth0
    （没有 172.67.0.20 —— 门牌不在它家）
```

于是角色分工清楚了：

| 角色 | 是什么 | 干的活 |
|------|--------|--------|
| KA1 / KA2 各自的 IP | 工位号 | 管理员 ssh 上去维护用，用户不认识 |
| VIP（172.67.0.20） | 公共门牌 | 用户/DNS 只认它；它钉在谁家，流量进谁家 |

**keepalived 的全部工作，就是决定这块门牌此刻钉在谁家。** 机器挂了它把门牌搬到备胎家；修好了再搬回来。它不碰业务流量，一个字节都不碰——这句话的实证放在第四节。

---

## 三、keepalived 从 0 到上岗：七步实测

以下每条命令都在两台 Ubuntu 22.04 容器上真实跑过，你可以照抄复现。

### 3.1 第 0 步：规划

动任何机器之前，先填这张表：

| 角色 | 机器 | 机上跑的业务 | priority |
|------|------|--------------|----------|
| KA1 | 172.67.0.21 | nginx（或 APISIX） | **100**（大哥） |
| KA2 | 172.67.0.22 | 同样的业务 | **90**（备胎） |
| VIP | 172.67.0.20 | —— 用户只连这个 | —— |

三条铁律：两台必须同一网段（心跳靠二层广播）；`virtual_router_id` 两台一致；priority 大者称王。

### 3.2 第 1 步：装软件（两台都执行）

```bash
apt-get update && apt-get install -y keepalived nginx
```

装完会自建空的 `/etc/keepalived/` 目录，服务起不来属正常——还没写配置。

### 3.3 第 2 步：写配置（两台只差两行）

KA1 的 `/etc/keepalived/keepalived.conf`，逐行翻译：

```conf
vrrp_instance VI_1 {              # 一组"抢IP小队"，名字随便取
    state MASTER                  # 初始角色（KA2 上写 BACKUP）     ← 差异①
    interface eth0                # 心跳和VIP绑在哪块网卡
    virtual_router_id 61          # 小队编号 0~255，两台必须相同
    priority 100                  # 权位，谁大谁持有VIP（KA2 写 90） ← 差异②
    advert_int 1                  # 心跳间隔1秒
    virtual_ipaddress {
        172.67.0.20/24            # 大家争夺的VIP
    }
}
```

网卡名别猜，用 `ip route | awk '/default/ {print $5}'` 查真实名字（可能是 `ens192`、`enp0s3`）。KA2 的配置就是把 `MASTER` 改 `BACKUP`、`100` 改 `90`，**其余逐字节一致**。

三个容易想歪的点：

1. `state` 只是开机初始站位，真正说了算的是 `priority`——就算把 KA1 写成 `state MASTER` 但 priority 给 50，KA2（BACKUP/90）照样把它摁下去
2. `virtual_router_id` 和 VIP 两台必须一致，差一个字符就是两支互不认账的小队，各抢各的
3. 以后任何改动（心跳间隔、换 VIP）都要两台同步改，只许 state/priority 各自维护

### 3.4 第 3 步：启动（两台）

```bash
systemctl enable --now keepalived
systemctl status keepalived       # active (running)
```

### 3.5 第 4 步：验收

```bash
ip addr show eth0 | grep 172.67.0.20   # KA1 上能看到 = 对；KA2 上没有 = 对
curl http://172.67.0.20/                # 应答内容 = KA1 的页面
```

我给两台各放了一个自我介绍页面，此刻访问 VIP：

```text
$ curl http://172.67.0.20/
我是 KA1 (MASTER 172.67.0.21)
```

### 3.6 第 5 步：故障演练（上岗前必做）

三幕剧，全部真实输出。

第一幕，正常状态：VIP 在 KA1 网卡上，curl VIP 是 KA1 应答（见上文）。

第二幕，KA1 宕机——kill 掉它的 keepalived 模拟猝死：

```text
$ docker exec ka1 pkill keepalived
  第1秒: KA2 网卡上 VIP 已出现 ✓
$ curl http://172.67.0.20/
我是 KA2 (BACKUP 172.67.0.22)
```

注意：KA1 上的 nginx 还活着，但门牌已经不在它家——没有流量找它了。

第三幕，KA1 修好复活：

```text
$ systemctl start keepalived        # KA1 上执行
$ ip addr show eth0 | grep 172.67.0.20
    inet 172.67.0.20/24 scope global secondary eth0
$ curl http://172.67.0.20/
我是 KA1 (MASTER 172.67.0.21)       ← priority 100 > 90，大哥回归抢回门牌
```

看全程内幕的最佳位置是 `journalctl -u keepalived -f`，两台都开着，能实时看到"心跳丢失 → 接管"和"大哥回归 → 让位"的日志对白。

**"几秒接管"的账**：BACKUP 连续 3 个心跳没收到才判定对方死亡（`3 × advert_int` ≈ 3 秒），加上免费 ARP 广播刷新全网交换机的地址表（几秒）。整容器拔网线实测约 6 秒，真机断电场景按 3~4 秒预期——用户的浏览器会自动重试，基本无感。

### 3.7 第 6 步：聪明让位（track_script，强烈建议加）

上面的配置只防"机器死了"。如果机器活着但**网关进程死了**，门牌不会动，流量继续打进死机器。加一段健康检查解决：

```conf
vrrp_script chk_nginx {
    script "/usr/bin/curl -s -o /dev/null http://127.0.0.1/"   # 探活本机业务
    interval 3       # 每3秒查一次
    weight -30       # 查不通→priority减30（100变70，低于90，自动让位）
    fall 2           # 连续失败2次才算真死（防网络抖动误杀）
    rise 2           # 连续成功2次才算复活（防反复横跳）
}
vrrp_instance VI_1 {
    ...原有内容不动...
    track_script { chk_nginx }
}
```

### 3.8 第 7 步：上岗

keepalived 只管门牌不碰业务。把业务（nginx / APISIX / 别的什么）在两台都跑起来，前端和 DNS 全部指向 VIP，完事。

---

## 四、keepalived 和 APISIX 是怎么配合的

这是最多人想岔的一步："keepalived 怎么把数据传给后面的 APISIX？"——**它不传，一个字节都不传。** 两个证据。

证据一，看谁在监听端口。在网关机上：

```text
$ ss -tlnp | grep 9080
LISTEN 0 511 0.0.0.0:9080 0.0.0.0:*  users:(("openresty",pid=1,fd=20))  ← APISIX 的内核
（keepalived 不在任何 TCP 端口上——它的心跳是 IP 协议号 112，根本不走 TCP/UDP 端口）

$ ps aux | grep keepalived
root  9  ... keepalived -D -f /etc/keepalived/keepalived.conf   ← 活着，但不接客
```

证据二，让两台网关的流水账（access log）说话。网关集群正常时打一发请求，账记在持 VIP 的 M1 头上：

```text
172.66.0.1 - - [16/Sep/2026:12:43:46 +0000] 172.66.0.100:9080 "GET /hello HTTP/1.1" 200 ...
```

停掉 M1 的 keepalived、等 VIP 漂到 M2，再打一发：

```text
172.66.0.1 - - [16/Sep/2026:12:43:52 +0000] 172.66.0.100:9080 "GET /hello HTTP/1.1" 200 ...
（这条出现在 M2 的日志里——同一时刻 M1 的日志没有新增）
```

复活 M1，等门牌搬回来再打：

```text
172.66.0.1 - - [16/Sep/2026:12:45:34 +0000] 172.66.0.100:9080 "GET /hello HTTP/1.1" 200 ...
（这条回到 M1 的日志里）
```

结论：**请求打到 VIP，永远是"此刻网卡上挂着 VIP 的那台机器"里的网关接单记账。** 数据是按门牌自己找上门的，不是谁转交给 APISIX 的。

那两台网关和 keepalived 靠什么"配合"？靠一份三方契约，没有任何直接对话：

| 契约条款 | 谁负责 | 违约后果 |
|----------|--------|----------|
| ① 网关必须监听 `0.0.0.0`，不能写死自己 IP | 网关的配置文件 | 写死 `192.168.1.31` → VIP 漂过来也没人接电话，经典翻车点 |
| ② 两台网关认识完全相同的路由 | etcd 同步 | 路由不一致 → 漂移瞬间"换了一家公司"，部分接口 404 |
| ③ 机器活着但网关死了也要让位 | keepalived 的 track_script | 不配 → 半死机状态，VIP 不漂，流量黑洞 |

![公司网关两台同机形态](/Linux/loadbalancing/img-001.png)

看图注意一件事：keepalived 和 APISIX 两个进程之间没有任何通信、没有任何接口调用。这也是这个架构简洁的地方——把 APISIX 换成 nginx 或任何别的网关，keepalived 的配置一个字都不用改。

---

## 五、四层与七层：信封与信纸

把一个请求想象成一封信：

```text
┌─────────────────────────────────────────┐
│ 信封：                                    │
│   收件地址 192.168.1.40（IP）             │
│   收件窗口 9080 端口                      │  ← 四层设备只读到这里
│ ───────────────────────────────────────  │
│ 信纸（HTTP 内容）：                        │
│   "GET /usercenter/api/list HTTP/1.1"    │  ← 七层设备才会拆开读
│   Header: Authorization: xxx             │
│   Body: {"page": 2}                      │
└─────────────────────────────────────────┘
```

- 四层 = 传输层：看信封（IP + 端口），不拆信
- 七层 = 应用层：拆信读内容，知道你要干嘛（查哪个路径、带什么登录态）

于是两种设备的分工与身价：

| | 四层设备（LVS） | 七层设备（APISIX/nginx） |
|---|---|---|
| 能做的事 | 只能按 IP:端口 分 | 按路径/Header/Cookie/Body 做任何事 |
| 抗量 | 百万级连接 | 数万~数十万 QPS |
| 代价 | 极便宜：不拆包，只记一张转发表 | 贵：每个请求完整解析一遍 HTTP |

四层为什么扛得住百万连接？它对每封信只做"扫条码 → 换单转发"，开销几乎恒定；七层每封都要"拆封、通读、决策、重封"，天然贵一个量级。所以大厂才用"便宜的四层扛量、昂贵的七层干精活"的分工。

顺带把身边的设备归个类：keepalived 的 VIP 连四层都不算（只管 IP，端口都不看）；Windows portproxy、云 SLB 的"四层监听"是四层；nginx 的 `location` + `proxy_pass`、APISIX 的 `uris: /usercenter/*`、云 SLB 的"七层监听"是七层。

---

## 六、LVS：传达室里的分拣机

### 6.1 它是什么

LVS（Linux Virtual Server）不是软件包，是 **Linux 内核自带的转发引擎**（IPVS 模块）。`modprobe ip_vs` 给它插上电，`ipvsadm` 只是往它肚子里那张表格填数据的笔。快的原因就一条：转发在内核里完成，数据包不用拷到任何用户态程序转一圈。

用传达室的比方：所有包裹都必经传达室（内核），LVS 就是传达室里装的一台自动分拣机——包到传达室就被机器改写收件人直接转走，根本不用递给任何程序处理。

### 6.2 配置 = 在纸条上写三行字

实测（WSL 内核加载 ip_vs 后）：

```bash
modprobe ip_vs                                # 插电源
ipvsadm -A -t 172.66.0.200:9081 -s rr        # 纸条第一行: 到这个VIP:端口的包,按"轮流"分
ipvsadm -a -t 172.66.0.200:9081 -r 172.66.0.11:9080 -m   # 名单①: 网关1
ipvsadm -a -t 172.66.0.200:9081 -r 172.66.0.12:9080 -m   # 名单②: 网关2
```

看这张内核里的纸条：

```text
$ ipvsadm -Ln
Prot LocalAddress:Port Scheduler
  -> RemoteAddress:Port           Forward Weight ActiveConn InActConn
TCP  172.66.0.200:9081 rr
  -> 172.66.0.11:9080             Masq    1      0          3
  -> 172.66.0.12:9080             Masq    1      0          3
```

算法除了 `rr`（轮询）还有 `wrr`（加权轮询）、`lc`（最少连接，谁闲给谁）、`sh`（源 IP 哈希，会话保持）。记住 rr 和 wrr 就够应付九成场景。

### 6.3 实测一：轮询分流

连打 6 发请求，看内核自己的账本：

```text
$ ipvsadm -Ln --stats
  -> 172.66.0.11:9080        3 conns    1218 bytes
  -> 172.66.0.12:9080        3 conns    1218 bytes
```

6 发一边 3 发，分毫不差。这就是"四层分流"的全部真相——它只改信封上的收件人（NAT 模式顺便做端口翻译 9081→9080），不拆信不看内容。

### 6.4 实测二：裸 LVS 的翻车现场

停掉名单上的一台后端（模拟网关宕机），再打 3 发：

```text
再打3发: 000 200 000      ← 000 = 超时，一半请求寄给了死人
```

**裸 LVS 不做健康检查**——名单上还写着死人的名字，它照样轮流寄。所以生产上 LVS 从不裸奔，由 keepalived 全权打理（见 6.6）。

### 6.5 实测三：扩容 = 名单加一行字

名单里加入第三台网关，再打 6 发：

```text
$ ipvsadm -a -t 172.66.0.200:9081 -r 172.66.0.34:9080 -m
（打 6 发后）
  -> 172.66.0.11:9080    累计连接 +2
  -> 172.66.0.12:9080    累计连接 +2
  -> 172.66.0.34:9080    累计连接 +2     ← 新机器立刻开始接活
```

再玩个花的：把算法换成 wrr、给第三台权重 4（好机器多干活），连打 10 发，增量正好 2 : 2 : 6——权重一行字，比例立刻变。

**LVS 里的全部配置就五样**：VIP:端口（收件地址）、算法（怎么分）、模式（怎么改包）、后端名单（分给谁，**必须认识每一台网关**）、每台权重。它不知道路径、域名、路由规则、健康状态——故意这么蠢，蠢 = 快。聪明事全在别人那儿：路径归网关，健康归 keepalived。

### 6.6 keepalived + LVS：本来就是一套

keepalived 的另一半工作就是替 LVS 管这张纸条（这也解释了为什么架构图里它俩总画在同一个框里）：

```conf
vrrp_instance VI_1 { ... }                  # 前半身: 心跳 + VIP 漂移

virtual_server 192.168.1.40 9080 {          # 后半身: 替 LVS 管转发表
    delay_loop 3                            #   每3秒给名单全员做一次体检
    lb_algo wrr                             #   加权轮询
    lb_kind NAT
    real_server 192.168.1.31 9080 {         #   名单第1行
        weight 1
        TCP_CHECK {                         #   体检: 尝试TCP连接
            connect_port 9080
            connect_timeout 2
            retry 2
            delay_before_retry 1
        }                                   #   不通→自动摘除; 复活→自动写回
    }
    real_server 192.168.1.32 9080 { ... }   #   名单第2行, 结构同上
}
```

keepalived 一肩挑三件事：VIP 漂移（机器级故障）、LVS 转发表（怎么分流）、后端健康检查（进程级故障自动摘除）。扩容 = 照抄一段 `real_server` 改 IP，两台 keepalived.conf 同步改，reload 生效，30 秒的活。

---

## 七、完整 keepalived.conf：三大块与两处差异

一份完整模板（已通过 `keepalived -t` 语法校验，退出码 0）：

```conf
# ---------- 全局定义 ----------
global_defs {
    router_id GW_M1                # 本机署名(日志用), 另一台写 GW_M2
    enable_script_security         # 体检脚本只许root执行(防篡改后自动提权)
    script_user root
}

# ---------- 体检项目 ----------
vrrp_script chk_apisix {
    script "/usr/bin/curl -s -o /dev/null http://127.0.0.1:9080/"
    interval 3
    timeout 2
    weight -30
    fall 2
    rise 2
}

# ---------- VIP 小队 ----------
vrrp_instance VI_APISIX {
    state MASTER                   # ★M2改: BACKUP
    interface ens192               # ip route 查真实网卡名
    virtual_router_id 51           # 两台一致, 同网段全网唯一
    priority 100                   # ★M2改: 90
    advert_int 1
    # nopreempt                    # 可选: 大哥修好不抢回, 防二次抖动(只能用在BACKUP侧)
    # unicast_src_ip 192.168.1.31  # 可选: 交换机禁组播时改单播, 两台互换
    # unicast_peer { 192.168.1.32 }
    authentication {
        auth_type PASS
        auth_pass Ap1six           # 前8位有效, 两台一致
    }
    virtual_ipaddress {
        192.168.1.40/24            # 争夺的VIP, 前端/DNS只填这个
    }
    track_script { chk_apisix }
}

# ---------- LVS 名单(选配, 不玩LVS整段删) ----------
virtual_server 192.168.1.40 9080 {
    delay_loop 3
    lb_algo wrr
    lb_kind NAT
    protocol TCP
    real_server 192.168.1.31 9080 {
        weight 1
        TCP_CHECK { connect_port 9080  connect_timeout 2  retry 2  delay_before_retry 1 }
    }
    real_server 192.168.1.32 9080 { ...同上... }
}
```

两台机器的差异背下来就三处：`router_id`、`state`、`priority`（若启用单播再加 src/peer 互换）。其余逐字节相同。

改完自查一条：`keepalived -t -f /etc/keepalived/keepalived.conf`——只测语法不运行，生产改配置的保命习惯。

---

## 八、公司两台 vs 大厂分层：该用哪种形态

![大厂分层接入架构](/Linux/loadbalancing/img-002.png)

| | 同机形态（两台） | 分层形态（大厂） |
|---|---|---|
| 机器数 | 2 台 | 2 台专机 LVS + 4~N 台网关 |
| 每台机器上跑什么 | keepalived + APISIX | LVS 机：keepalived + LVS；网关机：纯 APISIX |
| 分流在哪层做 | APISIX 的 upstream 自带轮询 | LVS 四层分流（百万级连接） |
| 适合谁 | 绝大多数中小公司、内网网关 | 公网大流量、网关超过 3 台 |
| 拆层的信号 | —— | 网关要独立扩缩容；四层扛量七层干精活要分开算钱 |

分层形态的精髓是两层各干各的粗细活：LVS 只看 IP:端口（四层，便宜，扛量），网关集群拆信干细活（七层，贵，精活）；网关无状态（配置全在 etcd，watch 实时同步每一台），加机器即扩容，LVS 名单添一行完事。

而两层防挂的手法你已经全会了：**接入层自身就是一对 keepalived 主备 + VIP 漂移，和你们两台网关之间玩的是同一个把戏**。如果主备两台同时挂呢？——双机房各一套接入层，DNS 把域名切到另一机房兜底（分钟级）；再往上才是异地多活。工程上不存在"永不挂的东西"，追求的是"挂了用户感觉不到"：消灭单点 + 恢复自动化，两条而已。

公司两台网关的裁剪建议：**删掉 virtual_server 整段**（APISIX 的 upstream 自带轮询，不需要 LVS），剩下的就是"keepalived 只管门牌 + 网关死也让位"的最小可靠形态——本文第四节那张图。

---

## 九、生产部署检查表

容器里遇不到、真机上必查的四件事，逐条打勾再上岗：

- [ ] **网卡名**：`ip route | awk '/default/ {print $5}'` 查真实名字，替换配置里的 `interface`
- [ ] **防火墙放行心跳**：VRRP 是 IP 协议号 112，不是端口！`ufw allow proto 112 from <对端IP>`（firewalld 用 rich rule）；排障期可临时 `ufw disable` 对照
- [ ] **组播是否被禁**：部分交换机吞掉 224.0.0.18。症状 = 两台都说自己 MASTER（双双抢 VIP）。解法 = 配置改单播（`unicast_src_ip` / `unicast_peer`）
- [ ] **演练制度**：上岗前至少完整演练一次"拔电→接管→复活→抢回"；以后每次变更（换网关、升级配置）后重演一遍。没演练过的高可用 = 没有高可用
- [ ] **网关监听地址**：确认网关配置监听 `0.0.0.0:9080`（APISIX 的 `node_listen` 默认就是），写死单机 IP 是漂移后没人接电话的经典翻车点
- [ ] **别忘了**：`keepalived -t` 语法自查 → `systemctl enable --now keepalived` → `ip addr` 确认 VIP 归属 → `journalctl -u keepalived -f` 看心跳对白

---

## 十、FAQ 与踩坑实录

**Q1：两台都显示 MASTER、IP 时通时断？**
脑裂（split-brain）典型症状：心跳不通但两台都活着，各抢各的 VIP。先查防火墙 112 和交换机组播，再考虑配双心跳路径。内网双机场景概率极低，但症状要认得。

**Q2：curl VIP 返回 000 是什么意思？**
超时无应答。本文 6.4 节的实测：后端死了但 LVS 名单没摘除，一半请求寄给死人。带上 keepalived 的健康检查（或任何带探活的负载均衡）就不会发生。

**Q3：为什么是 3~4 秒接管，不是 0 秒？**
3 × advert_int 的判定窗口 + 免费 ARP 刷新交换机表项。想要更快可把 advert_int 调小（如 0.5），代价是心跳流量变大、网络抖动误判变多——1 秒是甜点位。

**Q4：VIP 漂回 MASTER 后，前几秒请求还是旧机器应答？**
正常现象：交换机 ARP 缓存还没刷新。用户侧浏览器自动重试可吸收；介意的话用 `nopreempt` 让大哥修好后安静当备胎，不抢回。

**Q5：keepalived 到底占不占端口？**
不占任何 TCP/UDP 端口。心跳走 IP 协议号 112。`ss -tlnp` 里永远找不到它——找不到才说明它健康。

**Q6：为什么我的 LVS 实验不生效，流量全去了同一台？**
检查宿主机有没有别的 DNAT 抢先。笔者的实测翻车：网关容器发布过 `-p 9080:9080`，docker 的 DNAT 规则把宿主机上所有目的端口 9080 的包直接劫走，LVS 根本没轮到出手。换个没被占用的端口（如 9081，LVS 顺手做端口翻译）立刻正常。

---

## 参考资料

- keepalived 官方文档与 man page：`man keepalived.conf`（配置项最全的一手来源）
- Linux Virtual Server 项目：<https://www.linuxvirtualserver.org>
- IPVS 内核文档：内核源码 `Documentation/networking/ipvs.rst`
- Julia Evans 的技术写作方式（比喻 + 小实验）：<https://jvns.ca>
- Brendan Gregg 的证据纪律（结论必须配真实输出）：<https://www.brendangregg.com>
- Google SRE Book（演练与故障排查方法论）：<https://sre.google/books/>

---

➡️ 下一篇：系列完结（规划中：《keepalived 脑裂与仲裁》《LVS DR 模式与公网接入》）
