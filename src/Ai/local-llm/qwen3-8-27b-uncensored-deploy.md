---
title: "Qwen3.8-27B-Uncensored 远程部署实录：AutoDL 4090 + llama.cpp + SSH 隧道接入 Pi"
sidebarGroup: "本地模型"
shortTitle: "Qwen3.8-Uncensored 部署实录"
order: 22
date: 2026-08-30
category: "AI"
tag:
  - "Qwen"
  - "llama.cpp"
  - "GGUF"
  - "大模型，本地部署"
  - "SSH隧道"
description: "在 AutoDL RTX 4090 上从零部署 Qwen3.8-27B-Uncensored（GGUF），含引擎选型弯路、CUDA 编译踩坑、MTP 推测解码与 SSH 隧道接入 Pi 的完整过程记录。"
---

# Qwen3.8-27B-Uncensored 远程部署实录

> 实战记录 · 部署仍在进行中，本文持续更新

目标很直接：租的 AutoDL 4090 服务器上跑 `JonathanColetti/Qwen3.8-27B-Uncensored-GGUF`，暴露 OpenAI 兼容 API，再通过 SSH 隧道接进 Pi 编程助手。过程中踩了不少坑，全部如实记录。

## 环境

服务器（AutoDL 容器）：

| 项目       | 配置                                    |
| -------- | ------------------------------------- |
| 系统       | Ubuntu 22.04.5 LTS                    |
| GPU      | RTX 4090 · 24GB 显存 · 驱动 580.76        |
| CPU / 内存 | Xeon Platinum 8470Q · 208 核 · 1TB     |
| 磁盘       | 系统盘 30G + 数据盘 `/root/autodl-tmp` 50G  |
| 网络       | 学术加速 `/etc/network_turbo`             |
| Python   | 只有 miniconda（3.12），无系统 python3、无 nvcc |

本机是 Windows 11 + Git Bash，有 OpenSSH 和 paramiko，没有 sshpass。

## 第一步：SSH 免密，不用 sshpass

脚本化 SSH 密码登录，Linux 下的惯用解法是 `sshpass -p '密码' ssh ...`，但 Windows Git Bash 装这个很折腾，而且密码明文躺在命令行里也不体面。

更标准的做法是公钥免密：用 Python 的 paramiko 拿密码连一次，把本机公钥写进服务器的 `authorized_keys`，之后全部走密钥认证。

```python
import paramiko

PUBKEY = open(r"C:/Users/你的用户名/.ssh/id_ed25519.pub").read().strip()  # 换成你的用户名

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("connect.cqa1.seetacloud.com", port=17785,
            username="root", password="你的服务器密码", timeout=30)
# 写入公钥（幂等：已存在就不重复追加）
cmd = ('mkdir -p ~/.ssh && chmod 700 ~/.ssh && '
       f'grep -qF "{PUBKEY}" ~/.ssh/authorized_keys || '
       f'echo "{PUBKEY}" >> ~/.ssh/authorized_keys; '
       'chmod 600 ~/.ssh/authorized_keys')
ssh.exec_command(cmd)
```

之后 `ssh -p 17785 root@host 'echo ok'` 直接通。公钥免密不只是优雅——后面 SSH 隧道的进程必须能非交互登录，这是硬前提。

## 第二步：摸清这个模型

查 HuggingFace API 发现几个关键事实：

- 基于 `Qwen/Qwen3.8-27B`，架构是新的 `Qwen3_5ForConditionalGeneration`（混合线性注意力，每 4 层才 1 层 full attention，KV cache 只有传统架构的 1/4 左右，262K 上下文）
- 仓库**只有 GGUF 格式**，带 imatrix 量化校准
- 量化档位：IQ2_M / IQ4_XS / Q4_K_M / Q5_K_M / Q6_K / Q8_0
- 附赠好东西：`draft-Q4_0` / `draft-Q8_0` 草稿模型（MTP 推测解码用）、`mmproj-F16` 视觉投影器

