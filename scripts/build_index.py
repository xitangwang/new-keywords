#!/usr/bin/env python3
"""扫描 data/ 下所有 YYYY-MM-DD.json，重建 data/index.json（日期倒序）。可重复运行。"""
import datetime as dt, json, os, re
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
days = []
for fn in os.listdir(root):
    m = re.fullmatch(r"(\d{4}-\d\d-\d\d)\.json", fn)
    if not m:
        continue
    with open(os.path.join(root, fn), encoding="utf-8") as f:
        d = json.load(f)
    cs = d.get("candidates", [])
    top = sorted(cs, key=lambda c: (-(c.get("rating") or 0), c.get("rank") or 999))
    days.append({"date": m.group(1), "count": len(cs),
                 "deep_dives": sum(1 for c in cs if c.get("deep_dive")),
                 "top": [c["keyword"] for c in top[:3]],
                 "generated_at": d.get("generated_at")})
days.sort(key=lambda x: x["date"], reverse=True)
idx_path = os.path.join(root, "index.json")
new = {"dates": [d["date"] for d in days], "days": days}
old = {}
if os.path.exists(idx_path):
    with open(idx_path, encoding="utf-8") as f:
        old = json.load(f)
# 内容没变就不改 updated_at，保证幂等
old_cmp = {k: old.get(k) for k in ("dates", "days")}
new["updated_at"] = old.get("updated_at") if old_cmp == new and old.get("updated_at") else \
    dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(timespec="seconds")
with open(idx_path, "w", encoding="utf-8") as f:
    json.dump({"updated_at": new["updated_at"], "dates": new["dates"], "days": new["days"]}, f, ensure_ascii=False, indent=1)
    f.write("\n")
print(f"index.json: {len(days)} 天，最新 {new['dates'][0] if days else '-'}")
