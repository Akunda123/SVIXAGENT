# -*- coding: utf-8 -*-
"""将 Synthesizer V Studio Scripting Manual 的 HTML 类文档转换为 Markdown 子文件。

输出结构（skills/sv-scripting/api/）：
  README.md          主 md：类索引 + 全局对象速览
  <ClassName>.md     每个 HTML 类文档一个子 md，内容完整保留
"""
import re
import sys
from pathlib import Path
from bs4 import BeautifulSoup

# ⚠️ 输入目录也从**家目录**推（2026-09-25 公开仓库前去掉写死的 `C:\Users\<name>\...`；
#    想换地方就设环境变量 SVAPI_HTML_DIR）。
import os
SRC = Path(os.environ.get("SVAPI_HTML_DIR") or (Path.home() / "Downloads" / "sv script"))
# ⚠️ 输出目录**从脚本自身位置推导**（本脚本在 <repo>/scripts/ 下）—— 别写死开发机路径：
#    2026-09-22 产品改名时写死的那句被改成了 `…\Documents\AKDAgent\…`，而仓库目录没改名 ⇒ 路径失效。
OUT = Path(__file__).resolve().parents[1] / "skills" / "sv-scripting" / "api"

# 类文档清单（排除 Home / Tutorial）
CLASS_FILES = [
    "ArrangementSelectionState", "ArrangementView", "Automation",
    "CoordinateSystem", "GroupSelection", "MainEditorView", "NestedObject",
    "Note", "NoteGroup", "NoteGroupReference", "PitchControlCurve",
    "PitchControlPoint", "PlaybackControl", "Project", "RetakeList",
    "ScriptableNestedObject", "SelectionStateBase", "SV", "TimeAxis",
    "Track", "TrackInnerSelectionState", "TrackMixer", "WidgetValue",
]


def html_to_text(el) -> str:
    """把 BeautifulSoup 元素转成 markdown 文本（保留 code/链接）。"""
    if el is None:
        return ""
    out = []
    for node in el.descendants:
        if node.name == "h4" and "name" in (node.get("class") or []):
            # 方法/属性签名标题
            text = node.get_text(" ", strip=True)
            text = re.sub(r"\s+", " ", text)
            out.append(f"\n### {text}\n")
        elif node.name == "h5":
            out.append(f"\n**{node.get_text(' ', strip=True)}:**\n")
        elif node.name in ("ul", "ol"):
            items = node.find_all("li", recursive=False)
            for li in items:
                txt = li.get_text(" ", strip=True)
                txt = re.sub(r"\s+", " ", txt)
                out.append(f"- {txt}")
            out.append("")
        elif node.name == "p":
            txt = node.get_text(" ", strip=True)
            txt = re.sub(r"\s+", " ", txt)
            if txt:
                out.append(txt)
                out.append("")
        elif node.name == "table":
            rows = []
            for tr in node.find_all("tr"):
                cells = [re.sub(r"\s+", " ", td.get_text(" ", strip=True)) for td in tr.find_all(["th", "td"])]
                rows.append(cells)
            if rows:
                widths = [max(len(r[i]) for r in rows if i < len(r)) for i in range(max(len(r) for r in rows))]
                for ri, row in enumerate(rows):
                    out.append("| " + " | ".join(c.ljust(widths[ci]) for ci, c in enumerate(row)) + " |")
                    if ri == 0:
                        out.append("|" + "|".join("-" * (w + 2) for w in widths) + "|")
                out.append("")
        elif node.name in ("code", "pre"):
            txt = node.get_text("\n", strip=True)
            if node.name == "pre":
                out.append("```\n" + txt + "\n```\n")
    # 去重空行
    text = "\n".join(out)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def convert_class(name: str) -> str:
    f = SRC / f"{name} - Synthesizer V Studio Scripting Manual.html"
    if not f.exists():
        print(f"  !! missing: {f.name}")
        return None
    soup = BeautifulSoup(f.read_text(encoding="utf-8", errors="replace"), "lxml")
    article = soup.find("article")
    if article is None:
        print(f"  !! no <article> in {f.name}")
        return None

    # 标题：从 h1（类名）
    h1 = article.find("h1")
    title = h1.get_text(" ", strip=True) if h1 else name

    # 类描述（第一个 p 之前的块级内容）
    parts = []
    # 依次处理 article 的直接子元素
    for child in article.children:
        if child.name is None:
            continue
        if child.name == "h1":
            continue
        if child.name == "h2":
            parts.append(f"## {child.get_text(' ', strip=True)}\n")
            continue
        if child.name == "h4" and "name" in (child.get("class") or []):
            text = re.sub(r"\s+", " ", child.get_text(" ", strip=True))
            parts.append(f"\n### {text}\n")
            continue
        if child.name == "h5":
            parts.append(f"\n**{child.get_text(' ', strip=True)}:**\n")
            continue
        if child.name == "p":
            txt = re.sub(r"\s+", " ", child.get_text(" ", strip=True))
            if txt:
                parts.append(f"{txt}\n")
            continue
        if child.name in ("ul", "ol"):
            items = child.find_all("li", recursive=False)
            for li in items:
                txt = re.sub(r"\s+", " ", li.get_text(" ", strip=True))
                parts.append(f"- {txt}")
            parts.append("")
            continue
        if child.name == "table":
            rows = []
            for tr in child.find_all("tr"):
                cells = [re.sub(r"\s+", " ", td.get_text(" ", strip=True)) for td in tr.find_all(["th", "td"])]
                rows.append(cells)
            if rows:
                ncols = max(len(r) for r in rows)
                for ri, row in enumerate(rows):
                    row = row + [""] * (ncols - len(row))
                    parts.append("| " + " | ".join(row) + " |")
                    if ri == 0:
                        parts.append("|" + "|".join("-" * (len(c) + 2) for c in row) + "|")
                parts.append("")
            continue
        if child.name in ("code", "pre"):
            txt = child.get_text("\n", strip=True)
            parts.append("```\n" + txt + "\n```\n")
            continue
        # 其他：递归取其文本
        txt = re.sub(r"\s+", " ", child.get_text(" ", strip=True))
        if txt:
            parts.append(f"{txt}\n")

    body = "\n".join(parts)
    body = re.sub(r"\n{3,}", "\n\n", body).strip()
    return f"# {title}\n\n{body}\n"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    index = ["# SV 脚本 API 参考\n",
             "> 由 Synthesizer V Studio Scripting Manual 的 HTML 文档转换而来（内容原封不动）。\n",
             "> 每个类一个子 md；全局对象 `SV` 与工程结构见对应文件。\n",
             "",
             "## 类索引\n"]
    for name in CLASS_FILES:
        md = convert_class(name)
        if md is None:
            continue
        fname = f"{name}.md"
        (OUT / fname).write_text(md, encoding="utf-8")
        print(f"  wrote {fname} ({len(md)} chars)")
        index.append(f"- [{name}]({fname})")
    (OUT / "README.md").write_text("\n".join(index) + "\n", encoding="utf-8")
    print("done ->", OUT)


if __name__ == "__main__":
    main()