## 第三步：引擎选型的弯路

一开始嫌 llama.cpp 效率不高，想换 vLLM，认真调研了一圈：

| 引擎            | 结论                                               |
| ------------- | ------------------------------------------------ |
| vLLM / SGLang | 需要 safetensors；`qwen3_5` 新架构 + MTP 层，GGUF 加载器不支持 |
| Ollama        | 底层就是 llama.cpp，速度不会更快，新架构支持还滞后                   |
| 反量化喂 vLLM     | GGUF→BF16 要 55GB 磁盘，数据盘只有 50G，直接死刑               |
| llama.cpp     | 唯一支持该 GGUF 的引擎，仓库就是为它设计的                         |

官方版倒是有 FP8 变体（探测 `Qwen/Qwen3.8-27B-FP8` 返回 200），想走 vLLM 高吞吐就得放弃未审查版。最后明确需求：**就要未审查版**，那就没有第二个选择——llama.cpp，而且它就是该模型的最快跑法（MTP 推测解码 + 全 GPU offload）。

## 第四步：量化选择

24GB 显存的算术题：

| 量化     | 权重体积    | 结论                      |
| ------ | ------- | ----------------------- |
| Q8_0   | ~29GB   | 超了                      |
| Q6_K   | ~22GB   | 极限，上下文放不开               |
| Q5_K_M | ~18.9GB | 紧张                      |
| Q4_K_M | ~16.5GB | ✅ 留足 KV cache + 草稿模型的空间 |

混合注意力架构帮了大忙：KV cache 压力只有传统架构的 1/4，Q4_K_M + 16K 上下文绰绰有余。

## 第五步：llama.cpp 没有 Linux CUDA 预编译

预编译路线全灭：

1. latest release `v0.3.0` 只有标签，二进制资产为空
2. nightly `b10693` 有 27 个资产，Linux 只有 CPU / Vulkan / ROCm / SYCL 包，**CUDA 预编译只出 Windows 版**

Vulkan 包 33MB 就能跑，但大模型推理速度通常只有 CUDA 的六七成。好在服务器 208 核，源码编译几分钟的事，决定自己编 `GGML_CUDA=ON`。

## 第六步：下载模型，hf-mirror 后台拉 16GB

```bash
mkdir -p /root/autodl-tmp/models && cd /root/autodl-tmp/models
BASE="https://hf-mirror.com/JonathanColetti/Qwen3.8-27B-Uncensored-GGUF/resolve/main"
nohup wget -c -q "$BASE/Qwen3.8-27B-Uncensored-Q4_K_M.gguf" \
      -O Qwen3.8-27B-Uncensored-Q4_K_M.gguf > dl_main.log 2>&1 &
nohup wget -c -q "$BASE/Qwen3.8-27B-Uncensored-draft-Q4_0.gguf" \
      -O Qwen3.8-27B-Uncensored-draft-Q4_0.gguf > dl_draft.log 2>&1 &
```

`wget -c` 断点续传 + `nohup` 后台，不怕 SSH 断。实测速度约 14.5 MB/s，17 分钟拉完 16GB，草稿模型 1.6GB 顺路带走。

## 第七步：conda 装 CUDA 的超时教训

第一版方案 `conda install -c nvidia cuda-toolkit=12.6` 想一步到位，结果完整 toolkit 3-4GB，conda 经典求解器慢得出名，撞上 15 分钟工具超时被截断。

两个教训：

1. **完整 toolkit 是浪费**——llama.cpp 编译只需要 nvcc、cudart-dev、libcublas-dev、profiler-api，加起来 500MB 左右
2. **长任务一律 `nohup` 后台 + 日志轮询**，绝不前台同步等

```bash
nohup conda install -y -c nvidia cuda-nvcc=12.6 cuda-cudart-dev=12.6 \
      libcublas-dev=12.6 cuda-profiler-api=12.6 > /root/cuda_install.log 2>&1 &
```

顺带把源码也备好：

