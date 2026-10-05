/* ================= Aster 阅读器 · 交互引擎 ================= */
(function () {
"use strict";

/* ---------- 数据 ---------- */
var BOOK = window.BOOK_DATA || { title: "阅读器", updated: "", books: [] };
var LS = {
  settings: "vsw-reader.settings",
  progress: "vsw-reader.progress",
  marks: "vsw-reader.marks",
  bookmarks: "vsw-reader.bookmarks",
  imports: "vsw-reader.imports",
  last: "vsw-reader.last",
  stats: "vsw-reader.stats",
  books: "vsw-reader.books"
};
var DEFAULTS = {
  theme: "night", size: 18, lh: 170, pg: 105, ls: 0, width: "std",
  indent: true, dropcap: true, semantic: true, openingTitle: true,
  fontBody: "serif", webFont: false, autoSpeed: 1, sidePin: true, shelfHome: true,
  coverSkin: "classic", hue: 38, lum: 12, goalMin: 0, ttsRate: 1, ttsVoice: "", vertical: false, themeAuto: false, autoNext: true, breakMin: 0
};
var store = { settings: null, progress: {}, marks: [], bookmarks: [], imports: [], last: null };
var S = {};
var state = { idx: 0, query: "", auto: false, autoLast: 0, paraFocus: false, focusP: 0, anchor: null, anchorTimer: null };
var stat = { runCh: null, runPct: {}, actAt: 0, lastPersist: 0 };
var breakAcc = 0;

var $ = function (s, c) { return (c || document).querySelector(s); };
var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
var esc = function (s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
};
var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var AUTO_SPEEDS = { 0: 0.3, 1: 0.55, 2: 0.95, 3: 1.6 };
var AUTO_LABEL = { 0: "舒缓", 1: "匀速", 2: "轻快", 3: "疾驰" };

function loadStore() {
  try { store.settings = JSON.parse(localStorage.getItem(LS.settings) || "null"); } catch (e) {}
  try { store.progress = JSON.parse(localStorage.getItem(LS.progress) || "{}"); } catch (e) {}
  try { store.marks = JSON.parse(localStorage.getItem(LS.marks) || "[]"); } catch (e) {}
  try { store.bookmarks = JSON.parse(localStorage.getItem(LS.bookmarks) || "[]"); } catch (e) {}
  try { store.imports = JSON.parse(localStorage.getItem(LS.imports) || "[]"); } catch (e) {}
  try { store.last = JSON.parse(localStorage.getItem(LS.last) || "null"); } catch (e) {}
  try {
    var st = JSON.parse(localStorage.getItem(LS.stats) || "null");
    if (st && typeof st === "object" && typeof st.totalSec === "number" && st.days && typeof st.days === "object") {
      store.stats = { totalSec: st.totalSec || 0, days: st.days, chapters: (st.chapters && typeof st.chapters === "object") ? st.chapters : {} };
    } else store.stats = { totalSec: 0, days: {}, chapters: {} };
  } catch (e) { store.stats = { totalSec: 0, days: {}, chapters: {} }; }
}
function persist(key, val, silent) {
  try { localStorage.setItem(key, JSON.stringify(val)); }
  catch (e) { if (!silent) toast("浏览器存储已满：部分数据可能无法保存", 3400); }
}
function saveSettings() { persist(LS.settings, S); }

function books() { return BOOK.books.concat(store.imports); }
function currentBook() { return books()[state.idx]; }

/* ---------- 设置 ---------- */
function themeFade() {
  var b = document.body;
  b.classList.remove("theme-fade");
  void b.offsetWidth;
  b.classList.add("theme-fade");
  setTimeout(function () { b.classList.remove("theme-fade"); }, 380);
}
function applySettings() {
  var r = document.documentElement, b = document.body;
  var eff = S.theme;
  if (S.themeAuto) {
    var light = false;
    try { light = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches; } catch (e) {}
    eff = light ? "day" : "night";
  }
  var prevTheme = r.getAttribute("data-theme");
  r.setAttribute("data-theme", eff);
  if (prevTheme && prevTheme !== eff) themeFade();
  if (eff === "mine" && !S.themeAuto) applyMinePalette();
  else clearMinePalette();
  b.setAttribute("data-cover", S.coverSkin || "classic");
  b.classList.toggle("vertical-on", !!S.vertical);
  r.style.setProperty("--fs", S.size + "px");
  r.style.setProperty("--lh", String(S.lh / 100));
  r.style.setProperty("--pg", (S.pg / 100) + "em");
  r.style.setProperty("--ls", (S.ls / 100) + "em");
  r.style.setProperty("--indent", S.indent ? "2em" : "0");
  var mwEm = S.width === "narrow" ? 33 : S.width === "wide" ? 44 : 38;
  r.style.setProperty("--mw", Math.round(mwEm * S.size) + "px");
  b.classList.toggle("no-indent", !S.indent);
  b.classList.toggle("no-dropcap", !S.dropcap);
  b.classList.toggle("semantic-off", !S.semantic);
  b.classList.remove("f-sans", "f-kai", "f-round");
  if (S.fontBody === "sans") b.classList.add("f-sans");
  if (S.fontBody === "kai") b.classList.add("f-kai");
  if (S.fontBody === "round") b.classList.add("f-round");
  webfont();
  updateFavicon();
}

function updateFavicon() {
  var link = document.querySelector("link[rel='icon']");
  if (!link) return;
  var c = "%23cf915a";
  try {
    var v = getComputedStyle(document.documentElement).getPropertyValue("--accent-ink").trim();
    if (v) c = encodeURIComponent(v);
  } catch (e) {}
  link.href = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21z' fill='none' stroke='" + c + "' stroke-width='1.8' stroke-linejoin='round'/%3E%3Cpath d='M4 18.5A2.5 2.5 0 0 1 6.5 16H20' fill='none' stroke='" + c + "' stroke-width='1.8'/%3E%3C/svg%3E";
}

function hslStr(h, s, l) { return "hsl(" + h + ", " + s + "%, " + l + "%)"; }
function calcMinePalette() {
  var h = S.hue, lum = S.lum, dark = lum <= 50;
  var bg = lum;
  var paper = dark ? Math.min(50, lum + 5) : Math.max(55, lum - 5);
  var bg2 = dark ? Math.max(2, lum - 2) : Math.min(97, lum + 2);
  var paper2 = dark ? Math.min(50, lum + 9) : Math.max(55, lum - 9);
  var line = dark ? hslStr(h, 16, Math.min(70, lum + 12)) : hslStr(h, 12, Math.max(12, lum - 12));
  var line2 = dark ? hslStr(h, 16, Math.min(64, lum + 8)) : hslStr(h, 10, Math.max(10, lum - 8));
  var accent = dark ? hslStr(h, 55, 62) : hslStr(h, 48, 40);
  var accentInk = dark ? hslStr(h, 60, 76) : hslStr(h, 50, 30);
  return {
    "--bg": bg, "--bg2": bg2, "--paper": paper, "--paper2": paper2,
    "--ink": dark ? hslStr(h, 24, 88) : hslStr(h, 14, 14),
    "--ink2": dark ? hslStr(h, 16, 72) : hslStr(h, 10, 38),
    "--ink3": dark ? hslStr(h, 12, 56) : hslStr(h, 8, 52),
    "--line": line, "--line2": line2,
    "--accent": accent, "--accent-ink": accentInk,
    "--accent-soft": "hsla(" + h + ", 55%, 62%, " + (dark ? ".16" : ".14") + ")",
    "--sel": "hsla(" + h + ", 55%, 62%, .32)",
    "--mine-bg": bg2, "--mine-accent": accent
  };
}
var MINE_KEYS = ["--bg", "--bg2", "--paper", "--paper2", "--ink", "--ink2", "--ink3", "--line", "--line2", "--accent", "--accent-ink", "--accent-soft", "--sel", "--mine-bg", "--mine-accent"];
function applyMinePalette() {
  var r = document.documentElement;
  var m = calcMinePalette();
  Object.keys(m).forEach(function (k) { r.style.setProperty(k, m[k]); });
  r.style.colorScheme = (S.lum <= 50) ? "dark" : "light";
}
function clearMinePalette() {
  var r = document.documentElement;
  MINE_KEYS.forEach(function (k) { r.style.removeProperty(k); });
  r.style.colorScheme = "";
}
function syncMinePalette() {
  var m = calcMinePalette();
  var pv = $("#mine-preview"); if (pv) pv.style.background = m["--paper"];
  var e;
  e = $("#mine-ink"); if (e) e.style.background = m["--ink"];
  e = $("#mine-ink2"); if (e) e.style.background = m["--line"];
  e = $("#mine-mono"); if (e) e.style.background = m["--ink2"];
  e = $("#mine-dlg"); if (e) e.style.background = m["--accent"];
}
function webfont() {
  var id = "link-webfont";
  if (S.webFont) {
    if (!document.getElementById(id)) {
      var l = document.createElement("link");
      l.id = id; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=LXGW+WenKai&family=Noto+Serif+SC:wght@400;600;700&family=Noto+Sans+SC:wght@400;500;600&display=swap";
      document.head.appendChild(l);
    }
  } else {
    var old = document.getElementById(id);
    if (old) old.remove();
  }
}

/* ---------- 滚动 / 进度 ---------- */
function axY() { return S.vertical ? window.scrollX : window.scrollY; }
function axMax() {
  var d = document.documentElement;
  return S.vertical ? Math.max(0, d.scrollWidth - window.innerWidth) : Math.max(0, d.scrollHeight - window.innerHeight);
}
function axScroll(v, behavior) {
  if (S.vertical) window.scrollTo({ left: v, behavior: behavior || "instant" });
  else window.scrollTo({ top: v, behavior: behavior || "instant" });
}
function elOff(el, off) {
  var r = el.getBoundingClientRect();
  return S.vertical ? (r.left + window.scrollX - (off || 0)) : (r.top + window.scrollY - (off || 0));
}
function scrollPct() {
  var max = axMax();
  return max > 4 ? Math.min(1, axY() / max) : 0;
}
function updateSpine() {
  var f = $("#spine-fill");
  if (f) f.style.transform = "scaleX(" + scrollPct() + ")";
  var pctTxt = $("#foot-pct");
  if (pctTxt) pctTxt.textContent = Math.round(scrollPct() * 100) + "%";
  var tp = $("#tb-pct");
  if (tp) tp.textContent = Math.round(scrollPct() * 100) + "%";
  var tpEl = $("#toc-pct");
  if (tpEl && tpEl.offsetParent !== null) {
    var pv = String(Math.round(scrollPct() * 100));
    if (tpEl.value !== pv) tpEl.value = pv;
    var vl = $("#toc-pct-val");
    if (vl) vl.textContent = pv + "%";
  }
}
function saveProgress() {
  var b = currentBook(); if (!b) return;
  var pct = Math.round(scrollPct() * 100);
  store.progress[b.id] = pct;
  var p0 = stat.runPct[b.id] || 0;
  if (pct > p0 && b.wordCount) {
    var dd = statEnsureDay(dayKey());
    dd.words += Math.round(b.wordCount * (pct - p0) / 100);
  }
  stat.runPct[b.id] = pct;
  var ch = statEnsureCh(b.id);
  if (pct > (ch.lastPct || 0)) ch.lastPct = pct;
  if (pct >= 98) ch.done = true;
  persist(LS.progress, store.progress, true);
  updateTocBars();
}
var _saveTimer = null;
function queueSaveProgress() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveProgress, 500);
}

/* ---------- 阅读统计 ---------- */
function dayKey(d) {
  d = d || new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}
function statEnsureDay(k) { if (!store.stats.days[k]) store.stats.days[k] = { sec: 0, words: 0 }; return store.stats.days[k]; }
function statEnsureCh(id) { if (!store.stats.chapters[id]) store.stats.chapters[id] = { sec: 0, lastPct: 0, done: false }; return store.stats.chapters[id]; }
function statActive() { return document.visibilityState !== "hidden" && (Date.now() - stat.actAt) < 90000; }
function statTick() {
  if (!statActive()) return;
  var d = statEnsureDay(dayKey());
  d.sec += 10; store.stats.totalSec += 10;
  if (stat.runCh) statEnsureCh(stat.runCh).sec += 10;
  if (S.breakMin > 0) { breakAcc += 10; maybeBreak(); }
  checkCelebrate();
  if (Date.now() - stat.lastPersist > 30000) { stat.lastPersist = Date.now(); persist(LS.stats, store.stats, true); }
}
function persistStatsNow() { persist(LS.stats, store.stats, true); }
function markActivity() { stat.actAt = Date.now(); }
function initStats() {
  window.__reader = window.__reader || {};
  window.__reader.setStats = function (s) {
    if (s && typeof s === "object") { store.stats = s; persist(LS.stats, s, true); renderStatsPanel(); checkCelebrate(); }
  };
  window.__reader.jumpBreak = function (sec) { breakAcc = sec || 0; maybeBreak(); };
  stat.actAt = Date.now();
  setInterval(statTick, 10000);
  window.addEventListener("pagehide", persistStatsNow);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") persistStatsNow();
    else stat.actAt = Date.now();
  });
  document.addEventListener("keydown", markActivity, { passive: true });
  document.addEventListener("mousedown", markActivity, { passive: true });
  document.addEventListener("touchstart", markActivity, { passive: true });
}
function maybeBreak() {
  if (!S.breakMin) return;
  if (breakAcc >= S.breakMin * 60) {
    var bb = $("#break-banner");
    if (bb && bb.hidden) {
      var bt = $("#break-txt");
      if (bt) bt.textContent = "已经连续专心读了 " + S.breakMin + " 分钟，起来伸个懒腰";
      bb.hidden = false;
    }
  }
}
function statStreak() {
  var n = 0;
  while (n < 365) {
    var d2 = new Date(); d2.setDate(d2.getDate() - n);
    var dd = store.stats.days[dayKey(d2)];
    if (dd && (dd.sec || 0) > 60) n++;
    else break;
  }
  return n;
}
function hideCelebrate() { var c = $("#celebrate"); if (c) c.hidden = true; }
function checkCelebrate() {
  if (!(S.goalMin > 0)) return;
  var d = store.stats.days[dayKey()] || { sec: 0 };
  if (Math.floor(d.sec / 60) < S.goalMin) return;
  if (store.stats.lastCelebrate === dayKey()) return;
  store.stats.lastCelebrate = dayKey();
  persist(LS.stats, store.stats, true);
  var c = $("#celebrate");
  if (c) {
    c.hidden = false;
    if (window.gsap && !reduced) {
      window.gsap.fromTo(c, { opacity: 0, scale: .8, y: 10 }, { opacity: 1, scale: 1, y: 0, duration: .5, ease: "power2.out" });
      setTimeout(hideCelebrate, 2600);
    } else setTimeout(hideCelebrate, 3000);
  }
}
function fmtMm(sec) {
  var m = Math.round(sec / 60);
  if (m < 60) return m + " 分钟";
  return Math.floor(m / 60) + " 时 " + (m % 60) + " 分";
}
function renderStatsPanel() {
  var k = dayKey(), d = store.stats.days[k] || { sec: 0, words: 0 };
  var mn = document.getElementById("stat-today-min"); if (mn) mn.textContent = String(Math.floor(d.sec / 60));
  var tw = document.getElementById("stat-today-words"); if (tw) tw.textContent = String(d.words || 0);
  var tot = document.getElementById("stat-total"); if (tot) tot.textContent = fmtMm(store.stats.totalSec || 0);
  var tww = document.getElementById("stat-total-words");
  if (tww) {
    var sum = 0; for (var kk in store.stats.days) sum += store.stats.days[kk] ? (store.stats.days[kk].words || 0) : 0;
    tww.textContent = String(sum);
  }
  var gmin = S.goalMin || 0, doneM = Math.floor(d.sec / 60);
  var gw = document.getElementById("stat-goal-wrap");
  if (gw) {
    gw.style.display = "";
    var gv = document.getElementById("stat-goal-val"); if (gv) gv.textContent = gmin > 0 ? doneM + " / " + gmin + " 分钟" : "未设定";
    var gi = document.getElementById("goal-bar-i"); if (gi) gi.style.width = gmin > 0 ? Math.min(100, Math.round(doneM / Math.max(1, gmin) * 100)) + "%" : "0%";
    var gnote = document.getElementById("stat-goal-note");
    if (gnote) gnote.textContent = gmin > 0 ? (doneM >= gmin ? "今日目标已达成，读得漂亮。" : "还差 " + (gmin - doneM) + " 分钟，稳住节奏。") : "给自己定个小目标，坚持每天读一点。";
  }
  var st = document.getElementById("stat-streak");
  if (st) {
    var streak = statStreak();
    var totalDays = 0;
    Object.keys(store.stats.days).forEach(function (k2) { if ((store.stats.days[k2] || {}).sec > 60) totalDays++; });
    var doneC = 0;
    books().forEach(function (bb) { if ((store.progress[bb.id] || 0) >= 98) doneC++; });
    st.textContent = "连续 " + streak + " 天 · 累计 " + totalDays + " 天 · 已读完 " + doneC + " 篇";
  }
  var chart = document.getElementById("stat-chart");
  if (chart) {
    var cols = [];
    for (var i = 6; i >= 0; i--) {
      var dt = new Date(); dt.setDate(dt.getDate() - i);
      var key2 = dayKey(dt);
      var dd2 = store.stats.days[key2] || { sec: 0 };
      cols.push({ label: (dt.getMonth() + 1) + "/" + dt.getDate(), sec: dd2.sec || 0 });
    }
    var maxSec = 1;
    cols.forEach(function (x) { if (x.sec > maxSec) maxSec = x.sec; });
    var html = "";
    cols.forEach(function (x) {
      var h = Math.max(4, Math.round((x.sec / maxSec) * 92));
      html += '<div class="chart-col"><div class="chart-bar" style="height:' + h + 'px" title="' + Math.round(x.sec / 60) + ' 分钟"><i></i></div><div class="chart-cap">' + x.label + "</div></div>";
    });
    chart.innerHTML = html;
  }
  $$("#goal-chips .chip-btn").forEach(function (c) { c.classList.toggle("active", parseInt(c.getAttribute("data-gmin"), 10) === (S.goalMin || 0)); });
}

