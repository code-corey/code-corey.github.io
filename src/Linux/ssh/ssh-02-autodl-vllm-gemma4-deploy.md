---
title: AutoDL 部署 vLLM + Gemma-4——从裸容器到 OpenAI 兼容 API，以及一版再版的多线程断点续传下载器
sidebarGroup: SSH 远程连接
shortTitle: 02 AutoDL 部署 vLLM + Gemma-4
order: 2
date: 2026-08-28T00:00:00.000Z
category: Linux
tag:
  - AutoDL
  - vLLM
  - Gemma
  - 断点续传
  - fp8
  - screen
description: 目标是在 AutoDL 的 RTX 4090 D 容器里用 vLLM 跑 Gemma-4-12B，再让本地电脑像调 OpenAI API 一样调用它：先三源测速把 pip 换到清华源，再 12 线程分片下载 HuggingFace 模型，遭遇镜像掐连接后迭代出带断点续传和字节级校验的第三版下载器，最后一条 SSH 隧道把 8000 端口搬回家。全程命令与翻车现场还原。
---

> **SSH 远程连接 · 第 2 篇**（上一篇：[Windows Terminal SSH 一键直连](./ssh-01-windows-terminal-ssh-key-login.md)）  
> 实验环境延续第 1 篇：客户端 **Windows 11**，服务端 **AutoDL 云服务器（Ubuntu 22.04，RTX 4090 D 24G 显存）**，已配好 SSH 密钥免密登录。

---

## 开头：这次要干什么

第 1 篇把免密登录打通之后，这台 AutoDL 上的 RTX 4090 D 就一直在吃灰。这次给它找个活：

> 在容器里装 vLLM，跑一个 Gemma-4-12B 的去审查版本模型，然后在本地电脑上像调 OpenAI API 一样调它。

最终效果长这样——本地 Python，`base_url` 指向 localhost，背后是远端 4090 在推理：

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8000/v1", api_key="EMPTY")
resp = client.chat.completions.create(
    model="gemma-4-12b",
    messages=[{"role": "user", "content": "你好"}],
)
```

整条链路拆成五步：

```text
选型号 → 摸家底 → 装 vLLM → 下模型(12GB,重头戏) → 起服务 → SSH 隧道连回家
```

其中「下模型」占了本文一半篇幅——12.4GB 的文件在受限带宽下怎么下得又快又稳，我前后写了三版下载器，每一版都踩在上一版的坑上。

---

## 一、选型号：想要的那个版本不存在

最初想下的模型叫 `AEON-7/Gemma-4-12B-it-AEON-Abliterated-K4-Mixed`，名字是从别处抄来的。国内直连 HuggingFace 不通，但 hf-mirror.com 这个镜像站可以，模型搜索走它的 API：

```bash
curl -s "https://hf-mirror.com/api/models?search=AEON%20Gemma%20Abliterated&limit=10"
```

结果第一枪就哑火：**K4-Mixed 这个版本不存在**。真实存在的是这三个：

| 版本 | 大小 | 适配显卡 |
|------|------|----------|
| K4-BF16 | 22.3 GB | 任意架构，但 24G 显存很勉强 |
| **K4-FP8** | 12.2 GB | RTX 40 系（Ada）/ H100，**原生 FP8** |
| K4-NVFP4 | 10.9 GB | RTX 50 系（Blackwell）为主 |

选型的判断依据就一条：**显卡架构决定能吃什么量化格式**。RTX 4090 D 是 Ada 架构（SM89），张量核心原生支持 FP8；而 NVFP4 主要是 Blackwell 的菜。所以 K4-FP8 是这台机器的最优解——12.2GB 权重装进 24GB 显存，还剩约 10GB 给 KV cache，宽裕。

下单之前再验一眼「量化格式是不是 vLLM 认的」。仓库里的 `hf_quant_config.json`：

```bash
curl -s "https://hf-mirror.com/AEON-7/Gemma-4-12B-it-AEON-Abliterated-K4-FP8/raw/main/hf_quant_config.json"
```

```json
{
  "producer": { "name": "modelopt", "version": "0.43.0" },
  "quantization": {
    "quant_algo": "FP8_PER_CHANNEL_PER_TOKEN",
    "kv_cache_quant_algo": null,
    "exclude_modules": ["lm_head", "model.embed_audio*", "..."]
  }
}
```

`modelopt`（NVIDIA ModelOpt）产出的 FP8，是 vLLM 一等公民格式。再看 `config.json` 里的架构字段是 `Gemma4UnifiedForConditionalGeneration`——这是个多模态统一架构（文本+图像+音频），比较新，**vLLM 版本必须够新才认识它**，这个伏笔第三章收。

顺便看清楚要下什么：整个仓库就一个大文件 `model.safetensors`（12.4GB），外加一堆 KB 级的配置文件。这个结构直接决定了第四章下载器的写法。

---

## 二、进容器：五分钟摸清家底

SSH 进去先别急着动手，花一分钟把家底盘清楚：

```bash
ssh -p 41230 root@服务器地址     # 密钥免密，见第 1 篇

