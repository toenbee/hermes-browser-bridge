---
name: browser-control
description: 浏览器统一控制入口 — WS 连接、代理管理、多平台搜索、内容研究、图片提取、网络诊断。一次加载覆盖所有浏览器操作，不再需要分别加载 bridge 和 operations。
version: 3.3.0
category: automation
tags: [browser, proxy, search, images, network, content-research, unified]
triggers:
  - 浏览器操作 / 打开网页 / 搜索 / 截图
  - 写文章 / 搜素材 / 配图 / 提取图片
  - 代理 / 翻墙 / 网络不通
  - 任何需要操控浏览器的任务
---

# Browser Control — 浏览器统一入口

一个 skill 覆盖所有浏览器操作。不再需要分别加载 `browser-bridge` 和 `browser-operations`。

底层依赖：`~/hermes-browser-bridge/`（bridge.py + 扩展），深入调试时参考 `browser-bridge` skill 的七~十一章（架构/项目结构/坑/发布/故障排查）。

---

## 零、启动检查（每次浏览器操作前必做）

**必须确认 bridge 在运行且扩展已连接，否则所有 browser_navigate 会超时或走远程代理（国内站必挂）。**

### 三层健康检查（缺一不可）

```bash
# Layer 1: Bridge 进程 + 端口
ss -tlnp | grep 9876 || echo "❌ Port 9876 未监听"
ps aux | grep bridge.py | grep -v grep || echo "❌ 无 bridge 进程"

# Layer 2: 扩展是否连接（必须有 ESTABLISHED 连接）
powershell.exe -Command "netstat -ano | findstr ':9876'" | grep ESTABLISHED || echo "❌ 扩展未连接"

# Layer 3: NativeMessaging 注册表（如果 Layer 2 失败，检查此项）
powershell.exe -ExecutionPolicy Bypass -File "C:\Users\10737\Desktop\hermes-extension\verify_nm.ps1" 2>&1
```

### 如果 Layer 2 失败（扩展未连接）→ 检查 NativeMessaging

**症状**：bridge 在运行，port 9876 监听中，但 list_tabs 返回 "no extension"。

**根因**：Windows NativeMessaging 注册表未配置，扩展无法通过 NM 启动/连接 bridge。

**修复**：
```bash
# 导入注册表（Edge）
powershell.exe -Command "reg import 'C:\Users\10737\Desktop\hermes-extension\install_native.reg'"
# 验证
powershell.exe -ExecutionPolicy Bypass -File "C:\Users\10737\Desktop\hermes-extension\verify_nm.ps1"
```

注册表路径：`HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.hermes.browser_bridge` → 指向 `manifest_native.json`

### 如果 Layer 1 失败（bridge 未运行）→ 启动 bridge

```bash
# start_bridge.ps1 v2: 智能端口检测 + 自动恢复旧进程 + 验证扩展连接
powershell.exe -ExecutionPolicy Bypass -File "C:\Users\10737\Desktop\hermes-extension\start_bridge.ps1"
```

脚本功能：
- 检测端口 9876 是否被 LISTEN 占用（忽略 TIME_WAIT 残留和 PID=0）
- 如果是旧 bridge 进程 → 自动杀掉重启
- 启动后验证端口监听 + 扩展连接数

详见 `references/port-management-v2.md`

### 端到端验证（Python on Windows）

```python
# 保存为 test_bridge.py 并在 Windows 运行
import asyncio, json, websockets
async def test():
    async with websockets.connect("ws://127.0.0.1:9876") as ws:
        # ⚠️ client 必须注册为 "hermes"，其他名字 bridge 不转发命令
        await ws.send(json.dumps({"type":"register","client":"hermes"}))
        await ws.recv()
        await ws.send(json.dumps({"type":"command","id":"t1","action":"list_tabs","params":{}}))
        r = json.loads(await asyncio.wait_for(ws.recv(), timeout=8))
        if "error" in r: print(f"FAIL: {r['error']}")
        else: print(f"OK: {len(r.get('tabs',[]))} tabs")
asyncio.run(test())
```