```bash
cd /root/autodl-tmp
wget -c https://github.com/ggml-org/llama.cpp/archive/refs/tags/b10693.tar.gz
tar xzf llama.cpp-b10693.tar.gz && mv llama.cpp-b10693 llama.cpp
```

## 第七步半：编译前夜——一场依赖地狱连环坑

这是整个部署最曲折的一段，单独记录。

### 坑 1：PyPI 的 nvcc 轮子里没有 nvcc

pip 装 `nvidia-cuda-nvcc-cu12==12.6.85` 成功，`bin/` 里却只有 `ptxas`。解剖轮子（`unzip -l`）实锤：**PyPI 官方这个轮子本身就只含 ptxas + nvvm，没有 nvcc 主体**。

**解法**：改用 NVIDIA 官方 redist CDN，按清单拉完整组件 tarball：

```bash
# 拉清单，解析出 cuda_nvcc 的下载路径
curl -sL https://developer.download.nvidia.com/compute/cuda/redist/redistrib_12.6.3.json -o redist.json
REL=$(python -c "import json; print(json.load(open('redist.json'))['cuda_nvcc']['linux-x86_64']['relative_path'])")
echo $REL   # cuda_nvcc/linux-x86_64/cuda_nvcc-linux-x86_64-12.6.85-archive.tar.xz
wget "https://developer.download.nvidia.com/compute/cuda/redist/$REL"
```

NVIDIA CDN 速度飞快，48MB 几秒完事，xz 校验完整。

### 坑 2：GitHub 源码下不全

codeload 动态生成的 tarball **不支持 Range 断点续传**，`wget -c` 直接静默失败；直连也会卡死在 36M。**解法**：`git clone --depth 1 --branch b10693`，外加低速熔断 + 30 次自动重试循环：

```bash
git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=30 clone --depth 1 --branch b10693 \
    https://github.com/ggml-org/llama.cpp.git
```

### 坑 3：头文件地狱

自己拼 CUDA 根目录（`/root/cuda-pip`）后 nvcc 报 `crt/host_config.h` 找不到。手动拷 shim 补丁结果造成 `crt/host_defines.h` **自包含递归 200 层**。真相：**完整的 `crt/` 头文件树就藏在 nvcc redist 的 `include/` 里**，而我只拷了它的 `bin/` 和 `nvvm/`。补上 `cp -a $SRC/include/. /root/cuda-pip/include/` 后 configure 一次通过。

### 顺带的教训：pkill 自杀两次

`pkill -f "wget.*b10693"` 会匹配到**自己这条 bash -c 命令行**（脚本里到处是这些字样），把自己 SSH 会话干掉，连续两次。正确姿势：`pkill -x wget`（精确匹配进程名），或者 ps + grep 后按 PID 杀。

## 第八步：编译进行中

```bash
cmake -B build -S . -DGGML_CUDA=ON \
  -DCMAKE_CUDA_COMPILER=/root/cuda-pip/bin/nvcc \
  -DCUDAToolkit_ROOT=/root/cuda-pip \
  -DCMAKE_CUDA_ARCHITECTURES=89 \          # 4090 专用，跳过其他架构
  -DCMAKE_BUILD_RPATH=/root/cuda-pip/lib64 \
  -DLLAMA_CURL=OFF
cmake --build build --target llama-server -j 64
```

## 第九步：启动服务 ✅

```bash
LD_LIBRARY_PATH=/root/cuda-pip/lib64:. ./llama-server \
  -m /root/autodl-tmp/models/Qwen3.8-27B-Uncensored-Q4_K_M.gguf \
  -md /root/autodl-tmp/models/Qwen3.8-27B-Uncensored-draft-Q4_0.gguf \
  -ngl 99 -ngld 99 \      # 主模型 + 草稿模型全部层进显存
  -c 16384 \              # 16K 上下文
  -fa on --jinja \        # Flash Attention + GGUF 内置聊天模板
  --threads 16 --host 0.0.0.0 --port 8000
```

