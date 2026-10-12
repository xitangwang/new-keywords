#!/usr/bin/env python3
"""把每日「新词候选」Markdown 报告转换成看板用的 JSON。

用法:
    python3 scripts/md2json.py <report.md> [-o data/YYYY-MM-DD.json] [--date YYYY-MM-DD]

设计原则:
  * 只搬运报告里已有的文字，不编造任何数据；解析不了的内容原样保留到 raw/extra 字段。
  * 按表头关键字识别列（列顺序、列名有小变化也能识别），识别不了的列放进 extra。
  * 允许没有表格、没有某些章节：缺什么就留空。
"""
import argparse
import datetime as dt
import json
import os
import re
import sys

URL_RE = re.compile(r"https?://[^\s，、。；;（）()<>\[\]\"'`|]+")
DATE_RE = re.compile(r"(20\d\d)-(\d\d)-(\d\d)")

# 列名 -> 字段，按顺序匹配（先匹配到的优先）
COLUMN_RULES = [
    ("rank", [r"^#$", r"^序号$", r"^排名$", r"^no\.?$"]),
    ("keyword", [r"关键词", r"keyword", r"新词", r"^词$"]),
    ("description", [r"是什么", r"说明", r"简介", r"描述", r"description"]),
    ("sources_text", [r"来源", r"链接", r"source"]),
    ("first_seen", [r"首次", r"出现", r"first"]),
    ("trend_signal", [r"热度", r"趋势", r"trend", r"信号"]),
    ("serp", [r"serp", r"竞争", r"第一页"]),
    ("domain", [r"域名", r"domain"]),
    ("idea", [r"产品", r"思路", r"变现", r"idea"]),
    ("rating_text", [r"评级", r"评分", r"星级", r"rating", r"★"]),
]


def strip_md(s):
    """去掉粗体/行内代码等 markdown 标记，保留文字。"""
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"__(.+?)__", r"\1", s)
    s = re.sub(r"`([^`]*)`", r"\1", s)
    s = re.sub(r"\[([^\]]*)\]\((https?://[^)]+)\)", r"\1 \2", s)
    return s.strip()


def split_row(line):
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    # 支持 \| 转义
    cells = re.split(r"(?<!\\)\|", line)
    return [c.replace("\\|", "|").strip() for c in cells]


def is_sep_row(cells):
    return all(re.fullmatch(r":?-{2,}:?", c.strip()) for c in cells if c.strip()) and any(cells)


def map_columns(header):
    mapping = {}
    used = set()
    for idx, h in enumerate(header):
        hl = strip_md(h).lower()
        for field, pats in COLUMN_RULES:
            if field in used:
                continue
            if any(re.search(p, hl) for p in pats):
                mapping[idx] = field
                used.add(field)
                break
    return mapping


def parse_rating(text):
    """★ 计 1 分，☆ 计 0.5 分（报告里 ★★☆ 介于 ★★★ 与 ★★ 之间）。也支持 '4/5'、'4 星'。"""
    t = text or ""
    m = re.match(r"\s*\**\s*([★☆✩⭐]+)\s*\**\s*(.*)", t, re.S)
    if m:
        stars = m.group(1)
        full = stars.count("★") + stars.count("⭐")
        half = stars.count("☆") + stars.count("✩")
        val = full + 0.5 * half
        return (min(max(val, 0), 5) or None), stars, m.group(2).strip()
    m = re.match(r"\s*(\d(?:\.\d)?)\s*(?:/\s*5|星|分)?\s*[:：,，]?\s*(.*)", t, re.S)
    if m:
        return min(float(m.group(1)), 5), m.group(1), m.group(2).strip()
    return None, "", t.strip()


def extract_urls(text):
    out = []
    for u in URL_RE.findall(text or ""):
        u = u.rstrip(".,;:!?）)」』】")
        if u not in out:
            out.append(u)
    return out