/* ---------- 目录 ---------- */
function buildToc() {
  var nav = $("#toc"); if (!nav) return;
  var bs = books();
  var filter = ($("#toc-filter") ? $("#toc-filter").value : "").toLowerCase();
  var groups = [], seen = {};
  bs.forEach(function (b) {
    var g = b.groupLabel || "其他";
    if (!seen[g]) { seen[g] = true; groups.push(g); }
  });
  var html = "";
  groups.forEach(function (g) {
    html += '<div class="toc-group"><div class="toc-group-label">' + esc(g) + "</div>";
    bs.forEach(function (b, i) {
      if ((b.groupLabel || "其他") !== g) return;
      if (filter && b.title.toLowerCase().indexOf(filter) < 0 && (b.dayLabel || "").toLowerCase().indexOf(filter) < 0) return;
      var pct = store.progress[b.id] || 0;
      html += '<button class="toc-item' + (i === state.idx ? " active" : "") + '" data-idx="' + i + '">' +
        '<span class="toc-no">' + esc(b.seal || pad2(i + 1)) + "</span>" +
        '<span class="toc-txt"><span class="toc-title">' + esc(b.title) + "</span>" +
        '<span class="toc-bar"><i style="width:' + pct + '%"></i></span></span>' +
        (pct >= 98 ? '<span class="toc-done" title="已读完">✓</span>' : "") +
        (b.badge ? '<span class="toc-badge">' + esc(b.badge) + "</span>" : "") +
        (b.imported ? '<span class="toc-del" data-imp-id="' + esc(b.id) + '" title="删除导入">' + iconSvg("i-trash", 13) + "</span>" : "") +
        "</button>";
      if (i === state.idx && b.scenes && b.scenes.length && !filter) {
        b.scenes.forEach(function (sc) {
          html += '<button class="toc-scene" data-scene="' + esc(sc.id) + '">' + esc(sc.label) + "</button>";
        });
      }
    });
    html += "</div>";
  });
  if (!bs.length) html = '<div class="bm-empty">（未找到任何章节：请双击「更新章节.bat」，或把 md 文件拖进本页面）</div>';
  nav.innerHTML = html;
}
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function iconSvg(id, size) {
  return '<svg class="ic" style="width:' + size + "px;height:" + size + 'px"><use href="#' + id + '"/></svg>';
}
function updateTocBars() {
  $$("#toc .toc-bar i").forEach(function (el) {
    var item = el.closest(".toc-item"); if (!item) return;
    var b = books()[parseInt(item.getAttribute("data-idx"), 10)];
    if (b) el.style.width = (store.progress[b.id] || 0) + "%";
  });
}
function markTocActive() {
  $$("#toc .toc-item").forEach(function (el) {
    el.classList.toggle("active", parseInt(el.getAttribute("data-idx"), 10) === state.idx);
  });
  var scenes = $$("#toc .toc-scene");
  if (!scenes.length) return;
  var chBody = $("#ch-body");
  if (!chBody) return;
  var current = null, els = $$("#ch-body h2[id]");
  var probe = window.scrollY + 110;
  els.forEach(function (h) {
    if (h.getBoundingClientRect().top + window.scrollY <= probe) current = h.id;
  });
  scenes.forEach(function (s) { s.classList.toggle("active", s.getAttribute("data-scene") === current); });
  $$("#scene-nav .seg").forEach(function (sg) { sg.classList.toggle("on", sg.getAttribute("data-scene") === current); });
}

/* ---------- 渲染章节 ---------- */
function renderChapter(idx, opts) {
  opts = opts || {};
  var bs = books();
  if (!bs.length) { $("#chapter").innerHTML = '<p class="sys">暂无内容</p>'; return; }
  idx = Math.max(0, Math.min(bs.length - 1, idx));
  state.idx = idx;
  if (tts.on && !opts.keep) ttsStop();
  cancelAutoNext();
  var keepY = opts.keep ? window.scrollY : null;
  var b = bs[idx];
  stat.runCh = b.id;
  store.last = { idx: idx };
  persist(LS.last, store.last, true);

  var segsHtml = "";
  if (b.scenes && b.scenes.length) {
    b.scenes.forEach(function (sc, i) {
      segsHtml += '<button class="seg" data-scene="' + esc(sc.id) + '">场景 ' + (i + 1) + " · " + esc(stripSceneLabel(sc.label)) + "</button>";
    });
  }
  var gate = S.openingTitle !== false && !opts.keep && !document.body.classList.contains("shelf-on");
  var chMeta = b.wordCount + ' 字<span class="sep">·</span>约 ' + b.min + ' 分钟<span class="sep">·</span>' + esc(b.groupLabel || '') + (b.badge ? '<span class="sep">·</span>' + esc(b.badge) : '');
  var headHtml = '<header class="ch-head' + (gate ? ' ch-gate' : '') + '">';
  headHtml += gate
    ? '<div class="gate-kicker">' + esc(b.dayLabel || b.groupLabel || "") + "</div>" +
      '<div class="gate-no">' + esc(b.seal || ("第 " + (idx + 1) + " 篇")) + "</div>" +
      "<h1>" + esc(b.title) + "</h1>" +
      '<div class="ch-flourish"><i></i><span>✦</span><i></i></div>' +
      '<div class="ch-meta">' + chMeta + "</div>"
    : '<div class="seal">' + esc(b.seal || ("第 " + (idx + 1) + " 篇")) +
      '<span class="seal-day">' + esc(b.dayLabel || "") + "</span></div>" +
      "<h1>" + esc(b.title) + "</h1>" +
      '<div class="ch-flourish"><i></i><span>✦</span><i></i></div>' +
      '<div class="ch-meta">' + chMeta + "</div>";
  headHtml += "</header>";
  var endHtml;
  if (state.idx === bs.length - 1) {
    endHtml = '<div class="ch-end">' +
      '<div class="ch-end-orn">✦ ✦ ✦</div>' +
      '<div class="ch-end-t">全 书 终</div>' +
      '<div class="ch-end-sub">' + esc(BOOK.title) + " · 共 " + bs.length + " 篇 · 累计精读 " + fmtMm(store.stats.totalSec || 0) + " · 感谢读完</div>" +
      '<div class="ch-end-acts"><button class="chip-btn" id="btn-end-shelf">回到书架</button><button class="chip-btn ghost" id="btn-end-start">从头再读</button></div>' +
      '<div class="ch-colophon">' + esc(b.title) + " · " + b.wordCount + " 字 · 完</div>" +
      "</div>";
  } else {
    var csec = (store.stats.chapters[b.id] || {}).sec || 0;
    var mRead = Math.max(0, Math.round(csec / 60));
    var rem = 0;
    for (var k = state.idx; k < bs.length; k++) rem += bs[k].wordCount || 0;
    rem -= Math.round((b.wordCount || 0) * Math.min(1, scrollPct()));
    var remMin = Math.max(1, Math.ceil(rem / 400));
    var remTxt = remMin < 60 ? ("约 " + remMin + " 分钟") : ("约 " + Math.floor(remMin / 60) + " 时 " + (remMin % 60) + " 分");
    endHtml = '<div class="endmark">—— 本章完 ——</div>' +
      '<div class="ch-colophon">' + esc(b.title) + " · " + b.wordCount + " 字" +
      (mRead > 0 ? " · 本章已读 " + mRead + " 分钟" : "") +
      " · 全书剩余 " + remTxt + " · " + esc(b.dayLabel || b.groupLabel || "") + "</div>";
  }
  $("#chapter").innerHTML = headHtml +
    '<div class="ch-body" id="ch-body">' + b.html + "</div>" + endHtml;
  var sn = $("#scene-nav");
  if (sn) {
    sn.innerHTML = segsHtml;
    sn.hidden = !(b.scenes && b.scenes.length);
  }

  var bodyEl = $("#ch-body");
  if (!bodyEl) {
    try {
      var chEl = $("#chapter");
      console.error("RENDER-ANOMALY", JSON.stringify({ bs: bs.length, hasChapter: !!chEl, chapterHtmlLen: chEl ? chEl.innerHTML.length : -1, emptySys: chEl ? (chEl.innerHTML.indexOf("暂无内容") >= 0) : false, hash: location.hash }));
    } catch (e2) { console.error("RENDER-ANOMALY-ERR", e2); }
    return;
  }
  var eb1 = $("#btn-end-shelf");
  if (eb1) eb1.addEventListener("click", function () { showShelf(); });
  var eb2 = $("#btn-end-start");
  if (eb2) eb2.addEventListener("click", function () { renderChapter(0, { to: "top", flip: true }); });
  var firstP = bodyEl.firstElementChild;
  if (S.dropcap && firstP && firstP.tagName === "P" &&
      !firstP.classList.contains("mono") && !firstP.classList.contains("stage") && !firstP.classList.contains("sys")) {
    firstP.classList.add("dc");
  }
  $$("#ch-body p").forEach(function (p, i) {
    p.setAttribute("data-p", String(i));
  });
  if (state.paraFocus) {
    if (state.focusP >= $$("#ch-body p").length) state.focusP = 0;
    setParaFocus(state.focusP, false);
  }
  if (!reduced) {
    $$("#ch-body h2[id], #ch-body h3").forEach(function (h) {
      if (h.getBoundingClientRect().top > window.innerHeight) {
        h.classList.add("scene-wait");
        var io = new IntersectionObserver(function (es) {
          es.forEach(function (en) {
            if (en.isIntersecting) { en.target.classList.add("scene-in"); io.disconnect(); }
          });
        }, { rootMargin: "0px 0px -10% 0px" });
        io.observe(h);
      }
    });
  }
  $$("#ch-body p").forEach(function (p) {
    var pid = p.getAttribute("data-p");
    if (store.bookmarks.some(function (bm) { return bm.ch === b.id && String(bm.p) === String(pid); })) p.classList.add("bm");
  });
  applyMarks(b.id);
  if (state.query) applySearch();
  $$("#ch-body p").forEach(function (p) {
    var btn = document.createElement("button");
    btn.className = "p-bm";
    btn.setAttribute("aria-label", "书签");
    btn.setAttribute("title", "添加/移除书签");
    btn.innerHTML = iconSvg("i-bookmark", 14);
    p.appendChild(btn);
  });

  $("#tb-book").textContent = BOOK.title;
  $("#tb-ch").textContent = b.title;
  $("#btn-prev").disabled = state.idx <= 0;
  var hasNext = state.idx < bs.length - 1;
  $("#btn-next").disabled = !hasNext;
  $("#btn-next-label").textContent = hasNext ? "下一章" : "已读完";
  $("#foot-pos").textContent = (state.idx + 1) + " / " + bs.length + " 篇";

  var anim = bodyEl;
  var gateEl = gate ? $("#chapter .ch-gate") : null;
  anim.classList.remove("anim-in");
  void anim.offsetWidth;
  if (window.gsap && !reduced && !window.gsapFallback) {
    if (gateEl && gateEl.children.length) {
      window.gsap.fromTo(Array.prototype.slice.call(gateEl.children), { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out", stagger: 0.07, clearProps: "opacity,transform" });
    }
    window.gsap.fromTo(anim, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.42, ease: "power2.out", clearProps: "opacity,transform" });
  } else {
    anim.classList.add("anim-in");
    if (gateEl) {
      gateEl.classList.remove("gate-anim");
      void gateEl.offsetWidth;
      gateEl.classList.add("gate-anim");
    }
  }

  requestAnimationFrame(function () {
    if (keepY != null) { axScroll(keepY); return; }
    if (opts.to === "scene") {
      var h = document.getElementById(opts.id);
      if (h) {
        var st = elOff(h, 96);
        axScroll(st);
        if (opts.lock) setTimeout(function () { axScroll(st); }, 340);
      }
      else axScroll(0);
    } else if (opts.to === "top") {
      axScroll(0);
    } else {
      var saved = (opts.pct != null) ? opts.pct : store.progress[b.id];
      if (saved && saved > 1) {
        axScroll(saved >= 98 ? axMax() : (saved / 100) * axMax());
      } else axScroll(0);
    }
  });

  applyHash(state.idx, (opts.to === "scene" && opts.id) ? opts.id : null);
  if (opts.flip !== false && !document.body.classList.contains("shelf-on")) pageFlipIn();
  buildToc();
  markTocActive();
  updateSpine();
}
function scrollToParagraph(chId, pIdx) {
  var b = currentBook(); if (!b || b.id !== chId) return;
  var ps = $$("#ch-body p");
  var t = null;
  ps.forEach(function (p) { if (p.getAttribute("data-p") === String(pIdx)) t = p; });
  if (t) axScroll(elOff(t, 120), reduced ? "auto" : "smooth");
  else axScroll(0);
}

/* ---------- 划线 ---------- */
function charIndex(container, node, offset) {
  var idx = 0, found = false;
  var w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  var n;
  while ((n = w.nextNode())) {
    if (n === node) { idx += offset; found = true; break; }
    idx += n.textContent.length;
  }
  return found ? idx : -1;
}
function applyMarks(chId) {
  var ps = $$("#ch-body p");
  if (!ps.length || !store.marks.length) return;
  ps.forEach(function (p) {
    var chMarks = store.marks.filter(function (m) {
      return m.ch === chId && String(m.p) === p.getAttribute("data-p");
    });
    if (!chMarks.length) return;
    // 从后往前处理, 保证前缀偏移不被后续节点替换影响
    chMarks.sort(function (a, b2) { return b2.start - a.start; });
    var nodes = [];
    var w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = w.nextNode())) {
      var pn = n.parentNode;
      if (pn && (pn.tagName === "BUTTON" || pn.tagName === "SCRIPT" || pn.tagName === "STYLE")) continue;
      nodes.push(n);
    }
    var total = 0, nodeStart = [];
    nodes.forEach(function (tn) { nodeStart.push(total); total += tn.textContent.length; });
    chMarks.forEach(function (m) {
      var s = Math.max(0, Math.min(total, m.start));
      var e = Math.max(s, Math.min(total, m.end));
      if (e <= s) return;
      for (var i = 0; i < nodes.length; i++) {
        var ns = nodeStart[i], nt = nodes[i].textContent.length, ne = ns + nt;
        if (ne <= s || ns >= e) continue;
        var from = Math.max(0, s - ns);
        var to = Math.min(nt, e - ns);
        var tn2 = nodes[i];
        var head = tn2.textContent.slice(0, from);
        var mid = tn2.textContent.slice(from, to);
        var tail = tn2.textContent.slice(to);
        var mk = document.createElement("mark");
        mk.className = "hl";
        mk.setAttribute("data-mid", String(m.t));
        mk.textContent = mid;
        var frag = document.createDocumentFragment();
        if (head) frag.appendChild(document.createTextNode(head));
        frag.appendChild(mk);
        if (tail) frag.appendChild(document.createTextNode(tail));
        tn2.parentNode.replaceChild(frag, tn2);
      }
    });
  });
}

