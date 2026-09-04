/**
 * 一次性迁移脚本：G:\MyNewPaper\<日期>\*.md → src/News/<日期>/*.md
 *
 * - 跳过 _old/ 目录
 * - 解析正文首行 `# 标题` 与 meta 行 `> 📅 日期 | 🏷️ 分类 | ⭐ 热度`
 * - 注入站点规范 frontmatter（title/sidebarGroup/shortTitle/order/date/category/tag/description）
 *
 * 用法：node scripts/migrate-news.mjs
 */
import fs from "node:fs";
import path from "node:path";

const SRC_ROOT = "G:/MyNewPaper";
const DEST_ROOT = path.resolve(import.meta.dirname, "..", "src", "News");
const SKIP_DIRS = new Set(["_old"]);

function listDayDirs() {
  return fs
    .readdirSync(SRC_ROOT)
    .filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name))
    .sort();
}

/** 提取正文第一个实质段落（跳过标题行与引用块），截断 120 字 */
function extractDescription(body) {
  const lines = body.split(/\r?\n/);
  const paras = [];
  let buf = [];
  for (const line of lines) {
    const t = line.trim();
    if (t === "" || t.startsWith("#") || t.startsWith(">")) {
      if (buf.length) paras.push(buf.join(" "));
      buf = [];
      continue;
    }
    buf.push(t);
  }
  if (buf.length) paras.push(buf.join(" "));
  const first = paras[0] || "";
  const clean = first
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*`_]/g, "")
    .trim();
  return clean.length > 120 ? `${clean.slice(0, 117)}...` : clean;
}

/** 从标题去掉尾部中文括号翻译 → shortTitle，超 22 字截断 */
function makeShortTitle(title) {
  let t = title;
  const zhMatch = t.match(/（([^）]+)）\s*$/);
  if (zhMatch) t = zhMatch[1];
  t = t.replace(/^[|#\s]+/, "").trim();
  return t.length > 22 ? `${t.slice(0, 21)}…` : t;
}

/** meta 行字段清洗：去掉 emoji 前缀，保留首个字母/数字/CJK 起的文本 */
function cleanMeta(value) {
  const m = value.match(/[A-Za-z0-9\u4e00-\u9fff].*/);
  return m ? m[0].trim() : value.trim();
}

function buildFrontmatter({ title, shortTitle, sidebarGroup, order, date, category, tag, description }) {
  const esc = (s) => s.replace(/"/g, '\\"');
  return [
    "---",
    `title: "${esc(title)}"`,
    `shortTitle: "${esc(shortTitle)}"`,
    `sidebarGroup: "${esc(sidebarGroup)}"`,
    `order: ${order}`,
    `date: ${date}`,
    `category:`,
    `  - "${esc(category)}"`,
    `tag:`,
    `  - "${esc(tag)}"`,
    `description: "${esc(description)}"`,
    "---",
    "",
  ].join("\n");
}

function migrateFile(dayDir, fileName) {
  const srcPath = path.join(SRC_ROOT, dayDir, fileName);
  const raw = fs.readFileSync(srcPath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/);

  // 标题：首个 `# ` 行
  const titleLine = lines.find((l) => l.startsWith("# "));
  const title = titleLine ? titleLine.replace(/^#\s+/, "").trim() : fileName.replace(/\.md$/, "");

  // meta 行：`> 📅 ... | 🏷️ ... | ⭐ ...`（导读文件是 `> 面向企业...` 单行）
  let fileDate = dayDir;
  let tag = "每日 AI 简报";
  let heat = "";
  const metaLine = lines.find((l) => l.startsWith("> ") && /\|/.test(l));
  if (metaLine) {
    const parts = metaLine.replace(/^>\s*/, "").split("|").map((s) => s.trim());
    for (const p of parts) {
      if (/^[\p{Extended_Pictographic}\uFE0F\u200D\s]*\d{4}-\d{2}-\d{2}/u.test(p)) fileDate = cleanMeta(p);
      else if (/^[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u200D\s]*(工程|值得研究|前沿|模型发布|安全|国内)/u.test(p)) tag = cleanMeta(p);
      else if (/HN|GitHub|HF|↑|分|★/u.test(p)) heat = cleanMeta(p);
    }
  }

  const orderMatch = fileName.match(/^(\d+)/);
  const order = orderMatch ? Number(orderMatch[1]) : 99;

  const bodyStart = lines.findIndex((l) => l.startsWith("# ")) + 1;
  const description = extractDescription(lines.slice(bodyStart).join("\n")) || title;

  const fm = buildFrontmatter({
    title,
    shortTitle: makeShortTitle(title),
    sidebarGroup: dayDir,
    order,
    date: fileDate,
    category: "每日 AI 简报",
    tag,
    description,
  });

  const destDir = path.join(DEST_ROOT, dayDir);
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(path.join(destDir, fileName), fm + raw, "utf8");
  return { title, tag, heat };
}

let count = 0;
const skipped = [];
for (const dayDir of listDayDirs()) {
  const files = fs.readdirSync(path.join(SRC_ROOT, dayDir)).filter((f) => f.endsWith(".md"));
  for (const f of files) {
    if (SKIP_DIRS.has(f)) continue;
    const srcStat = fs.statSync(path.join(SRC_ROOT, dayDir, f));
    if (!srcStat.isFile()) continue;
    const { title, tag } = migrateFile(dayDir, f);
    count++;
    console.log(`[${dayDir}] ${f} → ${tag} | ${title.slice(0, 50)}`);
  }
}
console.log(`\n✅ 迁移完成：${count} 篇 → src/News/`);
if (skipped.length) console.log(`跳过：${skipped.length}`);
