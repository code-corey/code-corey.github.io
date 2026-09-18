---
title: 把配置和密码放进容器——ConfigMap 与 Secret（苏格拉底对话实录）
sidebarGroup: CKA 通过之路
shortTitle: 03 ConfigMap 与 Secret
order: 3
date: 2026-09-19T00:00:00.000Z
author: Corey
category: 云原生
tag:
  - CKA
  - Kubernetes
  - ConfigMap
  - Secret
  - 苏格拉底对话
description: docker -e 传环境变量在 k8s 里的正统做法：ConfigMap 存配置、Secret 存密码，envFrom 整包注入，k exec 进容器验证，base64 解码看明文——含一次真实的 passsword 三个 s 事故。
---

> **CKA 通过之路 · 第 4/9 篇**
> 上一篇：[《yaml 就是一棵树——dry-run 生成、缩进陷阱与报错定位》](/云原生/cka/cka-02-yaml-tree) · 下一篇：[《流量转发名单——Service 与 endpoints》](/云原生/cka/cka-04-service-endpoints)

---

## 写在前面

用 docker 时我常 `docker run -e DB_HOST=xxx`。到 k8s 里第一件事也是把环境变量传进容器——正路不是写进镜像，而是 ConfigMap（配置）和 Secret（密码）两种对象。参考资料：[Configure a Pod to Use a ConfigMap](https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/)、[Secret 官方文档](https://kubernetes.io/docs/concepts/configuration/secret/)。

课堂路线：

> ① 建两个对象 → ② envFrom 整包注入（含真实缩进报错） → ③ exec 进容器验证 → ④ base64 不是加密 → ⑤ passsword 三个 s 事故 → ⑥ 裸 Pod 与 Deployment Pod 的差别

---

## 第 1 课：先建两个对象

```bash
k create configmap app-config --from-literal=DB_HOST=192.168.1.100 --from-literal=DB_PORT=5432
k create secret generic db-cred --from-literal=username=admin --from-literal=password=abc123
```

> **🧑‍🏫 老师：** 两条命令结构一样，为什么一个用 configmap 一个用 secret？——**判断标准是"这份数据泄露了要不要紧"**。不要紧的（数据库地址、开关、超时配置）进 ConfigMap；要紧的（密码、令牌、证书）进 Secret，集群对它有额外保护（不写日志、可配置静态加密、可限制只让需要的节点拉取）。

看内容：

```bash
k get configmap app-config -o yaml
```

```yaml
apiVersion: v1
data:
  DB_HOST: 192.168.1.100
  DB_PORT: "5432"
kind: ConfigMap
metadata:
  name: app-config
```

`data` 下每个键值就是一条待注入的数据。Secret 的 `get -o yaml` 则显示 base64——第 4 课拆。

## 第 2 课：envFrom 整包注入——第一次踩缩进坑

目标是让 pod 的环境变量整批来自这两个对象：

```yaml
envFrom:
- configMapRef:
    name: app-config
- secretRef:
    name: db-cred
```

我第一次写成了 `configMapRef: app-config`（值直接跟在冒号后），apply 报错：

```text
Error from server (BadRequest): error when creating "STDIN": Pod in version "v1" cannot be
handled as a Pod: json: cannot unmarshal string into Go struct field
EnvFromSource.spec.containers.envFrom.configMapRef of type v1.ConfigMapEnvSource
```

报错翻译：`configMapRef` 这个位置系统要一个**对象**（v1.ConfigMapEnvSource），你给了一个**字符串**。修法就是上一篇的规则——对象值要换行、下一行缩进写子字段。改完 apply 成功：

```text
pod/app1 created
```

这里`envFrom` 和逐条写 `env` 的差别值得记：`env` 一条条指定，`envFrom` 把对象整个搬进来，键名 = 变量名。

## 第 3 课：验证——进容器里看真的变量

`k exec` = docker exec 的 k8s 版，进 pod 里的容器执行命令：

```bash
k exec app1 -- env | grep -E "DB_|user|pass"
```

```text
DB_HOST=192.168.1.100
DB_PORT=5432
username=admin
password=abc123
```

四个变量确实在容器里。注意它们注入的位置是**容器的环境变量**——和 docker `-e` 结果相同，只是来源改成了集群里的对象，pod 重启、漂移、多副本，配置都跟着对象走，不散落在命令行历史里。

## 第 4 课：Secret 的 base64——是编码，不是加密

```bash
k get secret db-cred -o yaml
```

```yaml
data:
  password: YWJjMTIz
  username: YWRtaW4=
```

老师的问题：

> **🧑‍🏫 老师：** `YWJjMTIz` 和 `abc123`，什么关系？

亲手解开：

```bash
echo "YWJjMTIz" | base64 -d
```

```text
abc123
```

**base64 是编码不是加密**——任何人拿到这串字符都能 0 成本还原。Secret 的"secret"在于集群的分发控制（谁有权限读它、它会被送到哪些节点），而不是内容保密强度。真要存敏感数据，配合静态加密（[Secret 加密配置](https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/)）或外部密钥系统。反向造值用 `echo -n "abc123" | base64`。

## 第 5 课：passsword——三个 s 的事故

真实翻车记录：实验后我用一条命令核对 Secret 键名，输出里赫然是：

```text
passsword: YWJjMTIz
```

`passsword`，三个 s。回看我建对象那行命令——`--from-literal=passsword=abc123`，从源头就拼错了，集群忠实地把错误键名存了一路。教训三条：

1. **键名是普通字符串，拼错了照样成功创建**，报错不会替你拦
2. 注入后变量名 = 键名，`passsword=abc123` 注进容器，程序读 `password` 读不到
3. 验证永远用 `k exec -- env | grep` 看**容器里实际生效的变量**，而不是看自己写了什么

## 第 6 课：裸 Pod 与 Deployment Pod——改配置时的两种命运

最后老师补了一个此篇埋下、下篇展开的差别。app1 是 `k run` 出来的**裸 Pod**（没有 Deployment 管着它），试着改它的环境变量：

```bash
k delete pod app1
# 重新 apply 修改后的 app1.yaml
pod "app1" deleted
pod/app1 created
```

裸 Pod 是不可变对象：改任何配置（环境变量、镜像、探针）都不能原地改，**只能删了重建**。而 Deployment 管的 pod，改配置走"造新替旧"——这正是下一篇 Service 存在的理由：pod 生生灭灭、IP 一直变，谁来当稳定的访问入口？

## 本篇小结

| 需求 | 做法 |
|---|---|
| 配置进容器 | ConfigMap + `envFrom.configMapRef` |
| 密码进容器 | Secret + `envFrom.secretRef` |
| 验证 | `k exec <pod> -- env` 看实际变量 |
| 看 Secret 明文 | `echo <值> \| base64 -d`（编码≠加密） |
| 改裸 Pod 配置 | 只能 delete + 重建（不可变对象） |

➡️ 下一篇：[《流量转发名单——Service 与 endpoints》](/云原生/cka/cka-04-service-endpoints)