模型 8.9 秒加载完成（16GB 刚下完还在页缓存里，直接进显存）。显存占用 **20.4GB / 24.5GB**。

## 第十步：速度实测 ✅

| 指标    | 数值                         |
| ----- | -------------------------- |
| 生成速度  | **~89 tok/s**（端到端含 SSH 隧道） |
| 草稿接受率 | 62.7%（平均每次接受 2.88 token）   |
| 显存占用  | 20.4GB / 24.5GB            |

27B 稠密模型在单卡 4090 上跑到 89 tok/s，MTP 推测解码功不可没——这就是当初说"llama.cpp 就是该模型最快跑法"的底气。

## 科普：MTP 推测解码到底是什么

先看问题：大模型生成文本是“一次一个字”的自回归过程，每吐一个 token，27B 参数就得完整过一遍。GPU 的耗时大头其实是把权重从显存搬进计算单元（访存瓶颈），真正用来“算”的并行度很低——搬一次只算一个 token，太亏了。

推测解码（Speculative Decoding）的思路是“先猜后验”：

1. 一个 1.6GB 的小草稿模型（draft-Q4_0）飞快地连猜 8~16 个 token，小模型猜一个只要几十毫秒
2. 大模型把这一串候选**一次性并行验证**——关键在于：验证 16 个 token 的一次前向，耗时和验证 1 个 token 几乎一样（权重反杠要搬一遍，多算几个基本白送）
3. 从头逐个比对：猜对的直接采纳；第一个猜错的截断，换上大模型自己的答案，从这里继续

平均下来一次前向能产出 2~3 个 token，等于小模型的算力白赚。而且接受/拒绝采样在设计上保证输出分布与直接用大模型生成一致，质量不打折。

我们日志里的 `draft acceptance = 62.7%，mean len = 2.88` 就是成绩单：草稿每猜 3 个能中 2 个，平均每次验证白赚 2.88 个 token——这就是 27B 单卡 4090 跑出 89~99 tok/s 的全部秘密。

那 MTP（Multi-Token Prediction，多 token 预测）是什么？它是比外挂草稿更进一步的玩法：训练主模型时就给它装上额外的预测头，一次前向直接预测后面好几个 token，相当于模型自带草稿能力。Qwen3.8 的 GGUF 里就带了 MTP 权重（仓库 tags 里那个 "mtp"），官方还同时提供了同源同词表的独立草稿模型。我们部署用的是后者（`-md draft-Q4_0` 外挂式），llama.cpp 负责整个“猜-验”调度；草稿和主模型同源，接受率比随便找个小模型高得多。

顺带回应一个容易困惑的点：Pi 界面显示的 `16.4K / 32.8K` 上下文，读的是 `models.json` 里的 `contextWindow`——这个文件**只在 Pi 会话启动时加载**，改完配置要重启 Pi 会话才生效，运行中的会话不会热更新。

## 第十一步：SSH 隧道 + 接入 Pi ✅

本地一条命令建隧道（公钥免密，非交互）：

```bash
ssh -f -N -L 18100:localhost:8000 -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -p 17785 root@connect.cqa1.seetacloud.com


```

| 参数                                 | 含义                                                 |
| ---------------------------------- | -------------------------------------------------- |
| `ssh`                              | SSH 客户端命令，用于建立安全连接。                                |
| `-f`                               | **后台运行**（fork），SSH 连接建立后转入后台执行，不占用当前终端。            |
| `-N`                               | **不执行远程命令**，仅建立端口转发（纯隧道模式），不打开远程 Shell。            |
| `-L 18100:localhost:8000`           | **本地端口转发**，将本地的 `18100` 端口转发到远程服务器的 `8000` 端口。      |
| `-o ServerAliveInterval=30`        | **保活探测间隔**，每 30 秒向服务器发送一个空包检测连接是否存活。               |
| `-o ServerAliveCountMax=3`         | **最大保活失败次数**，连续 3 次探测无响应后断开连接（总超时 90 秒）。           |
| `-p 17785`                         | SSH 服务端口是 `17785`（非默认的 22 端口）。                     |
| `root@connect.cqa1.seetacloud.com` | 以 `root` 用户登录到远程服务器 `connect.cqa1.seetacloud.com`。 |

