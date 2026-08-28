---
title: SSH 免密登录——从每次输密码到一键直连，以及 UNPROTECTED PRIVATE KEY FILE 的遭遇战
sidebarGroup: SSH 远程连接
shortTitle: 01 Windows Terminal SSH 一键直连
order: 1
date: 2026-08-28T00:00:00.000Z
category: Linux
tag:
  - SSH
  - Windows Terminal
  - 免密登录
  - 密钥认证
  - icacls
description: 目标是 Windows Terminal 标签栏点一下就登上 AutoDL 服务器：ssh-keygen 生成 Ed25519 密钥、一条管道命令装公钥，却撞上 Windows 经典坑 UNPROTECTED PRIVATE KEY FILE——icacls 切断继承、只授自己两条命令修复，再用 ~/.ssh/config 起别名。全程命令与报错现场还原。
---

> **SSH 远程连接 · 第 1/2 篇**（开篇）  
> 实验环境约定：客户端 **Windows 11 + Windows Terminal**，服务端 **AutoDL 云服务器（Ubuntu 22.04）**，连接方式 `ssh -p 41230 root@connect.westc.seetacloud.com`。

---

## 开头：每次连接都要「三件套」

在 AutoDL 租了台 GPU 服务器跑大模型，每次连接的流程是：开终端 → 翻出那条带 `-p 41230` 的长命令 → 输密码。三步一个不能少，日积月累相当烦。

目标是把它压成一步：

```text
Windows Terminal 标签栏：[PowerShell] [AutoDL 服务器] [+]
                                       ↑ 点这个直接进服务器，不要密码
```

本文记录整个过程，包括中途撞上的那个 Windows 生态里极其经典的坑——`UNPROTECTED PRIVATE KEY FILE`。

---

## 一、给 Windows Terminal 添加 SSH 标签页

Windows Terminal 的每个标签页本质是一个「配置文件（Profile）」，可以绑定任意命令。打开设置（`Ctrl + ,`）→「添加新配置文件」→「新建空配置文件」，只填两项：

- **名称**：`AutoDL 服务器`
- **命令行**：`ssh -p 41230 root@connect.westc.seetacloud.com`

保存后，点标签栏下拉箭头 `∨` 就能看到它。喜欢直接改 JSON 的话，等价写法：

```json
{
    "name": "AutoDL 服务器",
    "commandline": "ssh -p 41230 root@connect.westc.seetacloud.com",
    "icon": "🖥️"
}
```

标签页有了，但每次打开**还是要输密码**。下一步解决它。

---

## 二、配 SSH 密钥，把密码从流程里删掉

### 原理：一把钥匙配一把锁

| 文件 | 角色 | 类比 |
|------|------|------|
| `id_ed25519`（私钥） | 留在自己电脑，绝不外传 | 🔑 钥匙 |
| `id_ed25519.pub`（公钥） | 安装到服务器上 | 🔒 锁 |

把「锁」装到服务器的门上之后，SSH 自动用密钥验证身份，不再询问密码。

### 生成密钥对（本地 PowerShell）

```powershell
ssh-keygen -t ed25519
```