**⚠️ 关键：注册名必须为 `"hermes"`** — bridge.py 硬编码只转发 `client == "hermes"` 的命令给扩展。其他名字（如 "hermes-test"）返回 "no extension"。

---

## 零.五、中文站抓取优先级

浏览器受 SPA/验证码/反爬影响大。优先级从高到低：

1. **curl 直连**（非 SPA 静态页面）→ 最快最稳
2. **浏览器 browser_navigate**（仅对百度热搜/头条等非 SPA 页）→ 可拿 JS 渲染内容
3. **Hermes 内置 browser 工具** → 注意：这是 session 内置浏览器，不是 bridge！bridge 未启动时它会走远程代理，国内站几乎必超时

⚠️ **关键区分**：`browser_navigate` / `browser_snapshot` 是 Hermes 内置浏览器工具（自带渲染引擎），`browser-control` 的 `cmd(ws, 'navigate', ...)` 是 bridge WS 协议。两者是不同的浏览器实例。当 bridge 未运行时，只能用内置浏览器，且国内站要预知超时风险。

---

## 零、速查：WS 命令封装

所有浏览器操作的基础。直接复制使用：

```python
import asyncio, json, websockets

async def cmd(ws, action, params=None, tab_id=None, timeout=15):
    rid = f't_{int(__import__("time").time()*1000)}'
    await ws.send(json.dumps({'type':'command','id':rid,'action':action,'tabId':tab_id,'params':params or {}}))
    return json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))

async def main():
    async with websockets.connect('ws://localhost:9876') as ws:
        await ws.send(json.dumps({'type':'register','client':'hermes'}))
        await asyncio.wait_for(ws.recv(), timeout=5)
        # ... 你的操作 ...
```

全部命令：`list_tabs` `activate_tab` `new_tab` `close_tab` `reload_tab` `navigate` `read_text` `read_html` `click` `scroll` `screenshot` `get_images` `get_links` `type_text` `key_press` `create_window` `close_window` `list_windows`

---

## 一、铁律（违反必出事）

1. **只用独立窗口** — `create_window` 开、`close_window` 关，绝不用 `new_tab` 在用户窗口里开标签
2. **close_window 必须用 windowId** — 从 create_window 返回值取，禁止通过 tabId 反查
3. **新标签先 reload** — navigate 后 reload_tab 等 3s，确保 content.js 注入
4. **用完即关** — 独立窗口干完活立刻 close_window
5. **标签 ≤ 10 个**
6. **代理按需开关** — 默认直连，国际站自动开，用完即关
7. **NO_PROXY=localhost** — 代理排除 localhost，否则劫持 WS

---

## 二、代理自动管理

**原则：默认直连，访问国际站时自动开全局代理，用完即关。**

```python
def need_proxy(url):
    intl = ['youtube.com','tiktok.com','twitter.com','x.com',
            'github.com','google.com','openai.com','reddit.com','discord.com',
            'facebook.com','instagram.com','medium.com','wikipedia.org']
    from urllib.parse import urlparse
    domain = urlparse(url).netloc.lower()
    return any(d in domain for d in intl)

# 开代理
subprocess.run(['python3','~/hermes-browser-bridge/proxy_manager.py','on'])
await asyncio.sleep(2)

# 关代理
subprocess.run(['python3','~/hermes-browser-bridge/proxy_manager.py','off'])
```

---

## 三、多平台搜索

### 国内（直连）

| 平台 | URL 模板 | 备注 |
|------|----------|------|
| 搜狗 | `sogou.com/web?query={}` | 中文最佳 |
| 头条搜索 | `so.toutiao.com/search?keyword={}` | |
| 头条图片 | `so.toutiao.com/search?keyword={}&tab=image` | **配图首选** |
| 小红书 | `xiaohongshu.com/search_result?keyword={}` | |
| 微博 | `s.weibo.com/weibo?q={}` | |
| B站 | `search.bilibili.com/all?keyword={}` | |
| 百度 | `baidu.com/s?wd={}` | ⚠️ 验证码多 |
| 知乎 | `zhihu.com/search?type=content&q={}` | ⚠️ 反爬 |

### 国际（需代理）