/* ---------- 搜索 ---------- */
var searchCache = [];
function doSearch(q) {
  var box = $("#search-results"), hint = $("#search-hint");
  if (!q) {
    box.innerHTML = "";
    hint.style.display = "";
    state.query = "";
    applySearch();
    return;
  }
  q = q.toLowerCase();
  searchCache = [];
  books().forEach(function (b, bi) {
    var t = b.text.toLowerCase(), pos = -1;
    while ((pos = t.indexOf(q, pos + 1)) !== -1 && searchCache.length < 400) {
      searchCache.push({ bi: bi, pos: pos });
    }
  });
  if (!searchCache.length) {
    box.innerHTML = '<div class="empty"><span class="empty-ic">' + iconSvg("i-search", 24) + '</span><div class="empty-t">没有找到相关段落</div><div class="empty-s">没有与「' + esc(q) + '」匹配的内容，换个关键词试试</div></div>';
    hint.style.display = "none";
    return;
  }
  var lastBi = -1, html = "";
  searchCache.forEach(function (m, i) {
    var b = books()[m.bi];
    if (m.bi !== lastBi) {
      html += '<div class="result-ch">' + esc(b.title) + " · " + esc(b.dayLabel || b.groupLabel || "") + "</div>";
      lastBi = m.bi;
    }
    var s = Math.max(0, m.pos - 24);
    var e = Math.min(b.text.length, m.pos + q.length + 30);
    var snip = (s > 0 ? "…" : "") + esc(b.text.slice(s, m.pos)) +
      "<b>" + esc(b.text.slice(m.pos, m.pos + q.length)) + "</b>" + esc(b.text.slice(m.pos + q.length, e)) +
      (e < b.text.length ? "…" : "");
    html += '<button class="result-item" data-mi="' + i + '">' + snip + '<span class="r-meta">' + pad2(Math.round((m.pos / Math.max(1, b.text.length)) * 100)) + "% 处</span></button>";
  });
  box.innerHTML = html;
  hint.style.display = "none";
}
function applySearch() {
  var bodyEl = $("#ch-body");
  if (!bodyEl) return;
  $$("#ch-body mark.srch").forEach(function (m) {
    m.replaceWith(document.createTextNode(m.textContent));
  });
  var q = state.query.toLowerCase();
  if (!q) return;
  var walk = document.createTreeWalker(bodyEl, NodeFilter.SHOW_TEXT);
  var nodes = [], n;
  while ((n = walk.nextNode())) {
    var pn = n.parentNode;
    if (!pn || pn.tagName === "SCRIPT" || pn.tagName === "STYLE" || pn.tagName === "MARK") continue;
    if (n.textContent.toLowerCase().indexOf(q) >= 0) nodes.push(n);
  }
  nodes.forEach(function (tn) {
    var txt = tn.textContent, lower = txt.toLowerCase(), ql = q;
    var idx = -1, last = 0;
    var frag = document.createDocumentFragment();
    while ((idx = lower.indexOf(ql, last)) !== -1) {
      if (idx > last) frag.appendChild(document.createTextNode(txt.slice(last, idx)));
      var mk = document.createElement("mark");
      mk.className = "srch";
      mk.textContent = txt.slice(idx, idx + ql.length);
      frag.appendChild(mk);
      last = idx + ql.length;
    }
    if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
    tn.parentNode.replaceChild(frag, tn);
  });
}
function gotoSearchMatch(m) {
  // m: {bi, pos} — 打开对应章并定位该章内第 rank 个匹配
  snapshotAnchor();
  var rank = 0;
  searchCache.forEach(function (x) { if (x.bi === m.bi && x.pos < m.pos) rank++; });
  closePanel();
  renderChapter(m.bi, { to: "top", skipSearch: false });
  requestAnimationFrame(function () {
    var marks = $$("#ch-body mark.srch");
    var tgt = marks[rank] || marks[0];
    if (tgt) {
      marks.forEach(function (x) { x.classList.remove("cur"); });
      tgt.classList.add("cur");
      tgt.scrollIntoView({ block: "center" });
    }
  });
}

/* ---------- 书签 ---------- */
function toggleBookmark(b, pIdx, pEl) {
  var i = store.bookmarks.findIndex(function (m) { return m.ch === b.id && String(m.p) === String(pIdx); });
  if (i >= 0) {
    store.bookmarks.splice(i, 1);
    persist(LS.bookmarks, store.bookmarks, true);
  } else {
    var snip = pEl.textContent.slice(0, 90);
    if (!snip.replace(/\s/g, "")) snip = "（空段落）";
    store.bookmarks.push({ ch: b.id, p: pIdx, title: b.title, snip: snip, t: Date.now() });
    persist(LS.bookmarks, store.bookmarks, true);
  }
  renderChapter(state.idx, { keep: true });
  toast(i >= 0 ? "已移除书签" : "已添加书签", 1600);
}
function renderBookmarkPanel() {
  var list = $("#bm-list");
  if (!store.bookmarks.length) {
    list.innerHTML = '<div class="empty"><span class="empty-ic">' + iconSvg("i-bookmark", 24) + '</span><div class="empty-t">还没有书签</div><div class="empty-s">阅读时点段落左侧的小图标，或选中文字后点「书签」</div></div>';
    return;
  }
  var html = "";
  store.bookmarks.slice().reverse().forEach(function (b, i) {
    var idx = store.bookmarks.length - 1 - i;
    html += '<div class="bm-item"><button class="bm-txt" data-bmidx="' + idx + '">' +
      '<span class="bm-title">' + esc(b.title) + "</span>" +
      '<span class="bm-snip">' + esc(b.snip) + "</span></button>" +
      '<button class="bm-del" title="删除" data-bmdel="' + idx + '">' + iconSvg("i-trash", 15) + "</button></div>";
  });
  list.innerHTML = html;
}
function renderMarkPanel() {
  var list = $("#mk-list");
  if (!store.marks.length) {
    list.innerHTML = '<div class="empty"><span class="empty-ic">' + iconSvg("i-pen", 24) + '</span><div class="empty-t">还没有划线</div><div class="empty-s">选中正文文字，点浮出的「划线」即可标注</div></div>';
    return;
  }
  var html = "";
  store.marks.slice().reverse().forEach(function (m, i) {
    var idx = store.marks.length - 1 - i;
    var b = null;
    books().forEach(function (x) { if (x.id === m.ch) b = x; });
    html += '<div class="bm-item"><button class="bm-txt" data-mkidx="' + idx + '">' +
      '<span class="bm-title">' + esc(b ? b.title : "已删除章节") + "</span>" +
      '<span class="bm-snip">' + esc(m.text) + "</span></button>" +
      '<button class="bm-del" title="删除" data-mkdel="' + idx + '">' + iconSvg("i-trash", 15) + "</button></div>";
  });
  list.innerHTML = html;
}
function gotoBookmark(m) {
  snapshotAnchor();
  var bi = books().findIndex(function (b) { return b.id === m.ch; });
  if (bi < 0) return;
  closePanel();
  renderChapter(bi, { to: "top" });
  requestAnimationFrame(function () { scrollToParagraph(m.ch, m.p); });
}
function gotoMark(m) {
  snapshotAnchor();
  var bi = books().findIndex(function (b) { return b.id === m.ch; });
  if (bi < 0) return;
  closePanel();
  renderChapter(bi, { to: "top" });
  requestAnimationFrame(function () {
    scrollToParagraph(m.ch, m.p);
    var mk = $('mark.hl[data-mid="' + m.t + '"]');
    if (mk) setTimeout(function () { mk.scrollIntoView({ block: "center" }); }, 60);
  });
}

/* ---------- 阅读锚点（返回原处） ---------- */
function snapshotAnchor() {
  if (state.anchor) return;
  var b = currentBook();
  if (!b) return;
  state.anchor = { idx: state.idx, pct: Math.round(scrollPct() * 100) };
  showAnchorPill();
}
function showAnchorPill() {
  var a = state.anchor;
  var pill = $("#anchor-pill");
  if (!a || !pill) return;
  var b = books()[a.idx];
  var t = $("#anchor-to");
  if (t) t.textContent = "返回原处 · " + (b ? b.title : "") + " " + a.pct + "%";
  pill.hidden = false;
  if (state.anchorTimer) clearTimeout(state.anchorTimer);
  state.anchorTimer = setTimeout(function () { state.anchor = null; pill.hidden = true; }, 90000);
}
function dismissAnchor() {
  state.anchor = null;
  if (state.anchorTimer) clearTimeout(state.anchorTimer);
  var pill = $("#anchor-pill");
  if (pill) pill.hidden = true;
}
function surpriseMe(fromShelf) {
  var bs = books();
  if (!bs.length) return;
  if (!fromShelf) snapshotAnchor();
  hideShelf();
  closePanel();
  var idx = Math.floor(Math.random() * bs.length);
  var pct = 5 + Math.floor(Math.random() * 85);
  renderChapter(idx, { pct: pct, gate: false });
  toast("随便翻翻：《" + bs[idx].title + "》 " + pct + "%", 2400);
}
function returnToAnchor() {
  var a = state.anchor;
  if (!a) { toast("没有可以返回的位置", 1600); return; }
  dismissAnchor();
  closePanel();
  hideShelf();
  if (tts.on) ttsStop();
  renderChapter(a.idx, { pct: a.pct, gate: false, flip: false });
}

/* ---------- 选区工具条 ---------- */
var selState = null;
function onSelection() {
  var sel = window.getSelection();
  var bar = $("#selbar");
  if (!sel || sel.isCollapsed) { bar.hidden = true; selState = null; return; }
  var range = sel.getRangeAt(0);
  var bodyEl = $("#ch-body");
  if (!bodyEl || !bodyEl.contains(range.commonAncestorContainer)) { bar.hidden = true; selState = null; return; }
  var pEl = range.commonAncestorContainer;
  while (pEl && pEl.tagName !== "P" && pEl !== bodyEl) pEl = pEl.parentNode;
  if (!pEl || pEl.tagName !== "P") { bar.hidden = true; selState = null; return; }
  var start = charIndex(pEl, range.startContainer, range.startOffset);
  var end = charIndex(pEl, range.endContainer, range.endOffset);
  if (start < 0 || end < 0 || start === end) { bar.hidden = true; selState = null; return; }
  selState = { p: pEl.getAttribute("data-p"), start: start, end: end, text: sel.toString() };
  var rect = range.getBoundingClientRect();
  bar.hidden = false;
  bar.style.position = "fixed";
  bar.style.left = Math.max(8, Math.min(window.innerWidth - 168, rect.left + rect.width / 2 - 76)) + "px";
  var top = rect.bottom + 10;
  if (top + 46 > window.innerHeight) top = rect.top - 56;
  bar.style.top = Math.max(58, top) + "px";
}
function addSelMark() {
  if (!selState) return;
  var b = currentBook();
  store.marks.push({ ch: b.id, p: selState.p, start: selState.start, end: selState.end, text: selState.text, t: Date.now() });
  persist(LS.marks, store.marks, true);
  renderChapter(state.idx, { keep: true });
  toast("已划线", 1500);
  window.getSelection().removeAllRanges();
  $("#selbar").hidden = true; selState = null;
}
function addSelBookmark() {
  if (!selState) return;
  var b = currentBook();
  var pIdx = selState.p;
  var i = store.bookmarks.findIndex(function (m) { return m.ch === b.id && String(m.p) === String(pIdx); });
  if (i >= 0) {
    store.bookmarks.splice(i, 1);
    persist(LS.bookmarks, store.bookmarks, true);
  } else {
    store.bookmarks.push({ ch: b.id, p: pIdx, title: b.title, snip: selState.text.slice(0, 90), t: Date.now() });
    persist(LS.bookmarks, store.bookmarks, true);
  }
  renderChapter(state.idx, { keep: true });
  toast(i >= 0 ? "已移除书签" : "已添加书签", 1500);
  window.getSelection().removeAllRanges();
  $("#selbar").hidden = true; selState = null;
}

