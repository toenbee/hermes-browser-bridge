---
name: scrapling-official
description: "Scrape web pages using Scrapling with anti-bot bypass, adaptive scraping, and JavaScript rendering. Use when asked to scrape/crawl/extract data from websites. Use get for HTTP, fetch/stealthy-fetch for browser-based (see Playwright section)."
version: "0.4.8"
---

# Scrapling

Adaptive Web Scraping framework. Parser learns from website changes, bypasses anti-bot.

**Requires: Python 3.10+** (`pip install scrapling[all]`)

## CLI Usage

```bash
# ✅ HTTP fetch → markdown (可用)
scrapling extract get URL output.md --ai-targeted

# ⏳ Browser-based (待 Playwright 支持 Ubuntu 26.04)
scrapling extract fetch URL output.md
scrapling extract stealthy-fetch URL out.md --solve-cloudflare
```

Key options: `--ai-targeted` (always use), `-s/--css-selector`, `--timeout`

## Python Usage

```python
from scrapling.fetchers import Fetcher
page = Fetcher.get('https://example.com')
data = page.css('.selector::text').getall()
```

## Tool Selection

| 场景 | 工具 | 理由 |
|------|------|------|
| 快速读网页 | **Jina Reader** | 更轻量 |
| 搜索+全文 | **Jina Reader** | 搜索抓取一体 |
| HTTP 抓取 | **Scrapling get** | 自适应选择器 |
| Jina 不通时的降级 | **Scrapling get** | 本地抓取 |
| 需要交互 | **Browser Bridge** | 唯一交互方案 |

## Guardrails
- Always `--ai-targeted` in CLI
- Respect robots.txt
- Clean temp files
- Prefer `.md` output; use `-s` CSS selectors

## ⏳ Playwright 浏览器（待支持）

Ubuntu 26.04 暂不支持 Playwright 浏览器安装。
GitHub PR #40876 已合并修复，等待 1.61.0 发布。

届时执行：
```bash
pip install --upgrade playwright
playwright install chromium
```

安装后 `fetch` 和 `stealthy-fetch` 即可使用：
- `fetch`: JS 渲染页面
- `stealthy-fetch`: 反爬绕过 + Cloudflare 破解

## Full Reference
https://github.com/D4Vinci/Scrapling/blob/main/agent-skill/Scrapling-Skill/SKILL.md
