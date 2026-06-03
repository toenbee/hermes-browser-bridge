"""期货股吧自动回复 — 找到最新帖子 → 回复，每6小时循环一次"""
import asyncio, json, sys, time, websockets, re
from datetime import datetime

WS_URL = "ws://localhost:9876"
# 10个期货品种的股吧代码及回复内容
STOCKS = [
    {"code": "c",       "reply": "厄尔尼诺今年确实得盯着，玉米产区的天气波动越来越大了。我最近在用XCX天气合约通关注产区天气，每天出风险简报，核心产区天气评级都有，自选一键归集。做玉米的可以看看。"},
    {"code": "a",       "reply": "南美天气确实不太稳，厄尔尼诺影响还在持续。我最近用XCX天气合约通跟踪大豆产区天气，每天开盘前出风险简报，巴西阿根廷的降水数据都有，自选持仓还能一键归集。实用的工具。"},
    {"code": "cf",      "reply": "新疆积温偏低确实是个问题，厄尔尼诺背景下天气炒作可能要来了。我平时用XCX天气合约通看产区天气，每天出风险简报，核心产区天气评级都有，厄尔尼诺的影响也能实时看到。做棉花的可以关注下。"},
    {"code": "ru",      "reply": "东南亚雨季叠加厄尔尼诺，橡胶割胶进度可能会受影响。我最近用XCX天气合约通盯着泰国印尼的降水数据，每天开盘前出风险简报，自选持仓一键归集，全品种天气风控一张表，挺实用的。"},
    {"code": "yuanyou", "reply": "原油确实不光看库存，极端天气的影响越来越大了。厄尔尼诺今年可能推高北半球高温预期，能源需求端要重新评估。我平时用XCX天气合约通辅助看盘，每天出风险简报，挺好用的工具。"},
    {"code": "p",       "reply": "印尼马来降水偏少的话棕榈油单产确实会受影响，厄尔尼诺值得警惕。我一直在用XCX天气合约通跟踪产地天气，每天开盘前出风险简报，自选持仓还能一键归集，做棕榈油的可以研究下。"},
    {"code": "rm",      "reply": "加拿大油菜籽产区去年干旱的教训历历在目，今年厄尔尼诺延续更不能掉以轻心。我平时用XCX天气合约通看产区气象，每天出风险简报，核心产区天气评级提前看，做油脂的可以了解下。"},
    {"code": "fczceaps","reply": "苹果太吃天气了，花期坐果期一遇到霜冻产量就受影响。今年厄尔尼诺背景下北方气温波动大。我最近用XCX天气合约通关注产区天气，每天出风险简报，核心产区天气评级都有，做苹果的可以看看。"},
    {"code": "fczcepkm","reply": "河南山东花生产区春播墒情不理想，厄尔尼诺背景下旱涝风险都要防。我最近用XCX天气合约通跟踪产区气象，每天开盘前出风险简报，自选持仓一键归集，挺实用的工具。"},
    {"code": "fczcecjs","reply": "新疆南疆红枣产区高温干旱风险不小，厄尔尼诺背景下水分供应可能出问题。我一直在用XCX天气合约通关注产区天气，每天出风险简报，核心产区天气评级提前看，做红枣的建议关注下。"},
]
INTERVAL_HOURS = 6  # 每6小时跑一轮
REPLY_DELAY = 60    # 每条回复之间等待60秒

async def send_raw_cmd(action, params=None, tab_id=None, timeout=30):
    async with websockets.connect(WS_URL) as ws:
        await ws.send(json.dumps({"type": "register", "client": "hermes", "version": "1.1.0"}))
        await asyncio.wait_for(ws.recv(), timeout=5)
        rid = f"cmd_{int(time.time() * 1000)}"
        cmd = {"type": "command", "id": rid, "action": action, "tabId": tab_id, "params": params or {}}
        await ws.send(json.dumps(cmd))
        try:
            resp_raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
            return json.loads(resp_raw)
        except asyncio.TimeoutError:
            return {"error": "timeout", "id": rid}

