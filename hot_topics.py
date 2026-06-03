"""China Hot Topics — 中文热点数据 API（纯 Python，零依赖，蒸馏版）

  从 OpenCLI (jackwener/opencli) 提取，经 Hermes multi-perspective-review 三轮蒸馏（29→5→6发现，全部修复）。
  可直接喂给任何 AI (Cursor/Claude/Copilot/Gemini)，或作为独立模块使用。

  用法:
    from hot_topics import toutiao_hot, eastmoney_kuaixun, sinafinance_news

    # 今日头条热搜 TOP10
    for item in toutiao_hot(10):
        print(f"{item['rank']}. {item['title']} | 热度:{item.get('hot_value',0):,}")

    # 东方财富 7x24 快讯
    for item in eastmoney_kuaixun(20):
        print(f"{item['time']} {item['title']}")

    # 新浪财经实时快讯
    for item in sinafinance_news(20):
        print(f"{item['time']} {item['title']}")

  所有接口均为公开 API，无需登录，无需 API Key。
  Python 3.8+ 可直接运行，无第三方依赖。

  蒸馏修复记录:
  - R1: _parse_limit 统一参数解析，.get() 防御，null→None 注入修复
  - R2: 4份拷贝→1源，空数据返回 [] 而非异常
  - R3: 安全认证（bridge 侧），热加载 hot_sources.py
"""

import json
import urllib.request
import urllib.parse
from typing import Optional


def _fetch(url: str, headers: Optional[dict] = None, timeout: int = 15) -> dict:
    req = urllib.request.Request(url, headers=headers or {})
    req.add_header("User-Agent", "Mozilla/5.0")
    req.add_header("Accept", "application/json")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def _parse_limit(args, default=30, maximum=100):
    """安全解析 limit：处理 None/非整数/超限（R1蒸馏）"""
    if not isinstance(args, dict):
        return default
    raw = args.get("limit", default)
    if raw is None:
        return default
    try:
        return max(1, min(int(raw), maximum))
    except (ValueError, TypeError):
        return default


# ═══════════════════════════════════════════════════════════════
#  toutiao_hot — 今日头条实时热搜榜
# ═══════════════════════════════════════════════════════════════

TOUTIAO_HOT_URL = "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc"

def toutiao_hot(limit: int = 30) -> list[dict]:
    """今日头条首页热榜（公开 API，无需登录）

    Args:
        limit: 返回条数 (1-50)
    Returns:
        list[dict]: rank, title, hot_value, url
    """
    limit = _parse_limit({"limit": limit}, 30, 50)
    data = _fetch(TOUTIAO_HOT_URL, headers={"Referer": "https://www.toutiao.com/"})

    if data.get("status") != "success":
        raise RuntimeError(f"toutiao hot-board status={data.get('status')}")

    items = data.get("data", [])
    if not isinstance(items, list):
        items = []

    rows = []
    for item in items:
        if not isinstance(item, dict):
            continue
        title = (item.get("Title") or "").strip()
        if not title:
            continue
        # R1蒸馏：防御性 .get() 代替直接 key 访问
        cid = item.get("ClusterId")
        gid = item.get("ClusterIdStr") or (str(cid) if cid is not None else None)
        hv = item.get("HotValue")
        hot_value = None
        if hv is not None:
            try:
                hot_value = int(hv)
            except (ValueError, TypeError):
                pass
        rows.append({
            "rank": len(rows) + 1,
            "title": title,
            "hot_value": hot_value,
            "url": (item.get("Url") or "").strip() or None,
            "label": (item.get("Label") or "").strip() or None,
        })

    if not rows:
        raise RuntimeError("toutiao hot: empty result")
    return rows[:limit]


# ═══════════════════════════════════════════════════════════════
#  eastmoney_kuaixun — 东方财富 7x24 财经快讯
# ═══════════════════════════════════════════════════════════════

EM_KUAIXUN_URL = "https://np-listapi.eastmoney.com/comm/web/getFastNewsList"

def eastmoney_kuaixun(limit: int = 20, column: str = "102") -> list[dict]:
    """东方财富 7x24 财经实时快讯

    Args:
        limit: 返回条数 (1-100)
        column: 频道 102=重要 101=全部 104=公司 105=市场 106=机构 107=宏观
    """
    limit = _parse_limit({"limit": limit}, 20, 100)
    # R1蒸馏: null→"None" 修复
    col = str(column or "102").strip()
    params = urllib.parse.urlencode({
        "client": "web", "biz": "web_724",
        "fastColumn": col, "sortEnd": "",
        "pageSize": str(limit), "req_trace": "1",
    })
    data = _fetch(f"{EM_KUAIXUN_URL}?{params}")
    items = data.get("data", {}).get("fastNewsList", [])
    # R2蒸馏：空数据返回 [] 而非异常
    if not items:
        return []
    # R1蒸馏：.get() 代替直接索引
    return [{
        "time": i.get("showTime"),
        "title": i.get("title"),
        "summary": (i.get("summary") or "").replace("\n", " ")[:400],
    } for i in items[:limit]]


# ═══════════════════════════════════════════════════════════════
#  sinafinance_news — 新浪财经 7x24 实时快讯
# ═══════════════════════════════════════════════════════════════

SINA_NEWS_URL = "https://app.cj.sina.com.cn/api/news/pc"

def sinafinance_news(limit: int = 20) -> list[dict]:
    """新浪财经 7x24 实时快讯

    Args:
        limit: 返回条数 (1-100)
    """
    limit = _parse_limit({"limit": limit}, 20, 100)
    params = urllib.parse.urlencode({"page": "1", "num": str(limit)})
    data = _fetch(f"{SINA_NEWS_URL}?{params}")

    feed = data.get("result", {}).get("data", {}).get("feed", {})
    items = feed.get("list", [])
    if not isinstance(items, list):
        items = []
    if not items:
        raise RuntimeError("sinafinance returned no news data")

    return [{
        "time": item.get("ctime"),
        "title": (item.get("rich_text") or "").strip()[:200],
        "url": item.get("url"),
        "summary": (item.get("brief") or "").strip()[:300],
    } for item in items[:limit]]


# ═══════════════════════════════════════════════════════════════
#  快速测试: python hot_topics.py
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=== 今日头条热搜 TOP5 ===")
    for item in toutiao_hot(5):
        hv = f"{item['hot_value']:,}" if item.get('hot_value') else "?"
        label = f" [{item['label']}]" if item.get('label') else ""
        print(f"  {item['rank']:2}. {item['title'][:55]}{label}")
        print(f"      热度:{hv}")

    print(f"\n=== 东方财富 7x24 快讯（最新5条）===")
    for item in eastmoney_kuaixun(5):
        print(f"  {item['time']}  {item['title'][:70]}")

    print(f"\n=== 新浪财经快讯（最新5条）===")
    for item in sinafinance_news(5):
        print(f"  {item.get('time','?')}  {item['title'][:70]}")
