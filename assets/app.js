(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var state = { dates: [], index: null, day: null, q: "", deepOnly: false, sort: "rating" };

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
        out.push('<div class="tbl-wrap"><table><thead><tr>' + head.map(function (h) { return "<th>" + inline(h) + "</th>"; }).join("") +
          "</tr></thead><tbody>" + rows.map(function (r) {
            return "<tr>" + head.map(function (_, k) { return "<td>" + inline(r[k] || "") + "</td>"; }).join("") + "</tr>";
          }).join("") + "</tbody></table></div>");
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
  function slug(s) { return String(s || "").toLowerCase().replace(/[^0-9a-z\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, ""); }
  function scoreBadge(dd) {
    if (!dd || dd.total == null) return "";
    return '<span class="score" title="深挖评分（需求/竞争/可行性/变现/寿命）">' + dd.total + (dd.max ? "/" + dd.max : "") + " 分</span>";
  }
  function scoreBars(dd) {
    if (!dd || !(dd.scores || []).length) return "";
    return '<div class="bars">' + dd.scores.map(function (x) {
      var pct = Math.max(0, Math.min(100, x.score / 5 * 100));
      return '<div class="bar" title="' + esc(x.note || "") + '"><span class="bar-l">' + esc(x.dim) + '</span><span class="bar-t"><i style="width:' + pct + '%"></i></span><span class="bar-v">' + x.score + "</span></div>";
    }).join("") + "</div>";
  }
  function stars(c) {
    if (c.rating == null) return '<span class="stars"><span class="num">未评级</span></span>';
    var full = Math.floor(c.rating), half = c.rating - full >= 0.5, s = "";
    for (var i = 0; i < full; i++) s += "★";
    if (half) s += "☆";
    return '<span class="stars" title="' + esc(c.rating_stars || "") + '">' + (/[★☆]/.test(c.rating_stars || "") ? esc(c.rating_stars) : s) +
      '<span class="num">' + c.rating + "/5</span></span>";
  }
  function getJSON(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(url + " " + r.status);
      return r.json();
    });
  }

  function renderDates() {
    var sel = $("dateSelect"), chips = $("dateChips");
    sel.innerHTML = state.dates.map(function (d) { return '<option value="' + d + '">' + d + "</option>"; }).join("");
    chips.innerHTML = state.dates.slice(0, 14).map(function (d) {
      return '<button class="chip" data-date="' + d + '">' + d.slice(5).replace("-", "月") + "日</button>";
    }).join("");
  }
  function markActive(date) {
    $("dateSelect").value = date;
    Array.prototype.forEach.call(document.querySelectorAll(".chip"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-date") === date);
    });
  }
  function fmtTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    // 固定用北京时间显示
    var b = new Date(d.getTime() + 8 * 3600e3);
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return b.getUTCFullYear() + "-" + p(b.getUTCMonth() + 1) + "-" + p(b.getUTCDate()) + " " + p(b.getUTCHours()) + ":" + p(b.getUTCMinutes()) + "（北京时间）";
  }

  function parseHash() {
    var h = decodeURIComponent(location.hash.slice(1)), i = h.indexOf("/");
    return i < 0 ? { date: h, kw: "" } : { date: h.slice(0, i), kw: h.slice(i + 1) };
  }
  function findBySlug(kw) {
    var cs = (state.day && state.day.candidates) || [];
    for (var i = 0; i < cs.length; i++) if (slug(cs[i].keyword) === kw) return cs[i];
    return null;
  }
  function openDetail(kw, noPush) {
    var c = findBySlug(kw);
    if (!c || !c.deep_dive) return;
    var dd = c.deep_dive, toc = [], body = [];
    (dd.sections || []).forEach(function (s, i) {
      var id = "dd-" + i;
      toc.push('<a href="#" data-target="' + id + '">' + esc(s.title) + "</a>");
      body.push('<section class="dd-sec" id="' + id + '"><h3>' + esc(s.title) + '</h3><div class="md">' + md(s.markdown) + "</div></section>");
    });
    $("detailBody").innerHTML =
      '<header class="dd-head"><div class="dd-kw">' + esc(c.keyword) + (c.keyword_note ? ' <span class="kw-note">' + esc(c.keyword_note) + "</span>" : "") + "</div>" +
      '<div class="dd-sub">' + stars(c) + scoreBadge(dd) + (c.first_seen ? '<span class="tag">首次：' + esc(c.first_seen.replace(/\*\*/g, "")) + "</span>" : "") + "</div>" +
      (c.description ? '<p class="desc">' + inline(c.description) + "</p>" : "") + scoreBars(dd) +
      (dd.intro ? '<div class="md">' + md(dd.intro) + "</div>" : "") + "</header>" +
      (toc.length ? '<nav class="dd-toc">' + toc.join("") + "</nav>" : "") + body.join("");
    $("detail").hidden = false;
    document.body.classList.add("noscroll");
    $("detailBody").scrollTop = 0;
    var want = "#" + state.day.date + "/" + kw;
    if (!noPush && location.hash !== want) history.replaceState(null, "", want);
  }
  function closeDetail() {
    $("detail").hidden = true;
    document.body.classList.remove("noscroll");
    if (state.day && location.hash !== "#" + state.day.date) history.replaceState(null, "", "#" + state.day.date);
  }

  function loadDay(date, kw) {
    markActive(date);
    var want = "#" + date + (kw ? "/" + kw : "");
    if (location.hash !== want) history.replaceState(null, "", want);
    $("cards").innerHTML = '<div class="empty">加载中…</div>';
    getJSON("data/" + date + ".json").then(function (day) {
      state.day = day; renderDay();
      if (kw) openDetail(kw, true);
    }).catch(function (e) {
      $("cards").innerHTML = '<div class="empty">这一天的数据加载失败：' + esc(e.message) + "</div>";
      $("extraSections").innerHTML = "";
    });
  }

  function renderDay() {
    var d = state.day, cs = d.candidates || [];
    var nDeep = cs.filter(function (c) { return c.deep_dive; }).length;
    var n4 = cs.filter(function (c) { return (c.rating || 0) >= 4; }).length;
    $("meta").innerHTML = "<b>" + esc(d.date) + "</b> 共 <b>" + cs.length + "</b> 个候选，★★★★ 及以上 <b>" + n4 +
      "</b> 个，有深挖分析 <b>" + nDeep + "</b> 个" +
      (d.collected_at ? " · 数据采集：" + esc(d.collected_at) : "") +
      " · 页面数据更新：" + esc(fmtTime(d.generated_at));
    var tn = $("trendsNotice");
    if (d.trends_unverified) {
      tn.hidden = false;
      tn.innerHTML = "⚠️ <b>本期 Google Trends 未验证</b>：下面的「热度信号」主要是 X 上的发帖量，不等于搜索量。上站前请自己在浏览器打开 Trends 对比 GPTs 复核。";
    } else tn.hidden = true;
    renderCards(); renderExtra();
  }

  function matches(c, q) {
    if (!q) return true;
    var hay = [c.keyword, c.keyword_note, c.description, c.idea, c.reason, c.serp, c.domain, c.trend_signal, c.sources_text, c.deep_dive ? JSON.stringify(c.deep_dive) : ""].join(" ").toLowerCase();
    return q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
  }

  function card(c) {
    var tags = [];
    if (c.deep_dive) tags.push('<span class="tag deep">🔍 有深挖</span>');
    if (c.trends_verified === false) tags.push('<span class="tag warn">Trends 未验证</span>');
    else if (c.trends_verified === true) tags.push('<span class="tag ok">Trends 已验证</span>');
    if (c.first_seen) tags.push('<span class="tag">首次：' + esc(c.first_seen.replace(/\*\*/g, "")) + "</span>");
    var srcLinks = (c.sources || []).map(function (u) {
      return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(u.replace(/^https?:\/\/(www\.)?/, "")) + "</a>";
    }).join("");
    var extra = "";
    Object.keys(c.extra || {}).forEach(function (k) { extra += "<dt>" + esc(k) + "</dt><dd>" + inline(c.extra[k]) + "</dd>"; });
    return '<article class="card' + (c.deep_dive ? " has-deep" : "") + '" id="kw-' + slug(c.keyword) + '">' +
      '<div class="card-head"><span class="rank" title="报告原排名">' + (c.rank != null ? "#" + c.rank : "–") + "</span>" +
      '<div style="flex:1;min-width:0"><h3 class="kw">' + esc(c.keyword) + (c.keyword_note ? ' <span class="kw-note">' + esc(c.keyword_note) + "</span>" : "") + "</h3>" +
      stars(c) + scoreBadge(c.deep_dive) + "</div></div>" +
      (tags.length ? '<div class="tags">' + tags.join("") + "</div>" : "") +
      '<p class="desc">' + inline(c.description) + "</p>" +
      (c.reason ? '<div class="reason"><b>评级理由：</b>' + inline(c.reason) + "</div>" : "") +
      '<dl class="kv"><dt>热度信号</dt><dd>' + inline(c.trend_signal || "—") + "</dd>" +
      "<dt>.com 域名</dt><dd>" + inline(c.domain || "—") + "</dd></dl>" +
      "<details><summary>SERP 竞争 · 产品思路 · 来源</summary><dl class=\"kv\">" +
      "<dt>SERP</dt><dd>" + inline(c.serp || "—") + "</dd>" +
      "<dt>产品思路</dt><dd>" + inline(c.idea || "—") + "</dd>" +
      "<dt>来源说明</dt><dd>" + inline(c.sources_text || "—") + "</dd>" + extra +
      "</dl></details>" +
      (c.deep_dive ? scoreBars(c.deep_dive) + '<button class="deep-btn" data-kw="' + esc(slug(c.keyword)) + '">查看深挖详情 →</button>' : "") +
      (srcLinks ? '<div class="sources"><span class="kv-l" style="color:var(--muted)">来源链接：</span>' + srcLinks + "</div>" : "") +
      "</article>";
  }

  function renderCards() {
    var d = state.day;
    if (!d) return;
    if (!(d.candidates || []).length && d.raw_markdown) {
      $("cards").innerHTML = '<article class="panel md" style="grid-column:1/-1">' + md(d.raw_markdown) + "</article>";
      $("count").textContent = "未能解析表格，显示原文";
      return;
    }
    var q = state.q.trim().toLowerCase();
    var list = (d.candidates || []).filter(function (c) { return (!state.deepOnly || c.deep_dive) && matches(c, q); });
    list.sort(state.sort === "rank"
      ? function (a, b) { return (a.rank || 999) - (b.rank || 999); }
      : state.sort === "score"
      ? function (a, b) { return ((b.deep_dive && b.deep_dive.total) || -1) - ((a.deep_dive && a.deep_dive.total) || -1) || (b.rating || 0) - (a.rating || 0); }
      : function (a, b) { return (b.rating || 0) - (a.rating || 0) || (a.rank || 999) - (b.rank || 999); });
    $("count").textContent = "显示 " + list.length + " / " + (d.candidates || []).length;
    $("cards").innerHTML = list.length ? list.map(card).join("") : '<div class="empty">没有符合条件的候选词</div>';
  }

  function renderExtra() {
    var d = state.day, parts = [];
    function panel(title, body, cls) { if (body) parts.push('<section class="panel md ' + (cls || "") + '"><h2>' + esc(title) + "</h2>" + md(body) + "</section>"); }
    panel("⭐ Top 推荐理由", d.top_picks);
    panel("📎 补充（不进排名）", d.supplement);
    (d.other_sections || []).forEach(function (s) { panel(s.title, s.markdown); });
    panel("📡 每天监控的信号源", d.monitoring);
    panel("ℹ️ 本期方法与数据说明", d.preface);
    $("extraSections").innerHTML = parts.join("");
  }

  $("search").addEventListener("input", function (e) { state.q = e.target.value; renderCards(); });
  $("deepOnly").addEventListener("change", function (e) { state.deepOnly = e.target.checked; renderCards(); });
  $("cards").addEventListener("click", function (e) {
    var b = e.target.closest(".deep-btn"); if (b) openDetail(b.getAttribute("data-kw"));
  });
  $("detailClose").addEventListener("click", closeDetail);
  $("detail").addEventListener("click", function (e) { if (e.target === $("detail")) closeDetail(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("detail").hidden) closeDetail(); });
  $("sortBy").addEventListener("change", function (e) { state.sort = e.target.value; renderCards(); });
  $("dateSelect").addEventListener("change", function (e) { loadDay(e.target.value); });
  $("dateChips").addEventListener("click", function (e) {
    var b = e.target.closest(".chip"); if (b) loadDay(b.getAttribute("data-date"));
  });
  window.addEventListener("hashchange", function () {
    var h = parseHash();
    if (state.dates.indexOf(h.date) < 0) return;
    if (!state.day || state.day.date !== h.date) loadDay(h.date, h.kw);
    else if (h.kw) openDetail(h.kw, true);
    else if (!$("detail").hidden) closeDetail();
  });
  $("detailBody").addEventListener("click", function (e) {
    var a = e.target.closest(".dd-toc a"); if (!a) return;
    e.preventDefault();
    var t = document.getElementById(a.getAttribute("data-target")); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  getJSON("data/index.json").then(function (idx) {
    state.index = idx;
    state.dates = (idx.dates || []).map(function (x) { return typeof x === "string" ? x : x.date; });
    if (idx.updated_at) $("footUpdated").textContent = "看板最后更新：" + fmtTime(idx.updated_at);
    if (!state.dates.length) { $("cards").innerHTML = '<div class="empty">还没有数据</div>'; return; }
    renderDates();
    var h = parseHash();
    if (state.dates.indexOf(h.date) >= 0) loadDay(h.date, h.kw); else loadDay(state.dates[0]);
  }).catch(function (e) {
    $("cards").innerHTML = '<div class="empty">索引加载失败：' + esc(e.message) + "</div>";
  });
})();