nvidia-smi                       # 显卡和驱动
df -h / /root/autodl-tmp         # 系统盘和数据盘
free -g | head -2; nproc         # 内存和 CPU
```

关键输出整理成表：

| 项目 | 配置 | 对部署的意义 |
|------|------|--------------|
| GPU | RTX 4090 D，24564MiB | 选 FP8 量化格式 |
| 驱动 | 580.76.05，CUDA 13.0 | 能带新轮子，torch cu13 没问题 |
| 系统盘 `/` | 30G | 放 vLLM + torch（约 15G 内） |
| 数据盘 `/root/autodl-tmp` | 50G | **放模型**，随实例保留 |
| 内存 / CPU | 755G / 256 核 | 随便造 |

两个 AutoDL 特色要注意：

- 数据盘挂载在 `/root/autodl-tmp`，**模型必须放这里**——系统盘小，而且数据盘的内容在关机后保留更省心；
- 容器自带 miniconda（Python 3.12），但**非交互 shell 里 `python` 不在 PATH**，要 `source /root/miniconda3/etc/profile.d/conda.sh && conda activate base`，或者直接用全路径 `/root/miniconda3/bin/python`。

网络连通性顺手测了三个：

```bash
curl -s -o /dev/null -w '%{http_code}' https://hf-mirror.com    # 200 ✓
curl -s -o /dev/null -w '%{http_code}' https://www.modelscope.cn # 302 ✓
cat /etc/pip.conf                                                # 默认走阿里云源
```

家底盘完，开始干活的。所有长任务都丢进 `screen` 后台跑——SSH 万一断了，里面的进程照活，回来 `screen -r` 接着看，这是云服务器上跑长任务的基本功。

---

## 三、装 vLLM：镜像测速定生死

vLLM 连同 torch 全家桶要下 3GB+，pip 源的速度直接决定安装是 5 分钟还是 5 小时。容器默认的阿里云源给了我当头一棒——312MB 的 vllm wheel 挂了 8 分钟才 64MB。

不猜，测。同一个 wheel 文件，从三个源各拉 10MB 计时：

```bash
WHL=packages/87/d7/xxxx/vllm-0.28.0-cp38-abi3-manylinux_2_28_x86_64.whl
time curl -s --max-time 10 -r 0-10485759 "http://mirrors.aliyun.com/pypi/$WHL" -o /dev/null
time curl -s --max-time 10 -r 0-10485759 "https://pypi.tuna.tsinghua.edu.cn/$WHL" -o /dev/null
time curl -s --max-time 10 -r 0-10485759 "https://files.pythonhosted.org/$WHL" -o /dev/null  # 配合学术加速
```

结果差距悬殊：

| pip 源 | 实测 | 结论 |
|--------|------|------|
| 阿里云（容器默认） | 10s 拉满 10MB ≈ 1 MB/s | 慢 |
| **清华 TUNA** | **1s 拉满 10MB ≥ 10 MB/s** | 快 10 倍 |
| PyPI 官方 + 学术加速 | 10s 拉满 10MB ≈ 1 MB/s | 慢 |

> AutoDL 的「学术资源加速」是 `source /etc/network_turbo`，本质是给终端挂一个平台代理（http_proxy/https_proxy），对 HuggingFace 官方和 PyPI 官方有加成，但这次实测不如清华源直连。

换清华源重装，一条命令（丢在 screen 里）：

```bash
screen -dmS vllm_install bash -c 'source /root/miniconda3/etc/profile.d/conda.sh && \
  conda activate base && \
  pip install -U vllm -i https://pypi.tuna.tsinghua.edu.cn/simple \
  > /root/vllm_install.log 2>&1; \
  echo INSTALL_EXIT_$? >> /root/vllm_install.log'
