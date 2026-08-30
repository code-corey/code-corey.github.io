---
title: 多网络容器实战：监控探针与前后端隔离网关
sidebarGroup: Docker 附录
shortTitle: 03 多网络容器实战
order: 3
date: 2026-08-30T00:00:00.000Z
category: 云原生
tag:
  - Docker
  - 云原生
  - Docker附录
  - 网络
description: 多网络容器实战——用同一台机器上的两个隔离网络，演示监控探针接入多网、nginx 应用层网关、容器路由器三种玩法，全部实验实跑记录
---

> **Docker 附录 · 第 3/3 篇**
>
> 本文是[主线第 15 篇（容器网络）](/云原生/docker/docker-15-network/)第 5 课「一个容器可同时插在多个网络」的实战展开，建议先读主线再来看这篇。文中所有命令和输出都来自 2026-08-30 在 WSL2（Ubuntu 22.04 + Docker Engine 29.1.3）上的实机操作，未做美化。

---

# 多网络容器实战：监控探针与前后端隔离网关

## 开场：为什么要折腾「一个容器插两个网络」

🧑‍🎓 学生：老师，上次你说一个容器可以同时插在多个网络里，我回去想了想——这除了「能」，还有什么用吗？

🧑‍🏫 老师：用处大得很。你想想现实里两种特别常见的角色：

第一种，**监控探针**。公司里有十个隔离的业务网段，监控服务器要看到每一个网段里的服务活没活着。总不能在十个网段里各装一套监控系统吧？让探针这个容器把十条腿分别插进十个网络，它就「哪里的门禁都刷得开」，一探到底。

第二种，**前后端隔离网关**。安全上的经典做法：前端网络和后端网络互相隔离，前端里的机器不许直接摸到后端——但前端又确实需要调后端的接口。怎么办？在两个网络中间放一个「只开一扇小门」的容器：它两条腿一边踩一个网络，前端只能通过它中转，而且它只转发某一种流量（比如 HTTP），别的统统不放行。

🧑‍🎓 学生：等一下，「两条腿一边踩一个网络」——这不就是上次说的 `docker network connect` 吗？

🧑‍🏫 老师：对，机制就是那么简单。但「连上」和「用好」之间差着一整个架构师的活儿。今天我们就把这两种角色在机器上真实搭一遍，你就能看见每个细节。先把实验现场搭起来。

## 第 1 课：搭舞台——两个互相隔离的网络

按照主线第 15 篇讲的，先建两个网络。我故意起名叫 `dmz-net`（前端区）和 `core-net`（后端核心区），模拟公司里最经典的分区：

```bash
docker network create dmz-net
docker network create core-net
docker network inspect -f "{{.Name}} {{range .IPAM.Config}}{{.Subnet}}{{end}}" dmz-net core-net
```

```text
dmz-net 172.20.0.0/16
core-net 172.21.0.0/16
```

两个网段，一个 172.20，一个 172.21。然后往里面放两台「业务机」：后端放一台 nginx 当核心应用，前端区放一台 busybox 当普通工作机。

```bash
docker run -d --name core-app --network core-net nginx:alpine
docker run -d --name dmz-web --network dmz-net busybox sleep 3600
```

先验证一下隔离是真的。让前端的 `dmz-web` 去 ping 后端：

```bash
docker exec dmz-web ping -c1 -W2 core-app
```

```text
ping: bad address 'core-app'
```

名字解析直接失败——Docker 的内置 DNS 只告诉你自己网络里的名字（主线第 15 篇第 4 课讲过，每个网络一本名册）。那绕过 DNS，硬敲 IP 呢？

```bash
docker exec dmz-web ping -c1 -W2 172.21.0.2
```

```text
PING 172.21.0.2 (172.21.0.2): 56 data bytes

--- 172.21.0.2 ping statistics ---
1 packets transmitted, 0 packets received, 100% packet loss
```

100% 丢包。这就是主线讲过的三层隔离里的第三层：两个网段连的是不同的桥，iptables 的转发链把跨桥的包直接丢弃了。

🧑‍🎓 学生：所以现在就是一个「前端区」和一个「后端区」，谁也不理谁。

🧑‍🏫 老师：完美的舞台。接下来请两位主角登场——都是「一个容器插两个网络」的玩法。

