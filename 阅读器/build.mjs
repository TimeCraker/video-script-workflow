/* ============ 视频剧本工作流 阅读器 · 构建脚本 =============
   用法: node build.mjs  (或双击 更新章节.bat)
   递归扫描项目根目录(video-script-workflow)下所有 *.md，生成单文件 阅读器.html */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const DIR = import.meta.dirname;
const ROOT = path.resolve(DIR, ".."); // video-script-workflow
const SRC = path.join(DIR, "src");
const OUT = path.join(DIR, "阅读器.html");
const SELF = DIR; // 排除阅读器目录自身

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ---------- 递归收集 md（排除阅读器目录自身与隐藏目录） ---------- */
async function collectMd(dir, base, out) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    const rel = path.join(base, e.name);
    if (e.isDirectory()) {
      if (full === SELF) continue;
      await collectMd(full, rel, out);
    } else if (/.md$/i.test(e.name)) {
      out.push(rel.replace(/\\/g, "/"));
    }
  }
  return out;
}

/* ---------- markdown -> HTML（沿用原阅读器解析规则，H2 改为普通小节标题） ---------- */
function parseBlocks(text, titleOfFile) {
  const lines = text.split("\n");
  let html = "";
  let buf = [];
  let inQuote = false, inList = false, nodeMode = false;
  let inTable = [];
  let scenes = [], sceneI = 0, wordCount = 0, imgCount = 0;
  const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml" };
  const HEART_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20.3C7 16.6 3.5 13.3 3.5 9.7 3.5 7.2 5.5 5.2 8 5.2c1.6 0 3 .9 4 2.3 1-1.4 2.4-2.3 4-2.3 2.5 0 4.5 2 4.5 4.5 0 3.6-3.5 6.9-8.5 10.6z"/></svg>';

  function escInline(s) {
    let t = esc(s);
    t = t.replace(/\*\*([^\*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/(^|[^\*])\*([^\*\s][^\*]*)\*(?!\*)/g, "$1<em>$2</em>");
    return t;
  }
  function flushP() {
    if (!buf.length) return;
    const raw = buf.join(" ");
    buf = [];
    const t = raw.trim();
    if (!t) return;
    wordCount += t.replace(/\s/g, "").length;
    let cls = "";
    const isWhole = /^[（(][\s\S]*[）)]$/.test(t);
    const headChar = t.charAt(0);
    if (isWhole || headChar === "（" || headChar === "(") {
      const hasEll = t.indexOf("……") >= 0;
      cls = (t.length >= 20 || hasEll) ? "mono" : "stage";
    } else if (headChar === "「") {
      html += '<p class="dialog"><span class="dq">「</span>' + escInline(t.replace(/^「/, "")) + "</p>\n";
      return;
    } else if (/^(思考了|Thought|系统)/.test(t)) {
      cls = "sys";
    } else if (/[：:]$/.test(t) && t.length < 20) {
      cls = "sys";
    }
    html += "<p" + (cls ? ' class="' + cls + '"' : "") + ">" + escInline(t) + "</p>\n";
  }
  function flushList() {
    if (!buf.length) { inList = false; return; }
    html += "<ul>";
    buf.forEach((li) => { wordCount += li.replace(/\s/g, "").length; html += "<li>" + escInline(li) + "</li>"; });
    html += "</ul>\n";
    buf = []; inList = false;
  }
  function flushQuote() {
    if (!buf.length) { inQuote = false; return; }
    wordCount += buf.join(" ").replace(/\s/g, "").length;
    html += '<details class="archive"><summary>归档信息</summary><div class="arch-body">' + escInline(buf.join("\n")) + "</div></details>\n";
    buf = []; inQuote = false;
  }
  function closeNode() { if (nodeMode) { html += "</div>\n"; nodeMode = false; } }
  const isTableSep = (rr) => /^\|[\s:|\-]+\|$/.test(rr);
  function flushTable() {
    if (!inTable.length) return;
    const lines2 = inTable; inTable = [];
    const rows = lines2.filter((rr) => !isTableSep(rr));
    if (!rows.length) return;
    const hasHead = rows.length > 1 && isTableSep(lines2[1]);
    html += "<table>";
    rows.forEach((row, ri) => {
      const cells = row.split("|").slice(1, -1).map((c) => c.trim());
      const tag = (ri === 0 && hasHead) ? "th" : "td";
      wordCount += cells.join("").replace(/\s/g, "").length;
      html += "<tr>" + cells.map((c) => "<" + tag + ">" + escInline(c) + "</" + tag + ">").join("") + "</tr>";
    });
    html += "</table>\n";
  }

  lines.forEach((ln) => {
    const s = ln.trim();
    if (inTable.length && !/^\|.+\|$/.test(s)) flushTable();
    if (/^\|.+\|$/.test(s)) {
      if (inList) flushList(); if (inQuote) flushQuote(); flushP();
      inTable.push(s);
      return;
    }
    if (/^!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/.test(s)) {
      if (inTable.length) flushTable(); if (inList) flushList(); if (inQuote) flushQuote(); flushP();
      const mi = s.match(/^!\[([^\]]*)\]\(([^)\s]+)/);
      const miAlt = mi[1], miSrc = mi[2];
      if (/^https?:/i.test(miSrc)) {
        html += '<figure class="fig"><img loading="lazy" src="' + esc(miSrc) + '" alt="' + esc(miAlt) + '"><figcaption>' + escInline(miAlt) + "</figcaption></figure>\n";
      } else {
        const imgPath = path.join(ROOT, miSrc);
        const ext = (miSrc.split(".").pop() || "").toLowerCase();
        let ok = false;
        if (MIME[ext] && existsSync(imgPath)) {
          try {
            const buf2 = readFileSync(imgPath);
            if (buf2.length > 0 && buf2.length < 15 * 1024 * 1024) {
              html += '<figure class="fig"><img loading="lazy" src="data:' + MIME[ext] + ";base64," + buf2.toString("base64") + '" alt="' + esc(miAlt) + '"><figcaption>' + escInline(miAlt) + "</figcaption></figure>\n";
              ok = true; imgCount++;
            }
          } catch (e2) { ok = false; }
        }
        if (!ok) {
          html += '<figure class="fig"><span class="fig-missing">图：' + esc(miAlt || "配图") + "（缺图：" + esc(miSrc) + "）</span></figure>\n";
        }
      }
      return;
    }
    if (inQuote && s.charAt(0) !== ">" && s !== "") flushQuote();
    if (inList && !/^[-•]\s/.test(s) && s !== "") flushList();
    if (s === "") {
      if (inQuote) buf.push("");
      else if (inList) flushList();
      else flushP();
      return;
    }
    if (/^---+$/.test(s)) {
      flushP(); if (inList) flushList(); flushQuote(); closeNode();
      html += '<div class="orn"><i></i><span>✦</span><i></i></div>\n';
      return;
    }
    if (s.charAt(0) === ">") {
      if (inList) flushList(); flushP();
      inQuote = true;
      buf.push(s.replace(/^>\s?/, ""));
      return;
    }
    if (/^[-•]\s/.test(s)) {
      if (inQuote) flushQuote();
      inList = true;
      buf.push(s.replace(/^[-•]\s/, ""));
      return;
    }
    if (/^#{1,6}\s/.test(s)) {
      flushP(); if (inList) flushList(); if (inQuote) flushQuote();
      const mm = s.match(/^(#{1,6})\s+(.*)$/);
      const lvl = mm[1].length, txt = mm[2];
      wordCount += txt.replace(/\s/g, "").length;
      if (lvl >= 3) {
        html += "<h3>" + escInline(txt) + "</h3>\n";
      } else if (lvl === 2) {
        closeNode();
        const sm = txt.match(/^🩷\s*场景\s*(\d+)\s*[:：]\s*(.*)$/);
        if (sm) {
          const id = "sc-" + sceneI++;
          scenes.push({ id, label: txt });
          html += '<h2 class="scene" id="' + id + '"><span class="heart">' + HEART_SVG + '</span><span class="sno">场景 ' + sm[1] + '</span>' + escInline(sm[2]) + "</h2>\n";
        } else {
          html += "<h2>" + escInline(txt) + "</h2>\n";
        }
      } else {
        closeNode();
        html += "<h1>" + escInline(txt) + "</h1>\n";
      }
      return;
    }
    if (inQuote) { buf.push(s); return; }
    if (inList) { buf.push(s); return; }
    buf.push(s);
  });
  flushP(); if (inList) flushList(); if (inQuote) flushQuote(); flushTable(); closeNode();
  return { html, scenes, wordCount, imgCount, paraCount: (html.match(/<p[ >]/g) || []).length };
}

/* ---------- 分组：三个书架 ---------- */
function groupOf(rel) {
  if (rel.startsWith("characters/")) return { label: "① 角色设定", order: 0 };
  if (rel.indexOf("生成提示词") >= 0) return { label: "③ 生成提示词", order: 2 };
  return { label: "② 大纲与分镜", order: 1 };
}
function innerOrder(rel) {
  if (rel.startsWith("characters/")) {
    const seg = rel.split("/")[1];
    const map = { "雨宫太木": 0, "綾乃川澪": 1, "日向步": 2, "月花梨": 3, "水无月千井": 4, "北村一诚": 5 };
    if (map[seg] != null) return map[seg];
    return 9;
  }
  const name = rel.split("/").pop();
  if (name === "agent.md") return 0;
  if (name === "outline.md") return 1;
  if (name === "script.md") return 2;
  if (rel.indexOf("生成提示词") >= 0) {
    const m = rel.match(/P(\d+)/);
    return m ? parseInt(m[1], 10) : 10;
  }
  return 5;
}

/* ---------- 主流程 ---------- */
async function main() {
  let relPaths = await collectMd(ROOT, "", []);
  relPaths = relPaths.filter((r) => r !== "agent.md"); // 工作流规范不入阅读器
  relPaths.sort((a, b) => groupOf(a).order - groupOf(b).order || innerOrder(a) - innerOrder(b) || a.localeCompare(b, "zh"));

  console.log("发现 " + relPaths.length + " 个 md 文件:");
  const books = [];
  const bookTitle = "视频生成剧本工作流";

  for (const rel of relPaths) {
    console.log("  · " + rel);
    let raw = await readFile(path.join(ROOT, rel), "utf8");
    raw = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    const id = rel.replace(/\.md$/i, "");
    const h1m = raw.match(/^#\s+(.*)$/m);
    const title = h1m ? h1m[1].trim() : id.split("/").pop();
    const parsed = parseBlocks(raw, title);
    const totalLen = raw.replace(/\s/g, "").length;
    const g = groupOf(rel);
    books.push({
      id, title,
      metaChapter: false,
      groupLabel: g.label,
      dayLabel: "",
      dayOrder: g.order,
      badge: "",
      wordCount: totalLen,
      min: Math.max(1, Math.round(totalLen / 400)),
      html: parsed.html,
      text: raw,
      scenes: parsed.scenes,
      imgs: parsed.imgCount || 0,
      paraCount: parsed.paraCount || 0
    });
  }

  // 目录分组顺序
  const groups = [];
  const seen = new Set();
  books.forEach((b) => { if (!seen.has(b.groupLabel)) { seen.add(b.groupLabel); groups.push({ key: b.groupLabel, order: b.dayOrder }); } });
  groups.sort((a, b) => a.order - b.order);
  const groupOrder = {};
  groups.forEach((g, i) => { groupOrder[g.key] = i; });
  books.forEach((b) => { b.groupIdx = groupOrder[b.groupLabel]; });

  // GSAP 拉取(离线回退)
  let gsapCore = "", gsapST = "";
  try {
    const sig = AbortSignal.timeout(9000);
    const urls = [
      "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js",
      "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js"
    ];
    const [a, b] = await Promise.all(urls.map((u) => fetch(u, { signal: sig }).then((r) => (r.ok ? r.text() : Promise.reject(new Error("http " + r.status))))));
    if (a.includes("gsap") && a.length > 30000 && b.includes("ScrollTrigger")) { gsapCore = a; gsapST = b; }
  } catch (e) { console.log("  (离线: 使用内置迷你动效引擎)"); }

  const tpl = await readFile(path.join(SRC, "ui.html"), "utf8");
  const css = await readFile(path.join(SRC, "style.css"), "utf8");
  const app = await readFile(path.join(SRC, "app.js"), "utf8");
  const fallback = await readFile(path.join(SRC, "motion-fallback.js"), "utf8");

  const dataJson = JSON.stringify({
    title: bookTitle,
    updated: new Date().toISOString().slice(0, 10),
    books
  }).replace(/</g, "\u003c").replace(/>/g, "\u003e");

  const motion = (gsapCore ? (gsapCore + "\n" + gsapST) : fallback);

  let out = tpl;
  out = out.replace("__TITLE__", () => esc(bookTitle) + " · 离线阅读器");
  out = out.replace("/*__CSS__*/", () => css);
  out = out.replace("/*__GSAP__*/", () => motion);
  out = out.replace("/*__BOOKS_JSON__*/", () => dataJson);
  out = out.replace("/*__APP__*/", () => app);

  await writeFile(OUT, out, "utf8");
  console.log("\n✓ 已生成 " + OUT);
  console.log("  文档: " + books.length + " 篇 | 总字数: " + books.reduce((s, b) => s + b.wordCount, 0).toLocaleString("zh-CN"));
  console.log("  动效引擎: " + (gsapCore ? "GSAP 3.12.5" : "内置迷你引擎") + " | 双击 阅读器.html 即可阅读");
}

main().catch((e) => { console.error(e); process.exit(1); });