```

细节：结尾 `echo INSTALL_EXIT_$?` 把退出码写进日志——后台任务干没干成，`grep` 一下便知，不用盯着屏幕等。

换源之后 14 MB/s，几分钟装完：**vLLM 0.28.0 + torch 2.13.0（cu13）+ transformers 5.16.1**。

然后收回第一章的伏笔——vLLM 到底认不认识 `Gemma4UnifiedForConditionalGeneration` 这个新架构？直接查它的架构注册表：

```bash
python -c "
from vllm.model_executor.models.registry import ModelRegistry
archs = ModelRegistry.get_supported_archs()
print([a for a in archs if 'emma4' in a])
"
```

```text
['Gemma4ForCausalLM', 'Gemma4ForConditionalGeneration',
 'Gemma4UnifiedForConditionalGeneration', 'Gemma4DSparkModel', ...]
```

在列表里，稳了。**装完先验架构支持，再开始下几十 GB 的模型**——这个顺序反了的话，下载两小时、启动报错 `Model architecture not supported`，会想砸键盘。

---

## 四、下模型：三版下载器迭代记

12.4GB，按第二章测的出口带宽（单连接约 1.5 MB/s），wget 单线程要两个半小时。这一章就是怎么把它压到可接受的范围，以及压的过程中翻的三次车。

### 4.1 第一版：wget 单线程，慢但能用

```bash
wget -c "https://hf-mirror.com/AEON-7/.../resolve/main/model.safetensors" \
     -O /root/autodl-tmp/models/.../model.safetensors
```

`-c` 支持断点续传，思路没问题，就是速度：3 分钟 271MB，约 1.5 MB/s，ETA 两小时。pass，但留下了两个遗产：hf-mirror 单连接速度基准（1.5 MB/s），以及「必须多线程」的结论。

### 4.2 第二版：12 线程分片，快但脆

大文件 + 服务器支持 Range 请求（`curl -sI` 看到响应头有 `Accept-Ranges`），标准解法就是分片并发：把文件按字节切成 12 段，每段一个 curl 后台下载，最后 `cat` 拼接。

```bash
# v2 核心逻辑（pdl.sh）
SIZE=$(curl -sIL $URL | grep -i content-length | tail -1 | tr -d '\r' | awk '{print $2}')
CHUNK=$((SIZE / 12 + 1))
for i in $(seq 0 11); do
  START=$((i * CHUNK)); END=$((START + CHUNK - 1))
  curl -sL -r $START-$END $URL -o $DEST.part$i &
done
wait
cat $(seq -f "$DEST.part%g" 0 11) > $DEST
```

效果立竿见影：45 秒 650MB，**约 14 MB/s**，10 倍提速，ETA 压到 15 分钟。

然后车速下来了两回。

**第一回：限速回落。** 十分钟后聚合速度掉到 2.3 MB/s——hf-mirror 对单 IP 有聚合限速，多线程只能帮你冲过起步阶段。顺手把其他路都测了一遍（这次学乖了，**数真实落盘字节**，用 `stat -c%s` 量）：

| 路线 | 实测（真实字节） | 备注 |
|------|------------------|------|
| hf-mirror 单连接 | 27.1MB / 20s ≈ 1.4 MB/s | 基准 |
| HF 官方 + 学术加速，单连接 | 42.6MB / 20s ≈ 2.1 MB/s | 略快 |
| HF 官方 + 加速，4 并发 | 81MB / 25s ≈ 3.2 MB/s | 聚合也上不去 |
| ModelScope | 「0s 下完 10MB」？？ | 见下 |

ModelScope 那行是measurement事故：模型页返回 200 让我以为它收录了这个模型，下载「10MB 不到 1 秒」让我狂喜——其实那是个 **145 字节的 404 错误页**。HTTP 状态码 200 也可能是软 404（返回正常页面的壳），**验证速度测试必须检查落盘字节数**，`curl -w '%{http_code}'` 不够。

结论：路就这一条，2~3 MB/s 的聚合天花板，接受。剩下的时间就是等。

**第二回：连接被掐死。** 等着等着发现不对——速度越来越慢，`ps aux | grep curl` 一看，**12 个下载进程只剩 1 个还活着**，其余 11 个早被 hf-mirror 掐断了（长连接 + 同 IP 高并发，被限流很合理）。更糟的是 v2 脚本的设计缺陷此刻暴露无遗：

> `wait` 只等所有后台任务退出，不检查它们是「下完了」还是「死掉了」。11 个死的 + 1 个活的，wait 照样返回，然后 `cat` 把 11 个残缺分片拼成一个**字节数对但内容错**的损坏文件。不报错，单纯地在几小时后给你一颗哑弹。

幸好 `wait` 前多看了一眼分片大小。翻车不算深，但缺陷是结构性的，光加个 if 补不了——重写。

### 4.3 第三版：断点续传 + 字节级校验

v3（pdl2.sh）要同时解决三件事：

1. **断点续传到分片级**：每个分片从「已落盘字节数」对应的位置续传，已完成的分片秒识别，一点不浪费；
2. **自动重试**：被掐了就退避重试，单分片最多 300 次，人类休息，脚本值班；
3. **字节级验收**：12 个分片各拿到「期望字节数」才算数，总数对不上绝不拼接。

```bash
#!/bin/bash
# /root/pdl2.sh —— 断点续传版多线程下载器
URL=https://hf-mirror.com/AEON-7/Gemma-4-12B-it-AEON-Abliterated-K4-FP8/resolve/main/model.safetensors
DEST=/root/autodl-tmp/models/Gemma-4-12B-it-AEON-Abliterated-K4-FP8/model.safetensors
PARTS=12
SIZE=$(curl -sIL $URL | grep -i content-length | tail -1 | tr -d '\r' | awk '{print $2}')
CHUNK=$((SIZE / PARTS + 1))
echo "SIZE=$SIZE CHUNK=$CHUNK"