## 第 2 课：场景一 监控探针——哪里的门禁都刷得开

先搭探针。创建时只加入 `core-net`，再把第二条腿 `connect` 到 `dmz-net`：

```bash
docker run -d --name gw-probe --network core-net busybox sleep 3600
docker network connect dmz-net gw-probe
```

看看它现在的网络清单：

```bash
docker inspect -f "{{range $k,$v := .NetworkSettings.Networks}}{{$k}}={{$v.IPAddress}} {{end}}" gw-probe
```

```text
core-net=172.21.0.3 dmz-net=172.20.0.3
```

两条腿，两个网段的 IP 都拿到了。现在探针两头 ping 一遍——这就是监控探针的日常工作：

```bash
docker exec gw-probe ping -c1 -W2 dmz-web | tail -2
docker exec gw-probe ping -c1 -W2 core-app | tail -2
```

```text
round-trip min/avg/max = 0.166/0.166/0.166 ms
round-trip min/avg/max = 0.145/0.145/0.145 ms
```

两边都是 0% 丢包。再狠一点，直接对后端发起 HTTP 探测（监控系统真实的做法）：

```bash
docker exec gw-probe wget -T2 -qO- http://core-app | head -c 120
```

```text
<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title
```

🧑‍🎓 学生：所以探针能看见两边的服务，但两边的业务机互相看不见。

🧑‍🏫 老师：这正是探针的价值——**它的「可见」不破坏别人的「隔离」**。刚才我们验过 `dmz-web` 还是 ping 不到 `core-app`，探针只是自己两条腿各伸一边。监控的世界里这叫「带外观测」：我看得到你，你摸不到我。

## 第 3 课：场景二 方案 A——nginx 应用层网关

第二个场景难一点：前端要调后端的接口，但不许直连。先说**应用层方案**：放一台 nginx 网关，两边各插一条腿，把它配置成「反向代理」——前端访问网关，网关替它去取后端的内容。

```bash
docker run -d --name gw-proxy --network dmz-net nginx:alpine
docker network connect core-net gw-proxy
```

然后写一小段 nginx 配置：把收到的请求原封不动转给 `core-app:80`（注意，nginx 在 core-net 里，所以它能解析 `core-app` 这个名字），写完热加载：

```bash
docker exec gw-proxy sh -c "printf 'server {\n  listen 80;\n  location / {\n    proxy_pass http://core-app:80;\n  }\n}\n' > /etc/nginx/conf.d/default.conf && nginx -s reload"
```

```text
2026/08/30 09:52:11 [notice] 50#50: signal process started
```

现在从前端的 `dmz-web` 出发，走网关访问后端：

```bash
docker exec dmz-web wget -T2 -qO- http://gw-proxy | head -c 100
```

```text
<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title
```

拿到了！前端机成功读到了后端 nginx 的页面——尽管它自己 ping 不到后端的任何东西。

🧑‍🎓 学生：等下，我要确认一下「不许直连」还在不在。它现在能不能绕过网关直接摸后端？

🧑‍🏫 老师：问得好，这叫验证「隔离没被破坏」。按名字绕（DNS 还是只认自己网络）：

```bash
docker exec dmz-web wget -T2 -qO- http://core-app
```

```text
wget: bad address 'core-app'
```

按 IP 绕（硬敲 172.21.0.2）：

```bash
docker exec dmz-web wget -T2 -O- http://172.21.0.2 2>&1 | tail -1
```

```text
wget: download timed out
```

两条绕行的路都堵死。**前端只能通过网关这一扇门拿到后端的东西**——而且 nginx 还可以加白名单、限流、鉴权（`allow`、`limit_req`、`auth_request`），门上装什么锁随你。

🧑‍🎓 学生：那这台网关容器，本质上是个「懂 HTTP 的门卫」。

🧑‍🏫 老师：总结得准。它是应用层网关：门卫看得懂你在说什么（HTTP），所以能决定「这话可以帮你递，那话不行」。这是最推荐的做法——安全边界清晰，策略写在配置里明明白白。

## 第 4 课：方案 B——让容器当路由器（以及一个真实的坑）

