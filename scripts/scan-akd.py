# -*- coding: utf-8 -*-
"""扫描 AKD 脚本目录，生成每个脚本的概览：名称、category、用到的 SV API。
用于从大量脚本中挑选可复用函数。"""
import os
import re
import sys
from pathlib import Path

# ⚠️ 目录从**家目录**推（2026-09-25 公开仓库前去掉写死的 `C:\Users\<name>\...`）；
#    Windows 上是 %USERPROFILE%\Documents\… 与 %APPDATA%\…；可用 AKD_SRC_DIRS 覆盖（分号分隔）。
_dir_env = os.environ.get("AKD_SRC_DIRS", "")
DIRS = [Path(p) for p in _dir_env.split(os.pathsep) if p] or [
    Path.home() / "Documents" / "Dreamtonics" / "Synthesizer V Studio" / "scripts" / "AKD",
    Path.home() / "AppData" / "Roaming" / "Dreamtonics" / "Synthesizer V Studio 2" / "scripts" / "AKD",
]

API_RE = re.compile(r"SV\.\w+")
CLIENT_RE = re.compile(r'"name"\s*:\s*"([^"]+)"')
CAT_RE = re.compile(r'"category"\s*:\s*"([^"]+)"')

seen = {}
for d in DIRS:
    if not d.exists():
        continue
    for f in sorted(d.glob("*.js")):
        try:
            txt = f.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        name = CLIENT_RE.search(txt)
        cat = CAT_RE.search(txt)
        apis = sorted(set(API_RE.findall(txt)))
        # 统计 API 频率，取前 12 个高频
        from collections import Counter
        freq = Counter(API_RE.findall(txt))
        top = [a for a, _ in freq.most_common(12)]
        key = f.name
        seen[key] = {
            "path": str(f),
            "title": name.group(1) if name else f.name,
            "cat": cat.group(1) if cat else "?",
            "apis": top,
            "size": f.stat().st_size,
        }

# 输出去重后的清单（同名脚本只列一次，标注多版本）
for key in sorted(seen):
    info = seen[key]
    print(f"{key}\t[{info['cat']}]\t{info['title']}\t{info['size']}B")
    print(f"    API: {', '.join(info['apis'])}")
