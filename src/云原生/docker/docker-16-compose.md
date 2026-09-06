---
title: Docker Compose 编排——从一个 Nginx 滚成一整栈
sidebarGroup: Docker 系列
shortTitle: 16 Compose 编排
order: 16
date: 2026-08-25T00:00:00.000Z
category: 云原生
tag:
  - Docker
  - 云原生
  - Docker系列
  - Compose
  - 对话实录
description: 师生对话实录课：0 基础学生与教学大师的 Docker Compose 控制台逐字稿，从一个 5 行 Nginx 开始，每次只加一个因素——多服务 DNS、卷、.env、就绪等待、现场构建、扩容与资源上限，像堆雪球一样滚成一整栈。实验全部 WSL2 实机真跑。
---

> **Docker 系列 · 第 16/33 篇**
> 上一篇：[《Docker 网络——从 localhost 不通滚到能用名字互访》](/云原生/docker/docker-15-network) · 下一篇：[《从零理解 HTTPS——Nginx 容器从红页到可信（师生对话实录）》](/云原生/docker/docker-17-https-nginx)
>
> 本篇是 Compose 的主线语法课：把 `docker run` 时代散落在 bash 里的端口、卷、环境变量、启动顺序，收进一份 YAML。[第 18 篇](/云原生/docker/docker-18-compose-modern)的 watch / profiles / include，都建立在这一篇之上。

---

## 写在前面

本地开发一套 Nacos + MySQL + Gateway，每个服务一条 `docker run`。端口、卷、环境变量、启动顺序散在 bash 里：我不敢动，改一处漏两处，CI 和本机敲的命令还对不上。

所以这篇继续用老办法：**让 AI 当老师，我当学生，每课只讲一个概念，我有问题就打断，没问题就继续**。从「一条命令起一个 Nginx」的现场开始，同一个网站一路长大，像堆雪球：

> ① 五行星一条命令 → ② 服务名互访 → ③ bind mount 换页面 → ④ 命名卷与 `down -v` → ⑤ `.env` 与 `config` 预检 → ⑥ healthcheck 就绪等待 → ⑦ 现场构建 → ⑧ 扩容与资源上限 🧗

实验目录始终是 `/root/compose-lab`，每一节给出**当时完整的** `compose.yaml`（方便整份复制），正文只强调「相对上一节新增了什么」。