还有第二种思路，更「网络层」：不放懂 HTTP 的门卫，放一个**路由器**。它两条腿插两个网络，打开内核的 IP 转发，前端把「去后端的路」指到它身上，它在 IP 层替双方转包，顺手做个源地址伪装（就是主线第 15 篇插问 2 讲的 MASQUERADE）。

标准姿势一共五步，我先把完整命令给你：

```bash
# 1. 起路由器：挂进前端网络，开 NET_ADMIN 权限（要改路由/防火墙）和 IP 转发
docker run -d --name gw-router --network dmz-net \
  --cap-add NET_ADMIN --sysctl net.ipv4.ip_forward=1 alpine sleep 3600

# 2. 第二条腿插进后端网络
docker network connect core-net gw-router

# 3. 装防火墙工具，加源地址伪装：从后端网卡出去的包，源地址伪装成自己的
docker exec gw-router apk add --no-cache iptables
docker exec gw-router iptables -t nat -A POSTROUTING -o eth1 -j MASQUERADE

# 4. 前端机上把「去后端的路」指向路由器（路由器在前端网络的 IP，假设是 172.20.0.2）
docker exec gw-front ip route add 172.21.0.0/16 via 172.20.0.2

# 5. 验证
docker exec gw-front ping -c1 -W3 172.21.0.2
```

🧑‍🎓 学生：原理我听懂了——这跟家里路由器让全家设备上网是一回事。跑起来什么样？

🧑‍🏫 老师：这就是我今天最想跟你聊的部分。**这套命令是业界标准的容器路由器姿势，在标准 Linux 宿主机上是通的。但我在这台 WSL2 机器上复现时，它卡住了**——而且排查的过程本身，比「成功」教的东西更多。我把整个过程原样给你看。

第一步，路由器和前端机都就位后，先确认近处是通的：前端 ping 路由器自己，通。

```text
round-trip min/avg/max = 0.201/0.201/0.201 ms
```

第二步，前端 ping 后端（走路由器转发）：

```text
1 packets transmitted, 0 packets received, 100% packet loss
```

不通。按排障三板斧来。第一斧：**路由表对不对？** 用 `ip route get` 直接问内核「这个包你打算怎么发」：

```bash
docker exec gw-front ip route get 172.21.0.2
```

```text
172.21.0.2 via 172.20.0.2 dev eth0 src 172.20.0.3 uid 0
```

内核明确说：经 172.20.0.2（路由器）发。路由没毛病。第二斧：**邻居（ARP）对不对？** 网关的 MAC 地址解析出来了没有：

```bash
docker exec gw-front ip neigh show
```

```text
172.20.0.2 dev eth0 lladdr 3a:61:6d:cf:a8:09 ... REACHABLE
```

REACHABLE，路由器就在对面站着，MAC 都握上手了。第三斧：**包到底死在哪？** 在路由器的网卡上抓包看：

```bash
docker exec gw-router tcpdump -l -i eth0 -n icmp or arp
```

抓到的关键几行（时间戳保留）：

```text
13:43:55.661097 ARP, Request who-has 172.20.0.2 tell 172.20.0.3
13:43:55.661109 ARP, Reply 172.20.0.2 is-at 3a:61:6d:cf:a8:09
13:43:55.661142 IP 172.20.0.3 > 172.20.0.2: ICMP echo request   ← 前端 ping 路由器自己：到达
13:43:55.661181 IP 172.20.0.2 > 172.20.0.3: ICMP echo reply     ← 路由器回答：正常
13:44:00.739865 ARP, Request who-has 172.20.0.3 tell 172.20.0.2 ← 注意这行！
13:44:00.739907 ARP, Reply 172.20.0.3 is-at 12:b3:4f:cd:bc:e8
```

前四行是「前端 ping 路由器」的完整对话，健康无比。而最后两行的时间点，恰好卡在「前端 ping 后端超时」的那一瞬——**路由器在反向 ARP 前端机**。这说明一件非常有意思的事：确实有一个包（大概率是后端弹回来的回应）送到了路由器手上、要发给前端，路由器却要到超时那一刻才想起来问「前端机你 MAC 是多少」。包在半路上被拖延、被吞，但**不在前端，也不在路由表**。

🧑‍🎓 学生：所以凶手藏在更深的地方？

