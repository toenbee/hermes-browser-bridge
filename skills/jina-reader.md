---
name: jina-reader
description: "Convert URLs to clean LLM-friendly markdown via Jina Reader API (r.jina.ai). Search web with full-text results (s.jina.ai). API key configured in .env as JINA_API_KEY. Use for quick page-to-markdown, search with full-content results, PDF/Office doc extraction."
---

# Jina Reader

Free/paid API that converts URLs and searches to LLM-friendly markdown.

**Website**: https://jina.ai/
**API Dashboard**: https://jina.ai/api-dashboard

**Endpoints:**
- `https://r.jina.ai/{URL}` — URL → clean markdown ✅
- `https://s.jina.ai/{query}` — Search + top 5 full-text results ✅

**API key**: Stored in `$JINA_API_KEY` (from ~/.hermes/.env). Always use:
```bash
curl -H "Authorization: Bearer $JINA_API_KEY" "https://r.jina.ai/{URL}"
curl -H "Authorization: Bearer $JINA_API_KEY" "https://s.jina.ai/{query}"
```

## Proxy / Fallback Logic

国内直连 Jina 可能超时。按以下顺序尝试：

1. **直连** `curl --connect-timeout 10` — 能通就用
2. **代理** `curl -x http://127.0.0.1:7897` — 直连不通走 Clash
3. **降级** → 代理也不通 → 换 Scrapling get
4. **再降级** → Scrapling 也不通 → Browser Bridge

**判断标准**：curl 返回非空 markdown 内容 = 成功；401/403/超时/空响应 = 失败，自动降级。

## Tool Selection: Which tool for which job?

| 场景 | 工具 | 理由 |
|------|------|------|
| 搜索+全文 | **Jina s.jina.ai** | 一次返回5条完整文章 |
| 快速读网页 | **Jina r.jina.ai** | 零开销 |
| Jina 不通 | **Scrapling get** | HTTP 抓取降级 |
| 需要交互 | **Browser Bridge** | 登录/点击 |
| 批量/反爬 | **Scrapling get** | 并发+自适应 |

## Usage

```bash
# 读网页
curl -s -H "Authorization: Bearer $JINA_API_KEY" "https://r.jina.ai/https://example.com"

# 搜索（URL-encode query）
curl -s -H "Authorization: Bearer $JINA_API_KEY" "https://s.jina.ai/AI%20news"

# 站点内搜索
curl -s -H "Authorization: Bearer $JINA_API_KEY" "https://s.jina.ai/deepseek?site=api.deepseek.com"

# 指定输出格式
curl -s -H "Authorization: Bearer $JINA_API_KEY" \
  -H "X-Respond-With: markdown" \
  "https://r.jina.ai/https://example.com"

# 只提取特定区域
curl -s -H "Authorization: Bearer $JINA_API_KEY" \
  -H "X-Target-Selector: article" \
  "https://r.jina.ai/https://example.com"
```

## Notes
- Free tier: 100 RPM, 100K TPM, 新用户送 1000万 token
- r.jina.ai 无需 API key 也能用（有限制）
- s.jina.ai 需要 API key
- 结果缓存 1 小时
- 支持 JS 渲染、PDF/Office 文档