/* ---------- 自动滚动 ---------- */
function startAuto() {
  if (state.auto) return;
  exitParaFocus();
  if (tts.on) ttsStop();
  state.auto = true;
  $("#auto-pill").hidden = false;
  $("#auto-toggle").classList.add("on");
  $("#auto-toggle").innerHTML = iconSvg("i-pause", 18);
  $("#auto-speed").textContent = AUTO_LABEL[S.autoSpeed] || "匀速";
  state.autoLast = (performance && performance.now) ? performance.now() : Date.now();
  if (state.autoTimer) clearInterval(state.autoTimer);
  state.autoTimer = setInterval(autoStep, 16);
}
function stopAuto() {
  state.auto = false;
  if (state.autoTimer) { clearInterval(state.autoTimer); state.autoTimer = null; }
  $("#auto-toggle").innerHTML = iconSvg("i-play", 18);
  $("#auto-toggle").classList.remove("on");
}
function toggleAuto() { if (state.auto) stopAuto(); else startAuto(); }
function autoStep() {
  if (!state.auto) return;
  var now2 = (performance && performance.now) ? performance.now() : Date.now();
  var dt = Math.min(60, now2 - state.autoLast);
  state.autoLast = now2;
  var spd = AUTO_SPEEDS[S.autoSpeed] || 0.95;
  if (S.vertical) window.scrollBy({ left: spd * (dt / 16.7), behavior: "instant" });
  else window.scrollBy({ top: spd * (dt / 16.7), behavior: "instant" });
  if (axY() >= axMax() - 4) stopAuto();
}

/* ---------- 语音朗读 ---------- */
var tts = { on: false, paused: false, queue: [], qi: 0, lastEl: null };
function ttsVoices() {
  try { return (window.speechSynthesis && typeof speechSynthesis.getVoices === "function") ? speechSynthesis.getVoices() : []; } catch (e) { return []; }
}
function ttsCJK(v) { return /zh|cmn|chinese|中文/i.test(v.lang || ""); }
function ttsBestVoice() {
  var vs = ttsVoices().filter(ttsCJK);
  if (!vs.length) return null;
  var pref = ["ting-ting", "xiaoxiao", "huihui", "yaoyao", "xiaoyi", "yunxi"];
  var best = null;
  vs.forEach(function (v) { if (!best && pref.some(function (p) { return (v.name || "").toLowerCase().indexOf(p) >= 0; })) best = v; });
  return best || vs[0] || null;
}
function ttsStatus() {
  var b = $("#tts-toggle");
  if (!b) return;
  b.innerHTML = iconSvg(tts.paused ? "i-play" : "i-pause", 18);
  b.classList.toggle("on", tts.on && !tts.paused);
  b.setAttribute("aria-label", tts.on ? (tts.paused ? "继续朗读" : "暂停朗读") : "开始朗读");
}
function ttsSplit(text) {
  var parts = text.split(/(?<=[。！？…；!?;])/);
  var out = [], buf = "";
  parts.forEach(function (s) {
    if (!s) return;
    if ((buf + s).length > 140 && buf) { out.push(buf); buf = s; }
    else buf += s;
  });
  if (buf) out.push(buf);
  return out.length ? out : (text ? [text] : []);
}
function ttsBuildQueue() {
  var q = [];
  $$("#ch-body p").forEach(function (p) {
    if (p.classList.contains("sys") || p.classList.contains("node-box")) return;
    var txt = (p.textContent || "").replace(/\s+/g, " ").trim();
    if (!txt) return;
    ttsSplit(txt).forEach(function (seg) { q.push({ el: p, text: seg }); });
  });
  return q;
}
function ttsStep() {
  if (!tts.on || tts.paused) return;
  if (tts.qi >= tts.queue.length) { ttsStop(true); return; }
  var item = tts.queue[tts.qi++];
  item.el.classList.add("tts-active");
  if (tts.lastEl && tts.lastEl !== item.el) tts.lastEl.classList.remove("tts-active");
  tts.lastEl = item.el;
  var r = item.el.getBoundingClientRect();
  if (r.top < 60 || r.bottom > window.innerHeight - 40) {
    item.el.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }
  try {
    var synth = window.speechSynthesis;
    if (!synth) { ttsStop(); return; }
    var u = new SpeechSynthesisUtterance(item.text);
    var v = null, vs = ttsVoices();
    if (S.ttsVoice) vs.forEach(function (x) { if (x.voiceURI === S.ttsVoice) v = x; });
    if (!v) v = ttsBestVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    else u.lang = "zh-CN";
    u.rate = S.ttsRate || 1;
    u.onend = function () { setTimeout(ttsStep, 40); };
    u.onerror = function () { setTimeout(ttsStep, 40); };
    synth.speak(u);
  } catch (e) { ttsStop(); }
}
function ttsStart() {
  if (!window.speechSynthesis) { toast("当前浏览器不支持语音朗读", 2400); return; }
  if (!ttsVoices().length) { toast("未找到中文语音（系统未安装 zh 语音包），朗读不可用", 3000); return; }
  if (state.auto) stopAuto();
  exitParaFocus();
  tts.on = true; tts.paused = false;
  tts.queue = ttsBuildQueue();
  tts.qi = 0;
  if (!tts.queue.length) { tts.on = false; toast("本章没有可朗读的正文", 2000); return; }
  $("#tts-pill").hidden = false;
  $("#tts-speed").textContent = (S.ttsRate || 1) + "×";
  ttsStatus();
  ttsStep();
  toast("开始朗读 · 滚轮或触摸即停", 2200);
}
function ttsPauseResume() {
  if (!tts.on) return;
  try {
    var synth = window.speechSynthesis;
    if (tts.paused) { synth.resume(); tts.paused = false; ttsStep(); }
    else { synth.pause(); tts.paused = true; }
    ttsStatus();
  } catch (e) {}
}
function ttsStop(finished) {
  tts.on = false; tts.paused = false;
  try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
  if (tts.lastEl) tts.lastEl.classList.remove("tts-active");
  tts.lastEl = null; tts.queue = []; tts.qi = 0;
  $("#tts-pill").hidden = true;
  ttsStatus();
  if (finished) toast("本章朗读完毕", 2000);
}

/* ---------- 面板 / 侧栏 ---------- */
var PANEL_TRIG = { "panel-settings": "btn-settings", "panel-search": "btn-search", "panel-bookmarks": "btn-bookmarks", "panel-stats": "btn-stats" };
function syncPanelAria() {
  Object.keys(PANEL_TRIG).forEach(function (pid) {
    var p = document.getElementById(pid);
    var t = document.getElementById(PANEL_TRIG[pid]);
    if (t) t.setAttribute("aria-expanded", (p && !p.hidden) ? "true" : "false");
  });
}
function openPanel(id) {
  var sb = $("#selbar");
  if (sb && !sb.hidden) { sb.hidden = true; }
  $$(".panel").forEach(function (p) {
    var isT = p.id === id;
    p.hidden = !isT;
    if (isT) {
      void p.offsetWidth;
      p.classList.add("open");
    } else p.classList.remove("open");
  });
  syncPanelAria();
}
function closePanel() {
  $$(".panel").forEach(function (p) {
    p.classList.remove("open");
    p.hidden = true;
  });
  syncPanelAria();
}
function togglePanel(id) {
  var p = document.getElementById(id);
  if (p && !p.hidden && p.classList.contains("open")) closePanel();
  else openPanel(id);
}
var SHORTCUTS = [
  ["← / →", "上一章 / 下一章"],
  ["t", "目录侧栏"],
  ["h", "回到书架首页"],
  ["f", "沉浸模式"],
  ["s", "阅读设置"],
  ["/", "全文搜索"],
  ["?", "快捷键速查"],
  ["Esc", "关闭弹层 / 停止自动滚动"],
  ["空格", "停止自动滚动"],
  ["A＋ / A−", "字号微调"],
  ["r", "语音朗读 / 停止"],
  ["x", "随便翻翻"],
  ["Ctrl/Cmd + P", "打印当前章"],
  ["b", "返回跳转前位置"]
];
function renderKeys() {
  var el = $("#keys-grid"); if (!el) return;
  el.innerHTML = SHORTCUTS.map(function (r) {
    return '<div class="key-row"><kbd>' + esc(r[0]) + "</kbd><span>" + esc(r[1]) + "</span></div>";
  }).join("");
}
function openKeys() { renderKeys(); $("#keys-overlay").hidden = false; }
function closeKeys() { $("#keys-overlay").hidden = true; }
function toggleSide() {
  document.body.classList.toggle("side-on");
}
function exitParaFocus() {
  state.paraFocus = false;
  document.body.classList.remove("para-focus-on");
  $$("#ch-body p").forEach(function (p) { p.classList.remove("focus-now"); });
}
function setParaFocus(i, doScroll) {
  var ps = $$("#ch-body p");
  if (!ps.length) return;
  if (i < 0) i = 0;
  if (i >= ps.length) i = ps.length - 1;
  state.focusP = i;
  ps.forEach(function (p, k) { p.classList.toggle("focus-now", k === i); });
  if (doScroll) {
    axScroll(elOff(ps[i], S.vertical ? window.innerWidth * 0.5 : window.innerHeight * 0.42));
  }
}
function updateParaFocus() {
  if (!state.paraFocus) return;
  var ps = $$("#ch-body p");
  if (!ps.length) return;
  var cy = S.vertical ? window.innerWidth * 0.5 : window.innerHeight * 0.42, hit = -1;
  for (var i = 0; i < ps.length; i++) {
    var r = ps[i].getBoundingClientRect();
    var lo = S.vertical ? r.left : r.top, hi = S.vertical ? r.right : r.bottom, lead = S.vertical ? r.left : r.top;
    if (lo <= cy && hi >= cy) { hit = i; break; }
    if (lead > cy) break;
  }
  if (hit < 0) {
    var best = 0, bd = Infinity;
    ps.forEach(function (p, i) {
      var rr = p.getBoundingClientRect();
      var c2 = S.vertical ? ((rr.left + rr.right) / 2) : ((rr.top + rr.bottom) / 2);
      var dd = Math.abs(c2 - cy);
      if (dd < bd) { bd = dd; best = i; }
    });
    hit = best;
  }
  if (hit !== state.focusP) setParaFocus(hit, false);
}
function toggleFocus(show) {
  if (typeof show === "boolean") {
    document.body.classList.toggle("focus-on", show);
    $("#btn-focus").classList.toggle("on", show);
    if (!show) exitParaFocus();
    return;
  }
  if (state.paraFocus) {
    exitParaFocus();
    document.body.classList.remove("focus-on");
    $("#btn-focus").classList.remove("on");
    toast("已退出专注", 1600);
    return;
  }
  if (document.body.classList.contains("focus-on")) {
    state.paraFocus = true;
    document.body.classList.add("para-focus-on");
    $("#btn-focus").classList.add("on");
    setParaFocus(state.focusP || 0, false);
    updateParaFocus();
    toast("焦点段落：滚轮或 ↑↓ 移动焦点 · F 退出", 2600);
    return;
  }
  document.body.classList.add("focus-on");
  $("#btn-focus").classList.add("on");
  toast("沉浸模式 · 移开鼠标隐藏界面（再按 F 进入焦点段落）", 2200);
}
function nextChapter() {
  if (state.idx < books().length - 1) renderChapter(state.idx + 1, { to: "top" });
  else toast("已经是最后一章啦", 1800);
}
var nextAuto = { timer: null, t: 0 };
function maybeAutoNext() {
  if (!S.autoNext || state.auto || tts.on || state.paraFocus || state.idx >= books().length - 1) return;
  var mark = document.querySelector("#chapter .endmark");
  if (!mark) return;
  var r = mark.getBoundingClientRect();
  var vis = Math.max(0, Math.min(window.innerHeight, r.bottom) - Math.max(0, r.top));
  if (vis < Math.max(8, r.height * 0.5) || r.bottom < 40) { cancelAutoNext(); return; }
  if (nextAuto.timer) return;
  nextAuto.t = 3;
  var elt = $("#next-txt");
  if (elt) elt.textContent = nextAuto.t + " 秒后自动进入下一章";
  var hint = $("#next-hint");
  if (hint) hint.hidden = false;
  nextAuto.timer = setInterval(function () {
    nextAuto.t--;
    if (nextAuto.t <= 0) { goAutoNext(); return; }
    var el2 = $("#next-txt");
    if (el2) el2.textContent = nextAuto.t + " 秒后自动进入下一章";
  }, 1000);
}
function cancelAutoNext() {
  if (nextAuto.timer) { clearInterval(nextAuto.timer); nextAuto.timer = null; }
  nextAuto.t = 0;
  var hint = $("#next-hint");
  if (hint) hint.hidden = true;
}
function goAutoNext() { cancelAutoNext(); nextChapter(); }

/* ---------- 顶栏快捷工具 ---------- */
var FONT_CYCLE_L = ["宋", "楷", "黑", "圆"];
var FONT_CYCLE_K = ["serif", "kai", "sans", "round"];
function currentFontName() {
  var i = FONT_CYCLE_K.indexOf(S.fontBody);
  return FONT_CYCLE_L[i < 0 ? 0 : i];
}
function updateFontBtn() {
  var b2 = $("#btn-fontcycle");
  if (b2) b2.textContent = "字 " + currentFontName();
}
function stepFs(d) {
  S.size = Math.min(28, Math.max(14, S.size + d));
  saveSettings(); applySettings(); syncSettingsControls();
}
var HEART_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20.3C7 16.6 3.5 13.3 3.5 9.7 3.5 7.2 5.5 5.2 8 5.2c1.6 0 3 .9 4 2.3 1-1.4 2.4-2.3 4-2.3 2.5 0 4.5 2 4.5 4.5 0 3.6-3.5 6.9-8.5 10.6z"/></svg>';
function stripSceneLabel(label) {
  return String(label || "").replace(/^🩷\s*场景\s*\d+\s*[:：]\s*/, "");
}

/* ---------- URL 深链(刷新保位/直达) ---------- */
function hashTarget() {
  var h = location.hash || "";
  if (!h || h === "#") return null;
  var parts = h.substring(1).split("/");
  var idx = parseInt(parts[0], 10);
  if (isNaN(idx)) return null;
  var totalB = books().length;
  if (totalB < 1) return null;
  return { idx: Math.max(0, Math.min(totalB - 1, idx)), scene: parts[1] || null };
}
function refreshImportSeals() {
  store.imports.forEach(function (b, j) {
    b.seal = "导 " + pad2(j + 1);
    b.groupLabel = "导入章节";
  });
}
function applyHash(idx, sceneId) {
  var target = "#" + idx + (sceneId ? "/" + sceneId : "");
  try { if (location.hash !== target) history.replaceState(null, "", target); } catch (e) {}
}

