/** 校验 src/News 所有 md 的 frontmatter 结构（模板化生成，正则校验足够） */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "src", "News");
const KEYS = /^(title|shortTitle|sidebarGroup|order|date|category|tag|description):(\s.*)?$/;
let n = 0;
let bad = 0;

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      walk(p);
      continue;
    }
    if (!f.endsWith(".md") || f === "README.md") continue;
    n++;
    const text = fs.readFileSync(p, "utf8");
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) {
      console.log(`NO FRONTMATTER: ${p}`);
      bad++;
      continue;
    }
    const lines = m[1].split(/\r?\n/);
    const seen = new Set();
    for (const line of lines) {
      if (line === "") continue;
      const km = line.match(KEYS);
      if (km) {
        seen.add(km[1]);
        const val = km[2];
        // 标量值必须带引号或为数字/日期；不允许裸中文/裸 emoji
        if (val && val.trim() !== "" && !/^("(\\.|[^"\\])*"|\d{4}-\d{2}-\d{2}|\d+)$/.test(val.trim())) {
          console.log(`BAD VALUE [${p}] ${line}`);
          bad++;
        }
      } else if (/^\s*-\s*"[^"]*"$/.test(line)) {
        // 列表项，OK
      } else {
        console.log(`BAD LINE [${p}] ${line}`);
        bad++;
      }
    }
    const need = ["title", "shortTitle", "sidebarGroup", "order", "date", "category", "tag", "description"];
    const missing = need.filter((k) => !seen.has(k));
    if (missing.length) {
      console.log(`MISSING ${missing.join(",")}: ${p}`);
      bad++;
    }
  }
}

walk(root);
console.log(`checked ${n} files, ${bad} issues`);
process.exit(bad ? 1 : 0);