download_part() {
  local i=$1
  local START=$((i * CHUNK))
  local END=$((START + CHUNK - 1))
  [ $END -ge $SIZE ] && END=$((SIZE - 1))
  local PF="$DEST.part$i"
  local EXPECTED=$((END - START + 1))
  for attempt in $(seq 1 300); do
    local HAVE=0
    [ -f "$PF" ] && HAVE=$(stat -c%s "$PF")
    if [ "$HAVE" -eq "$EXPECTED" ]; then echo "part$i DONE"; return 0; fi
    if [ "$HAVE" -gt "$EXPECTED" ]; then echo "part$i OVERSIZE"; return 1; fi
    # 关键：从 START+HAVE 续传，追加写入；-f 保证 HTTP 错误页不会写进文件
    curl -sfL --connect-timeout 15 --max-time 900 \
         -r $((START + HAVE))-$END "$URL" >> "$PF"
    sleep 2
  done
  echo "part$i FAILED"
  return 1
}

for i in $(seq 0 11); do download_part $i & done
wait

# 验收：逐分片比对期望大小
TOTAL=0
for i in $(seq 0 11); do
  S=$(stat -c%s "$DEST.part$i" 2>/dev/null || echo 0)
  TOTAL=$((TOTAL + S)); echo "part$i: $S"
done
echo "TOTAL=$TOTAL EXPECT=$SIZE"
[ "$TOTAL" -eq "$SIZE" ] && echo ALL_PARTS_VERIFIED || echo VERIFY_FAILED
```

三个容易漏的点：

- `curl -f`：HTTP 状态码 ≥400 时直接失败不写 body。没有它，一次 503 的 HTML 错误页会被静默追加进分片，字节数对了内容却错；
- `>>` 追加 + `-r START+HAVE`：续传的位移计算是「分片起点 + 本分片已有字节数」，不是全局偏移；
- `--max-time 900`：给单次尝试兜底，防止某条连接假死把整个循环卡住。

拼接也不急着手工来，挂个监视进程，日志里出现 `ALL_PARTS_VERIFIED` 才动手：

```bash
screen -dmS concat_watch bash -c '\
  while ! grep -q ALL_PARTS_VERIFIED /root/model_dl2.log 2>/dev/null; do sleep 30; done; \
  cat $(seq -f "$DEST.part%g" 0 11) > $DEST && echo CONCAT_DONE >> /root/model_dl2.log'