/* ---------- 风格选择浮层 ---------- */
var THEME_NAMES = { night: "深夜书房", dusk: "薄暮", day: "素纸白昼", sepia: "羊皮纸", sage: "青灯护眼", gold: "鎏金之夜", mine: "我的主题" };
function openStyleChooser() { syncStyleChooser(); $("#style-overlay").hidden = false; }
function closeStyleChooser() { $("#style-overlay").hidden = true; }
function syncStyleChooser() {
  $$(".style-card").forEach(function (c) { c.classList.toggle("active", c.getAttribute("data-theme-opt") === S.theme); });
  $$(".font-card").forEach(function (c) { c.classList.toggle("active", c.getAttribute("data-font") === S.fontBody); });
  $$(".cover-chip").forEach(function (c) { c.classList.toggle("active", c.getAttribute("data-cover") === S.coverSkin); });
  syncMinePalette();
}

/* ---------- 书架首页 ---------- */
function refreshShelf() {
  var bs = books();
  if (!bs.length) return;
  $("#shelf-title").textContent = BOOK.title;
  var totalWords = 0, readCount = 0, pctSum = 0;
  bs.forEach(function (b) {
    totalWords += b.wordCount || 0;
    var p = store.progress[b.id] || 0;
    if (p > 1) readCount++;
    pctSum += p;
  });
  $("#shelf-sub").textContent = "共 " + bs.length + " 篇 · 更新 " + (BOOK.updated || "");
  $("#st-read").textContent = readCount + " / " + bs.length;
  $("#st-pct").textContent = Math.round(pctSum / (bs.length || 1)) + "%";
  $("#st-words").textContent = totalWords >= 10000 ? (totalWords / 10000).toFixed(1) + "万" : String(totalWords);
  var lb = null;
  if (store.last && store.last.idx != null && store.last.idx < bs.length) lb = bs[store.last.idx];
  if (!lb) lb = bs[0];
  var lp = store.progress[lb.id] || 0;
  $("#rc-title").textContent = lb.title;
  $("#rc-meta").textContent = (lb.dayLabel || lb.groupLabel || "") + " · " + lp + "%";
  var bar = $("#rc-bar-i");
  if (bar) bar.style.width = lp + "%";
  var wk = 0;
  for (var wi = 0; wi < 7; wi++) {
    var wd = new Date(); wd.setDate(wd.getDate() - wi);
    var wdd = store.stats.days[dayKey(wd)];
    if (wdd) wk += wdd.sec || 0;
  }
  var sw = $("#shelf-week");
  if (sw) sw.textContent = "本周阅读 " + fmtMm(wk) + (S.goalMin ? " · 今日目标 " + S.goalMin + " 分钟" : "");
}
function showShelf() {
  refreshShelf();
  $("#shelf").hidden = false;
  document.body.classList.add("shelf-on");
}
function hideShelf() {
  $("#shelf").hidden = true;
  document.body.classList.remove("shelf-on");
}
function shelfResume() {
  hideShelf();
  var idx = (store.last && store.last.idx != null && store.last.idx < books().length) ? store.last.idx : 0;
  renderChapter(idx, { resume: true });
  requestAnimationFrame(function () {
    var b2 = currentBook();
    if (b2) {
      var saved2 = store.progress[b2.id] || 0;
      if (saved2 > 1) {
        var max2 = axMax();
        axScroll(saved2 >= 98 ? max2 : (saved2 / 100) * max2);
      }
    }
  });
}
function shelfOpenToc() {
  hideShelf();
  document.body.classList.add("side-on");
}

/* ---------- 章节揭页过场 ---------- */
var _flipTweens = [];
function pageFlipIn() {
  var f = $("#flip");
  if (!f || reduced || !window.gsap) return;
  _flipTweens.forEach(function (t) { if (t && t.kill) t.kill(); });
  _flipTweens = [];
  f.classList.add("on");
  var l = $(".flip-l"), r = $(".flip-r");
  var down = false;
  function done() {
    f.classList.remove("on");
    window.gsap.set(l, { clearProps: "transform" });
    window.gsap.set(r, { clearProps: "transform" });
  }
  window.gsap.set(l, { scaleX: 1, transformOrigin: "100% 50%" });
  window.gsap.set(r, { scaleX: 1, transformOrigin: "0% 50%" });
  _flipTweens.push(window.gsap.fromTo(l, { scaleX: 1 }, { scaleX: 0, duration: 0.4, ease: "power2.inOut", onComplete: function () { if (down) done(); down = true; } }));
  _flipTweens.push(window.gsap.fromTo(r, { scaleX: 1 }, { scaleX: 0, duration: 0.4, ease: "power2.inOut", onComplete: function () { if (down) done(); down = true; } }));
}

/* ---------- 灯箱 ---------- */
function openLightbox(src, cap) {
  var lb = $("#lightbox");
  $("#lb-img").src = src;
  $("#lb-img").alt = cap || "";
  $("#lb-cap").textContent = cap || "";
  lb.hidden = false;
  var b = $("#lb-close");
  if (b) b.focus();
}
function closeLightbox() { $("#lightbox").hidden = true; }

/* ---------- 设置控件 ---------- */
function updateRangeLabel(key) {
  var el = document.getElementById("set-" + key);
  var label = document.getElementById("val-" + key);
  if (!el || !label) return;
  var s = el.value;
  if (key === "size") s += " px";
  if (key === "lh") s = (parseInt(s, 10) / 100).toFixed(2);
  if (key === "pg") s = (parseInt(s, 10) / 100).toFixed(1) + " em";
  if (key === "ls") s = (parseInt(s, 10) / 100).toFixed(2) + " em";
  label.textContent = s;
}
function syncSettingsControls() {
  $$(".theme-card").forEach(function (c) { c.classList.toggle("active", c.getAttribute("data-theme-opt") === S.theme); });
  $$("#seg-font button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-font") === S.fontBody); });
  $$("#seg-width button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-width") === S.width); });
  var map = { size: S.size, lh: S.lh, pg: S.pg, ls: S.ls };
  Object.keys(map).forEach(function (k) {
    var el = document.getElementById("set-" + k);
    if (el) el.value = String(map[k]);
  });
  ["size", "lh", "pg", "ls"].forEach(updateRangeLabel);
  $("#set-indent").checked = !!S.indent;
  $("#set-dropcap").checked = !!S.dropcap;
  $("#set-semantic").checked = !!S.semantic;
  $("#set-openingTitle").checked = !!S.openingTitle;
  $("#set-vertical").checked = !!S.vertical;
  $("#set-themeAuto").checked = !!S.themeAuto;
  $("#set-autoNext").checked = !!S.autoNext;
  $$("#break-chips .chip-btn").forEach(function (c) { c.classList.toggle("active", parseInt(c.getAttribute("data-bmin"), 10) === (S.breakMin || 0)); });
  var vSel = $("#set-voice");
  if (vSel) {
    var remembered = S.ttsVoice;
    vSel.innerHTML = "";
    var vs = ttsVoices();
    var zhs = vs.filter(ttsCJK);
    var rest = vs.filter(function (v) { return !ttsCJK(v); });
    var all = zhs.concat(rest);
    if (!all.length) { var o0 = document.createElement("option"); o0.value = ""; o0.textContent = "（未发现可用语音）"; vSel.appendChild(o0); }
    else all.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v.voiceURI;
      o.textContent = v.name + " (" + (v.lang || "?") + ")";
      vSel.appendChild(o);
    });
    var best = ttsBestVoice();
    vSel.value = remembered || (best ? best.voiceURI : "");
    if (!S.ttsVoice && best) S.ttsVoice = best.voiceURI;
  }
  var rateEl = $("#set-rate");
  if (rateEl) { rateEl.value = String(Math.round((S.ttsRate || 1) * 10)); var vr4 = $("#val-rate"); if (vr4) vr4.textContent = (S.ttsRate || 1).toFixed(1) + "×"; }
  $("#set-webFont").checked = !!S.webFont;
  $("#set-shelfHome").checked = !!S.shelfHome;
  var ms = $("#mine-swatch");
  if (ms) {
    var mmp = calcMinePalette();
    ms.style.background = "linear-gradient(135deg, " + mmp["--mine-bg"] + " 55%, " + mmp["--mine-accent"] + " 55%)";
  }
  var hueEl = document.getElementById("set-hue");
  var lumEl = document.getElementById("set-lum");
  if (hueEl) hueEl.value = String(S.hue);
  if (lumEl) lumEl.value = String(S.lum);
  var vh = $("#val-hue"); if (vh) vh.textContent = S.hue + "°";
  var vl = $("#val-lum"); if (vl) vl.textContent = S.lum <= 50 ? "暗" : "亮";
  updateFontBtn();
  syncMinePalette();
}

/* ---------- toast ---------- */
var toastTimer = null, toastMsg = null, toastAt = 0;
function toast(msg, ms) {
  var t = $("#toast");
  var now = Date.now();
  if (t && !t.hidden && t.classList.contains("show") && toastMsg === msg && now - toastAt < 900) {
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, ms || 2400);
    return;
  }
  toastMsg = msg; toastAt = now;
  $("#toast-text").textContent = msg;
  var actions = $(".toast-actions");
  if (actions) actions.style.display = "none";
  t.classList.add("show");
  t.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms || 2400);
}
function toastWithActions(msg, ms) {
  var t = $("#toast");
  $("#toast-text").textContent = msg;
  var actions = $(".toast-actions");
  if (actions) actions.style.display = "";
  t.classList.add("show");
  t.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms || 20000);
}
function hideToast() {
  var t = $("#toast");
  t.classList.remove("show");
  if (toastTimer) clearTimeout(toastTimer);
  setTimeout(function () { t.hidden = true; }, 330);
}