环境：WSL2 Ubuntu-22.04（root）+ Docker Engine 29.1.3 + Compose v2.40.3。所有输出都是本机实跑的真实结果，不是文档抄写。官方入口：[Compose overview](https://docs.docker.com/compose/)、[Compose file reference](https://docs.docker.com/reference/compose-file/)。

---

## 第 1 课：五行星，一条命令，一个欢迎页

**🧑‍🏫 老师：**

先看你现在的工作方式。`docker run` 是**过程式**的——每条命令只说「现在做一步」：先跑 web、再配端口、再挂卷，顺序散在历史命令里，别人接手只能考古。

Docker Compose 换成**声明式**：一份 YAML 写整组容器**应该长什么样**，一条 `docker compose up` 把实际状态搬过去。空口无凭，动手。建目录，写一个最小的 `compose.yaml`（Compose V2 默认找这个名字，老名字 `docker-compose.yml` 也能认）：

```bash
mkdir -p /root/compose-lab && cd /root/compose-lab

cat > compose.yaml <<'EOF'
services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
EOF

docker compose up -d
```

```text
 Network compose-lab_default  Creating
 Network compose-lab_default  Created
 Container compose-lab-web-1  Creating
 Container compose-lab-web-1  Created
 Container compose-lab-web-1  Starting
 Container compose-lab-web-1  Started
```

六行输出里，Compose 做了两件事：建项目网络 `compose-lab_default`，起容器 `compose-lab-web-1`。名字规则是 **项目名-服务名-序号**，项目名默认等于**目录名** `compose-lab`。

YAML 就三层缩进（空格，别用 Tab）：`services` → 服务名 `web` → `image` / `ports`。`8080:80` 和上一篇的 `-p` 是同一件事。看效果：

```bash
docker compose ps
curl -s localhost:8080 | grep "<title>"
docker compose logs --tail=2 web
```

```text
NAME                IMAGE          COMMAND                  SERVICE   CREATED         STATUS        PORTS
compose-lab-web-1   nginx:alpine   "/docker-entrypoint.…"   web       5 seconds ago   Up 1 second   0.0.0.0:8080->80/tcp, [::]:8080->80/tcp

<title>Welcome to nginx!</title>

web-1  | 2026/08/17 13:00:20 [notice] 1#1: start worker process 35
web-1  | 172.26.0.1 - - [17/Aug/2026:13:00:21 +0000] "GET / HTTP/1.1" 200 896 "-" "curl/7.81.0" "-"
```

`ps` 比 `docker ps` 多一列 **SERVICE**。日志第二行是 nginx 访问日志：有人 `GET /`，回了 `200`。页面通了。清场（先记住，后面几节还要在同一目录反复 `up`）：

```bash
docker compose down
```

```text
 Container compose-lab-web-1  Stopping
 Container compose-lab-web-1  Stopped
 Container compose-lab-web-1  Removing
 Container compose-lab-web-1  Removed
 Network compose-lab_default  Removing
 Network compose-lab_default  Removed
```

`up` 建了什么，`down` 就删什么——容器和网络。**卷暂时还没有**，所以还看不出「数据还在不在」。现在回头看刚才冒出来的三个名字，Compose 的三层模型才有着落：

```text
Project（工程）          ← 目录 compose-lab，一份 YAML
└── Service（服务）      ← YAML 里的 web
    └── Container（容器）← 跑起来的 compose-lab-web-1
```

**🧑‍🎓 学生：** 等等，网上教程的 `compose.yaml` 第一行都写着 `version: '3.8'`，咱们要不要写？不写会不会不兼容？

**🧑‍🏫 老师：**

问得好，这正是最大的历史包袱。**`version` 现在是废弃字段**。你在文件里写上试试，V2 会警告并忽略：

```text
the attribute `version` is obsolete, it will be ignored, please remove it to avoid potential confusion
```

顺带把另一个包袱一起清了：`docker-compose`（带连字符的 V1）已于 2023-06 EOL，现在的命令是插件式的 **`docker compose`**（空格）。新文件不要写 `version:`。端口值建议仍加引号（`"8080:80"`），V2 不加也不会再把 `53:53` 当成六十进制整数——那是 V1 用 Python YAML 1.1 解析的老坑。

**🧑‍🎓 学生：** 项目名必须等于目录名吗？两个项目都想叫 `compose-lab` 怎么办？

**🧑‍🏫 老师：**

可以用 `docker compose -p 别的名字 up` 覆盖，或设 `COMPOSE_PROJECT_NAME` 环境变量。不过新手期先别折腾，让默认值立着，名字里的项目前缀反而是好用的筛子。最后画一条边界：**Compose 是单机编排**——不管集群负载均衡、不管故障了到别的机器上重拉，那是 Swarm / K8s 的事。这条边界的滋味，第 8 课会让你亲口尝到。

---

## 第 2 课：再加一个 Redis，用服务名互相找到

**🧑‍🏫 老师：**

真实项目不会只有一个容器。现在**只新增 `redis` 服务**，`web` 用短格式 `depends_on` 点名依赖它：

```yaml
services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
    depends_on:
      - redis
  redis:
    image: redis:7
```

```bash
docker compose up -d
```

```text
 Network compose-lab_default  Creating
 Network compose-lab_default  Created
 Container compose-lab-redis-1  Creating
 Container compose-lab-redis-1  Created
 Container compose-lab-web-1  Creating
 Container compose-lab-web-1  Created
 Container compose-lab-redis-1  Starting
 Container compose-lab-redis-1  Started
 Container compose-lab-web-1  Starting
 Container compose-lab-web-1  Started
```

两个细节：**redis 先创建、先启动**；两个容器进了**同一张项目网络**。于是上一篇的自定义 bridge + 内嵌 DNS 直接能用——同网络里用**服务名**当主机名：

```bash
docker compose exec web nslookup redis
docker compose exec redis redis-cli ping
```

```text
Server:		127.0.0.11
Address:	127.0.0.11:53

Non-authoritative answer:
Name:	redis
Address: 172.26.0.2

PONG
```

`127.0.0.11` 就是上一篇讲过的内嵌 DNS。应用配置里写 `redis:6379` 即可，不用记 IP，也不用过时的 `--link`。`exec` 是在已运行的服务里再跑一条命令。

**🧑‍🎓 学生：** 我有个不放心的地方。`depends_on` 写了 redis，web 就一定会连上 redis 吗？要是 web 启动那一瞬间就去连，redis 还没准备好接连接呢？

**🧑‍🏫 老师：**

这个不放心非常专业。短格式 `depends_on` **只保证 redis 容器先 start，不保证 redis 已经能接连接**——进程活着和「能干活」是两回事。web 启动瞬间去连，仍可能 `connection refused`。

这个坑今天先记下，不展开——第 6 课用 healthcheck 把它补上。

---

## 第 3 课：把页面换成你自己的 HTML

**🧑‍🏫 老师：**

nginx 默认欢迎页没意思。给 `web` 加一行 **bind mount**：把宿主机 `./html` 盖到 nginx 的站点目录，只读。

```yaml
services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./html:/usr/share/nginx/html:ro
    depends_on:
      - redis
  redis:
    image: redis:7
```

```bash
mkdir -p html && echo '<h1>hello from bind mount</h1>' > html/index.html
docker compose up -d
curl -s localhost:8080
```

```text
<h1>hello from bind mount</h1>
```

这就是第 14 篇玩过的 bind：改宿主机文件，容器读到的就是新页面。语法仍是 `宿主机路径:容器路径:ro`，只是从命令行的 `-v` 搬进了 YAML 的 `volumes:`。这一课没有新概念，就一句：**命令行里会的，YAML 里都有座位**。

---

## 第 4 课：Redis 的数据，删容器之后还在吗？

**🧑‍🏫 老师：**

网页能换了，缓存呢？给 redis 加**命名卷**，并在文件最外层声明卷名（和 `services` 同级）：

```yaml
services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./html:/usr/share/nginx/html:ro
    depends_on:
      - redis
  redis:
    image: redis:7
    volumes:
      - redis-data:/data

volumes:
  redis-data: {}
```

写入一个键，确认卷已经出现，并且带着项目前缀：

```bash
docker compose up -d
docker compose exec redis redis-cli set compose:proof survives-down
docker volume ls --format '{{.Name}}' | grep compose
```

```text
OK
compose-lab_redis-data
```

然后做第 14 篇的同款实验——**先 down 掉整套，再 up**：

```bash
docker compose down && docker compose up -d
docker compose exec redis redis-cli get compose:proof
```

```text
"survives-down"
```

`down` 删了容器和网络，**没动卷**。要连数据一起清：

```bash
docker compose down -v
docker compose up -d >/dev/null
docker compose exec redis redis-cli get compose:proof
```

```text
 Volume compose-lab_redis-data  Removing
 Volume compose-lab_redis-data  Removed

(nil)
```

`(nil)` 是 redis 对「键不存在」的固定答复。`down -v` 才会删命名卷。

**🧑‍🎓 学生：** 为什么 `down` 不顺手把卷也删了？删干净不是更清爽吗？

**🧑‍🏫 老师：**

反了——**不删才是对的**。卷里是数据资产：MySQL 的库、Redis 的会话。`down` 的语义是「这套容器先散了」，如果顺手把数据扬了，谁还敢在生产边上敲这条命令？所以编排工具的默认边界画得很清楚：自己建的网络、容器，随时收走；卷要显式加 `-v` 才动。对照第 14 篇开头那个 MySQL 故事：`db-data:/var/lib/mysql` 就是这一球 redis 写法的翻版。

---

## 第 5 课：同一份 YAML，换个端口、换套环境变量

**🧑‍🏫 老师：**

**优先级规则：environment (直接指定) > env_file (文件加载) > .env (默认变量)**

开发和测试不该改 YAML 里的硬编码端口。加上 **`${变量:-默认值}`**，值来自同目录 `.env` 或外壳环境变量。先造两个文件：

```bash
printf 'WEB_PORT=8081\nWHO=from-env-file\n' > .env
printf 'GREETING=hi-from-envfile\nONLY_IN_ENVFILE=yes\n' > app.env
```

.env文件

```yaml
WEB_PORT=8081
WHO=from-env-file
```

app.env文件

```
GREETING=hi-from-envfile
ONLY_IN_ENVFILE=yes
```



在上一份文件的 `web` 上增加端口变量、`env_file` 和 `environment`（redis / 卷先原样留着也行；下面为了盯配置，只留下 web）：

```yaml
services:
  web:
    image: nginx:alpine
    ports:
      - "${WEB_PORT:-8080}:80"
    env_file:
      - ./app.env
    environment:
      GREETING: overridden-by-environment # 覆盖 app.env 中的 GREETING
      WHO: ${WHO:-default}  # 使用 .env 中的 WHO=from-env-file
    volumes:
      - ./html:/usr/share/nginx/html:ro
```

先不要 `up`。`docker compose config` **不启动任何东西**，只把变量替换后的最终 YAML 打出来：

```bash
docker compose config
```

本机节选：

```text
name: compose-lab
services:
  web:
    environment:
      GREETING: overridden-by-environment
      ONLY_IN_ENVFILE: "yes"
      WHO: from-env-file
    image: nginx:alpine
    ports:
      - mode: ingress
        target: 80
        published: "8081"
        protocol: tcp
```

| 渲染结果 | 说明 |
|----------|------|
| `published: "8081"` | `.env` 里的 `WEB_PORT` 生效了 |
| `GREETING: overridden-by-environment` | 与 `env_file` 重名时，**`environment` 赢** |
| `ONLY_IN_ENVFILE: "yes"` | 只在 env_file 里的键，原样注入 |
| `WHO: from-env-file` | `${WHO}` 在**解析 YAML 时**替换，来自 `.env` |

再启动，进容器核对，并用新端口访问：

```bash
docker compose up -d >/dev/null
docker compose exec web sh -c 'echo "GREETING=$GREETING"; echo "ONLY_IN_ENVFILE=$ONLY_IN_ENVFILE"; echo "WHO=$WHO"'
curl -s -o /dev/null -w '%{http_code}\n' localhost:8081
```

```text
GREETING=overridden-by-environment
ONLY_IN_ENVFILE=yes
WHO=from-env-file
200
```

**🧑‍🎓 学生：** `env_file` 和 `environment` 都是注环境变量，长得很像，为什么两个都要留？我全写 `environment` 里不行吗？

**🧑‍🏫 老师：**

能，但会后悔。分工不一样：`env_file` 是**批量倒**——十几个配置一次灌入，适合跟代码无关的环境差异（数据库地址、密钥引用）；`environment` 是**精确管**——单独指定、且**优先级最高**，适合「这个环境就要覆盖那一个」的场景。记住两条就够用：优先级 **`environment` > `env_file`**；`${VAR}` 的替换发生在宿主机**解析 YAML 的阶段**，和容器里的环境变量是两码事——前者决定 YAML 长什么样，后者决定进程看到什么。以及今天的习惯口诀：**改完 YAML 先 `config`**，拼错立刻现形，不用等 `up` 爆。

> 若你把 redis 从这一版临时拿掉了，下一课加健康检查时再一并写回去。

---

## 第 6 课：等到 Redis 真的能干活，再起 Web

**🧑‍🏫 老师：**

还第 2 课的债。`depends_on: [redis]` = 容器 start 了，不等于 `redis-cli ping` 已经 PONG。解法分两步：给 redis 加探针，把依赖改成「等到 healthy」：

```yaml
services:
  web:
    image: nginx:alpine
    ports:
      - "${WEB_PORT:-8080}:80"
    volumes:
      - ./html:/usr/share/nginx/html:ro
    depends_on:
      redis:
        condition: service_healthy
  redis:
    image: redis:7
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 3s
      timeout: 3s
      retries: 3

volumes:
  redis-data: {}
```

`up -d` 时本机出现过这样的顺序：

```text
 Container compose-lab-redis-1  Healthy
 Container compose-lab-web-1  Starting
 Container compose-lab-web-1  Started
```

redis 先变成 **Healthy**，web 才 Starting。两种写法摆在一起看：

| 写法 | 等到什么 | 适用 |
|------|----------|------|
| `depends_on: [redis]` | 容器 **start** | 应用自己会重试 |
| `condition: service_healthy` | 探针 **healthy** | 数据库类慢启动（生产更稳） |

**🧑‍🎓 学生：** 探针能不能写在镜像里？我好像在哪见过 Dockerfile 里有 `HEALTHCHECK` 这个指令。

**🧑‍🏫 老师：**

见过的是对的，两处都能写，区别在**改动成本**。写在 Dockerfile 里，探针随镜像固化——改个间隔都要重建镜像、推仓库；写在 compose 里，随环境文件改，`up` 一下就生效，同一个镜像在测试环境探 3 秒、生产探 10 秒都行。所以镜像里的探针当默认值，编排里的探针做环境适配，是常见搭配。

---

## 第 7 课：别只用现成镜像了，让 Compose 现场构建

**🧑‍🏫 老师：**

项目里 web、redis 清一色 `image:` 开头——吃的都是别人做好的饭。这一课把 Compose 的另一大本事请出场：**现场构建**。服务定义里不写 `image`，改写 `build`，指向一个带 Dockerfile 的目录，`up` 时 Compose 替你现场造镜像。先造一个自己的静态站，三行 Dockerfile + 一个 html：

```bash
mkdir -p site
echo '<h1>built by compose</h1>' > site/index.html
cat > site/Dockerfile <<'EOF'
FROM busybox
COPY index.html /www/index.html
CMD ["httpd", "-f", "-p", "80", "-h", "/www"]
EOF
```

`site` 作为第三个服务加入项目。这一节的完整 YAML 如下——web、redis 原封不动地留着（前两位的配置从第 1-6 课一路攒到现在，正好凑齐一整份），新增的只有末尾的 `site` 段：

```yaml
services:
  web:
    image: nginx:alpine
    ports:
      - "${WEB_PORT:-8080}:80"
    volumes:
      - ./html:/usr/share/nginx/html:ro
    depends_on:
      redis:
        condition: service_healthy
  redis:
    image: redis:7
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 3s
      timeout: 3s
      retries: 3
  site:
    build: ./site
    ports:
      - "8082:80"

volumes:
  redis-data: {}
```

`build: ./site` 出现在从前 `image:` 的位置：不点名要哪个现成镜像，改为指出「拿这个目录现场造一个」。启动：

```bash
docker compose up -d --build
```

本机节选：

```text
time="…" level=warning msg="Docker Compose is configured to build using Bake, but buildx isn't installed"
#1 [site internal] load build definition from Dockerfile
#5 [site 1/2] FROM docker.io/library/busybox:latest@sha256:dc2d…
#6 [site 2/2] COPY index.html /www/index.html
#7 naming to docker.io/library/compose-lab-site:latest
 site  Built
 Container compose-lab-site-1  Started
```

输出有两个必看的细节。其一，**通篇只有 site 在动**：web、redis 的定义没变、容器还活着，`up -d` 对它们无所事事；`--build` 只催了新来的 site。这就是声明式的省心——你只管声明终态，谁要动、怎么动，Compose 自己算。其二，开头那行 warning：本机没装 buildx 插件，Compose 退回内置构建链路，不影响结果（[第 18 篇](/云原生/docker/docker-18-compose-modern)开篇的注记是同一件事）。

再看 `naming to` 那一行——别把它开头的 `#7` 当成行号，那是构建步骤的编号。这行说的是：镜像被自动打成了 **`项目名-服务名`**，也就是 `compose-lab-site:latest`。你没在任何地方写过这个名字，它是 Compose 替你管的，`docker images` 里能查到。验证页面：

```bash
sleep 1 && curl -s localhost:8082
```

```text
<h1>built by compose</h1>
```

Dockerfile 本身的细节在第 9 篇拆过，这里只借它三行；顺带一提，`COPY index.html` 复制的是**构建上下文**（`build: ./site` 指的那个目录）里的文件，所以它能找到刚建的 index.html。改了页面再 `up -d --build` 就更新，想完全绕开缓存就 `docker compose build --no-cache site`。最后补一个在项目网络里一次性跑命令的姿势——`run` 临时新起一个容器，跑完即删；它和 site-1 同网络，服务名 DNS 对它同样有效，所以能直接 `wget http://site` 找到正在跑的那个站：

```bash
docker compose run --rm site wget -qO- http://site
```

```text
<h1>built by compose</h1>
```

`run` 和 `exec` 的区别顺一句：`exec` 进的是**已经在跑**的容器；`run` 是**临时新起一个**，`--rm` 用完即删。

---

## 第 8 课 🧗：扩成两份，以及给 CPU/内存加盖

**🧑‍🏫 老师：**

最后一课，把单机编排的两条边界撞给你看。项目里现有三位：web、redis、site。先撞第一条——扩容。`--scale` **不需要 Swarm**：

```bash
docker compose up -d --scale web=2
```

本机翻过车：

```text
 Container compose-lab-web-2  Starting
Error response from daemon: failed to set up container networking: …
Bind for 0.0.0.0:8081 failed: port is already allocated
```

**🧑‍🎓 学生：** 为什么第二个起不来？`8081` 这个端口刚才不是在 .env 里配过吗，谁占了？

**🧑‍🏫 老师：**

就是**你自己**占的。web-1 先起，按 `${WEB_PORT:-8080}:80` 占走了 8081；web-2 进场时发现写死的那个口被自家兄弟占着，直接翻车。扩 N 份还写死端口，等于给停车位画死一个车位号。解法是改成一段**端口范围**，让每个副本自己认领一个口。

范围演示放在 site 上——web 此刻正占着 8081，范围里含 8081 必撞车。先把 web、redis 两段从 YAML 里摘掉，现场也收干净，只留 site：

```bash
docker compose down
```

```yaml
services:
  site:
    build: ./site
    ports:
      - "8080-8081:80"
```

```bash
docker compose up -d --build --scale site=2
docker compose ps --format '{{.Name}} {{.Ports}}'
```

```text
compose-lab-site-1 0.0.0.0:8080->80/tcp, [::]:8080->80/tcp
compose-lab-site-2 0.0.0.0:8081->80/tcp, [::]:8081->80/tcp
```

两个实例各拿一个宿主端口。把请求分摊给它们——**Compose 不管**，你得自己在前面加 nginx/网关；跨机器负载均衡更是 Swarm/K8s 的活，第 1 课画的那条边界在这里兑现。

第二条边界内旋：资源上限。演示对象换回 web——把 web、redis 两段抄回 YAML，给 web 挂上 `deploy`。`deploy` 当年是 Swarm 字段，其中 **limits 在单机 `docker compose up` 就会生效**。这一节的完整 YAML 如下（新增的只有 web 里的 `deploy:` 段，site 的端口范围保留）：

```yaml
services:
  web:
    image: nginx:alpine
    ports:
      - "${WEB_PORT:-8080}:80"
    volumes:
      - ./html:/usr/share/nginx/html:ro
    depends_on:
      redis:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 128M
  redis:
    image: redis:7
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 3s
      timeout: 3s
      retries: 3
  site:
    build: ./site
    ports:
      - "8080-8081:80"

volumes:
  redis-data: {}
```

```bash
docker compose up -d
docker inspect compose-lab-web-1 --format 'NanoCpus={{.HostConfig.NanoCpus}} Memory={{.HostConfig.Memory}}'
```

```text
NanoCpus=500000000 Memory=134217728
```

0.5 CPU、128 MiB 已经落进 cgroup（原理第 21 篇拆）。但注意 `deploy` 里**只有部分字段单机生效**：`replicas`、`restart_policy` 这些仍是 Swarm 语义，单机 `up` 会静默忽略——文档里 `deploy` 的每个子项，都值得先问一句「单机认不认」。

---

## 小结

从一个 nginx 欢迎页开始，每次只加一种能力：

1. **一份 YAML + `up`/`down`**：声明终态；容器名带着项目前缀；`version:` 是废弃字段。
2. **多服务**：同一项目网络，服务名就是 DNS。短 `depends_on` 只管启动顺序。
3. **bind mount**：页面跟宿主机走，命令行的 `-v` 在 YAML 里都有座位。
4. **命名卷**：`down` 保数据，`down -v` 才清卷——数据资产默认不删。
5. **`.env` + `config`**：先看渲染结果再启动；`environment` 覆盖 `env_file`，`${VAR}` 是解析期替换。
6. **healthcheck**：等到 Healthy 再起依赖方，进程活着 ≠ 能干活。
7. **`build`**：Compose 现场构建，自动 tag 成 `项目名-服务名`；`run --rm` 跑一次性命令。
8. **`--scale` 撞端口**用端口范围解决；`deploy.resources.limits` 单机生效，`replicas` 等是 Swarm 语义。

命令按滚雪球的顺序记：

| 阶段 | 命令 | 你在哪一课用过 |
|------|------|----------------|
| 起 | `docker compose up -d`（`--build` 先构建） | 1、7 |
| 看 | `ps` / `logs -f` | 1 |
| 进 | `exec <服务> sh` | 2 |
| 一次性 | `run --rm <服务> <命令>` | 7 |
| 校验 | `config` | 5 |
| 清 | `down`（`-v` 连命名卷） | 1、4、8 |
| 指定文件 / 项目名 | `-f 其它.yml`、`-p 名字` | — |

**思考题**：`web` 只写了 `depends_on: [db]`，启动仍报连接拒绝。先查 start 是否等于 ready，再查应用有没有重试、探针探的是不是那个端口。

下一篇：[《从零理解 HTTPS——Nginx 容器从红页到可信（师生对话实录）》](/云原生/docker/docker-17-https-nginx)。整栈能一键起了，下一篇给这套编排里的 Nginx 挂上证书，从浏览器红页滚到本机全绿。

---

## 和系列其它篇

| 相关篇 | 在这一路上出现的位置 |
|------|----------------------|
| [第 15 篇](/云原生/docker/docker-15-network) 网络 | 第 2 课：项目网络 + 服务名 DNS |
| [第 14 篇](/云原生/docker/docker-14-data-persistence) 持久化 | 第 3 课 bind、第 4 课命名卷 |
| [第 9 篇](/云原生/docker/docker-09-dockerfile) Dockerfile | 第 7 课 `build` |
| [第 18 篇](/云原生/docker/docker-18-compose-modern) Compose 现代特性 | 本篇的续集：watch / profiles / include |
| [第 21 篇](/云原生/docker/docker-21-cgroups) | 第 8 课的 NanoCpus / Memory |

---

## 参考资料

- [Docker Compose overview](https://docs.docker.com/compose/) — Compose 定位与工作方式总览
- [Compose file reference](https://docs.docker.com/reference/compose-file/) — Compose 文件字段权威手册
- [Control startup and shutdown order](https://docs.docker.com/compose/how-tos/startup-order/) — depends_on 条件与 healthcheck 官方指引
- [Compose V2 与 V1 差异 / version 字段废弃](https://docs.docker.com/compose/releases/migrate/) — 第 1 课的两个历史包袱出处
- 本机：WSL2 Ubuntu-22.04 + Docker 29.1.3 + Compose v2.40.3（未装 buildx，compose build 走内置链路），全部输出实跑于 2026-08-25