| 平台 | URL 模板 |
|------|----------|
| GitHub | `github.com/search?q={}&type=repositories` |
| X/Twitter | `x.com/search?q={}` |
| YouTube | `youtube.com/results?search_query={}` |

### 搜索降级

搜狗（中文最佳）→ Google（需代理，常超时）→ 头条搜索 → 换关键词重试

---

## 四、内容研究流水线

```
开独立窗口 → 多引擎搜索 → 筛选文章 → 点进原文 → 滚动到底 → 提取配图 → 判断完整性 → 截图取证 → 关窗
```

### 点进原文 + 滚动

```python
await cmd(ws, 'click', {'selector': '.result h3 a'}, tab)
await asyncio.sleep(5)
r = await cmd(ws, 'list_tabs')
art_tab = r['tabs'][-1]['id']

for i in range(25):
    rr = await cmd(ws, 'scroll', {'direction':'down','amount':800}, art_tab)
    if rr.get('scrollY',0) >= rr.get('maxScroll',99999)-100:
        break

r = await cmd(ws, 'read_text', {'maxLength': 20000}, art_tab)
```

### 完整性判断（检查最后 300 字）

| 标识 | 判断 |
|------|------|
| `举报` `版权` `免责声明` `界面新闻` `转载` `作者` | ✅ 完整 |
| 广告推荐 / 相关阅读 / 热搜榜 | ⚠️ 截断 |
| `展开全文` `阅读更多` | ❌ 需点击展开 |

### 引用铁律

- 真实来源，不编造
- 所有数据、排名、事实必须来自打开过的原文
- 每篇文章至少截 2 张图留存
- **每条数据必须标注来源 URL + 发布时间** — 用户问「什么时候发的」是最常见追问，不能事后补
- 如果发布时间确实无法获取（SPA/动态加载），显式标注「时间未知：页面为动态渲染，无法提取发布时间」

---

## 五、图片提取与配图

### 图片源优先级

| 优先级 | 来源 | 可靠性 |
|--------|------|:---:|
| **1** | 头条图片搜索 (`so.toutiao.com?tab=image`) | ✅ |
| 2 | 非 SPA 新闻站原文 | ✅ |
| 3 | Pollinations AI 生成 | ⚠️ 15% 成功率 |
| 4 | HTML 卡片（1200x800 截图） | ✅ 兜底 |

### 千万别做的事

- ❌ 点进头条文章详情页提取图片（SPA，get_images 返回空）
- ❌ 用 Bing 图片（只有缩略图 200-346px）
- ❌ 用百度图片（验证码地狱）

### 头条图片搜索流程

```python
from urllib.parse import quote
url = f"https://so.toutiao.com/search?keyword={quote(keyword)}&tab=image"
# 用 Hermes 内置 browser_navigate + browser_get_images
# Python 端手动过滤：尺寸≥200 + 黑名单域名
# 下载到 D:\Download\article-images\
```

### 图片验证铁律

1. **必须用 vision_analyze 验证** — 不能用标题/alt 猜测
2. **不匹配果断换源**

---

## 六、网络诊断（5 层递进）

用户说"网不通"时按顺序走：

```bash
# Layer 1: 网络存活？
ping -c 2 -W 2 192.168.31.1
nslookup baidu.com

# Layer 2: 直连可达？
env -u http_proxy -u https_proxy curl -sI --connect-timeout 5 https://www.baidu.com

# Layer 3: 代理端口？
ss -tlnp | grep 7897

# Layer 4: Windows 系统代理
powershell.exe -Command "Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' | Select-Object ProxyEnable,ProxyServer | Format-List"

# Layer 5: WSL2 环境变量
env | grep -iE "http_proxy|https_proxy|all_proxy"
```

### 常见修复

**Clash Verge ProxyServer 残留**（关闭代理后仍无法上网）：
```bash
powershell.exe -Command "Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -Name ProxyServer -Value ''"
```
然后完全退出浏览器重开。

**MiWiFi 劫持**（跳到 miwifi.com）：
```bash
sudo bash -c 'echo "nameserver 114.114.114.114" > /etc/resolv.conf'
powershell.exe -Command "ipconfig /flushdns"
```

---

## 七、独立窗口模板