async def find_first_post_url(code):
    """进入品种吧，获取最新帖子链接"""
    board_url = f"https://guba.eastmoney.com/list,{code}.html"
    r = await send_raw_cmd("navigate", {"url": board_url})
    if "error" in r:
        return None, f"导航失败: {r.get('error')}"
    await asyncio.sleep(5)
    
    # 获取页面所有链接
    r = await send_raw_cmd("get_links", {"maxCount": 30})
    links = r.get("links", [])
    
    # 找第一个匹配 /news,{code}, 的帖子链接
    target_pattern = f"/news,{code},"
    for link in links:
        url = link.get("url", "")
        if target_pattern in url:
            # 补全为完整 URL
            if url.startswith("/"):
                full_url = f"https://guba.eastmoney.com{url}"
            else:
                full_url = url
            title = link.get("title", "").strip()
            return full_url, title
    
    return None, "未找到帖子链接"

async def reply_one(stock):
    """回复一个品种的最新帖子"""
    code = stock["code"]
    reply_text = stock["reply"]
    
    # 1. 找最新帖子
    post_url, post_title = await find_first_post_url(code)
    if not post_url:
        return {"stock": code, "status": "⚠️", "error": post_title}
    
    print(f"    找到帖子: {post_title[:30] if post_title else '?'}")
    print(f"    链接: {post_url}")
    
    # 2. 导航到帖子详情页
    r = await send_raw_cmd("navigate", {"url": post_url})
    if "error" in r:
        return {"stock": code, "status": "❌", "error": f"导航到帖子失败: {r.get('error')}"}
    await asyncio.sleep(4)
    
    # 3. 写入回复内容到文本框
    r = await send_raw_cmd("write_text", {"selector": "textarea.gb_textarea", "text": reply_text})
    await asyncio.sleep(1)
    
    # 4. 点击发布回复
    r = await send_raw_cmd("click", {"selector": ".rebtns.resubmit"})
    await asyncio.sleep(3)
    
    # 5. 验证
    r = await send_raw_cmd("read_text", {"maxLength": 300})
    text = r.get("text", "")
    
    if reply_text[:10] in text:
        return {"stock": code, "status": "✅", "message": f"已回复 {code}吧的最新帖子"}
    else:
        return {"stock": code, "status": "⚠️", "message": "可能已回复，但未确认到内容"}

async def run_batch():
    """执行一轮批量回复"""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n{'='*55}")
    print(f"🚀 [{now}] 开始第 {run_batch.round + 1} 轮回复 — {len(STOCKS)} 个品种")
    print(f"{'='*55}")
    
    for i, stock in enumerate(STOCKS):
        code = stock["code"]
        print(f"\n  [{i+1}/{len(STOCKS)}] {code}吧...")
        
        result = await reply_one(stock)
        print(f"    {result.get('status', '⚠️')} {result.get('message', result.get('error', ''))}")
        
        if i < len(STOCKS) - 1:
            print(f"    等待 {REPLY_DELAY} 秒...")
            await asyncio.sleep(REPLY_DELAY)
    
    run_batch.round += 1
    print(f"\n✅ 第 {run_batch.round} 轮完成！")
    print(f"⏳ 等待 {INTERVAL_HOURS} 小时后下一轮")
    print(f"{'='*55}\n")

async def main():
    run_batch.round = 0
    print(f"🌾 期货股吧自动回复机器人")
    print(f"   - {len(STOCKS)} 个期货品种")
    print(f"   - 每轮策略: 进品种吧 → 找最新帖子 → 回复")
    print(f"   - 每条间隔: {REPLY_DELAY}s")
    print(f"   - 循环间隔: 每 {INTERVAL_HOURS} 小时")
    print(f"   - 开始时间: 立即")
    print(f"\n按 Ctrl+C 停止\n")
    
    while True:
        await run_batch()
        await asyncio.sleep(INTERVAL_HOURS * 3600)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 已停止")