🧑‍🏫 老师：对。再往下查就撞到 Docker 网络模型的「地基」了：这台机器上 Docker 开着 `bridge-nf-call-iptables`（桥接流量过防火墙），转发链又是 `-P FORWARD DROP` 全拒默认、白名单放行——容器扮演的路由器夹在两座桥中间，每一跳都在和平台的安全模型掰手腕。这条链路涉及内核桥接、netfilter、conntrack 三方时序，属于「能调通，但每次环境更新都可能翻车」的高阶玩法。

所以我把结论明明白白写在这：**原理上可行、命令如上五步；但在 Docker 托管网络里，这不是它推荐你走的路。** 想要「前端只能过网关摸后端」，方案 A（应用层网关）是正路；真要网络层互通，让宿主机或者专职网元（防火墙、负载均衡）来当那个路由器，别让业务容器客串。

🧑‍🎓 学生：我反而觉得这个「失败」比成功更有收获——原来排障要一层一层往下剥：路由表 → 邻居表 → 抓包 → 平台模型。

🧑‍🏫 老师：这正是网络排障的通用路径，记住这个顺序，以后你排查 Kubernetes 的网络问题还是这一套。

## 第 5 课：加固清单——网关容器的安全底线

不管选哪个方案，网关都是整个架构里最敏感的角色——它天生「看得见两边」。给几条底线：

1. **能用应用层就别用网络层。** nginx 网关的转发策略是显式配置，白纸黑字可审计；路由器转发是「看懂 IP 就放行」，粒度粗。
2. **权限最小化。** 今天全程没碰 `--privileged`。方案 B 里那一个 `--cap-add NET_ADMIN` 已经是不得已——它能改路由、改防火墙，给出去之前想清楚。方案 A 的 nginx 网关**一个额外权限都不需要**。
3. **网关上配白名单。** 应用层网关记得加 `allow/deny`；就算走网络层，也应该在 DOCKER-USER 链（主线第 15 篇插问 5）里限制「哪个源 IP 能过这扇门」，而不是全网开放。
4. **网关容器单独放在自己的网络里。** 别让它和业务容器混住，它暴露的面和别人不一样。

## 对照现实：这些角色你在真实世界都见过

- **DMZ（隔离区）**：今天搭的 `dmz-net`/`core-net` 就是它的微缩版。企业把对外服务放 DMZ，核心数据库放内网，中间隔一道防火墙——和我们的 nginx 网关一个思路，只是门卫从容器换成了硬件。
- **跳板机 / 堡垒机**：运维要进内网服务器，不许直连，必须先登录跳板机中转。「一个掌握两边凭证的中转点」，和探针/网关是同一个模式的安全变体。
- **Sidecar 边车**：Kubernetes 里每个 Pod 旁挂一个代理容器（如 Envoy），业务流量都从它过——「在容器旁边再放一个管网络的容器」，正是今天两个场景的合体。

## 清理现场

实验做完，把拆掉的舞台还原（这些命令会删掉今天创建的全部容器和网络）：

```bash
docker stop gw-probe gw-proxy dmz-web core-app
docker rm gw-probe gw-proxy dmz-web core-app
docker network rm dmz-net core-net
```

## 小结

| 玩法 | 一句话 | 关键命令 |
|------|--------|----------|
| 监控探针 | 两条腿各伸一边，看得见摸得着，但不破坏隔离 | `docker run --network A` + `docker network connect B` |
| 应用层网关 | 懂 HTTP 的门卫，只开一扇门 | nginx `proxy_pass` 指向对端服务名 |
| 容器路由器 | 原理可行，但和平台安全模型掰手腕，生产慎用 | `ip_forward` + `MASQUERADE` + `ip route add` |

**思考题**：

1. 探针容器删掉一个网络（`docker network disconnect`），它对另一边的探测会立刻失败吗？为什么？
2. 方案 A 里前端机解析不到 `core-app`，但网关能。如果两个网络里各有一台叫 `core-app` 的机器，网关解析到的会是哪一个？
3. 如果把方案 A 的网关配置改成 `proxy_pass http://172.21.0.2:80`（写死 IP）而不是服务名，会失去什么能力？

**参考资料**：

- Docker 官方文档：[Networking overview](https://docs.docker.com/engine/network/)
- 主线第 15 篇「容器网络」——本文所有机制的原理课
- nginx 官方文档：[ngx_http_proxy_module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