Pi 的 `~/.pi/agent/models.json` 新增 provider：

```json
"autodl-qwen38": {
  "name": "AutoDL Qwen3.8-Uncensored (SSH隧道)",
  "baseUrl": "http://localhost:18100/v1",
  "api": "openai-completions",
  "apiKey": "EMPTY",
  "models": [{
    "id": "qwen3.8-27b-uncensored",
    "name": "Qwen3.8-27B-Uncensored (AutoDL 4090)",
    "reasoning": true,
    "contextWindow": 32768,
    "maxTokens": 8192
  }]
}
```

端到端验证：Pi → localhost:18100 → SSH 隧道 → AutoDL 4090 → 89 tok/s 回复 ✅

## 维护手册

| 操作       | 命令                                                                               |
| -------- | -------------------------------------------------------------------------------- |
| 开隧道（本机，自动重连） | 双击 `桌面\qwen-tunnel.bat` |
| 远程关机后恢复服务 | 双击 `桌面\qwen-remote-restart.bat`（杀旧进程→启模型→20秒→health 检查） |
| 重启模型服务   | `ssh -p 17785 root@host 'nohup /root/start_server.sh > /root/server.log 2>&1 &'` |
| 重启隧道（本机） | `bash ~/Desktop/start-qwen-tunnel.sh`（带自动重连）                                     |
| 看服务日志    | `ssh ... 'tail -20 /root/server.log'`                                            |
| 重新编译     | `/root/build_llama.sh`（幂等，改代码后重跑）                                                |

**AutoDL 关机/重启须知**：关机（非释放）时系统盘和数据盘全部保留——模型、编译产物、CUDA 环境都在；开机后唯一要做的就是重启 llama-server 进程（双击 restart bat 即可），本机隧道 bat 会自动重连。只有「释放实例」才会清空一切。

## 总结

- **模型**：Qwen3.8-27B-Uncensored（Q4_K_M + MTP 草稿）· 唯一能跑它的引擎就是 llama.cpp
- **路径**：Pi → localhost:18100 → SSH 隧道 → AutoDL 4090 llama-server

## 附录：上线当晚的故障排查实录

部署完当晚就出了两个问题，记录一下排查过程。

**症状 1：隧道 bat 报 `bind [127.0.0.1]:8100: Permission denied`，无限重连。**

排查：`netsh interface ipv4 show excludedportrange protocol=tcp` 排除了 Windows 保留端口区；`netstat -aon` 发现 8100 被 pid 25560 占着，但 `tasklist`、`taskkill`、甚至 PowerShell 都**找不到这个进程**——这是 Git Bash 的 `ssh -f` 后台进程留下的幽灵 socket（MSYS fork 的 PID 映射与 Windows 进程表对不上）。

**解法**：不跟幽灵纠缠，直接换新端口 18100；bat 的端口清理改用 PowerShell 的 `Get-NetTCPConnection`（只杀确实叫 ssh 的进程，遇到杀不动的打印提示跳过）。

**症状 2：Pi 里切模型报 `Response was truncated before completion`。**

原因有二：一是排障期间隧道本身在抖；二是更隐蔽的——服务端只给了 16K 上下文，而 Pi 编程请求的 system prompt 动辄上万 token，顶到天花板就截断。**解法**：`-c 32768` 重启服务（混合注意力架构 KV cache 小，32K 也只要多占约 1GB 显存），Pi 配置同步 `contextWindow: 32768`。

