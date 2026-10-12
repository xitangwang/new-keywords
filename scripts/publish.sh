#!/usr/bin/env bash
# 每日发布：把当天的 Markdown 报告转成 JSON、更新索引、提交并推送到 GitHub（Pages 自动更新）。
#
# 用法：
#   scripts/publish.sh                    # 默认今天（北京时间）
#   scripts/publish.sh 2026-10-13         # 读取 /workspace/gefei/monitor/2026-10-13.md
#   scripts/publish.sh 2026-10-13 /path/to/report.md   # 指定报告文件
#   scripts/publish.sh /path/to/新词候选_2026-10-13.md  # 从文件名里取日期
#
# 需要环境变量 GITHUB_TOKEN_BRIEF（classic token，repo 权限）。
# token 只通过环境变量传给 git（GIT_CONFIG_*），不会写进 .git/config、远程地址或日志。
# 可重复运行：内容没变化时不会产生新提交。
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONITOR_DIR="${MONITOR_DIR:-/workspace/gefei/monitor}"
REMOTE_URL="${REMOTE_URL:-https://github.com/xitangwang/new-keywords.git}"
BRANCH=main

arg1="${1:-}"; arg2="${2:-}"
if [[ "$arg1" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  DATE="$arg1"; SRC="${arg2:-$MONITOR_DIR/$DATE.md}"
elif [[ -n "$arg1" ]]; then
  SRC="$arg1"
  DATE="$(basename "$SRC" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -n1 || true)"
  [[ -n "$DATE" ]] || { echo "无法从文件名得到日期，请用：publish.sh YYYY-MM-DD $SRC" >&2; exit 1; }
else
  DATE="$(TZ=Asia/Shanghai date +%F)"; SRC="$MONITOR_DIR/$DATE.md"
fi
# 兼容旧命名：monitor 里没有时，尝试 /workspace/gefei/新词候选_<date>.md
if [[ ! -f "$SRC" && -f "/workspace/gefei/新词候选_$DATE.md" ]]; then
  SRC="/workspace/gefei/新词候选_$DATE.md"
fi
[[ -f "$SRC" ]] || { echo "找不到报告文件：$SRC" >&2; exit 1; }
[[ -n "${GITHUB_TOKEN_BRIEF:-}" ]] || { echo "缺少环境变量 GITHUB_TOKEN_BRIEF" >&2; exit 1; }

# 只在本条命令的进程环境里注入认证头
AUTH_B64="$(printf 'x-access-token:%s' "$GITHUB_TOKEN_BRIEF" | base64 | tr -d '\n')"
git_auth() {
  GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0="http.https://github.com/.extraheader" \
  GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $AUTH_B64" GIT_TERMINAL_PROMPT=0 \
  git -C "$REPO_DIR" "$@"
}

cd "$REPO_DIR"
echo "==> 报告：$SRC  日期：$DATE"

# 先和远程同步，避免多处修改冲突
if git_auth ls-remote --exit-code --heads "$REMOTE_URL" "$BRANCH" >/dev/null 2>&1; then
  git_auth fetch -q "$REMOTE_URL" "$BRANCH"
  git -C "$REPO_DIR" merge -q --ff-only FETCH_HEAD 2>/dev/null || \
    git -C "$REPO_DIR" rebase -q FETCH_HEAD
fi

python3 scripts/md2json.py "$SRC" --date "$DATE" -o "data/$DATE.json"
python3 - "data/$DATE.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
assert d["date"], "缺少日期"
if not d["candidates"]:
    print("警告：没有解析出候选词，页面将显示报告原文", file=sys.stderr)
PY
python3 scripts/build_index.py

# 数据 + 页面/脚本一起提交（页面改版也随发布上线）
git add -A data assets index.html scripts README.md .nojekyll 2>/dev/null || git add -A data
if git diff --cached --quiet; then
  echo "==> 数据没有变化，无需提交"
else
  git -c user.name="xitangwang" -c user.email="xitangwang@users.noreply.github.com" \
    commit -q -m "data: $DATE 新词候选（含深挖）"
  echo "==> 已提交：$(git log -1 --oneline)"
fi

# 推送（本地没有领先时什么也不做）
if git_auth push -q "$REMOTE_URL" "HEAD:$BRANCH" 2>&1 | sed "s|$AUTH_B64|***|g"; then :; fi
git_auth ls-remote "$REMOTE_URL" "refs/heads/$BRANCH" | grep -q "$(git rev-parse HEAD)" \
  && echo "==> 已推送到 $BRANCH：$(git rev-parse --short HEAD)" \
  || { echo "推送失败" >&2; exit 1; }
echo "==> 页面（1–2 分钟后生效）：https://wenming.space/new-keywords/#$DATE（xitangwang.github.io/new-keywords 会自动跳转过去）"