```

> 这个监视器后来出了岔子，坑在下面插曲三——先埋个伏笔。

v3 上线后：v2 留下的 10 个残缺分片全部原地续传（含两个已 100% 的秒过），重试机制安安静静地填坑。剩下就是时间问题。

### 4.4 三个插曲

**插曲一：`rm -f` 被安全卫士拦了。** 重启下载前想顺手删掉旧的不完整文件，被本机的安全策略拦下（策略禁止递归/强制删除）。其实这步本来就多余——v3 的分片逻辑对旧文件是「识别 + 续传 + 覆盖」，根本不需要删。结论：清理类操作能不做就不做，50G 的盘还没娇贵到那个份上。下载验收通过后，12 个 `.part` 文件（约 12G）手动删掉即可：

```bash
# 确认 model.safetensors 完好后，手动删除分片（GUI 或逐条确认，别用 -rf 一把梭）
rm /root/autodl-tmp/models/.../model.safetensors.part0   # ...以此类推
```

**插曲二：`pkill -f` 又自杀了。** 清理旧下载进程时 `pkill -f 'curl -sL -r'`，SSH 会话跟着断——远程命令字符串里恰好包含同样的文本，pkill 连自己坐着的会话一起匹配了。这正是第 1 篇踩坑速查表的第 5 条，同一把刀捅了自己两次。正确姿势：先 `pgrep` 看 PID，再按 PID 杀。

**插曲三：监视器的 `$DEST` 蒸发了。** 剧本本来很美：v3 下载完 → 日志打上验收标记 → 监视器无缝拼接。结果等到 `ALL_PARTS_VERIFIED` 真的打出来（TOTAL=13028605312 与 EXPECT 分毫不差，全部分片字节级验收通过），`model.safetensors` 却纹丝不动，日志里也没有 `CONCAT_DONE`。

排查发现监视器进程活着，但 `cat` 根本没执行成——原因藏在启动命令里：

```bash
DEST=/root/autodl-tmp/.../model.safetensors; screen -dmS concat_watch bash -c '... $DEST ...'
```

`DEST` 只是普通 shell 变量，**没 `export`**。`screen -dmS` 起的是全新会话，新 bash 里 `$DEST` 展开为空，那行命令实际变成了 `cat .part0 .part1 ... > `——重定向目标是空，bash 直接语法错误，而错误输出随 screen 会话消失得无影无踪，静默失败。

修复：不玩变量，绝对路径硬编码重拼，并把退出码写回日志：

```bash
screen -dmS concat bash -c 'cat \
  /root/autodl-tmp/models/.../model.safetensors.part0 \
  /root/autodl-tmp/models/.../model.safetensors.part1 \
  ...（中间省略）... \
  > /root/autodl-tmp/models/.../model.safetensors; \
  echo CAT_EXIT_$? >> /root/model_dl2.log'
```

45 秒后 `CAT_EXIT_0`，`stat -c%s` 报出 13028605312——和期望值一字不差，12.4G 模型落盘完毕。从开始下载到验收拼接完成，全程约 1.5 小时，大半时间在等 hf-mirror 的限速天花板。

---

## 五、起服务：start_vllm.sh 逐参数拆解

模型落盘后，写个启动脚本（`/root/start_vllm.sh`）：

```bash
#!/bin/bash
source /root/miniconda3/etc/profile.d/conda.sh
conda activate base
MODEL=/root/autodl-tmp/models/Gemma-4-12B-it-AEON-Abliterated-K4-FP8
exec vllm serve $MODEL \
  --served-model-name gemma-4-12b \
  --host 0.0.0.0 \
  --port 8000 \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.92 \
  --enable-auto-tool-choice \
  --tool-call-parser gemma4
```

> 最后两个参数不是一开始就有的——被 Pi 上门的 400 炸出来后补的，故事在本节末尾的「补遗」。

逐个说：

| 参数 | 值 | 为什么 |
|------|-----|--------|
| `--served-model-name` | `gemma-4-12b` | API 里的模型名。不设的话客户端要写完整磁盘路径，又长又丑 |
| `--host` | `0.0.0.0` | 监听所有网卡。SSH 隧道走的是容器回环，其实 127.0.0.1 就够，但 0.0.0.0 以后想换 AutoDL「自定义服务」公网方案时不用改 |
| `--port` | `8000` | vLLM 默认端口 |
| `--max-model-len` | `32768` | 最大上下文。Gemma-4 支持更长，但 KV cache 随上下文线性膨胀，32K 在 24G 卡上是「够用且稳」的平衡点 |
| `--gpu-memory-utilization` | `0.92` | vLLM 允许占用的显存比例。0.92×24G ≈ 22G，装下 12.2G 权重后剩 ~10G 给 KV cache |

启动同样丢 screen：

```bash
chmod +x /root/start_vllm.sh
screen -dmS vllm bash -c '/root/start_vllm.sh > /root/vllm_server.log 2>&1'
tail -f /root/vllm_server.log    # 看加载进度，首次会先编译一些kernel，耐心等
```

看到日志里这几行，就是起来了（摘自真实启动日志）：

```text
(APIServer pid=6659) INFO ... [model.py:672] Resolved architecture: Gemma4UnifiedForConditionalGeneration
(EngineCore pid=7250) INFO ... [default_loader.py:430] Loading weights took 4.08 seconds
(EngineCore pid=7250) INFO ... [model_runner.py:380] Model loading took 12.75 GiB memory and 7.393888 seconds
(EngineCore pid=7250) INFO ... [kv_cache_utils.py:1869] GPU KV cache size: 110,457 tokens, \
    Maximum concurrency for 32,768 tokens per request: 3.37x