**验证**：换端口 + 32K 后，大 prompt（863 token）测试 `finish_reason: stop` 无截断，速度 99.3 tok/s。
- **性能**：89~99 tok/s · 62.7% 草稿接受率 · 显存 20.4/24.5GB · 32K 上下文
- **踩坑全景**：conda 超时 → 精简后台化；PyPI 轮子缺 nvcc → NVIDIA redist 直拉；codeload 不支持续传 → git clone 重试循环；crt 头文件缺失 → nvcc redist include；pkill 自杀 ×2 → 精确匹配进程名

> 全文完 · 部署于 2026-08-30

## 附录：两个完整脚本

> 均为实际在用的版本。保存时请存为 **CRLF 行尾**（记事本另存为默认即是），双击运行即可；
> 密钥认证失效时 ssh 会提示输密码兼容兑底。

### qwen-tunnel.bat（本机隧道，断线自动重连 + 健康检测）

```bat
@echo off
title Qwen3.8 SSH Tunnel - localhost:18100 to AutoDL:8000
set HOST=connect.cqa1.seetacloud.com
set PORT=17785
set USER=root
set LOCAL=18100
set REMOTE=8000
set SSH=C:\WINDOWS\System32\OpenSSH\ssh.exe

echo ==================================================
echo   Qwen3.8-27B-Uncensored SSH Tunnel
echo   Pi entry point : http://localhost:18100/v1
echo   Keep this window OPEN while tunnel runs.
echo ==================================================

rem ---- 1) kill visible stale ssh listeners on our port ----
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort %LOCAL% -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $p = $_.OwningProcess; $n = (Get-Process -Id $p -ErrorAction SilentlyContinue).ProcessName; if ($n -eq 'ssh') { Write-Host ('Killing stale ssh pid ' + $p); Stop-Process -Id $p -Force } else { Write-Host ('Port %LOCAL% held by non-ssh/unidentified process, skip kill') } }"

rem ---- 2) if a healthy tunnel already exists, nothing to do ----
curl -s -o nul --max-time 5 http://127.0.0.1:%LOCAL%/v1/models
if %errorlevel%==0 (
    echo.
    echo [OK] Tunnel already active and HEALTHY on port %LOCAL%.
    echo      Pi is ready. You can close this window.
    timeout /t 5 >nul
    exit /b 0
)

echo [%time%] No healthy tunnel detected. Starting tunnel...
echo.

:loop
echo [%date% %time%] tunnel connecting...
"%SSH%" -N -L %LOCAL%:localhost:%REMOTE% -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=accept-new -p %PORT% %USER%@%HOST%
echo [%time%] tunnel exited (code %errorlevel%). Reconnecting in 5s...
echo If bind fails repeatedly, check:  netstat -aon ^| findstr :%LOCAL%
timeout /t 5 /nobreak >nul
goto loop
```

### qwen-remote-restart.bat（远程关机后一键恢复模型服务）

```bat
@echo off
title Restart remote llama-server (AutoDL 4090)
set HOST=connect.cqa1.seetacloud.com
set PORT=17785
set USER=root
set SSH=C:\WINDOWS\System32\OpenSSH\ssh.exe

echo Restarting llama-server on remote GPU box...
echo (kill old process, start model, wait for load, check health)
echo.
"%SSH%" -o StrictHostKeyChecking=accept-new -p %PORT% %USER%@%HOST% "pkill -x llama-server 2>/dev/null; sleep 1; nohup /root/start_server.sh > /root/server.log 2>&1 & sleep 20; echo === health ===; curl -s --max-time 5 http://localhost:8000/health; echo; echo === log tail ===; tail -5 /root/server.log"
echo.
echo Done. If health shows {"status":"ok"} the model is UP.
echo Next: double-click qwen-tunnel.bat, then use Pi model
echo       autodl-qwen38 / qwen3.8-27b-uncensored
echo.
pause
```

两个脚本的设计要点：隧道 bat 先用 PowerShell 精确清理本端口的残留 ssh（只杀进程名确认为 ssh 的，避免误伤），再做健康检查——已有可用隧道就直接退出不抢端口；restart bat 用 `pkill -x`（精确进程名）避免自杀式误杀，启动后等 20 秒再做 health 检查。