`-t ed25519` 指定 Ed25519 算法：比传统 RSA 更快、密钥更短、安全性更好，当前首选。一路回车（passphrase 留空 = 登录时完全免输入），产物落在 `C:\Users\用户名\.ssh\` 下。

### 把公钥装上服务器（最后一次输密码）

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh -p 41230 root@服务器地址 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

这条长命令拆开是三段：

1. `type ...id_ed25519.pub` → 读取本地公钥内容（`type` 是 Windows 版的 `cat`）
2. `|` → 管道，把内容递给后半段
3. `ssh ... "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"` → 登录服务器（**最后一次输密码**），确保 `~/.ssh` 目录存在，把公钥追加进 `authorized_keys`

从此 `ssh -p 41230 root@服务器地址` 应当直接进入。

**但是**——我在这一步翻车了。

---

## 三、翻车现场：UNPROTECTED PRIVATE KEY FILE

满怀期待敲下 ssh，得到一坨大字报：

```text
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@         WARNING: UNPROTECTED PRIVATE KEY FILE!          @
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
Permissions for 'C:\Users\CGY/.ssh/id_ed25519' are too open.
It is required that your private key files are NOT accessible by others.
This private key will be ignored.
Load key "C:\Users\CGY/.ssh/id_ed25519": bad permissions
root@connect.westc.seetacloud.com's password:
```

注意最后一行——SSH **无视了私钥，退回密码登录**。

### 原因分析

OpenSSH 有一条铁律：**私钥文件只能被所有者访问**。同机器其他用户也能读到私钥的话，SSH 认为它不安全，直接拒载。

用 `icacls`（Windows ACL 查看工具）看现场：

```powershell
icacls C:\Users\CGY\.ssh\id_ed25519
```

```text
C:\Users\CGY\.ssh\id_ed25519 DESKTOP-JGGAK48\CGY:(F)                        ← 自己，应该有
                             DESKTOP-JGGAK48\CodexSandboxUsers:(I)(M,DC)    ← 多余！
                             S-1-5-21-3282...-2179864097:(I)(M,DC)          ← 多余！
                             NT AUTHORITY\SYSTEM:(I)(F)
                             BUILTIN\Administrators:(I)(F)
                             DESKTOP-JGGAK48\CGY:(I)(F)
```

问题一目了然：

- 带 `(I)` 标记的权限是**从父目录继承**来的
- 其中 `CodexSandboxUsers` 是机器上某个沙箱工具创建的用户组，它居然能读私钥
- OpenSSH 一看：除了你还有别人能拿钥匙，拒载

这个坑在 Windows 上极其常见——只要 `.ssh` 下的文件继承了用户目录的宽松权限就会触发，与用什么工具生成密钥无关。

### 修复：两条命令

```powershell
# 1. 切断权限继承：移除所有从父目录继承来的权限
icacls C:\Users\CGY\.ssh\id_ed25519 /inheritance:r

# 2. 只授予自己完全控制权限（:r 表示替换已有授权）
icacls C:\Users\CGY\.ssh\id_ed25519 /grant:r "CGY:F"
```

参数含义：

- `/inheritance:r` —— **r**emove，去掉所有 `(I)` 继承项
- `/grant:r "CGY:F"` —— **r**eplace，把当前用户权限设为 **F**ull（完全控制）

修完再验：

```text
C:\Users\CGY\.ssh\id_ed25519 DESKTOP-JGGAK48\CGY:(F)
```

干净了，只剩一行。再连：

```text
ssh -p 41230 root@connect.westc.seetacloud.com
Welcome to Ubuntu 22.04.5 LTS
root@autodl-container-xxx:~#
```

直接进入，无密码。

> 💡 命令行过敏的话，图形界面等效操作：右键私钥 → 属性 → 安全 → 高级 → **禁用继承** → 删除所有继承权限 → 手动添加当前用户「完全控制」。顺序不能反：先切继承，再授权，否则新授权也会被一并洗掉。

---

## 四、锦上添花：~/.ssh/config 别名

每次敲 `-p 41230 root@connect.westc.seetacloud.com` 还是太长。在 `C:\Users\用户名\.ssh\config`（**无后缀的纯文本文件**）里给服务器起别名：

```text
Host autodl
    HostName connect.westc.seetacloud.com
    User root
    Port 41230
    IdentityFile ~/.ssh/id_ed25519
