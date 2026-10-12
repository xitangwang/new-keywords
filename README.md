# 每日新词监控看板

在线地址：**https://xitangwang.github.io/new-keywords/**

这是一个纯静态网站（HTML + CSS + 原生 JS，没有构建步骤，不引用任何外部字体或 CDN，国内可直接打开），用来展示每天的「海外 SEO 新词候选」报告。

## 页面上有什么

- **日期切换**：右上角下拉框 + 顶部最近 14 天的日期按钮；网址带 `#日期`（如 `#2026-10-12`），可以直接分享某一天。
- **候选词卡片**：默认按评级（★）从高到低排序，也可以切换成报告原排名。每张卡片包括：
  - 关键词、是什么、评级和评级理由
  - 热度信号（X 发帖量等）、.com 域名情况、首次出现时间
  - 展开后可看 SERP 第一页竞争、产品思路 + 变现、来源说明
  - 可点击的来源链接
  - **「Trends 未验证」** 橙色标签：表示这条的热度没有经过 Google Trends 验证（只是社媒发帖量）
  - **「🌿 疗愈相关」** 绿色标签：报告里标了〔疗愈相关〕，或在疗愈章节里被引用（"来自 #N"）
- **筛选**：搜索框（关键词、说明、思路、域名都能搜）、「只看疗愈相关」开关。
- **报告其余章节**：疗愈点子、Top 推荐理由、补充、每天监控的信号源、本期方法与数据说明。
- **更新时间**：顶部显示数据采集时间和页面数据更新时间，页脚显示看板最后更新时间（北京时间）。

## 目录结构

```
index.html            页面
assets/style.css      样式（自动适配手机和深色模式）
assets/app.js         页面逻辑
data/index.json       日期索引（最新在前）
data/YYYY-MM-DD.json  每天的候选词数据
scripts/md2json.py    Markdown 报告 → JSON 转换器
scripts/build_index.py 重建 data/index.json
scripts/publish.sh    每日发布脚本
```

## 每天怎么更新

每天的报告写到 `/workspace/gefei/monitor/YYYY-MM-DD.md` 之后，运行：

```bash
/workspace/new-keywords/scripts/publish.sh 2026-10-13
```

- 不带参数时默认用今天（北京时间）的日期。
- 也可以指定报告文件：`publish.sh 2026-10-13 /path/to/report.md`，或直接 `publish.sh /path/to/新词候选_2026-10-13.md`。
- 脚本会：转换 Markdown → `data/日期.json`，重建 `data/index.json`，提交并推送到 `main`。GitHub Pages 1–2 分钟后自动更新。
- 可以重复运行：报告没变就不会产生新提交；报告改了再跑一次就会覆盖当天数据。
- 需要环境变量 `GITHUB_TOKEN_BRIEF`。token 只在命令运行时通过环境变量传给 git，不会写进仓库、`.git/config` 或远程地址。

## 数据格式（data/YYYY-MM-DD.json）

```jsonc
{
  "date": "2026-10-12",
  "collected_at": "报告里写的数据采集时间",
  "generated_at": "转换时间（ISO 8601，北京时间）",
  "trends_unverified": true,        // 报告声明本期 Trends 未验证
  "candidates": [{
    "rank": 1, "keyword": "...", "keyword_note": "（括号里的补充）",
    "description": "是什么", "sources": ["https://..."], "sources_text": "来源原文",
    "first_seen": "...", "trend_signal": "...", "trends_verified": false,
    "serp": "...", "domain": "...", "idea": "...",
    "rating": 2.5, "rating_stars": "★★☆", "reason": "评级理由",
    "healing": true, "healing_note": "疗愈章节里对应的点子",
    "extra": {}                      // 认不出的列原样放这里
  }],
  "supplement": "补充（Markdown 原文）", "top_picks": "...", "healing_section": "...",
  "monitoring": "监控信号源（Markdown 原文）", "preface": "方法说明", "other_sections": []
}
```

评级换算：★ = 1 分，☆ = 0.5 分（报告里 ★★☆ 排在 ★★★ 和 ★★ 之间）。

转换器只搬运报告里的原文，不补充任何数据；如果某天的报告解析不出候选表，会把整份原文存进 `raw_markdown`，页面直接显示原文。
