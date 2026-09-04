import { navbar } from "vuepress-theme-hope";

export default navbar([
  "/",
  {
    text: "AI",
    icon: "robot",
    children: [
      {
        text: "AI 专栏",
        icon: "robot",
        link: "/Ai/",
      },
      {
        text: "每日 AI 简报",
        icon: "newspaper",
        link: "/News/",
      },
    ],
  },
  {
    text: "Web3 区块链",
    icon: "link",
    link: "/web3区块链/",
  },
  {
    text: "Java",
    icon: "code",
    children: [
      {
        text: "Java",
        icon: "code",
        link: "/Java/",
      },
      {
        text: "并发编程",
        icon: "bolt",
        link: "/并发编程/",
      },
      {
        text: "源码剖析",
        icon: "microscope",
        link: "/源码剖析/",
      },
    ],
  },
  {
    text: "后端 · 架构",
    icon: "cubes",
    children: [
      {
        text: ".NET",
        icon: "code",
        link: "/DotNet/",
      },
      {
        text: "微服务",
        icon: "cubes",
        link: "/微服务/",
      },
      {
        text: "分布式",
        icon: "network-wired",
        link: "/分布式/",
      },
      {
        text: "软件架构",
        icon: "diagram-project",
        link: "/软件架构/",
      },
      {
        text: "亿级规模系统",
        icon: "chart-line",
        link: "/亿级规模系统/",
      },
      {
        text: "性能调优",
        icon: "gauge-high",
        link: "/性能调优/",
      },
    ],
  },
  {
    text: "数据 · 中间件",
    icon: "database",
    children: [
      {
        text: "数据库",
        icon: "database",
        link: "/数据库/",
      },
      {
        text: "中间件",
        icon: "server",
        link: "/中间件/",
      },
      {
        text: "大数据",
        icon: "database",
        link: "/BigData/",
      },
    ],
  },
  {
    text: "运维 · 环境",
    icon: "cloud",
    children: [
      {
        text: "云原生",
        icon: "cloud",
        link: "/云原生/",
      },
      {
        text: "Linux",
        icon: "terminal",
        link: "/Linux/",
      },
      {
        text: "Windows",
        icon: "laptop-code",
        link: "/Windows/",
      },
    ],
  },
  {
    text: "前端 · 小程序",
    icon: "laptop-code",
    children: [
      {
        text: "前端",
        icon: "laptop-code",
        link: "/前端/",
      },
      {
        text: "微信小程序",
        icon: "weixin",
        link: "/微信小程序/",
      },
    ],
  },
  {
    text: "面试题",
    icon: "comments",
    link: "https://interview.code-corey.com/面试题/",
  },
  {
    text: "更多",
    icon: "ellipsis",
    children: [
      {
        text: "工具",
        icon: "screwdriver-wrench",
        link: "/Tools/",
      },
      {
        text: "英语",
        icon: "language",
        link: "/English/",
      },
      {
        text: "笔记",
        icon: "note-sticky",
        link: "/Notes/",
      },
    ],
  },
]);