```

从此终端里只需 `ssh autodl`，Windows Terminal 的 Profile 命令行也简化成 `ssh autodl`。

额外好处：AutoDL 重启实例后端口会变。有了别名，端口变化只改 config 里一行，Terminal 配置完全不动。

---

## 五、最终效果：一键直连，甚至一键调用远端 GPU

现在的完整流程：

1. 打开 Windows Terminal
2. 点标签栏 `∨` → 「AutoDL 服务器」（或绑定 `Ctrl + Shift + 数字` 快捷键）
3. 直接进入，无密码、无等待

顺着这条隧道还能再进一步——把服务器上 vLLM 服务的 8000 端口转发到本地（`-N` 表示只转发不执行远程命令，适合挂隧道）：

```powershell
ssh -p 41230 -N -L 8000:localhost:8000 root@connect.westc.seetacloud.com
```

本地代码就能像调 OpenAI API 一样调远端 4090 上的模型：

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8000/v1", api_key="EMPTY")
resp = client.chat.completions.create(
    model="gemma-4-12b",
    messages=[{"role": "user", "content": "你好"}],
)
```

本地写代码，远端推理，体验与官方 API 无异。

---

## 六、小结

一句话链路：

> **生成密钥 → 公钥装上服务器 → 修好私钥权限（关键坑）→ config 起别名 → Terminal 建 Profile → 一键直连**

核心认知两条：

- SSH 密钥登录的本质是「锁装在服务器上，钥匙留在本地」，`authorized_keys` 是锁孔名单
- Windows 上私钥权限必须「只属于自己」：先 `/inheritance:r` 切继承，再 `/grant:r` 授权，顺序不能反

### 踩坑速查表

| # | 坑 | 解法 |
|---|-----|------|
| 1 | `WARNING: UNPROTECTED PRIVATE KEY FILE!` | `icacls 私钥 /inheritance:r` + `icacls 私钥 /grant:r "用户名:F"` |
| 2 | `config` 写了不生效 | 文件必须**无后缀**，位于 `C:\Users\用户名\.ssh\config` |
| 3 | AutoDL 重启后连不上 | 平台重分配端口/地址，同步改 `~/.ssh/config` 一行 |
| 4 | 装公钥命令要密码 | 首次安装公钥本就需要认证一次，属正常现象 |
| 5 | `pkill -f` 杀断了 SSH 会话 | `pkill -f` 按完整命令行模糊匹配，远程命令文本含同样字符串时会自杀；用 `pkill -f "wge[t] -c"` 正则避开自身，或先 `pgrep` 拿 PID 再精确 kill |

第 5 条是实际发生的事故：在服务器上清理重复下载进程时，`pkill -f "wget -c https://hf-mirror.com..."` 把执行它的 SSH 会话一起匹配杀掉了——远程命令的字符串里恰好包含同样的文本。

### 安全提醒

- 🔑 私钥 = 钥匙本钥：不发人、不进 Git、不截图
- 📝 文章若发公网，服务器地址与端口记得打码
- 🔐 更严格的做法：生成密钥时设置 passphrase，配合 `ssh-agent` 使用，私钥泄露也无法直接登入

---

## 参考资料

- [OpenSSH 官方文档](https://www.openssh.com/manual.html) — `ssh`、`ssh-keygen`、`ssh_config` 手册，别名与 `-L` 转发的权威定义
- [Microsoft Learn：icacls 语法](https://learn.microsoft.com/zh-cn/windows-server/administration/windows-commands/icacls) — `/inheritance` 与 `/grant` 参数的官方说明
- [Microsoft Learn：OpenSSH 密钥管理](https://learn.microsoft.com/zh-cn/windows-server/administration/openssh/openssh-keymanagement) — Windows 下生成与管理 SSH 密钥的官方指引，含私钥权限要求
- 本机实测环境：Windows 11（OpenSSH for Windows）+ Windows Terminal；服务端 AutoDL Ubuntu 22.04.5，OpenSSH 服务端默认配置

---

➡️ **下一篇**：[AutoDL 部署 vLLM + Gemma-4——从裸容器到 OpenAI 兼容 API，以及一版再版的多线程断点续传下载器](./ssh-02-autodl-vllm-gemma4-deploy.md)——把本文第五节预告的那条隧道真正跑起来：三源测速换 pip 源、12 线程分片下载 12.4G 模型、断点续传下载器三版迭代，最后本地电脑像调 OpenAI API 一样调远端 4090。