```python
# 开窗
r = await cmd(ws, 'create_window', {'url': 'https://目标'})
wid = r['windowId']
tid = r['tabId']

# 干活...
await cmd(ws, 'reload_tab', {}, tid)
await asyncio.sleep(3)

# 关窗（必须用 windowId！）
await cmd(ws, 'close_window', {'windowId': wid})
```

---

## 八、内存与稳定性

### 已知内存泄漏（v5→v6 已修复）

**根因**：
- bridge `pending` 字典：扩展崩后 futures 不清理 → 内存缓慢增长
- offscreen document：Edge sleeping tabs 冻结 → 扩展静默停止 → bridge 堆积未响应命令
- 无心跳机制：TCP 半开连接无法检测 → 双方以为连接还活着

**v6 修复**（2026-05-25）：
- 30s 心跳检测（bridge ping → offscreen pong）
- 每 30s 清理超时 futures（>60s 未完成即 pop）
- `MAX_PENDING=200` 上限保护
- offscreen 每 15s 更新 DOM title 防 Edge 休眠
- offscreen 每 20s 主动 ping，断开自动重连

### 自动监控 cron（推荐）

部署后无需手动检查，每 10 分钟自动巡检：

```bash
# 手动运行
python3 scripts/bridge_monitor.py

# 设为 cron（silent when OK, Bark alert on issues）
# cron ID: 95b5c10f363d  schedule: every 10m  deliver: local
```

脚本：`scripts/bridge_monitor.py`（检查端口→自动重启/扩展连接→Bark告警/内存>200MB→Bark告警）

### PowerShell 输出编码陷阱

WSL 调用 `powershell.exe` 时，输出可能含 GBK 编码字符，导致 Python `subprocess.run()` 抛出 `UnicodeDecodeError`。修复：`subprocess.run(..., encoding='utf-8', errors='replace')`。

### PowerShell 输出编码陷阱（新增 2026-05-26）

WSL 调用 `powershell.exe` 时，输出可能含 GBK 编码字符，导致 Python `subprocess.run()` 抛出：
```
UnicodeDecodeError: 'utf-8' codec can't decode byte 0xce in position 22
```
修复：`subprocess.run(..., encoding='utf-8', errors='replace')`

### 一键诊断

```bash
bash ~/.hermes/skills/automation/browser-control/scripts/bridge-diag.sh
```

输出：bridge 进程状态+内存、端口监听、扩展连接、Edge 进程 TOP5。

**端口详细排查** → `references/port-diagnostics.md`（LISTEN/TIME_WAIT/PID=0 状态处理、手动诊断命令）

### 内存监控（手动） + 自动巡检 cron

```bash
# bridge 进程内存
ps -p $(pgrep -f bridge.py) -o pid,rss,vsz,pcpu,etime --no-headers

# Edge 内存 TOP5
powershell.exe -Command "Get-Process msedge | Sort-Object WorkingSet64 -Descending | Select -First 5 | ft Id,@{N='Mem(MB)';E={[math]::Round(\$_.WorkingSet64/1MB,1)}} -AutoSize"
```

**自动巡检**：bridge-health-monitor cron（`/home/suke/.hermes/scripts/bridge_monitor.py`），每 10 分钟自动：
- 检查端口 9876 是否监听（掉了自动重启）
- 检查扩展是否通过 ESTABLISHED 连接
- 检查内存是否超 200MB
- 异常时 Bark 推送告警

**cron 检查**：`hermes cronjob list | grep bridge`

### 掉线恢复

1. bridge 掉线 → `powershell.exe -File C:\Users\10737\Desktop\hermes-extension\start_bridge.ps1`
2. 扩展掉线 → Edge `edge://extensions` → Hermes Bridge → 🔄 重新加载
3. 两者都掉 → 先重启 bridge，再重载扩展

---

## 九、故障速查

