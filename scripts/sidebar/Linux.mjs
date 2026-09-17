/** @type {Record<string, import("../sidebar.config.mjs").FolderMeta>} */
export default {
  basics: {
    title: "Linux 基础",
    icon: "terminal",
    order: 1,
  },
  nginx: {
    title: "Nginx",
    icon: "server",
    order: 2,
  },
  ssh: {
    title: "SSH 远程连接",
    icon: "key",
    order: 3,
  },
  loadbalancing: {
    title: "负载均衡与高可用",
    icon: "shield-halved",
    order: 4,
  },
};