/* ---------- 客户端 md 解析（拖拽导入用） ---------- */
function parseImport(raw, fileName) {
  var text = String(raw).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  var lines = text.split("\n");
  var html = "", buf = [], inQuote = false, inList = false, nodeMode = false;
  var scenes = [], sceneI = 0, wordCount = 0;
  var title = fileName.replace(/\.(md|markdown|txt)$/i, "").replace(/^\d+[A-Za-z]*-/, "").trim() || fileName;
  function escInline(s) {
    var t = esc(s);
    t = t.replace(/\*\*([^\*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/(^|[^\*])\*([^\*\s][^\*]*)\*(?!\*)/g, "$1<em>$2</em>");
    return t;
  }
  function flushP() {
    if (!buf.length) return;
    var raw = buf.join(" ");
    buf = [];
    var t = raw.trim();
    if (!t) return;
    var cls = "";
    var isWhole = /^[（(][\s\S]*[）)]$/.test(t);
    var headChar = t.charAt(0);
    if (isWhole || headChar === "（" || headChar === "(") {
      var hasEll = t.indexOf("……") >= 0;
      cls = (t.length >= 20 || hasEll) ? "mono" : "stage";
    } else if (headChar === "「") {
      cls = "dialog";
      t = '<span class="dq">「</span>' + escInline(t.replace(/^「/, ""));
      html += '<p class="dialog">' + t + "</p>\n";
      return;
    } else if (/^(思考了|Thought|系统)/.test(t)) {
      cls = "sys";
    } else if (/[：:]$/.test(t) && t.length < 20) {
      cls = "sys";
    }
    html += '<p' + (cls ? ' class="' + cls + '"' : "") + ">" + escInline(t) + "</p>\n";
  }
  function flushList() {
    if (!buf.length) { inList = false; return; }
    html += "<ul>";
    buf.forEach(function (li) { wordCount += li.replace(/\s/g, "").length; html += "<li>" + escInline(li) + "</li>"; });
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
  var inTable = [];
  function isTableSep(rr) { return /^\|[\s:|\-]+\|$/.test(rr); }
  function flushTable() {
    if (!inTable.length) return;
    var lines2 = inTable; inTable = [];
    var rows = lines2.filter(function (rr) { return !isTableSep(rr); });
    if (!rows.length) return;
    var hasHead = rows.length > 1 && isTableSep(lines2[1]);
    html += "<table>";
    rows.forEach(function (row, ri) {
      var cells = row.split("|").slice(1, -1).map(function (c) { return c.trim(); });
      var tag = (ri === 0 && hasHead) ? "th" : "td";
      wordCount += cells.join("").replace(/\s/g, "").length;
      html += "<tr>" + cells.map(function (c) { return "<" + tag + ">" + escInline(c) + "</" + tag + ">"; }).join("") + "</tr>";
    });
    html += "</table>\n";
  }
  lines.forEach(function (ln) {
    var s = ln.trim();
    if (inTable.length && !/^\|.+\|$/.test(s)) flushTable();
    if (/^\|.+\|$/.test(s)) {
      if (inList) flushList(); if (inQuote) flushQuote(); flushP();
      inTable.push(s);
      return;
    }
    if (/^!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/.test(s)) {
      if (inTable.length) flushTable(); if (inList) flushList(); if (inQuote) flushQuote(); flushP();
      var mi = s.match(/^!\[([^\]]*)\]\(([^)\s]+)/);
      var miAlt = mi[1], miSrc = mi[2];
      if (/^https?:/i.test(miSrc)) {
        html += '<figure class="fig"><img loading="lazy" src="' + esc(miSrc) + '" alt="' + esc(miAlt) + '"><figcaption>' + escInline(miAlt) + "</figcaption></figure>\n";
      } else {
        html += '<figure class="fig"><span class="fig-missing">图：' + esc(miAlt || "配图") + "（本地图片需随 md 放入工作区根目录后重建）</span></figure>\n";
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
      var mm = s.match(/^(#{1,6})\s+(.*)$/);
      var lvl = mm[1].length, txt = mm[2];
      wordCount += txt.replace(/\s/g, "").length;
      if (lvl >= 3) {
        html += "<h3>" + escInline(txt) + "</h3>\n";
      } else if (lvl === 2) {
        closeNode();
        if (txt.indexOf("⏸") >= 0 || txt.indexOf("🎯") >= 0 || txt.indexOf("暂停") >= 0) {
          nodeMode = true;
          html += '<div class="node-box"><h2 class="node">' + escInline(txt) + "</h2>\n";
        } else {
          var id = "sc-" + (sceneI++);
          scenes.push({ id: id, label: txt });
          var sm2 = txt.match(/^🩷\s*场景\s*(\d+)\s*[:：]\s*(.*)$/);
          if (sm2) {
            html += '<h2 class="scene" id="' + id + '"><span class="heart">' + HEART_SVG + '</span><span class="sno">场景 ' + sm2[1] + '</span>' + escInline(sm2[2]) + "</h2>\n";
          } else {
            html += '<h2 class="scene" id="' + id + '">' + escInline(txt) + "</h2>\n";
          }
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
  if (!html.replace(/\s/g, "")) return null;
  var pure = text.replace(/\s/g, "");
  return {
    id: "", imported: true, groupLabel: "导入章节", dayLabel: "", badge: "拖入",
    title: title, wordCount: pure.length, min: Math.max(1, Math.round(pure.length / 400)),
    html: html, text: text, scenes: scenes,
    paraCount: (html.match(/<p[ >]/g) || []).length
  };
}
/* ---------- 一键重扫 md 目录(按钮更新) ---------- */
function sortKey2(name) {
  var m = name.match(/^(d+)([A-Za-z]*)-/);
  if (m) return parseInt(m[1], 10) * 10 + (m[2] ? 1 : 0);
  return 999999;
}
function dayInfo2(title) {
  var m = title.match(/第s*(d+)s*(?:[-–—~至到]s*(d+))?s*天/);
  if (!m) return null;
  var d1 = parseInt(m[1], 10), d2 = m[2] ? parseInt(m[2], 10) : null;
  if (d2 && d2 > d1) return { label: "第 " + d1 + "-" + d2 + " 天", order: d1 * 100 };
  return { label: "第 " + d1 + " 天", order: d1 * 100 };
}
function readFileText(f) {
  return new Promise(function (res, rej) {
    var r = new FileReader();
    r.onload = function () { res(String(r.result)); };
    r.onerror = function () { rej(r.error); };
    r.readAsText(f, "utf-8");
  });
}
function rebuildFromFiles(files) {
  var list = Array.prototype.slice.call(files || []).filter(function (f) {
    return /\.md$/i.test(f.name) && !/^(AGENT|CLAUDE|README)/i.test(f.name) && f.name.charAt(0) !== ".";
  });
  if (!list.length) { toast("没找到 md 文件，请选中存放 000-xxx.md 的文件夹", 3200); return; }
  Promise.all(list.map(function (f) { return readFileText(f).then(function (raw) { return { name: f.name, raw: raw }; }); })).then(function (entries) {
    var books2 = [];
    entries.forEach(function (en) {
      var raw = en.raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
      var id = en.name.replace(/\.md$/i, "");
      var stem = (/^(\d+[A-Za-z]*)-/).exec(id);
      var shortId = stem ? stem[1] : id;
      var title = id.replace(/^\d+[A-Za-z]*-/, "").trim() || id;
      var parsed = parseImport(raw, title);
      if (!parsed) return;
      var day = dayInfo2(title);
      var metaChapter = /^000-/.test(id);
      var totalLen = raw.replace(/\s/g, "").length;
      books2.push({
        id: id, title: title, imported: false, metaChapter: metaChapter,
        groupLabel: metaChapter ? "设定与资料" : (day ? day.label : "其后辑录"),
        dayLabel: day ? day.label : "",
        dayOrder: metaChapter ? -1 : (day ? day.order : 999999),
        badge: (shortId === "006") ? "初版存档" : (shortId === "009R") ? "重写试看" : (shortId === "004") ? "参考存档" : (shortId === "005") ? "D 路线参考" : "",
        wordCount: totalLen, min: Math.max(1, Math.round(totalLen / 400)),
        html: parsed.html, text: raw, scenes: parsed.scenes || [],
        imgs: parsed.imgCount || 0, paraCount: parsed.paraCount || 0
      });
    });
    if (!books2.length) { toast("没有可解析的章节", 2400); return; }
    books2.sort(function (a, b) { return sortKey2(a.id + ".md") - sortKey2(b.id + ".md") || a.id.localeCompare(b.id, "zh"); });
    var storyN = 0;
    books2.forEach(function (b) {
      if (b.metaChapter) b.seal = "设定";
      else { storyN++; b.seal = "第 " + pad2(storyN) + " 篇"; }
    });
    BOOK.books = books2;
    store.imports = [];
    persist(LS.imports, store.imports, true);
    persist(LS.books, { updated: Date.now(), books: books2 }, true);
    hideShelf();
    closePanel();
    buildToc();
    $("#side-book-sub").textContent = "共 " + books2.length + " 篇 · 已从文件夹重扫";
    renderChapter(0, { to: "top", gate: false });
    var total = books2.reduce(function (s, x) { return s + x.wordCount; }, 0);
    toast("已更新：重扫 " + books2.length + " 篇 · 共 " + total + " 字", 3400);
  }).catch(function () { toast("读取 md 失败，请重试", 2400); });
}

/* ---------- 记住目录句柄 + 一键重扫 ---------- */
var IDB_OK = ("indexedDB" in window);
function idbOpen() {
  return new Promise(function (res, rej) {
    var req = indexedDB.open("vsw-reader", 1);
    req.onupgradeneeded = function () { req.result.createObjectStore("handles"); };
    req.onsuccess = function () { res(req.result); };
    req.onerror = function () { rej(req.error); };
  });
}
function idbGetDir() {
  if (!IDB_OK) return Promise.resolve(null);
  return idbOpen().then(function (db) {
    return new Promise(function (res) {
      var rq = db.transaction("handles", "readonly").objectStore("handles").get("dir");
      rq.onsuccess = function () { res(rq.result || null); };
      rq.onerror = function () { res(null); };
    });
  });
}
function idbPutDir(h) {
  if (!IDB_OK) return Promise.resolve(false);
  return idbOpen().then(function (db) {
    return new Promise(function (res) {
      var tx = db.transaction("handles", "readwrite");
      tx.objectStore("handles").put(h, "dir");
      tx.oncomplete = function () { res(true); };
      tx.onerror = function () { res(false); };
    });
  });
}
async function readDirToFiles(h) {
  var out = [];
  for await (var entry of h.values()) {
    if (entry.kind === "file" && /\.md$/i.test(entry.name)) out.push(await entry.getFile());
  }
  return out;
}
function showRememberedDir(name) {
  var el = $("#update-dir-label");
  if (!el) return;
  el.textContent = name ? ("已记住：" + name) : "选择并记住 md 目录";
}
async function pickDirAndRebuild() {
  var h = await idbGetDir();
  if (h && h.queryPermission) {
    try {
      var p = await h.queryPermission({ mode: "read" });
      if (p !== "granted") p = await h.requestPermission({ mode: "read" });
      if (p === "granted") {
        showRememberedDir(h.name);
        rebuildFromFiles(await readDirToFiles(h));
        return;
      }
    } catch (e) {}
  }
  if (window.showDirectoryPicker) {
    try {
      var h2 = await window.showDirectoryPicker({ mode: "read" });
      await idbPutDir(h2);
      try { localStorage.setItem("vsw-reader.dirName", h2.name); } catch (e) {}
      showRememberedDir(h2.name);
      rebuildFromFiles(await readDirToFiles(h2));
      return;
    } catch (e) { return; }
  }
  $("#dir-input").click();
}

function handleFiles(files) {
  Array.prototype.slice.call(files || []).forEach(function (f) {
    if (!/\.(md|markdown|txt)$/i.test(f.name)) { toast("文件类型不支持：" + f.name, 2200); return; }
    var rd = new FileReader();
    rd.onload = function () {
      var parsed = parseImport(String(rd.result), f.name);
      if (!parsed) { toast("无法解析：" + f.name, 2400); return; }
      parsed.id = "imp-" + Date.now() + "-" + store.imports.length;
      store.imports.push(parsed);
      refreshImportSeals();
      persist(LS.imports, store.imports, true);
      buildToc();
      toast("已导入：「" + parsed.title + "」", 3000);
    };
    rd.readAsText(f, "utf-8");
  });
}

/* ---------- 事件绑定 ---------- */
function bindUI() {
  $("#btn-side-open").addEventListener("click", function () { document.body.classList.add("side-on"); });
  $("#btn-side-close").addEventListener("click", function () {
    document.body.classList.remove("side-on");
  });
  $("#scrim").addEventListener("click", function () { document.body.classList.remove("side-on"); });
  $("#btn-shelf").addEventListener("click", showShelf);
  $("#btn-shelf-foot").addEventListener("click", showShelf);
  $(".tb-title").addEventListener("click", function () { if (!document.body.classList.contains("shelf-on")) showShelf(); });
  $("#btn-cover").addEventListener("click", shelfResume);
  if (window.gsap && !window.gsapFallback && !reduced && window.matchMedia && window.matchMedia("(hover: hover)").matches) {
    var cv2 = $("#btn-cover");
    cv2.addEventListener("mousemove", function (e) {
      var cr = cv2.getBoundingClientRect();
      window.gsap.to(cv2, { rotateX: ((e.clientY - cr.top) / cr.height - 0.5) * -7, rotateY: ((e.clientX - cr.left) / cr.width - 0.5) * 9, transformPerspective: 900, duration: 0.45, ease: "power2.out" });
    });
    cv2.addEventListener("mouseleave", function () { window.gsap.to(cv2, { rotateX: 0, rotateY: 0, duration: 0.6, ease: "power2.out" }); });
  }
  $("#btn-resume").addEventListener("click", shelfResume);
  $("#btn-from-start").addEventListener("click", function () {
    hideShelf();
    renderChapter(0, { to: "top", resume: false });
  });
  $("#btn-open-toc").addEventListener("click", shelfOpenToc);
  $("#btn-shelf-style").addEventListener("click", function () { openStyleChooser(); });
  $("#btn-shelf-stats").addEventListener("click", function () { hideShelf(); renderStatsPanel(); openPanel("panel-stats"); });
  $("#btn-shelf-settings").addEventListener("click", function () { syncSettingsControls(); openPanel("panel-settings"); });
  $("#lb-close").addEventListener("click", closeLightbox);
  $("#lightbox").addEventListener("click", function () { closeLightbox(); });
  $("#btn-fontcycle").addEventListener("click", function () {
    var i = FONT_CYCLE_K.indexOf(S.fontBody);
    S.fontBody = FONT_CYCLE_K[(i + 1) % 4];
    saveSettings(); applySettings(); syncSettingsControls(); updateFontBtn();
    toast("正文：" + currentFontName() + "体", 1300);
  });
  $("#btn-fs-minus").addEventListener("click", function () { stepFs(-1); });
  $("#btn-fs-plus").addEventListener("click", function () { stepFs(1); });
  $("#btn-top").addEventListener("click", function () {
    axScroll(0, reduced ? "auto" : "smooth");
  });
  $("#btn-theme").addEventListener("click", openStyleChooser);
  $("#btn-style").addEventListener("click", openStyleChooser);
  $("#so-close").addEventListener("click", closeStyleChooser);
  $("#so-start").addEventListener("click", closeStyleChooser);
  $("#btn-search").addEventListener("click", function () {
    openPanel("panel-search");
    setTimeout(function () { $("#search-input").focus(); }, 120);
  });
  $("#btn-bookmarks").addEventListener("click", function () {
    renderBookmarkPanel(); renderMarkPanel();
    openPanel("panel-bookmarks");
  });
  $("#btn-stats").addEventListener("click", function () { renderStatsPanel(); openPanel("panel-stats"); });
  $("#next-go").addEventListener("click", goAutoNext);
  $("#next-cancel").addEventListener("click", cancelAutoNext);
  $("#break-rest").addEventListener("click", function () {
    breakAcc = 0;
    var bb = $("#break-banner"); if (bb) bb.hidden = true;
    toast("歇一歇，回来继续读", 2000);
  });
  var breakLater = function () {
    breakAcc = Math.max(0, breakAcc - 600);
    var bb2 = $("#break-banner"); if (bb2) bb2.hidden = true;
  };
  $("#break-later").addEventListener("click", breakLater);
  $("#break-x").addEventListener("click", breakLater);
  $("#break-chips").addEventListener("click", function (e) {
    var t9 = e.target;
    if (!t9 || typeof t9.closest !== "function") return;
    var seg9 = t9.closest(".chip-btn[data-bmin]");
    if (!seg9) return;
    S.breakMin = parseInt(seg9.getAttribute("data-bmin"), 10) || 0;
    breakAcc = 0;
    saveSettings(); syncSettingsControls();
    var bb3 = $("#break-banner"); if (bb3) bb3.hidden = true;
    toast(S.breakMin ? "每连续阅读 " + S.breakMin + " 分钟提醒休息" : "已关闭休息提醒", 1600);
  });
  $("#btn-surprise").addEventListener("click", function () { surpriseMe(true); });
  var stageEl = $("#stage");
  var swipeX0 = null, swipeY0 = null, swipeT0 = 0;
  if (stageEl) {
    stageEl.addEventListener("touchstart", function (e) {
      if (!e.touches || !e.touches.length) return;
      swipeX0 = e.touches[0].clientX; swipeY0 = e.touches[0].clientY; swipeT0 = Date.now();
    }, { passive: true });
    stageEl.addEventListener("touchend", function (e) {
      if (swipeX0 == null) return;
      var tEv = (e.changedTouches && e.changedTouches[0]) || null;
      var x0 = swipeX0, y0 = swipeY0, t0 = swipeT0;
      swipeX0 = null;
      if (!tEv) return;
      var dx = tEv.clientX - x0, dy = tEv.clientY - y0, dt = Date.now() - t0;
      if (Math.abs(dx) < 70 || dt > 900) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.6) return;
      if (document.body.classList.contains("shelf-on")) return;
      if (dx < 0) { cancelAutoNext(); nextChapter(); }
      else if (state.idx > 0) { cancelAutoNext(); renderChapter(state.idx - 1, { to: "top" }); }
    }, { passive: true });
  }
  $("#anchor-go").addEventListener("click", returnToAnchor);
  $("#anchor-x").addEventListener("click", dismissAnchor);
  var tpEl = $("#toc-pct");
  if (tpEl) tpEl.addEventListener("input", function () {
    var v = parseInt(this.value, 10) || 0;
    var vl = $("#toc-pct-val");
    if (vl) vl.textContent = v + "%";
    axScroll((v / 100) * axMax());
    queueSaveProgress();
  });
  $("#keys-close").addEventListener("click", closeKeys);
  $("#keys-overlay").addEventListener("click", function (e) {
    var t8 = e.target;
    if (t8 === this || !t8 || typeof t8.closest !== "function" || !t8.closest(".keys-card")) closeKeys();
  });
  $("#goal-chips").addEventListener("click", function (e) {
    var t6 = e.target;
    if (!t6 || typeof t6.closest !== "function") return;
    var seg6 = t6.closest(".chip-btn[data-gmin]");
    if (!seg6) return;
    S.goalMin = parseInt(seg6.getAttribute("data-gmin"), 10) || 0;
    saveSettings(); renderStatsPanel();
    toast(S.goalMin > 0 ? "每日目标 " + S.goalMin + " 分钟" : "已关闭每日目标", 1600);
  });
  $("#seg-presets").addEventListener("click", function (e) {
    var t7 = e.target;
    if (!t7 || typeof t7.closest !== "function") return;
    var pb = t7.closest("button[data-preset]");
    if (!pb) return;
    var p = pb.getAttribute("data-preset");
    if (p === "classic") { S.fontBody = "serif"; S.size = 19; S.lh = 190; S.pg = 115; S.ls = 1; S.width = "std"; }
    else if (p === "soft") { S.fontBody = "kai"; S.size = 18; S.lh = 170; S.pg = 105; S.ls = 0; S.width = "std"; }
    else { S.fontBody = "sans"; S.size = 16; S.lh = 155; S.pg = 80; S.ls = 0; S.width = "wide"; }
    saveSettings(); applySettings(); syncSettingsControls();
    updateRangeLabel("size"); updateRangeLabel("lh"); updateRangeLabel("pg"); updateRangeLabel("ls");
    toast("已应用「" + (p === "classic" ? "古典" : p === "soft" ? "温软" : "高效") + "」排版", 1600);
  });
  renderKeys();
  $("#tts-toggle").addEventListener("click", function () { if (tts.on) ttsPauseResume(); else ttsStart(); });
  $("#tts-minus").addEventListener("click", function () {
    S.ttsRate = Math.max(0.6, Math.round((S.ttsRate - 0.1) * 10) / 10);
    saveSettings();
    $("#tts-speed").textContent = S.ttsRate + "×";
    var sr = $("#set-rate"); if (sr) { sr.value = String(Math.round(S.ttsRate * 10)); var vr = $("#val-rate"); if (vr) vr.textContent = S.ttsRate.toFixed(1) + "×"; }
  });
  $("#tts-plus").addEventListener("click", function () {
    S.ttsRate = Math.min(2, Math.round((S.ttsRate + 0.1) * 10) / 10);
    saveSettings();
    $("#tts-speed").textContent = S.ttsRate + "×";
    var sr2 = $("#set-rate"); if (sr2) { sr2.value = String(Math.round(S.ttsRate * 10)); var vr2 = $("#val-rate"); if (vr2) vr2.textContent = S.ttsRate.toFixed(1) + "×"; }
  });
  var vSel = $("#set-voice");
  if (vSel) vSel.addEventListener("change", function () { S.ttsVoice = this.value; saveSettings(); });
  var rateEl = $("#set-rate");
  if (rateEl) rateEl.addEventListener("input", function () {
    S.ttsRate = Math.round(parseInt(this.value, 10)) / 10;
    saveSettings();
    var vr3 = $("#val-rate"); if (vr3) vr3.textContent = S.ttsRate.toFixed(1) + "×";
  });
  $("#btn-export-anno").addEventListener("click", exportAnnotations);
  $("#btn-export-epub").addEventListener("click", buildEpub);
  $("#btn-export-epub2").addEventListener("click", buildEpub);
  $("#btn-backup").addEventListener("click", exportBackup);
  $("#btn-restore").addEventListener("click", function () { $("#file-restore").click(); });
  $("#file-restore").addEventListener("change", function (e) {
    if (e.target.files && e.target.files[0]) restoreBackup(e.target.files[0]);
    this.value = "";
  });
  try {
    if (window.speechSynthesis && speechSynthesis.addEventListener) speechSynthesis.addEventListener("voiceschanged", function () { syncSettingsControls(); });
  } catch (e) {}
  try {
    var mqScheme = window.matchMedia("(prefers-color-scheme: light)");
    var onScheme = function () { if (S.themeAuto) { applySettings(); syncStyleChooser(); } };
    if (mqScheme.addEventListener) mqScheme.addEventListener("change", onScheme);
    else if (mqScheme.addListener) mqScheme.addListener(onScheme);
  } catch (e) {}
  $("#btn-settings").addEventListener("click", function () {
    syncSettingsControls();
    openPanel("panel-settings");
  });
  $("#btn-focus").addEventListener("click", function () { toggleFocus(); });
  $("#btn-full").addEventListener("click", function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(function () { toast("浏览器拒绝全屏（可试 F11）", 2000); });
  });
  $("#btn-prev").addEventListener("click", function () {
    if (state.idx > 0) renderChapter(state.idx - 1, { to: "top" });
  });
  $("#btn-next").addEventListener("click", nextChapter);

  $("#toc").addEventListener("click", function (e) {
    var t0 = e.target;
    if (!t0 || typeof t0.closest !== "function") return;
    var del = t0.closest(".toc-del");
    if (del) {
      var id = del.getAttribute("data-imp-id");
      store.imports = store.imports.filter(function (x) { return x.id !== id; });
      refreshImportSeals();
      persist(LS.imports, store.imports, true);
      buildToc();
      if (state.idx >= books().length) renderChapter(books().length - 1, { to: "top" });
      else renderChapter(state.idx, { keep: true });
      toast("已移除导入章节", 1600);
      return;
    }
    var sc = e.target.closest(".toc-scene");
    if (sc) {
      snapshotAnchor();
      document.body.classList.remove("side-on");
      applyHash(state.idx, sc.getAttribute("data-scene"));
      var h = document.getElementById(sc.getAttribute("data-scene"));
      if (h) axScroll(elOff(h, 118), reduced ? "auto" : "smooth");
      return;
    }
    var item = e.target.closest(".toc-item");
    if (!item) return;
    var idx = parseInt(item.getAttribute("data-idx"), 10);
    document.body.classList.remove("side-on");
    if (idx === state.idx) {
      if (scrollPct() * 100 > 3) snapshotAnchor();
      axScroll(0, reduced ? "auto" : "smooth");
      return;
    }
    snapshotAnchor();
    renderChapter(idx, { to: "top", resume: true });
  });
  $("#toc-filter").addEventListener("input", function () { buildToc(); });

  $$(".theme-card, .style-card").forEach(function (c) {
    c.addEventListener("click", function () {
      S.theme = c.getAttribute("data-theme-opt");
      S.themeAuto = false;
      saveSettings(); applySettings(); syncSettingsControls(); syncStyleChooser();
      toast("主题：" + (THEME_NAMES[S.theme] || S.theme), 1300);
    });
  });
  $$(".font-card").forEach(function (c) {
    c.addEventListener("click", function () {
      S.fontBody = c.getAttribute("data-font");
      saveSettings(); applySettings(); syncSettingsControls(); syncStyleChooser();
      toast("正文字体已切换", 1300);
    });
  });
  $$(".cover-chip").forEach(function (c) {
    c.addEventListener("click", function () {
      S.coverSkin = c.getAttribute("data-cover");
      saveSettings(); applySettings(); syncStyleChooser();
      toast("书封皮肤已切换", 1300);
    });
  });
  var hueBind = [["set-hue", "hue"], ["set-lum", "lum"]];
  hueBind.forEach(function (pair) {
    var el = document.getElementById(pair[0]);
    if (!el) return;
    el.addEventListener("input", function () {
      S[pair[1]] = parseInt(el.value, 10);
      saveSettings(); applySettings(); syncSettingsControls(); syncStyleChooser();
    });
  });
  $("#seg-font").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    S.fontBody = b.getAttribute("data-font");
    saveSettings(); applySettings(); syncSettingsControls();
  });
  $("#seg-width").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    S.width = b.getAttribute("data-width");
    saveSettings(); applySettings(); syncSettingsControls();
  });
  [["set-size", "size"], ["set-lh", "lh"], ["set-pg", "pg"], ["set-ls", "ls"]].forEach(function (pair) {
    var el = document.getElementById(pair[0]);
    el.addEventListener("input", function () {
      S[pair[1]] = parseInt(el.value, 10);
      updateRangeLabel(pair[1]);
      saveSettings(); applySettings();
    });
  });
  $$(".set-group input[type=checkbox]").forEach(function (c) {
    c.addEventListener("change", function () {
      var key = c.id.replace("set-", "");
      S[key] = c.checked;
      saveSettings(); applySettings();
      if (key === "openingTitle") renderChapter(state.idx, { keep: true, gate: false });
      if (key === "vertical") { saveProgress(); renderChapter(state.idx, { resume: true, gate: false }); }
      if (key === "autoNext" && !c.checked) cancelAutoNext();
    });
  });
  $("#btn-reset-settings").addEventListener("click", function () {
    for (var k in DEFAULTS) S[k] = DEFAULTS[k];
    saveSettings(); applySettings(); syncSettingsControls();
    toast("已恢复默认设置", 1600);
  });
  $("#btn-clear-data").addEventListener("click", function () {
    store.marks = []; store.bookmarks = [];
    persist(LS.marks, [], true); persist(LS.bookmarks, [], true);
    renderChapter(state.idx, { keep: true });
    toast("已清空书签与划线", 1600);
  });

  var deb = null;
  $("#search-input").addEventListener("input", function () {
    if (deb) clearTimeout(deb);
    var v = this.value.trim();
    deb = setTimeout(function () {
      state.query = v;
      doSearch(v);
      if (state.idx >= 0) renderChapter(state.idx, { keep: true });
    }, 260);
  });
  $("#search-results").addEventListener("click", function (e) {
    var t2 = e.target;
    if (!t2 || typeof t2.closest !== "function") return;
    var item = t2.closest(".result-item");
    if (!item) return;
    var m = searchCache[parseInt(item.getAttribute("data-mi"), 10)];
    if (m) gotoSearchMatch(m);
  });

  $("#bm-list").addEventListener("click", function (e) {
    var t3 = e.target;
    if (!t3 || typeof t3.closest !== "function") return;
    var del = t3.closest("[data-bmdel]");
    if (del) {
      store.bookmarks.splice(parseInt(del.getAttribute("data-bmdel"), 10), 1);
      persist(LS.bookmarks, store.bookmarks, true);
      renderBookmarkPanel();
      renderChapter(state.idx, { keep: true });
      return;
    }
    var b = e.target.closest("[data-bmidx]");
    var bm = store.bookmarks[parseInt(b ? b.getAttribute("data-bmidx") : "-1", 10)];
    if (b && bm) gotoBookmark(bm);
  });
  $("#mk-list").addEventListener("click", function (e) {
    var t4 = e.target;
    if (!t4 || typeof t4.closest !== "function") return;
    var del = t4.closest("[data-mkdel]");
    if (del) {
      store.marks.splice(parseInt(del.getAttribute("data-mkdel"), 10), 1);
      persist(LS.marks, store.marks, true);
      renderMarkPanel();
      renderChapter(state.idx, { keep: true });
      return;
    }
    var b = e.target.closest("[data-mkidx]");
    var mk = store.marks[parseInt(b ? b.getAttribute("data-mkidx") : "-1", 10)];
    if (b && mk) gotoMark(mk);
  });
  $$(".tab").forEach(function (t) {
    t.addEventListener("click", function () {
      $$(".tab").forEach(function (x) { x.classList.remove("active"); });
      t.classList.add("active");
      var which = t.getAttribute("data-tab");
      $("#bm-list").hidden = which === "mk";
      $("#mk-list").hidden = which === "bm";
    });
  });

  document.addEventListener("mouseup", function (e) {
    var t5 = e.target;
    if (t5 && typeof t5.closest === "function" && t5.closest("#selbar")) return;
    setTimeout(onSelection, 10);
  });
  document.addEventListener("selectionchange", function () {
    var s7 = window.getSelection();
    if (!s7 || s7.isCollapsed) {
      $("#selbar").hidden = true;
      selState = null;
      return;
    }
    onSelection();
  });
  document.addEventListener("scroll", function () {
    var bar = $("#selbar");
    if (bar && !bar.hidden) { bar.hidden = true; }
  });
  $("#sel-mark").addEventListener("click", addSelMark);
  $("#sel-bm").addEventListener("click", addSelBookmark);
  $$(".panel-x").forEach(function (b) { b.addEventListener("click", closePanel); });
  $("#sel-close").addEventListener("click", function () {
    $("#selbar").hidden = true;
    selState = null;
    try { window.getSelection() && window.getSelection().removeAllRanges(); } catch (e) {}
  });

  $("#chapter").addEventListener("click", function (e) {
    var t1 = e.target;
    if (!t1 || typeof t1.closest !== "function") return;
    var im = t1.closest("figure.fig img");
    if (im) {
      var capEl = im.closest("figure");
      var capText = capEl && capEl.querySelector("figcaption") ? capEl.querySelector("figcaption").textContent : "";
      openLightbox(im.currentSrc || im.src, capText);
      return;
    }
    var btn = e.target.closest(".p-bm");
    if (!btn) return;
    var p = btn.closest("p");
    if (!p) return;
    toggleBookmark(currentBook(), p.getAttribute("data-p"), p);
  });
  var sn = $("#scene-nav");
  if (sn) sn.addEventListener("click", function (e) {
    var tSn = e.target;
    if (!tSn || typeof tSn.closest !== "function") return;
    var seg = tSn.closest(".seg");
    if (!seg) return;
    snapshotAnchor();
    var h = document.getElementById(seg.getAttribute("data-scene"));
    if (h) {
      axScroll(elOff(h, 118), reduced ? "auto" : "smooth");
      applyHash(state.idx, seg.getAttribute("data-scene"));
    }
  });

  $("#auto-toggle").addEventListener("click", toggleAuto);
  $("#auto-speed").textContent = AUTO_LABEL[S.autoSpeed] || "匀速";
  $("#auto-minus").addEventListener("click", function () {
    if (S.autoSpeed > 0) S.autoSpeed--;
    saveSettings();
    $("#auto-speed").textContent = AUTO_LABEL[S.autoSpeed] || "匀速";
  });
  $("#auto-plus").addEventListener("click", function () {
    if (S.autoSpeed < 3) S.autoSpeed++;
    saveSettings();
    $("#auto-speed").textContent = AUTO_LABEL[S.autoSpeed] || "匀速";
  });
  document.addEventListener("keydown", function (e) {
    var t = e.target;
    var inInput = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    if (e.key === "Escape") {
      var ko = $("#keys-overlay");
      if (ko && !ko.hidden) { closeKeys(); return; }
      var lb = $("#lightbox");
      if (lb && !lb.hidden) { closeLightbox(); return; }
      var so = $("#style-overlay");
      if (so && !so.hidden) { closeStyleChooser(); return; }
      closePanel();
      document.body.classList.remove("side-on");
      if (state.auto) stopAuto();
      if (state.paraFocus) exitParaFocus();
      if (tts.on) ttsStop();
      cancelAutoNext();
      var sb5 = $("#selbar");
      if (sb5 && !sb5.hidden) { sb5.hidden = true; selState = null; }
      return;
    }
    if (inInput) return;
    if (document.body.classList.contains("shelf-on")) return;
    var k = e.key;
    if (state.paraFocus) {
      if (k === "ArrowDown") { e.preventDefault(); setParaFocus((state.focusP || 0) + 1, true); return; }
      if (k === "ArrowUp") { e.preventDefault(); setParaFocus((state.focusP || 0) - 1, true); return; }
    }
    if (k === "ArrowLeft") { if (state.idx > 0) renderChapter(state.idx - 1, { to: "top" }); }
    else if (k === "ArrowRight") { nextChapter(); }
    else if (k === "t" || k === "T") { toggleSide(); }
    else if (k === "h" || k === "H") { showShelf(); }
    else if (k === "s" || k === "S") { togglePanel("panel-settings"); }
    else if (k === "/") {
      e.preventDefault();
      openPanel("panel-search");
      setTimeout(function () { $("#search-input").focus(); }, 120);
    }
    else if (k === "f" || k === "F") { toggleFocus(); }
    else if (k === "?") { e.preventDefault(); openKeys(); }
    else if (k === "r" || k === "R") { if (tts.on) ttsStop(); else ttsStart(); }
    else if (k === "b" || k === "B") { if (state.anchor) returnToAnchor(); }
    else if (k === "x" || k === "X") { surpriseMe(document.body.classList.contains("shelf-on")); }
    else if (k === " ") { if (state.auto) { e.preventDefault(); stopAuto(); } }
  });
  var pauseAuto = function () { if (state.auto) stopAuto(); if (tts.on) ttsStop(); cancelAutoNext(); };
  window.addEventListener("wheel", pauseAuto, { passive: true });
  window.addEventListener("touchstart", pauseAuto, { passive: true });

  $("#btn-import-file").addEventListener("click", function () { $("#file-input").click(); });
  $("#file-input").addEventListener("change", function (e) { handleFiles(e.target.files); this.value = ""; });
  $("#btn-rebuild").addEventListener("click", pickDirAndRebuild);
  var rb2 = $("#btn-rebuild2");
  if (rb2) rb2.addEventListener("click", pickDirAndRebuild);
  $("#dir-input").addEventListener("change", function (e) {
    var fs2 = e.target.files;
    if (fs2.length && fs2[0].webkitRelativePath) {
      var dn = fs2[0].webkitRelativePath.split("/")[0];
      try { localStorage.setItem("vsw-reader.dirName", dn); } catch (e2) {}
      showRememberedDir(dn);
    }
    rebuildFromFiles(fs2);
    this.value = "";
  });
  var dragCount = 0;
  window.addEventListener("dragenter", function (e) { e.preventDefault(); dragCount++; document.body.classList.add("dragging"); });
  window.addEventListener("dragover", function (e) { e.preventDefault(); });
  window.addEventListener("dragleave", function () { dragCount = Math.max(0, dragCount - 1); if (!dragCount) document.body.classList.remove("dragging"); });
  window.addEventListener("drop", function (e) {
    e.preventDefault(); dragCount = 0; document.body.classList.remove("dragging");
    if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  });

  $("#toast-go").addEventListener("click", function () {
    hideToast();
    shelfResume();
  });
  $("#toast-close").addEventListener("click", hideToast);

  var ticking = false;
  window.addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      updateSpine();
      markTocActive();
      queueSaveProgress();
      markActivity();
      if (state.paraFocus) updateParaFocus();
      maybeAutoNext();
      var tp2 = $("#btn-top");
      if (tp2) tp2.classList.toggle("show", axY() > 600);
    });
  }, { passive: true });
  window.addEventListener("resize", function () { applySettings(); });
  window.addEventListener("hashchange", function () {
    var t = hashTarget();
    if (!t) return;
    if (document.body.classList.contains("shelf-on")) hideShelf();
    if (t.idx !== state.idx) {
      renderChapter(t.idx, t.scene ? { to: "scene", id: t.scene, resume: false, lock: true } : { to: "top", resume: true });
    } else if (t.scene) {
      var hEl = document.getElementById(t.scene);
      if (hEl) axScroll(elOff(hEl, 118), reduced ? "auto" : "smooth");
    }
  });
}

