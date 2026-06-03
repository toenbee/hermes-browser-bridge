#!/usr/bin/env python3
"""Hermes Browser Bridge v6.1 — 心跳保活 + 内存清理 + 原生命令"""
import asyncio, json, os, time, urllib.request, urllib.parse
import websockets
from websockets.asyncio.server import serve

PORT = 9876
ext_ws = None
ext_last_seen = 0
pending = {}
MAX_PENDING = 200

# ═══════════════════════════════════════════
#  原生命令（不经过扩展，bridge 直接执行）
# ═══════════════════════════════════════════

NATIVE_COMMANDS = {}
BRIDGE_SECRET = os.environ.get("BRIDGE_SECRET", "hermes-bridge-v6")

def _parse_limit(args, default=30, maximum=100):
    """安全解析 limit 参数：处理 None/非整数/超限"""
    if not isinstance(args, dict): return default
    raw = args.get("limit", default)
    if raw is None: return default
    try: return max(1, min(int(raw), maximum))
    except (ValueError, TypeError): return default

def _http_get(url: str, headers: dict = None, timeout: int = 15) -> dict:
    req = urllib.request.Request(url, headers=headers or {})
    req.add_header("User-Agent", "Mozilla/5.0")
    req.add_header("Accept", "application/json")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())

# ── 共享数据源：hot_sources.py 导出 toutiao_hot / eastmoney_kuaixun ──
# 被 bridge.py（WS原生命令）和 hot_topics.py（独立库）共同 import
# 消除 4 份拷贝 → 1 个真理源。修改逻辑只改这一处。

try:
    import sys as _sys
    _sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from hot_sources import toutiao_hot, eastmoney_kuaixun
    _HAS_HOT_SOURCES = True
except ImportError:
    # 回退：内联实现（hot_sources.py 尚未建立时）
    _HAS_HOT_SOURCES = False
    @lambda fn: NATIVE_COMMANDS.__setitem__("toutiao_hot", fn) or fn
    def toutiao_hot(args):
        """今日头条实时热搜榜 — 公开API"""
        limit = _parse_limit(args, 30, 50)
        data = _http_get("https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc",
                         headers={"Referer": "https://www.toutiao.com/"})
        if data.get("status") != "success":
            raise RuntimeError("toutiao hot-board status=" + str(data.get("status")))
        items = data.get("data", [])
        if not isinstance(items, list): items = []
        rows = []
        for item in items:
            if not isinstance(item, dict): continue
            title = (item.get("Title") or "").strip()
            if not title: continue
            cid = item.get("ClusterId")
            gid = item.get("ClusterIdStr") or (str(cid) if cid is not None else None)
            img = item.get("Image", {}) or {}
            img_url = img.get("url") if isinstance(img, dict) else None
            if img_url is False: img_url = None
            hv = item.get("HotValue")
            hot_value = None
            if hv is not None:
                try: hot_value = int(hv)
                except (ValueError, TypeError): pass
            rows.append({"rank": len(rows)+1, "group_id": gid, "title": title,
                         "hot_value": hot_value, "url": (item.get("Url") or "").strip() or None})
        return rows[:limit]

    @lambda fn: NATIVE_COMMANDS.__setitem__("eastmoney_kuaixun", fn) or fn
    def eastmoney_kuaixun(args):
        """东方财富 7x24 财经快讯 — 公开API"""
        limit = _parse_limit(args, 20, 100)
        col = str(args.get("column") or "102").strip() if isinstance(args, dict) else "102"
        params = urllib.parse.urlencode({"client":"web","biz":"web_724","fastColumn":col,"sortEnd":"","pageSize":str(limit),"req_trace":"1"})
        data = _http_get(f"https://np-listapi.eastmoney.com/comm/web/getFastNewsList?{params}")
        items = data.get("data", {}).get("fastNewsList", [])
        if not items: return []
        return [{"time": i.get("showTime"), "title": i.get("title"),
                 "summary": (i.get("summary") or "").replace("\n"," ")[:400]}
                for i in items[:limit]]

if _HAS_HOT_SOURCES:
    NATIVE_COMMANDS["toutiao_hot"] = toutiao_hot
    NATIVE_COMMANDS["eastmoney_kuaixun"] = eastmoney_kuaixun

