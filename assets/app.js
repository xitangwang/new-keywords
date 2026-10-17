/* nk-ui v2 (2026-10 redesign) */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // 行内 markdown：`code`、**粗体**、[文字](链接)、裸链接
  function inline(s) {
    var codes = [];
    var t = esc(s).replace(/`([^`]+)`/g, function (_, c) { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/(^|[^"=>])(https?:\/\/[^\s<，、。；;（）()\[\]"']+)/g, function (_, pre, url) {
      var tail = "";
      var m = url.match(/[.,;:!?]+$/); if (m) { tail = m[0]; url = url.slice(0, -tail.length); }
      return pre + '<a href="' + url + '" target="_blank" rel="noopener">' + url + "</a>" + tail;
    });
    t = t.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    t = t.replace(/\u0000(\d+)\u0000/g, function (_, i) { return "<code>" + codes[+i] + "</code>"; });
    return t;
  }
  // 块级 markdown：段落、列表、引用、标题、表格
  function splitRow(line) {
    var t = line.trim().replace(/^\|/, "").replace(/\|$/, ""), cells = [], cur = "";
    for (var i = 0; i < t.length; i++) {
      if (t[i] === "\\" && t[i + 1] === "|") { cur += "|"; i++; }
      else if (t[i] === "|") { cells.push(cur.trim()); cur = ""; }
      else cur += t[i];
    }
    cells.push(cur.trim());
    return cells;
  }
  function isSep(line) { return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line); }
  function md(src) {
    var out = [], list = null, para = [];
    var lines = String(src || "").split(/\r?\n/);
    function flushPara() { if (para.length) { out.push("<p>" + para.map(inline).join("<br>") + "</p>"); para = []; } }
    function closeList() { if (list) { out.push("</" + list + ">"); list = null; } }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i], m;
      if (/^\s*\|/.test(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
        flushPara(); closeList();
        var head = splitRow(line), rows = [];
        i += 2;
        while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
        i--;
        out.push(mdTable(head, rows));
        continue;
      }
      if (/^\s*$/.test(line) || /^-{3,}\s*$/.test(line)) { flushPara(); closeList(); continue; }
      if ((m = line.match(/^\s*[-*]\s+(.*)/))) { flushPara(); if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; } out.push("<li>" + inline(m[1]) + "</li>"); continue; }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { flushPara(); if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; } out.push("<li>" + inline(m[1]) + "</li>"); continue; }
      if ((m = line.match(/^>\s?(.*)/))) { flushPara(); closeList(); out.push("<blockquote>" + inline(m[1]) + "</blockquote>"); continue; }
      if ((m = line.match(/^(#{1,6})\s+(.*)/))) { flushPara(); closeList(); var lv = Math.min(6, Math.max(3, m[1].length + 1)); out.push("<h" + lv + ">" + inline(m[2]) + "</h" + lv + ">"); continue; }
      closeList(); para.push(line);
    }
    flushPara(); closeList();
    return out.join("");
  }
  // 窄表格保留表格（自身容器内横向滚动）；4 列以上改成「标签：值」卡片列表
  function mdTable(head, rows) {
    if (head.length <= 3) {
      return '<div class="tbl-wrap"><table><thead><tr>' + head.map(function (h) { return "<th>" + inline(h) + "</th>"; }).join("") +
        "</tr></thead><tbody>" + rows.map(function (r) {
          return "<tr>" + head.map(function (_, k) { return "<td>" + inline(r[k] || "") + "</td>"; }).join("") + "</tr>";
        }).join("") + "</tbody></table></div>";
    }
    return '<div class="kv-list">' + rows.map(function (r) {
      return '<dl class="kv-item"><div class="kv-title">' + inline(r[0] || "") + "</div>" + head.slice(1).map(function (h, k) {
        var v = r[k + 1]; if (v == null || v === "" ) return "";
        return "<dt>" + inline(h) + "</dt><dd>" + inline(v) + "</dd>";
      }).join("") + "</dl>";
    }).join("") + "</div>";
  }
  function parseMdTables(src) {
    var lines = String(src || "").split(/\r?\n/), out = [];
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*\|/.test(lines[i]) && i + 1 < lines.length && isSep(lines[i + 1])) {
        var head = splitRow(lines[i]), rows = []; i += 2;
        while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
        out.push({ header: head, rows: rows });
      }
    }
    return out;
  }
  function stripMdTables(src) {
    var lines = String(src || "").split(/\r?\n/), out = [];
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*\|/.test(lines[i])) continue;
      out.push(lines[i]);
    }
    return out.join("\n");
  }
  function plain(s) { return String(s == null ? "" : s).replace(/\*\*/g, "").replace(/`/g, "").trim(); }
  function short(s, n) {
    s = plain(s).replace(/https?:\/\/\S+/g, "").trim();
    var m = s.split(/[；;。]/)[0];
    if (m.length > n) m = m.slice(0, n - 1) + "…";
    return m;
  }
  function slug(s) { return String(s || "").toLowerCase().replace(/[^0-9a-z\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, ""); }
  function num(v) { var m = plain(v).match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null; }
  function col(h, re) { for (var i = 0; i < h.length; i++) if (re.test(h[i])) return i; return -1; }
  function getJSON(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(url + " " + r.status); return r.json(); });
  }
  function fmtTime(iso) {
    if (!iso) return "";
    var d = new Date(iso); if (isNaN(d)) return iso;
    var b = new Date(d.getTime() + 8 * 3600e3), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return b.getUTCFullYear() + "-" + p(b.getUTCMonth() + 1) + "-" + p(b.getUTCDate()) + " " + p(b.getUTCHours()) + ":" + p(b.getUTCMinutes()) + "（北京时间）";
  }

  var $ = function (id) { return document.getElementById(id); };
  var state = { dates: [], day: null, tab: "today", q: {}, sort: {}, limit: {} };
  var TABS = [["today", "今日推荐"], ["effects", "🎬 视频玩法词"], ["pool", "候选池"], ["watch", "观察名单"]];
  var STAGES = ["起量", "萌芽", "拥挤", "回落"];

  // ---------- 候选词（深挖） ----------
  function cands() { return ((state.day && state.day.candidates) || []).slice().sort(function (a, b) {
    return (b.rating || 0) - (a.rating || 0) || ((b.deep_dive && b.deep_dive.total) || 0) - ((a.deep_dive && a.deep_dive.total) || 0) || (a.rank || 999) - (b.rank || 999);
  }); }
  function dim(c, re) {
    var s = ((c.deep_dive && c.deep_dive.scores) || []).filter(function (x) { return re.test(x.dim); })[0];
    return s || null;
  }
  function compBadge(c) {
    var s = dim(c, /竞争/);
    if (!s) return "";
    // 评分越高 = 竞争越小
    var lv = s.score >= 4 ? ["竞争低", "ok"] : s.score >= 3 ? ["竞争中", "mid"] : ["竞争高", "bad"];
    return '<span class="badge ' + lv[1] + '" title="' + esc(s.note || "") + '">' + lv[0] + "</span>";
  }
  function ratingBadge(c) {
    var dd = c.deep_dive;
    var parts = [];
    if (c.rating != null) parts.push('<span class="rating">★ ' + c.rating + "</span>");
    if (dd && dd.total != null) parts.push('<span class="score">' + dd.total + (dd.max ? "/" + dd.max : "") + " 分</span>");
    return parts.join("");
  }
  function topCard(c, i) {
    var fs = plain(c.first_seen), ev = short(fs.length >= 16 ? fs : (c.trend_signal || fs), 60);
    return '<article class="top-card" data-kw="' + esc(slug(c.keyword)) + '" tabindex="0">' +
      '<div class="top-rank">' + (i + 1) + "</div>" +
      '<h3 class="kw">' + esc(c.keyword) + "</h3>" +
      '<div class="badges">' + ratingBadge(c) + compBadge(c) + "</div>" +
      '<p class="what">' + esc(short(c.description, 70)) + "</p>" +
      (c.reason ? '<p class="why"><span>为什么做</span>' + esc(short(c.reason, 60)) + "</p>" : "") +
      (ev ? '<p class="ev"><span>关键证据</span>' + esc(ev) + "</p>" : "") +
      '<div class="more">查看详情 →</div></article>';
  }
  function rowCard(c) {
    return '<button class="row" data-kw="' + esc(slug(c.keyword)) + '">' +
      '<span class="row-main"><span class="row-kw">' + esc(c.keyword) + '</span><span class="row-note">' + esc(short(c.description, 56)) + "</span></span>" +
      '<span class="row-side">' + ratingBadge(c) + compBadge(c) + "</span></button>";
  }
  function renderToday() {
    var d = state.day, cs = cands();
    if (!cs.length) return d.raw_markdown ? '<div class="panel md">' + md(d.raw_markdown) + "</div>" : '<div class="empty">这一天没有候选词</div>';
    var h = '<h2 class="sec-title">今日 Top 3</h2><div class="top-grid">' + cs.slice(0, 3).map(topCard).join("") + "</div>";
    if (cs.length > 3) h += '<h2 class="sec-title">其他候选 <small>' + (cs.length - 3) + "</small></h2><div class=\"rows\">" + cs.slice(3).map(rowCard).join("") + "</div>";
    var extras = [];
    if (d.top_picks) extras.push(["⭐ Top 推荐理由", d.top_picks]);
    if (d.supplement) extras.push(["补充（不进排名）", d.supplement]);
    (d.other_sections || []).forEach(function (s) { extras.push([s.title, s.markdown]); });
    if (d.monitoring) extras.push(["每天监控的信号源", d.monitoring]);
    if (d.preface) extras.push(["本期方法与数据说明", d.preface]);
    if (extras.length) h += '<h2 class="sec-title">报告其他内容</h2><div class="folds">' + extras.map(function (x) {
      return '<details class="fold"><summary>' + esc(x[0]) + '</summary><div class="md">' + md(x[1]) + "</div></details>";
    }).join("") + "</div>";
    return h;
  }

  // ---------- 详情（深挖） ----------
  function findBySlug(kw) { return cands().filter(function (c) { return slug(c.keyword) === kw; })[0] || null; }
  function scoreBars(dd) {
    if (!dd || !(dd.scores || []).length) return "";
    return '<div class="bars">' + dd.scores.map(function (x) {
      var pct = Math.max(0, Math.min(100, x.score / 5 * 100));
      return '<div class="bar"><span class="bar-l">' + esc(x.dim) + '</span><span class="bar-t"><i style="width:' + pct + '%"></i></span><span class="bar-v">' + x.score + '</span><span class="bar-n">' + esc(x.note || "") + "</span></div>";
    }).join("") + "</div>";
  }
  function kv(pairs) {
    pairs = pairs.filter(function (p) { return p[1] != null && plain(p[1]) !== ""; });
    return pairs.length ? '<dl class="kv">' + pairs.map(function (p) { return "<dt>" + esc(p[0]) + "</dt><dd>" + inline(p[1]) + "</dd>"; }).join("") + "</dl>" : "";
  }
  function openDetail(kw) {
    var c = findBySlug(kw); if (!c) return;
    var dd = c.deep_dive || {}, h = [];
    h.push('<header class="dd-head"><h2>' + esc(c.keyword) + "</h2>" + (c.keyword_note ? '<div class="kw-note">' + esc(plain(c.keyword_note)) + "</div>" : "") +
      '<div class="badges">' + ratingBadge(c) + compBadge(c) + "</div>" +
      (c.description ? '<p class="what">' + inline(c.description) + "</p>" : "") + "</header>");
    if (c.reason) h.push('<section class="dd-sec"><h3>评级理由</h3><p>' + inline(c.reason) + "</p></section>");
    if (dd.scores && dd.scores.length) h.push('<section class="dd-sec"><h3>评分</h3>' + scoreBars(dd) + "</section>");
    h.push('<section class="dd-sec"><h3>概要</h3>' + kv([["首次出现", c.first_seen], ["热度信号", c.trend_signal], ["SERP 竞争", c.serp], ["域名", c.domain], ["产品思路", c.idea], ["来源", c.sources_text]].concat(
      Object.keys(c.extra || {}).map(function (k) { return [k, c.extra[k]]; }))) + "</section>");
    if (dd.intro) h.push('<section class="dd-sec"><div class="md">' + md(dd.intro) + "</div></section>");
    (dd.sections || []).forEach(function (s) {
      h.push('<details class="fold dd-fold"><summary>' + esc(s.title) + '</summary><div class="md">' + md(s.markdown) + "</div></details>");
    });
    $("detailBody").innerHTML = h.join("");
    $("detail").hidden = false; document.body.classList.add("noscroll");
    $("detail").querySelector(".detail-card").scrollTop = 0;
    var want = "#" + state.day.date + "/" + kw; if (location.hash !== want) history.replaceState(null, "", want);
  }
  function closeDetail() {
    $("detail").hidden = true; document.body.classList.remove("noscroll");
    if (state.day) history.replaceState(null, "", "#" + state.day.date);
  }

  // ---------- 通用：列表 + 展开 ----------
  function itemDetails(header, row, skip) {
    return kv(header.map(function (hh, i) { return skip.indexOf(i) >= 0 ? null : [plain(hh), row[i]]; }).filter(Boolean));
  }
  function toolbar(which, sorts) {
    return '<div class="toolbar"><input type="search" class="q" data-w="' + which + '" placeholder="搜索关键词…" value="' + esc(state.q[which] || "") + '">' +
      (sorts ? '<select class="sort" data-w="' + which + '">' + sorts.map(function (s) {
        return "<option value=\"" + s[0] + "\"" + (state.sort[which] === s[0] ? " selected" : "") + ">" + s[1] + "</option>"; }).join("") + "</select>" : "") + "</div>";
  }
  function listItem(o) {
    return '<details class="item"><summary><span class="row-main"><span class="row-kw">' + esc(o.kw) + "</span>" +
      (o.note ? '<span class="row-note">' + esc(o.note) + "</span>" : "") + '</span><span class="row-side">' + (o.side || "") + "</span></summary>" +
      '<div class="item-body">' + o.body + "</div></details>";
  }

  // ---------- 视频玩法词 ----------
  function stageOf(s) { var m = plain(s).match(/起量|萌芽|拥挤|回落/); return m ? m[0] : "其他"; }
  function chips(s) {
    s = plain(s); if (!s || s === "—" || s === "-") return "";
    return s.split(/[、,，]/).map(function (x) { x = x.replace(/[（(].*$/, "").trim(); return x ? '<span class="chip">' + esc(x) + "</span>" : ""; })
      .filter(function (v, i, a) { return v && a.indexOf(v) === i; }).join("");
  }
  function effectItems() {
    var t = state.day.effects, items = [];
    if (!t) return items;
    function add(h, rows, forced) {
      var iSt = col(h, /阶段/), iCl = col(h, /玩法簇/), iRep = col(h, /代表词/), iRisk = col(h, /风险/), iAct = col(h, /动作/), iDom = col(h, /新域名/), iHot = col(h, /热度/);
      rows.forEach(function (r) {
        var st = forced || stageOf(r[iSt]);
        var dn = iDom >= 0 ? num(r[iDom]) : null;
        items.push({ stage: st, kw: plain(iCl >= 0 ? r[iCl] : r[0]), rep: iRep >= 0 ? plain(r[iRep]) : "", act: iAct >= 0 ? plain(r[iAct]) : "",
          risk: iRisk >= 0 ? r[iRisk] : "", hot: iHot >= 0 ? num(r[iHot]) : null, dom: dn,
          body: (iSt >= 0 ? '<p class="stage-note">' + inline(r[iSt]) + "</p>" : "") + itemDetails(h, r, [iSt, iCl]), text: r.join(" ").toLowerCase() });
      });
    }
    add(t.header || [], t.rows || []);
    parseMdTables(t.rest).forEach(function (tb) { add(tb.header, tb.rows, /阶段/.test(tb.header.join("")) ? null : "回落"); });
    return items;
  }
  function renderEffects() {
    var t = state.day.effects;
    if (!t) return '<div class="empty">这一天的报告没有视频玩法词（v4 起才有）。</div>';
    var q = (state.q.effects || "").trim().toLowerCase();
    var items = effectItems().filter(function (x) { return !q || x.text.indexOf(q) >= 0; });
    var h = toolbar("effects");
    var groups = STAGES.concat(["其他"]);
    groups.forEach(function (g) {
      var list = items.filter(function (x) { return x.stage === g; });
      if (!list.length) return;
      var body = list.map(function (x) {
        var side = '<span class="stage s-' + g + '">' + g + "</span>" + (x.hot != null ? '<span class="num" title="哥飞热度（GPTs×）">热度 ' + x.hot + "</span>" : "");
        var note = [x.rep && x.rep !== x.kw ? x.rep : "", x.act].filter(Boolean).join(" · ");
        return '<details class="item"><summary><span class="row-main"><span class="row-kw">' + esc(x.kw) + '</span><span class="row-note">' + esc(short(note, 70)) + "</span>" +
          (chips(x.risk) ? '<span class="chips">' + chips(x.risk) + "</span>" : "") + '</span><span class="row-side">' + side + "</span></summary>" +
          '<div class="item-body">' + x.body + "</div></details>";
      }).join("");
      var open = (g === "起量" || g === "萌芽" || (g === "拥挤" && !items.some(function (x) { return x.stage === "起量" || x.stage === "萌芽"; }))) || q;
      h += '<details class="group"' + (open ? " open" : "") + '><summary><span class="stage s-' + g + '">' + g + "</span> " + list.length + " 个</summary><div class=\"rows\">" + body + "</div></details>";
    });
    if (!items.length) h += '<div class="empty">没有匹配的玩法词</div>';
    var note = stripMdTables(t.note || ""), restTxt = stripMdTables(t.rest || "").replace(/\*\*回落[^\n]*\n?/, "");
    if (plain(note + restTxt)) h += '<details class="fold"><summary>说明</summary><div class="md">' + md(note) + md(restTxt) + "</div></details>";
    return h;
  }

  // ---------- 候选池 / 观察名单 ----------
  function renderTableTab(which) {
    var d = state.day, t = which === "pool" ? d.pool : d.watchlist;
    if (!t || !(t.rows || []).length) return '<div class="empty">这一天的报告没有' + (which === "pool" ? "候选池" : "观察名单") + "。</div>";
    var h0 = t.header, iKw = col(h0, /关键词/), iCat = col(h0, which === "pool" ? /类别/ : /类型/), iScore = col(h0, /^分$|分数/), iSt = col(h0, /状态/),
      iEx = col(h0, which === "pool" ? /补全示例/ : /首次出现/), iTr = col(h0, /Trends/);
    if (iKw < 0) iKw = 1;
    var q = (state.q[which] || "").trim().toLowerCase(), so = state.sort[which] || "default";
    var rows = t.rows.filter(function (r) { return !q || r.join(" ").toLowerCase().indexOf(q) >= 0; });
    if (so === "score" && iScore >= 0) rows.sort(function (a, b) { return (num(b[iScore]) || 0) - (num(a[iScore]) || 0); });
    if (so === "trend" && iTr >= 0) rows.sort(function (a, b) { return (num(b[iTr]) || 0) - (num(a[iTr]) || 0); });
    if (so === "name") rows.sort(function (a, b) { return plain(a[iKw]).localeCompare(plain(b[iKw])); });
    var lim = state.limit[which] || 20;
    var sorts = [["default", "默认顺序"]];
    if (iScore >= 0) sorts.push(["score", "按分数"]);
    if (iTr >= 0) sorts.push(["trend", "按 Trends 热度"]);
    sorts.push(["name", "按字母"]);
    var h = toolbar(which, sorts) + '<div class="rows">' + rows.slice(0, lim).map(function (r) {
      var side = (iCat >= 0 && plain(r[iCat]) ? '<span class="cat">' + esc(plain(r[iCat])) + "</span>" : "") +
        (iScore >= 0 ? '<span class="num">' + esc(plain(r[iScore])) + " 分</span>" : "");
      var note = [iSt >= 0 ? plain(r[iSt]) : "", iEx >= 0 ? (which === "watch" ? "首次 " : "") + plain(r[iEx]) : ""].filter(Boolean).join(" · ");
      return listItem({ kw: plain(r[iKw]), note: short(note, 80), side: side, body: itemDetails(h0, r, [iKw]) });
    }).join("") + "</div>";
    if (!rows.length) h += '<div class="empty">没有匹配的词</div>';
    if (rows.length > lim) h += '<button class="show-more" data-w="' + which + '">显示更多（还有 ' + (rows.length - lim) + " 个）</button>";
    if (t.note) h += '<details class="fold"><summary>说明</summary><div class="md">' + md(t.note) + "</div></details>";
    return h;
  }

  // ---------- 页面 ----------
  function renderOverview() {
    var d = state.day, cs = d.candidates || [];
    var eff = state.day.effects ? effectItems() : [];
    var rising = eff.filter(function (x) { return x.stage === "起量" || x.stage === "萌芽"; }).length;
    var stats = [["今日候选", cs.length, "个（深挖 " + cs.filter(function (c) { return c.deep_dive; }).length + "）"]];
    if (d.pool && d.pool.rows) stats.push(["候选池", d.pool.rows.length, "个"]);
    if (eff.length) stats.push(["视频玩法词", eff.length, "个（起量/萌芽 " + rising + "）"]);
    if (d.watchlist && d.watchlist.rows) stats.push(["观察名单", d.watchlist.rows.length, "个"]);
    $("overview").innerHTML = '<div class="ov-head"><h2>今日概览 · ' + esc(d.date) + "</h2></div>" +
      '<div class="stats">' + stats.map(function (s) { return '<div class="stat"><div class="stat-l">' + s[0] + '</div><div class="stat-v">' + s[1] + "<small>" + esc(s[2]) + "</small></div></div>"; }).join("") + "</div>" +
      (d.trends_unverified ? '<p class="warn">⚠️ 本期 Google Trends 未验证，热度信号主要来自 X 发帖量。</p>' : "");
  }
  function renderTabs() {
    $("tabs").innerHTML = TABS.map(function (t) { return '<button role="tab" class="tab' + (state.tab === t[0] ? " active" : "") + '" data-tab="' + t[0] + '">' + t[1] + "</button>"; }).join("");
  }
  function renderView() {
    renderTabs();
    var v = state.tab;
    $("view").innerHTML = v === "effects" ? renderEffects() : v === "pool" ? renderTableTab("pool") : v === "watch" ? renderTableTab("watch") : renderToday();
  }
  function loadDay(date, kw) {
    $("dateSelect").value = date;
    $("detail").hidden = true; document.body.classList.remove("noscroll");
    if (location.hash !== "#" + date + (kw ? "/" + kw : "")) history.replaceState(null, "", "#" + date + (kw ? "/" + kw : ""));
    $("view").innerHTML = '<div class="empty">加载中…</div>';
    getJSON("data/" + date + ".json").then(function (day) {
      state.day = day; state.q = {}; state.limit = {};
      renderOverview(); renderView();
      if (kw) openDetail(kw);
    }).catch(function (e) { $("view").innerHTML = '<div class="empty">这一天的数据加载失败：' + esc(e.message) + "</div>"; });
  }
  function parseHash() {
    var h = decodeURIComponent(location.hash.slice(1)), i = h.indexOf("/");
    return i < 0 ? { date: h, kw: "" } : { date: h.slice(0, i), kw: h.slice(i + 1) };
  }

  $("tabs").addEventListener("click", function (e) { var b = e.target.closest(".tab"); if (b) { state.tab = b.getAttribute("data-tab"); renderView(); } });
  $("view").addEventListener("click", function (e) {
    var c = e.target.closest("[data-kw]"); if (c) { openDetail(c.getAttribute("data-kw")); return; }
    var m = e.target.closest(".show-more"); if (m) { var w = m.getAttribute("data-w"); state.limit[w] = (state.limit[w] || 20) + 20; renderView(); }
  });
  $("view").addEventListener("keydown", function (e) { var c = e.target.closest(".top-card"); if (c && e.key === "Enter") openDetail(c.getAttribute("data-kw")); });
  $("view").addEventListener("input", function (e) {
    if (!e.target.classList.contains("q")) return;
    var w = e.target.getAttribute("data-w"); state.q[w] = e.target.value; state.limit[w] = 20; renderView();
    var inp = document.querySelector('.q[data-w="' + w + '"]'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  });
  $("view").addEventListener("change", function (e) {
    if (!e.target.classList.contains("sort")) return;
    state.sort[e.target.getAttribute("data-w")] = e.target.value; renderView();
  });
  $("detailClose").addEventListener("click", closeDetail);
  $("detail").addEventListener("click", function (e) { if (e.target === $("detail")) closeDetail(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("detail").hidden) closeDetail(); });
  $("dateSelect").addEventListener("change", function (e) { loadDay(e.target.value); });
  window.addEventListener("hashchange", function () {
    var h = parseHash(); if (state.dates.indexOf(h.date) < 0) return;
    if (!state.day || state.day.date !== h.date) loadDay(h.date, h.kw);
    else if (h.kw) openDetail(h.kw); else if (!$("detail").hidden) closeDetail();
  });

  getJSON("data/index.json").then(function (idx) {
    state.dates = (idx.dates || []).map(function (x) { return typeof x === "string" ? x : x.date; });
    if (idx.updated_at) $("footUpdated").textContent = "最后更新：" + fmtTime(idx.updated_at);
    if (!state.dates.length) { $("view").innerHTML = '<div class="empty">还没有数据</div>'; return; }
    $("dateSelect").innerHTML = state.dates.map(function (d) { return '<option value="' + d + '">' + d + "</option>"; }).join("");
    var h = parseHash();
    loadDay(state.dates.indexOf(h.date) >= 0 ? h.date : state.dates[0], h.kw);
  }).catch(function (e) { $("view").innerHTML = '<div class="empty">索引加载失败：' + esc(e.message) + "</div>"; });
})();
