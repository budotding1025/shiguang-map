# -*- coding: utf-8 -*-
"""从 WeWe / RSS 抓博物馆展览候选，输出待审清单。不会自动改时光地图。

用法：
  1. 自建 WeWe-RSS，添加国博/故宫/首博等公众号，复制各源 .rss 地址
  2. 填进 tools/museum-feeds.json 的 rssUrl
  3. python tools/fetch_exhibition_candidates.py
  4. 打开 tools/pending-exhibitions.json，人工确认后再写入 js/data.js

依赖：仅标准库。
"""
from __future__ import annotations

import json
import re
import ssl
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FEEDS_PATH = ROOT / "museum-feeds.json"
OUT_PATH = ROOT / "pending-exhibitions.json"
REVIEW_MD = ROOT / "pending-exhibitions.md"

CTX = ssl.create_default_context()


def load_feeds():
    data = json.loads(FEEDS_PATH.read_text(encoding="utf-8"))
    return data


def fetch(url: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "shiguang-map-exhibition-radar/1.0"},
    )
    with urllib.request.urlopen(req, timeout=25, context=CTX) as res:
        return res.read()


def local(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag


def text_of(el) -> str:
    if el is None:
        return ""
    return "".join(el.itertext()).strip()


def parse_rss(raw: bytes):
    root = ET.fromstring(raw)
    items = []
    for node in root.iter():
        name = local(node.tag).lower()
        if name not in ("item", "entry"):
            continue
        title = link = summary = published = ""
        for child in list(node):
            cn = local(child.tag).lower()
            if cn == "title" and not title:
                title = text_of(child)
            elif cn == "link":
                href = child.attrib.get("href") or text_of(child)
                if href:
                    link = href.strip()
            elif cn in ("description", "summary", "content") and not summary:
                summary = re.sub(r"<[^>]+>", " ", text_of(child))
                summary = re.sub(r"\s+", " ", summary).strip()
            elif cn in ("pubdate", "published", "updated", "date") and not published:
                published = text_of(child)
        if title:
            items.append(
                {
                    "title": title,
                    "link": link,
                    "summary": summary[:400],
                    "published": published,
                }
            )
    return items


def parse_published(value: str):
    if not value:
        return None
    try:
        return parsedate_to_datetime(value).astimezone(timezone.utc).isoformat()
    except Exception:
        pass
    m = re.search(r"(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})", value)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    return value


def looks_relevant(text: str, keywords, excludes) -> bool:
    if any(x in text for x in excludes):
        return False
    return any(k in text for k in keywords)


def suggest_dynasties(text: str):
    rules = [
        ("夏", ["夏朝", "二里头"]),
        ("商", ["商朝", "甲骨", "殷墟"]),
        ("西周", ["西周", "青铜"]),
        ("春秋战国", ["春秋", "战国", "诸子"]),
        ("秦", ["秦朝", "秦始皇", "兵马俑", "大一统"]),
        ("汉", ["汉朝", "西汉", "东汉", "丝路", "河西"]),
        ("唐", ["唐朝", "大唐", "长安", "敦煌"]),
        ("宋", ["宋朝", "北宋", "南宋", "书画"]),
        ("元", ["元朝", "大都", "中轴线"]),
        ("明", ["明朝", "紫禁城", "永乐"]),
        ("清", ["清朝", "康乾", "故宫"]),
    ]
    hits = []
    for label, words in rules:
        if any(w in text for w in words):
            hits.append(label)
    return hits[:4]


def suggest_event_ids(text: str):
    rules = [
        ("shang-oracle", ["甲骨", "商朝"]),
        ("qin-unify", ["秦统一", "秦始皇", "兵马俑"]),
        ("han-found", ["西汉", "汉朝"]),
        ("zhangqian", ["张骞", "丝路", "河西"]),
        ("tang-chang-an", ["长安", "唐朝", "大明宫"]),
        ("song-market", ["宋朝", "汴京", "书画"]),
        ("yuan", ["元朝", "大都"]),
        ("ming-found", ["明朝", "紫禁城", "永乐"]),
        ("qing-enter", ["清朝", "入关"]),
        ("kangxi-map", ["康熙"]),
    ]
    hits = []
    for eid, words in rules:
        if any(w in text for w in words):
            hits.append(eid)
    return hits[:4]


def main():
    cfg = load_feeds()
    keywords = cfg.get("beijingKeywords") or []
    excludes = cfg.get("excludeKeywords") or []
    candidates = []
    errors = []

    for feed in cfg.get("feeds") or []:
        url = (feed.get("rssUrl") or "").strip()
        if not url:
            continue
        try:
            items = parse_rss(fetch(url))
        except Exception as exc:
            errors.append({"feed": feed.get("id"), "error": str(exc)})
            continue
        for item in items:
            blob = " ".join(
                [
                    item.get("title") or "",
                    item.get("summary") or "",
                    feed.get("name") or "",
                ]
            )
            if not looks_relevant(blob, keywords, excludes):
                continue
            if not re.search(r"展|陈列|开幕|预约|博物", blob):
                continue
            candidates.append(
                {
                    "status": "pending",
                    "sourceFeed": feed.get("id"),
                    "museumHint": feed.get("name"),
                    "tierSuggest": feed.get("tier") or "extra",
                    "title": item.get("title"),
                    "link": item.get("link"),
                    "summary": item.get("summary"),
                    "published": parse_published(item.get("published") or ""),
                    "dynastySuggest": suggest_dynasties(blob),
                    "eventIdSuggest": suggest_event_ids(blob),
                    "note": "请人工核对展期与朝代后，再写入 js/data.js exhibitions",
                }
            )

    # de-dupe by title+link
    seen = set()
    unique = []
    for row in candidates:
        key = (row.get("title"), row.get("link"))
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(unique),
        "errors": errors,
        "candidates": unique,
    }
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "# 馆展待审清单",
        "",
        f"生成时间：{payload['generatedAt']}",
        f"候选数：{payload['count']}",
        "",
        "确认后再写入 `js/data.js` 的 `exhibitions`。不要自动推上线。",
        "",
    ]
    if errors:
        lines.append("## 拉取失败")
        for err in errors:
            lines.append(f"- {err['feed']}: {err['error']}")
        lines.append("")
    if not unique:
        lines.append("暂无候选。请先在 `museum-feeds.json` 填入 WeWe 的 rssUrl。")
    for i, row in enumerate(unique, 1):
        lines.append(f"## {i}. {row['title']}")
        lines.append(f"- 来源：{row.get('museumHint')}")
        lines.append(f"- 建议层级：{row.get('tierSuggest')}")
        lines.append(f"- 建议朝代：{', '.join(row.get('dynastySuggest') or []) or '待定'}")
        lines.append(f"- 建议事件：{', '.join(row.get('eventIdSuggest') or []) or '待定'}")
        lines.append(f"- 链接：{row.get('link')}")
        lines.append(f"- 摘要：{row.get('summary')}")
        lines.append("")
    REVIEW_MD.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {OUT_PATH} ({len(unique)} candidates)")
    print(f"wrote {REVIEW_MD}")
    if errors:
        print(f"errors: {len(errors)}")


if __name__ == "__main__":
    main()