def split_sections(lines):
    """按 '## ' 二级标题切分；返回 [(title, [lines])]，第一个元素是标题前的内容。"""
    sections = [("", [])]
    for ln in lines:
        m = re.match(r"^##\s+(.*)", ln)
        if m and not ln.startswith("###"):
            sections.append((m.group(1).strip(), []))
        else:
            sections[-1][1].append(ln)
    return sections


def clean_block(lines):
    text = "\n".join(lines).strip()
    text = re.sub(r"\n-{3,}\s*$", "", text).strip()
    text = re.sub(r"^-{3,}\s*\n", "", text).strip()
    return text


def parse_tables(lines):
    """返回 [(header, rows, start_idx, end_idx)]。"""
    tables = []
    i = 0
    while i < len(lines) - 1:
        if lines[i].lstrip().startswith("|") and lines[i + 1].lstrip().startswith("|") \
                and is_sep_row(split_row(lines[i + 1])):
            header = split_row(lines[i])
            rows = []
            j = i + 2
            while j < len(lines) and lines[j].lstrip().startswith("|"):
                rows.append(split_row(lines[j]))
                j += 1
            tables.append((header, rows, i, j))
            i = j
        else:
            i += 1
    return tables


def parse_report(md_text, date_hint=None):
    lines = md_text.splitlines()
    title = ""
    for ln in lines:
        if ln.startswith("# "):
            title = ln[2:].strip()
            break
    date = date_hint
    if not date:
        m = DATE_RE.search(title) or DATE_RE.search(md_text)
        date = m.group(0) if m else None

    sections = split_sections(lines)
    # 文首说明（引用块）
    preface_lines = [ln for ln in sections[0][1] if not ln.startswith("# ")]
    preface = clean_block([re.sub(r"^>\s?", "", ln) for ln in preface_lines])
    preface_plain = strip_md(preface)
    collected_at = None
    m = re.search(r"(?:采集时间|collected)[：:]\s*([^\n]+)", preface_plain)
    if m:
        collected_at = m.group(1).strip().rstrip("。")

    # 全局 Trends 状态
    doc_trends_unverified = bool(re.search(r"Trends[^\n]{0,20}(未验证|没拿到|429|unverified)", md_text, re.I))

    # 候选表：选列识别最多、且含 keyword 列的表
    best = None
    for header, rows, s, e in parse_tables(lines):
        mp = map_columns(header)
        if "keyword" in mp.values():
            if best is None or len(mp) > len(best[1]):
                best = (header, mp, rows)
    candidates = []
    if best:
        header, mp, rows = best
        trend_header = next((header[i] for i, f in mp.items() if f == "trend_signal"), "")
        header_says_unverified = bool(re.search(r"Trends[^|]*未验证|未验证[^|]*Trends", trend_header))
        for r in rows:
            if not any(c.strip() for c in r):
                continue
            item = {"extra": {}}
            for idx, cell in enumerate(r):
                field = mp.get(idx)
                if field is None:
                    key = strip_md(header[idx]) if idx < len(header) else f"col{idx}"
                    item["extra"][key] = cell
                else:
                    item[field] = cell
            kw_raw = item.get("keyword", "")
            m = re.match(r"\s*\*\*(.+?)\*\*\s*(.*)", kw_raw)
            if m:
                keyword, kw_note = m.group(1).strip(), m.group(2).strip()
            else:
                m2 = re.match(r"\s*([^（(]+?)\s*([（(].*)?$", strip_md(kw_raw))
                keyword = (m2.group(1) if m2 else strip_md(kw_raw)).strip()
                kw_note = (m2.group(2) or "").strip() if m2 else ""
            rating, stars, reason = parse_rating(item.get("rating_text", ""))
            whole = " ".join(r)
            trend = item.get("trend_signal", "")
            cell_has_trends = bool(re.search(r"Trends", trend, re.I)) and not re.search(r"未验证", trend)
            trends_verified = cell_has_trends and not header_says_unverified
            if not cell_has_trends and not doc_trends_unverified and not header_says_unverified:
                trends_verified = None  # 报告没说明
            rank = None
            try:
                rank = int(re.sub(r"\D", "", item.get("rank", "")) or 0) or None
            except ValueError:
                pass
            fs = item.get("first_seen", "")
            candidates.append({
                "rank": rank,
                "keyword": keyword,
                "keyword_note": kw_note,
                "description": item.get("description", ""),
                "sources": extract_urls(item.get("sources_text", "")),
                "sources_text": item.get("sources_text", ""),
                "first_seen": fs,
                "trend_signal": trend,
                "trends_verified": trends_verified,
                "serp": item.get("serp", ""),
                "domain": item.get("domain", ""),
                "idea": item.get("idea", ""),
                "rating": rating,
                "rating_stars": stars,
                "reason": reason,
                "healing": "疗愈" in whole,
                "healing_note": "",
                "extra": item["extra"],
            })

    # 各章节
    supplement, top_picks, healing_section, monitoring, other_sections = "", "", "", "", []
    for title_s, body in sections[1:]:
        text = clean_block(body)
        if "候选" in title_s and ("表" in title_s or "排名" in title_s):
            # 去掉表格本身，剩下的作为补充
            rest = [ln for ln in body if not ln.lstrip().startswith("|")]
            supplement = clean_block(rest)
        elif re.search(r"推荐|top", title_s, re.I):
            top_picks = text
        elif "疗愈" in title_s:
            healing_section = text
        elif re.search(r"监控|信号源|monitor", title_s, re.I):
            monitoring = text
        else:
            other_sections.append({"title": title_s, "markdown": text})

    # 疗愈章节里 "来自 #N" 引用的候选也标为疗愈相关
    if healing_section:
        by_rank = {c["rank"]: c for c in candidates if c["rank"]}
        for block in re.split(r"\n(?=\d+\.\s)", healing_section):
            head = strip_md(block.split("\n")[0])
            for n in re.findall(r"来自\s*#\s*(\d+)", block):
                c = by_rank.get(int(n))
                if c:
                    c["healing"] = True
                    m = re.match(r"\d+\.\s*(.+?)[：:（(]", head)
                    note = m.group(1).strip() if m else head[:40]
                    c["healing_note"] = (c["healing_note"] + "；" if c["healing_note"] else "") + note

    candidates.sort(key=lambda c: (-(c["rating"] or 0), c["rank"] or 999))
    return {
        "date": date,
        "title": title,
        "collected_at": collected_at,
        "generated_at": dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(timespec="seconds"),
        "trends_unverified": doc_trends_unverified,
        "preface": preface,
        "candidates": candidates,
        "supplement": supplement,
        "top_picks": top_picks,
        "healing_section": healing_section,
        "monitoring": monitoring,
        "other_sections": other_sections,
        "parse_ok": bool(candidates),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("md")
    ap.add_argument("-o", "--out")
    ap.add_argument("--date")
    a = ap.parse_args()
    with open(a.md, encoding="utf-8") as f:
        text = f.read()
    date = a.date
    if not date:
        m = DATE_RE.search(os.path.basename(a.md))
        date = m.group(0) if m else None
    data = parse_report(text, date)
    if not data["date"]:
        sys.exit("无法确定日期，请用 --date 指定")
    if not data["parse_ok"]:
        # 没解析出表格：保留整份原文，页面会显示原文
        data["raw_markdown"] = text
        print("警告：没有解析出候选表，已保留原文 raw_markdown", file=sys.stderr)
    out = a.out or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", f"{data['date']}.json")
    # 幂等：内容没变就保留原来的 generated_at，避免产生无意义的提交
    if os.path.exists(out):
        try:
            with open(out, encoding="utf-8") as f:
                old = json.load(f)
            if {k: v for k, v in old.items() if k != "generated_at"} == \
                    {k: v for k, v in data.items() if k != "generated_at"}:
                data["generated_at"] = old.get("generated_at", data["generated_at"])
        except (ValueError, OSError):
            pass
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"{out}: {len(data['candidates'])} 个候选")


if __name__ == "__main__":
    main()