(APIServer pid=6659) INFO:     Started server process [6659]
```

三条信息各说了一件事：FP8 权重从盘到卡只用了 4 秒（数据盘读 2.7 GB/s，NVMe RAID 的实力）；权重吃拌 12.75 GiB，和仓库标称的 12.2 GB 对上；剩下的约 10G 显存池换成了 11 万 token 的 KV cache，兼容 32K 长度时能同时伺候 3 路请求。

容器里自测一把：

```bash
curl -s http://localhost:8000/v1/models
```

```json
{"object":"list","data":[{"id":"gemma-4-12b","object":"model",
  "created":1787931878,"owned_by":"vllm",
  "root":"/root/autodl-tmp/models/Gemma-4-12B-it-AEON-Abliterated-K4-FP8",
  "max_model_le...
```

再补一刀真实的对话推理：

```bash
curl -s http://localhost:8000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model": "gemma-4-12b", "messages": [{"role": "user", "content": "你好，请用一句话介绍你自己"}], "max_tokens": 100}'
```

```json
{"choices":[{"message":{"role":"assistant",
  "content":"我是 Gemma 4，由 Google DeepMind 开发的具有文本和图像理解能力的大型语言模型。"},
  "finish_reason":"stop"}],
 "usage":{"prompt_tokens":21,"completion_tokens":23,"total_tokens":44},
 "service_tier":null, ...}
```

服务端全通。

顺带一提显存账单：`nvidia-smi` 里 vLLM 起来后占用 ~22G——它启动时就按 `gpu-memory-utilization` 把显存池一次性圈好（PagedAttention 的KV cache 池），不是「按需增长」，这是 vLLM 和 ollama 观感上最大的区别。

### 5.1 补遗：Pi 一连就 400，工具解析没开

服务起来后，本地浏览器里测好好的，结果 Pi（编程智能体）一连上就痵：

```text
Error: 400: {"message":"\"auto\" tool choice requires --enable-auto-tool-choice
and --tool-call-parser to be set","type":"BadRequestError"}
```

原因一句话：**聊天客户端和智能体客户端的差别**。普通聊天只发消息，而 Pi 这类智能体每个请求都带着 `tools`（工具清单）和 `tool_choice: "auto"`（允许模型决定调工具）。vLLM 默认不开工具解析——这算是个安全默认：没配解析器时直接拒绝，免得模型输出的半成品工具调用静默漏给客户端。

解法分三步：

**第一步，看有哪些解析器。** 工具调用本质是「模型输出特殊格式的文本 → 服务端解析回结构化 JSON」，每家模型格式不同，vLLM 为它们各备了一个解析器。直接翻包目录：

```bash
ls /root/miniconda3/lib/python3.12/site-packages/vllm/tool_parsers/ | head
```

四十多个解析器一字排开（llama、mistral、hermes、deepseek……），其中赫然有两个候选：`gemma4_engine_tool_parser.py`（Gemma 4 专用）和 `functiongemma_tool_parser.py`。注册名再确认一下：

```bash
python -c "from vllm.tool_parsers import ToolParserManager as M; \
  import json; print(json.dumps(sorted(set(M.list_registered()))))" | tr ',' '\n' | grep -i gemma
```

```text
 "functiongemma"
 "gemma4"
```

Gemma-4-12B-it 对号入座，选 `gemma4`。

**第二步，加参数重启。** 在 `start_vllm.sh` 里补上那两行，然后停旧拉新：

```bash
screen -S vllm -X stuff '^C'        # Ctrl+C 优雅停机
screen -dmS vllm bash -c '/root/start_vllm.sh > /root/vllm_server.log 2>&1'
```

重启后日志的 non-default args 里能看到 `enable_auto_tool_choice: True, tool_call_parser: 'gemma4'`，说明参数吃进去了。

**第三步，用带工具的请求验证。** 光能聊天不算数，得让模型真调一次：

```bash
curl -s http://localhost:8000/v1/chat/completions -H 'Content-Type: application/json' -d @/tmp/tool_test.json
```

请求里塞一个 `get_weather` 工具定义（参数 `city`），问「北京天气如何」。真实响应：

```json
{"choices":[{"message":{"role":"assistant","content":null,
  "tool_calls":[{"type":"function",
    "function":{"name":"get_weather","arguments":"{\"city\": \"北京\"}"}}],
  "finish_reason":"tool_calls"}},
 "usage":{"prompt_tokens":76,"completion_tokens":15,"total_tokens":91}}
```

漂亮：模型没瞎编天气，而是正确发起工具调用，参数 `city=北京` 被解析成了规整的 JSON，`finish_reason` 也变成了 `tool_calls`。Pi 再连，一切正常。

> 顺带一提：`--tool-call-parser` 只管「解析模型输出」，不代表模型真的会调——Gemma-4-12B-it 本身训过 function calling（模型卡标签里写着 `function-calling`），两者缺一不可。

---

## 六、连回家：一条隧道把 8000 端口搬回本地

服务在容器里听着，本地电脑怎么连？AutoDL 容器没有独立公网 IP，最优雅的答案是 SSH 隧道——第 1 篇预告过的那一幕：

```powershell
ssh -p 41230 -N -L 8000:localhost:8000 root@服务器地址
```

参数拆开：

- `-L 8000:localhost:8000`：把本地的 8000 端口转发到「SSH 登录后那台机器视角里的 localhost:8000」，即容器的 vLLM；
- `-N`：只转发端口，不执行远程命令、不开 shell，专职隧道。

本地存个 `连接vllm.bat` 双击即用（第 1 篇配的密钥免密，窗口开了就是隧道）：

```bat
ssh -p 41230 -N -L 8000:localhost:8000 root@connect.westc.seetacloud.com
```

> 注意：AutoDL 实例重启后端口/地址可能变化（第 1 篇坑 3），bat 里的 `-p 41230` 和主机名以控制台当前显示为准。

窗口保持开启，本地测试脚本 `test_vllm.py`（先 `pip install openai`）：

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8000/v1", api_key="EMPTY")

print("可用模型:", [m.id for m in client.models.list()])

resp = client.chat.completions.create(
    model="gemma-4-12b",
    messages=[{"role": "user", "content": "你好，请用一句话介绍你自己。"}],
    max_tokens=200,
    temperature=0.7,
)
print("\n回复:", resp.choices[0].message.content)
print("\n统计: prompt %d tokens, 生成 %d tokens" % (
    resp.usage.prompt_tokens, resp.usage.completion_tokens))
```

`api_key="EMPTY"` 是 vLLM 的默认约定——没配 `--api-key` 时随便填。实际跑一把（真实输出）：

```text
可用模型: ['gemma-4-12b']

回复: 我是 Gemma 4，由 Google DeepMind 开发的一个能够处理文本和图像以及音频输入
      和支持视频输入的多模态人工智能助手模型。

统计: prompt 22 tokens, 生成 35 tokens
```

至此，本地写代码、远端 4090 推理，体验与官方 API 无异。AnythingLLM、LobeChat、Dify 等一切支持 OpenAI 兼容接口的工具，把 base_url 填 `http://localhost:8000/v1` 都能直接用。

不想开 Python 的话，一行 curl 也行（PowerShell 下注意转义，建议还是用上面的脚本）。

服务端的退出与重启也有讲究——不需要的时候别让它白烧卡费：

```bash
screen -S vllm -X stuff '^C'      # 向 vllm 会话发送 Ctrl+C 优雅停机
screen -S vllm -X quit            # 然后回收会话
```

下次要用，一条命令拉起（模型在数据盘上躺着，不用重新下载）：

```bash
screen -dmS vllm bash -c '/root/start_vllm.sh > /root/vllm_server.log 2>&1'
```

### 整机关机后的恢复清单（AutoDL 实例重启）

容器磁盘数据都在，流程就四步：

1. **控制台拿新 SSH 指令**——AutoDL 重启后端口/地址可能变化（第 1 篇坑 3），以控制台显示为准
2. **进容器拉起服务**：上面那条 `screen -dmS vllm ...` 命令，`tail -f /root/vllm_server.log` 看到 `Started server process` 即就绪（编译缓存还在，比首次快）
3. **改本地 bat 端口**（如果变了），双击 `连接vllm.bat` 重建隧道
4. **本地验证**：`python test_vllm.py` 出回复即全链路恢复

---

## 七、小结

一句话链路：

> **三源测速定 pip 源 → 清华源装 vLLM → 验架构支持 → 12 线程分片下载（断点续传 + 字节校验）→ screen 起服务 → SSH 隧道连回家**

核心认知三条：

- **带宽受限时先测速再动手**：同一文件多源实测，10 分钟的测速能省 2 小时的等待；测速要数真实落盘字节，200 状态码和「看起来快」都可能是幻觉
- **大文件并发下载必须配「续传 + 重试 + 校验」三件套**：并发把成功率换成了速度，没有校验的拼接是在攒哑弹
- **装完先验架构、下完先验字节，再谈启动**：顺序反了，代价是成小时的下载打水漂

### 踩坑速查表

| # | 坑 | 解法 |
|---|-----|------|
| 1 | pip 默认阿里云源只有 ~1 MB/s | 三源实测，换清华 TUNA（本例 10 倍速差） |
| 2 | 非交互 shell 里 `python` 不存在 | `source /root/miniconda3/etc/profile.d/conda.sh && conda activate base`，或全路径 `/root/miniconda3/bin/python` |
| 3 | hf-mirror 多线程起步快后劲不足 | 单 IP 聚合限速，属于规则内天花板，接受或换时段 |
| 4 | ModelScope「0 秒下完 10MB」 | 145 字节的软 404 错误页；测速必须核对落盘字节数 |
| 5 | curl 并发下载部分连接中途死亡，`wait` 后拼出损坏文件 | v3 脚本：分片级续传 + 300 次重试 + `curl -f` + 逐分片字节校验，全过才拼接 |
| 6 | HTTP 错误页被静默追加进分片 | curl 加 `-f`（HTTP ≥400 时不写 body） |
| 7 | `pkill -f` 杀断自己的 SSH 会话 | 与第 1 篇坑 5 同源：先 `pgrep` 拿 PID 再精确杀 |
| 8 | 下载完启动报 architecture not supported | 先查 `ModelRegistry.get_supported_archs()`，再决定下哪个版本 |
| 9 | screen 监视器静默失败，拼接没执行 | `screen -dmS` 新会话继承不到未 `export` 的 shell 变量，`$DEST` 展开为空导致语法错误；用绝对路径或 `export` |
| 10 | Pi/Claude Code 等智能体一连就 400：`tool choice requires --enable-auto-tool-choice` | 智能体每请求都带工具清单；启动加 `--enable-auto-tool-choice --tool-call-parser gemma4`（解析器按模型选） |

### 磁盘占用清单

| 路径 | 内容 | 大小 |
|------|------|------|
| `/root/miniconda3` | vLLM + torch cu13 全家桶 | ~15G（系统盘） |
| `/root/autodl-tmp/models/Gemma-4-...-K4-FP8` | 模型本体 `model.safetensors` | 12.4G（数据盘） |
| 同目录 `.part0` ~ `.part11` | 下载分片，**验收通过后可手动删除** | ~12.4G（数据盘） |

### 安全提醒

- 🔑 隧道 bat 里含服务器地址端口，截图/分享前打码；实例重启后端口会变，属正常
- 🔐 API 未设鉴权时仅回环+隧道可达；若改用 AutoDL「自定义服务」暴露公网，务必加 `--api-key`
- 📦 模型是社区「去审查」版本，能力与原版一致但安全对齐被移除，自用研究请自担责任

---

## 参考资料

- [vLLM 官方文档](https://docs.vllm.ai/) — `vllm serve` 参数、OpenAI 兼容 server、量化格式支持矩阵
- [NVIDIA ModelOpt 量化格式](https://nvidia.github.io/TensorRT-LLM/precision.html) — `FP8_PER_CHANNEL_PER_TOKEN` 与 `hf_quant_config.json` 的官方说明
- [hf-mirror.com](https://hf-mirror.com/) — HuggingFace 国内镜像，本文的模型搜索 / 下载全走这里
- [GNU Screen 手册](https://www.gnu.org/software/screen/manual/) — `screen -dmS` 后台会话、`-r` 重连
- 本机实测环境：Windows 11 + OpenSSH；AutoDL RTX 4090 D（驱动 580.76.05 / CUDA 13.0），vLLM 0.28.0 + torch 2.13.0