| 问题 | 处理 |
|------|------|
| 桥接挂了 | 重启 Windows bridge.py |
| 扩展未连接（`no extension`） | 检查 Edge 是否打开 → 重载扩展 → 检查 NativeMessaging 注册表 |
| bridge 内存增长 | 升级到 v6（心跳+清理），或手动 `kill` 重启 |
| 扩展频繁掉线 | v6 已加固（防休眠+主动重连），如仍发生：关掉 Edge 省电模式 |
| `injection failed` / 0字 | reload_tab + 等 3s |
| 截图失败 | debugger API 自动兜底 |
| WS 连接失败 | bridge.py 未运行，检查 `ss -tlnp \| grep 9876` |
| WSL→PowerShell 截图超时 | 扩展离线（电脑锁屏/休眠）→ 等电脑解锁再试 |
| 搜索结果不显示 | 换搜索引擎 |
| 劫持/WLAN | 立即停止，DNS→114 |
| 验证码 | 截图通知用户，不硬闯 |
| 图片全被过滤 | 换头条图片搜索 |
| SPA 页面返回空 | 不要 reload，换非 SPA 站 |
| vision_analyze 说配图不匹配 | 换源 |
| 浏览器连续超时 | 同一会话内只 navigate 一次！连续 navigate 会冲突。要换页面：先 close_tab → sleep 2 → navigate |

---

## 九、中文站反爬陷阱

### 搜狗搜索 → 反爬拦截
- 症状：返回 `sogou.com/antispider/?m=1` 页面
- 原因：搜狗对自动搜索请求有严格的反爬策略
- 解决：**不用搜狗搜索**，改用头条搜索 `so.toutiao.com/search?keyword={}&tab=all` 或百度热搜 `top.baidu.com/board?tab=realtime`

### 百度搜索 → 验证码
- 症状：返回百度安全验证页（captcha/tuxing_v2.html）
- 原因：百度搜索对自动化请求触发图形验证码
- 解决：不用百度搜索，改用百度热搜（top.baidu.com 返回正常内容）

### 百度热搜 → ✅ 推荐
- `top.baidu.com/board?tab=realtime` — 可直接获取完整 TOP40 热搜，返回正常快照，无需验证
- 这是获取中文热点数据的**最可靠来源**

### 今日头条 → ❌ SPA
- `toutiao.com` 及其子频道是 SPA（单页应用），`browser_navigate` 返回空快照
- 不要在此浪费回合，直接用百度热搜标题替代

### 快手网页版 → ❌ 纯 SPA
- `kuaishou.com/search/video?searchKey={}` 是 Vue.js SPA
- curl 返回完整 HTML 但 `<div class="cards"></div>` 为空，所有数据客户端渲染
- `window.INIT_STATE` 仅含页面配置，不含搜索结果
- 即使加 Mobile UA + Referer 也无法抓取商品/视频数据
- 需要实时数据 → 用第三方数据平台（飞瓜快数、蝉妈妈）；日常参考 → 行业报告+公开分析

### 头条搜索 → ⚠️ 长尾词无结果
- 头条搜索对超长尾/高度具体的查询返回「抱歉，未找到相关结果」
- 例如「快手 中老年 氨糖软骨素 热销」「晚年之美 中老年女装 GMV」等 5+ 词查询无结果
- 降级：用 2-3 词的短查询（如「快手中老年 保健品」），或切换到百度热搜（仅限热点话题）

### 必应中文搜索 → ⚠️ 不可靠
- `cn.bing.com` 对中文电商/垂直领域查询经常返回完全无关结果
- 已验证：搜"快手中老年商品"返回 Instagram 德语下载页、助学贷款教程等
- 不可作为中文内容研究的主搜索源

### 多引擎搜索降级策略
百度热搜（首选）→ 头条搜索 → 换关键词重试
- 搜狗：反爬拦截 ❌
- 百度搜索（`baidu.com/s?wd=`）：验证码 ❌
- 必应中文：结果不可靠 ⚠️
- 快手/头条：纯 SPA，不可爬 ❌
- DuckDuckGo：国内被墙 ❌

---

## 九、与旧 skill 的关系

- **browser-bridge** → 底层参考（安装/架构/14坑/项目结构），日常不需要加载，只有调试 bridge 本身才看
- **browser-operations** → 已被本 skill 吸收，后续迭代只更新 browser-control
- **browser-control** → 日常唯一入口，覆盖所有浏览器操作