/* ---------- EPUB 导出（手写 ZIP） ---------- */
var CRC_TABLE = (function () {
  var t = [];
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(u8) {
  var c = 0xFFFFFFFF;
  for (var i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function utf8b(s) { try { return new TextEncoder().encode(s); } catch (e) { return new Uint8Array(0); } }
function u16le(n) { return [n & 255, (n >> 8) & 255]; }
function u32le(n) { return [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]; }
function epZLocal(name, dataU8) {
  var nb = utf8b(name);
  var h = [0x50, 0x4B, 3, 4].concat(u16le(20), u16le(0x0800), u16le(0), u16le(0), u16le(0), u32le(crc32(dataU8)), u32le(dataU8.length), u32le(dataU8.length), u16le(nb.length), u16le(0));
  var out = new Uint8Array(h.length + nb.length + dataU8.length);
  out.set(h, 0); out.set(nb, h.length); out.set(dataU8, h.length + nb.length);
  return out;
}
function epZCentral(name, dataU8, offset) {
  var nb = utf8b(name);
  var h = [0x50, 0x4B, 1, 2].concat(u16le(20), u16le(20), u16le(0x0800), u16le(0), u16le(0), u16le(0), u32le(crc32(dataU8)), u32le(dataU8.length), u32le(dataU8.length), u16le(nb.length), u16le(0), u16le(0), u16le(0), u16le(0), u32le(0), u32le(offset));
  var out = new Uint8Array(h.length + nb.length);
  out.set(h, 0); out.set(nb, h.length);
  return out;
}
function epZip(entries) {
  var parts = [], central = [], off = 0;
  entries.forEach(function (en) {
    var loc = epZLocal(en.name, en.data);
    parts.push(loc);
    central.push(epZCentral(en.name, en.data, off));
    off += loc.length;
  });
  var cSize = 0;
  central.forEach(function (c) { cSize += c.length; });
  var eocd = [0x50, 0x4B, 5, 6].concat(u16le(0), u16le(0), u16le(entries.length), u16le(entries.length), u32le(cSize), u32le(off), u16le(0));
  var out = new Uint8Array(off + cSize + eocd.length);
  var p = 0;
  parts.forEach(function (x) { out.set(x, p); p += x.length; });
  central.forEach(function (x) { out.set(x, p); p += x.length; });
  out.set(eocd, p);
  return out;
}
function buildEpub() {
  var bs = books();
  if (!bs.length) { toast("没有内容可导出", 1800); return; }
  try {
    var uid = "aster-reader-" + Date.now();
    var manifest = '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>', spine = "";
    var items = [], chapterFiles = [];
    var stripSvg = function (h) { return h.replace(/<svg class="ic"[^>]*><use[^>]*><\/use><\/svg>/g, "◆"); };
    bs.forEach(function (b, i) {
      var fn = "ch" + (i + 1) + ".xhtml";
      var body = stripSvg(b.html || "");
      var xhtml = '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml">\n<head><meta charset="utf-8"/><title>' + esc(b.title) + '</title></head>\n<body>\n<h1>' + esc(b.title) + '</h1>\n' + body + '\n</body>\n</html>';
      items.push({ name: "OEBPS/" + fn, data: utf8b(xhtml) });
      manifest += '<item id="c' + i + '" href="' + fn + '" media-type="application/xhtml+xml"/>';
      spine += '<itemref idref="c' + i + '"/>';
      chapterFiles.push({ fn: fn, title: b.title, idx: i });
    });
    var ncx = '<?xml version="1.0" encoding="utf-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="' + uid + '"/></head><docTitle><text>' + esc(BOOK.title) + '</text></docTitle><navMap>';
    chapterFiles.forEach(function (c) { ncx += '<navPoint id="n' + c.idx + '" playOrder="' + (c.idx + 1) + '"><navLabel><text>' + esc(c.title) + '</text></navLabel><content src="' + c.fn + '"/></navPoint>'; });
    ncx += '</navMap></ncx>';
    items.push({ name: "OEBPS/toc.ncx", data: utf8b(ncx) });
    var opf = '<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid" version="2.0">\n<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf"><dc:identifier id="uid" opf:scheme="URI">' + uid + '</dc:identifier><dc:title>' + esc(BOOK.title) + '</dc:title><dc:language>zh-CN</dc:language></metadata>\n<manifest>' + manifest + '</manifest>\n<spine toc="ncx">' + spine + '</spine>\n</package>';
    items.push({ name: "OEBPS/content.opf", data: utf8b(opf) });
    items.push({ name: "META-INF/container.xml", data: utf8b('<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>') });
    items.unshift({ name: "mimetype", data: utf8b("application/epub+zip") });
    var zip = epZip(items);
    var ok = dlBlobData("Aster-全本.epub", zip, "application/epub+zip");
    toast(ok ? "已导出 EPUB 全本（" + bs.length + " 篇，可直接导入微信读书/掌阅等）" : "导出失败", 2600);
  } catch (e) { toast("EPUB 生成失败：" + (e && e.message ? e.message : ""), 2600); }
}
function dlBlobData(name, u8, mime) {
  try {
    var blob = new Blob([u8], { type: mime || "application/octet-stream" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 6000);
    return true;
  } catch (e) { return false; }
}

/* ---------- 批注导出 / 备份恢复 ---------- */
function stamp() {
  var d = new Date();
  function p2n(n) { return (n < 10 ? "0" : "") + n; }
  return d.getFullYear() + p2n(d.getMonth() + 1) + p2n(d.getDate()) + "-" + p2n(d.getHours()) + p2n(d.getMinutes());
}
function dlBlob(name, text, mime) {
  try {
    var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 6000);
    return true;
  } catch (e) { return false; }
}
function exportAnnotations() {
  var items = [];
  store.bookmarks.forEach(function (m) { items.push({ ch: m.ch, kind: "书签", p: parseInt(m.p, 10) || 0, text: m.snip, t: m.t }); });
  store.marks.forEach(function (m) { items.push({ ch: m.ch, kind: "划线", p: parseInt(m.p, 10) || 0, text: m.text, t: m.t }); });
  if (!items.length) { toast("还没有书签或划线，先读起来再导出吧", 2200); return; }
  items.sort(function (a, b) { return a.ch === b.ch ? (a.p - b.p) : (a.ch < b.ch ? -1 : 1); });
  var chOrder = [], byCh = {};
  items.forEach(function (it) { if (!byCh[it.ch]) { byCh[it.ch] = []; chOrder.push(it.ch); } byCh[it.ch].push(it); });
  var L = ["# " + BOOK.title + " · 批注导出", "", "> 导出时间：" + new Date().toLocaleString() + "，共 " + items.length + " 条（书签 " + store.bookmarks.length + " / 划线 " + store.marks.length + "）", ""];
  chOrder.forEach(function (chId) {
    var b = null;
    books().forEach(function (x) { if (x.id === chId) b = x; });
    L.push("## " + (b ? b.title : chId));
    byCh[chId].forEach(function (it, i) {
      var pctTxt = "";
      if (b && b.paraCount) pctTxt = "（约 " + Math.min(99, Math.round((it.p + 1) / b.paraCount * 100)) + "%）";
      var when = it.t ? new Date(it.t).toLocaleString() : "";
      L.push((i + 1) + ". **[" + it.kind + "]** 第 " + (it.p + 1) + " 段" + pctTxt + (when ? " · " + when : "") + "：" + it.text.replace(/[\r\n]+/g, " "));
    });
    L.push("");
  });
  var ok = dlBlob("Aster批注-" + stamp() + ".md", "\uFEFF" + L.join("\n"), "text/markdown;charset=utf-8");
  toast(ok ? "批注已导出为 md 文件" : "导出失败（浏览器限制）", 2200);
}
function exportBackup() {
  var data = { app: "vsw-reader", v: 1, exported: new Date().toISOString(), keys: {} };
  Object.keys(LS).forEach(function (k) { data.keys[k] = localStorage.getItem(LS[k]); });
  var ok = dlBlob("Aster阅读器备份-" + stamp() + ".json", JSON.stringify(data), "application/json;charset=utf-8");
  toast(ok ? "备份已导出（设置 / 进度 / 书签 / 划线 / 统计）" : "导出失败（浏览器限制）", 2200);
}
function restoreBackup(file) {
  var rd = new FileReader();
  rd.onload = function () {
    try {
      var data = JSON.parse(String(rd.result));
      if (!data || data.app !== "vsw-reader" || data.v !== 1 || !data.keys || typeof data.keys !== "object") throw new Error("bad");
      var n = 0;
      Object.keys(data.keys).forEach(function (k) {
        if (LS[k] && typeof data.keys[k] === "string" && data.keys[k].length < 4000000) { localStorage.setItem(LS[k], data.keys[k]); n++; }
      });
      toast("已恢复 " + n + " 项数据，正在重载…", 1800);
      setTimeout(function () { location.reload(); }, 900);
    } catch (e) { toast("备份文件无效或已损坏", 2600); }
  };
  rd.readAsText(file);
}

/* ---------- 启动 ---------- */
function init() {
  if ("scrollRestoration" in history) { try { history.scrollRestoration = "manual"; } catch (e0) {} }
  loadStore();
  try {
    var sp = JSON.parse(localStorage.getItem(LS.books) || "null");
    var builtMs = BOOK.updated ? Date.parse(BOOK.updated) : 0;
    if (sp && Array.isArray(sp.books) && sp.books.length && sp.updated > builtMs) {
      BOOK.books = sp.books;
    } else if (localStorage.getItem(LS.books)) {
      localStorage.removeItem(LS.books);
    }
  } catch (e) {}
  for (var k in DEFAULTS) {
    S[k] = (store.settings && store.settings[k] != null) ? store.settings[k] : DEFAULTS[k];
  }
  var storyN = 0;
  BOOK.books.forEach(function (b) {
    if (b.metaChapter) b.seal = "设定";
    else { storyN++; b.seal = "第 " + pad2(storyN) + " 篇"; }
  });
  if (!Array.isArray(store.imports)) store.imports = [];
  refreshImportSeals();
  if (!Array.isArray(store.marks)) store.marks = [];
  if (!Array.isArray(store.bookmarks)) store.bookmarks = [];

  // 内置引擎模式下, 联网时静默升级为真 GSAP(失败无影响)
  if (window.gsapFallback) {
    var g = document.createElement("script");
    g.src = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
    g.onload = function () { try { window.gsapFallback = false; } catch (e) {} };
    g.onerror = function () { g.remove(); };
    document.head.appendChild(g);
  }

  var hasLast = store.last && store.last.idx != null && store.last.idx < books().length && store.last.idx >= 0;
  var ph = hashTarget();

  applySettings();
  $("#side-book-name").textContent = BOOK.title;
  $("#side-book-sub").textContent = "共 " + books().length + " 篇 · 更新 " + (BOOK.updated || "");
  bindUI();
  syncSettingsControls();
  buildToc();
  initStats();
  var savedDir = null;
  try { savedDir = localStorage.getItem("vsw-reader.dirName"); } catch (e) {}
  if (savedDir) showRememberedDir(savedDir);
  if (IDB_OK) {
    idbGetDir().then(function (h) { if (h && h.name) showRememberedDir(h.name); });
  }
  var startIdx = ph ? ph.idx : (hasLast ? store.last.idx : books().length - 1);
  renderChapter(startIdx, ph && ph.scene ? { to: "scene", id: ph.scene, resume: false, flip: false, lock: true } : { to: hasLast ? "pct" : "top", flip: false });
  if (S.shelfHome && !ph) showShelf();
  if (!store.settings && !ph) openStyleChooser();
  if (hasLast && store.last.idx !== 0 && !ph) {
    var lb = books()[store.last.idx];
    toastWithActions("继续上次阅读：《" + lb.title + "》 · " + (store.progress[lb.id] || 0) + "%", 20000);
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
})();