# ═══════════════════════════════════════════
#  原有 bridge 逻辑（未改动）
# ═══════════════════════════════════════════

async def heartbeat():
    """每30秒心跳 + 内存清理"""
    global ext_ws, ext_last_seen
    while True:
        await asyncio.sleep(30)
        now = time.time()
        
        # 清理超时 pending
        stale = [rid for rid, fut in pending.items() if fut.done() or (now - getattr(fut, '_created', now)) > 60]
        for rid in stale:
            pending.pop(rid, None)
        if stale:
            print(f"[HB] Cleaned {len(stale)} stale futures, {len(pending)} remaining")
        
        # 心跳检测扩展
        if ext_ws and ext_ws.state.name == "OPEN":
            try:
                await asyncio.wait_for(ext_ws.send(json.dumps({"type":"ping"})), timeout=5)
                ext_last_seen = now
            except:
                print("[HB] Extension ping failed, disconnecting")
                try: await ext_ws.close()
                except: pass
                ext_ws = None
        elif ext_ws:
            # 状态不是 OPEN，清理
            ext_ws = None

async def handler(ws):
    global ext_ws, ext_last_seen
    client = "?"
    
    async for message in ws:
        try:
            msg = json.loads(message)
        except:
            continue
        
        if msg.get("type") == "register":
            client = msg.get("client", "?")
            if client == "extension":
                ext_ws = ws
                ext_last_seen = time.time()
            print(f"[+] {client}")
            await ws.send(json.dumps({"type": "registered"}))
            continue
        
        if msg.get("type") == "pong":
            # 扩展心跳回复
            continue
        
        # Hermes → 原生命令 or Extension: 分流
        if client == "hermes" and msg.get("type") == "command":
            action = msg.get("action", "")
            
            # 先检查原生命令（不走扩展）
            if action in NATIVE_COMMANDS:
                # 安全认证：必须提供正确 secret
                if msg.get("secret") != BRIDGE_SECRET:
                    await ws.send(json.dumps({"id": msg.get("id","?"), "type": "reply", "error": "auth required"}))
                    continue
                rid = msg.get("id", "?")
                try:
                    result = await asyncio.get_running_loop().run_in_executor(
                        None, NATIVE_COMMANDS[action], msg.get("params", {}))
                    await ws.send(json.dumps({"id": rid, "type": "reply", "result": result}))
                except Exception as e:
                    await ws.send(json.dumps({"id": rid, "type": "reply", "error": str(e)}))
                continue
            
            # 否则转发给扩展
            if ext_ws and ext_ws.state.name == "OPEN":
                rid = msg["id"]
                # 内存保护：超过上限拒绝
                if len(pending) >= MAX_PENDING:
                    await ws.send(json.dumps({"error": "too many pending", "id": rid}))
                    continue
                
                fut = asyncio.get_running_loop().create_future()
                fut._created = time.time()
                pending[rid] = fut
                
                try:
                    await ext_ws.send(json.dumps(msg))
                    result = await asyncio.wait_for(fut, timeout=30)
                    await ws.send(json.dumps(result))
                except asyncio.TimeoutError:
                    pending.pop(rid, None)
                    try: await ws.send(json.dumps({"error": "timeout", "id": rid}))
                    except: pass
                except Exception as e:
                    pending.pop(rid, None)
                    try: await ws.send(json.dumps({"error": str(e), "id": rid}))
                    except: pass
            else:
                await ws.send(json.dumps({"error": "no extension", "id": msg.get("id")}))
            continue
        
        # Extension → Hermes: 命令结果
        if client == "extension" and msg.get("type") == "reply":
            rid = msg.get("id")
            if rid and rid in pending:
                pending[rid].set_result(msg)
                del pending[rid]
            continue
    
    if client == "extension":
        ext_ws = None
        print(f"[-] Extension disconnected")
    print(f"[-] {client}")

async def main():
    print(f"Bridge v6: ws://localhost:{PORT}")
    asyncio.create_task(heartbeat())
    async with serve(handler, "127.0.0.1", PORT):
        await asyncio.get_running_loop().create_future()

if __name__ == "__main__":
    asyncio.run(main())
