# kind 教学集群 vs 生产集群——节点与数据落点对照

（第 12 课存储篇插问补图，2026-09-22 课堂实录；配图 HTML 源件在 `C:\Users\chengongyi\AppData\Local\Temp\kind-vs-prod\kind-vs-prod.html`，Archify 校验四视口全过）

## 左侧——教学环境（我们现在用的）

```
Windows 宿主机（学员笔记本）
  └─ WSL2（Windows 里的 Linux 子系统）
       └─ Docker Engine（容器运行时）
            └─ demo-control-plane ← 一个 Docker 容器，扮演了"一台机器"
                 ├─ 控制面组件（apiserver · scheduler · etcd）
                 ├─ 业务 Pod（app1、hello、share-box…）
                 └─ /data/lesson12 ← hostPath 数据落点
```

关键认知：**我们的"节点"本身是个 Docker 容器**——所以 hostPath 的数据，物理上最深处躺在 Docker 容器的文件系统里（这就是 `docker exec demo-control-plane ls /data/lesson12` 能看到数据的原因）。

## 右侧——生产环境（真的）

```
机房 / 公有云（真机群）
  ├─ 控制节点 ×1~3（真机，跑 apiserver/scheduler/etcd）
  ├─ 工作节点 ×N（真机，跑 kubelet + Pod 容器）
  └─ 真实存储（云盘/NFS——PV 的底层）
```

## 三句话总结差异

1. **模拟 vs 真机**：教学环境四层嵌套全在 Windows 里；生产每台节点是独立物理机/虚拟机
2. **一肩挑 vs 分工**：kind 单节点既当控制又当干活；生产里控制节点只拍板、工作节点只干活
3. **看不出 vs 看得出**：单节点永远体会不到「Pod 被派到另一台机器、hostPath 数据留在原机器」的分家问题——那正是 PV/PVC 要解决的
