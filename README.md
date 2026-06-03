# Hermes Browser Bridge

操控你的浏览器，两种方式任选：

- **🧠 AI Agent 模式** — 配合 Hermes Agent，说句话就让 AI 自动搜、读、配图、修网络
- **⌨️ 命令行模式** — 纯 Windows CMD，`python hermes_client.py` 手动操控

**不需要 WSL，不需要 Linux，装好 Python 就能用。**

---

## 目录

- [它能做什么](#它能做什么)
- [缝合工具链](#缝合工具链)
- [快速开始（3 分钟）](#快速开始3-分钟)
- [命令大全](#命令大全)
- [bridge v6.1 新特性](#bridge-v61-新特性)
- [hot_topics.py — 独立热点API](#hot_topicspy--独立热点api)
- [CloakBrowser — 反爬隐身 Chromium](#cloakbrowser--反爬隐身-chromium)
- [与 Hermes Agent 集成](#与-hermes-agent-集成)
- [常见问题排查](#常见问题排查)
- [项目文件结构](#项目文件结构)
- [开发踩坑记录](#开发踩坑记录)

---

## 它能做什么

### 🧠 AI Agent 模式（配合 Hermes Agent，推荐）

对 Hermes 说一句话，Agent 自动搞定：

```
你说的话                          Agent 做的事
─────────────────────────────────────────────────────────
"帮我搜一下今天AI圈有什么新闻"     自动搜索多平台 → 筛选相关文章 → 滚动到底读完 → 截图留存
"给这篇文章找3张配图"             自动搜头条图片 → 提取高分辨率图 → vision验证内容匹配 → 下载
"网又断了，看看怎么回事"           5层递进诊断 → 定位到Clash残留 → 自动修复 → 验证恢复
"搜一下鸿蒙最新版本的评测"         多引擎搜索 → 点进原文 → 读完 → 判断完整性 → 返回摘要
"今天有什么热点"                  直接返回头条热搜 TOP10 + 东方财富快讯（原生命令，秒级）
```

### ⌨️ 命令行模式（Windows CMD 直接跑）

```cmd
操作                          命令
────────────────────────────────────────────
列出所有标签页                python hermes_client.py list_tabs
搜索并打开网页                python hermes_client.py navigate "https://baidu.com/s?wd=天气"
读取页面文字                  python hermes_client.py read_text
截图                          python hermes_client.py screenshot
填写表单/发帖                 python hermes_client.py write_text "#title" "我的标题"
下载文件                      python hermes_client.py download "https://example.com/file.pdf"
新建窗口                      python hermes_client.py create_window "https://xiaohongshu.com"
Ctrl+F 搜索                   python hermes_client.py find_in_page "关键词"
```

**关键区别：** 它不是新开一个自动化浏览器，而是**操控你正在用的 Edge/Chrome 窗口**。你登录过的网站（小红书、知乎、微博）直接用，不需要再登录。

> ⚠️ **独立窗口原则：** AI Agent 操作时永远用 `create_window` 开新窗口，用完 `close_window` 关闭。**绝不在你正在工作的窗口里开标签页**——不会打扰你的正常浏览。

---

## 缝合工具链

Bridge 是内容获取链路的最后一环。整个体系按场景分工：

```
轻量阅读       → Jina Reader (r.jina.ai)     URL→Markdown，零开销
搜索+全文      → Jina Reader (s.jina.ai)     搜5条+抓全文，写作神器
HTTP 抓取      → Scrapling get               自适应选择器，Python/CLI
隐身反爬       → CloakBrowser 🆕             58个C++补丁隐身Chromium，过Cloudflare
后台热点       → Bridge 原生命令 🆕           toutiao_hot/eastmoney_kuaixun 秒级返回
需要交互       → Browser Bridge ← 你在这里    登录/点击/截图，唯一方案
文档交付       → libreoffice 🆕               MD→DOCX 一键转换
```

- [Jina Reader](https://jina.ai/reader) — 免费 API，URL 转 Markdown
- [Scrapling](https://github.com/D4Vinci/Scrapling) — Python 爬虫框架，反反爬
- [CloakBrowser](https://github.com/CloakHQ/CloakBrowser) — 隐身 Chromium，过所有反爬检测
- [libreoffice](https://www.libreoffice.org/) — `libreoffice --headless --convert-to docx` 文章→Word

降级链：Jina → Scrapling → CloakBrowser → Browser Bridge（前一环失败自动切换下一环）

---

## 快速开始（3 分钟）

### 第一步：安装 Python（如果没有的话）

打开 [python.org](https://www.python.org/downloads/) → 下载最新版。

**⚠️ 安装时一定要勾选** `Add Python to PATH`，否则后面 `python` 命令找不到。

装完后打开 CMD（Win+R → 输入 `cmd` → 回车），验证：

```cmd
python --version
pip --version
```

两条都应该显示版本号，不报错。

### 第二步：下载项目

```cmd
git clone https://github.com/xxxsuke/hermes-browser-bridge.git
cd hermes-browser-bridge
```

或直接下载 zip：https://github.com/xxxsuke/hermes-browser-bridge/archive/refs/heads/main.zip

### 第三步：安装依赖

```cmd
pip install websockets
```

看到 `Successfully installed websockets-xxx` 就成功了。

### 第四步：启动桥接服务

双击 `start_bridge.ps1`（会自动检测端口冲突、杀掉旧进程、验证扩展连接）。

或手动：
```cmd
python bridge.py
```

**⚠️ 这个窗口不要关，保持运行。**

### 第五步：安装 Edge/Chrome 扩展

1. 打开 Edge 浏览器
2. 地址栏输入 `edge://extensions`（Chrome 用户输入 `chrome://extensions`）
3. **打开左上角的「开发人员模式」开关**（很重要！）
4. 点击「加载解压缩的扩展」
5. 选择项目里的 `extension` 文件夹
6. 扩展栏会出现一个桥接图标，显示 **「已连接」**

没显示「已连接」？看下方 [常见问题排查](#常见问题排查)。

### 第六步：验证

**不要关掉 bridge.py 那个 CMD 窗口。** 打开**另一个** CMD：

```cmd
cd hermes-browser-bridge
python hermes_client.py list_tabs
```

返回标签页列表 → 成功！🎉

---

## 命令大全

### 标签页管理

```cmd
python hermes_client.py list_tabs                        # 列出所有标签
python hermes_client.py activate_tab <id>                # 切换到指定标签
python hermes_client.py new_tab <url>                     # 新建标签页
python hermes_client.py close_tab <id>                    # 关闭标签
python hermes_client.py reload_tab [id]                   # 刷新
python hermes_client.py navigate <url> [id]               # 导航到 URL
```

### 页面读写

```cmd
python hermes_client.py read_text [maxLength]             # 读取页面文字
python hermes_client.py read_html                         # 读取 HTML 源码
python hermes_client.py get_links [maxCount]              # 获取所有链接
python hermes_client.py get_images [maxCount]             # 获取所有图片
python hermes_client.py scroll [direction] [amount]       # 滚动页面
python hermes_client.py dismiss_popups                     # 自动关闭弹窗/遮罩/Cookie
```

### 页面操作

```cmd
python hermes_client.py click <selector>                  # 点击元素
python hermes_client.py write_text <selector> <text>       # 填写输入框
python hermes_client.py type_text <selector> <text>        # 逐字模拟键盘输入
python hermes_client.py find_in_page <query>               # 页面内搜索
```

### 截图与窗口

```cmd
python hermes_client.py screenshot [id]                   # 截图
python hermes_client.py create_window <url>                # 创建新窗口
python hermes_client.py list_windows                      # 列出所有窗口
```

---

## bridge v6.1 新特性

### 原生命令

无需扩展，bridge 直接执行 HTTP 请求返回 JSON。与 `navigate`/`screenshot` 走同一 WS 协议。

```python
await ws.send(json.dumps({
    "type": "command", "action": "toutiao_hot",
    "params": {"limit": 10},
    "secret": "hermes-bridge-v6"     # v6.1 强制认证
}))
```

| 命令 | 功能 | 数据源 | 认证 |
|------|------|--------|:---:|
| `toutiao_hot` | 今日头条实时热搜榜 | public API | ✅ |
| `eastmoney_kuaixun` | 东方财富 7x24 快讯 | public API | ✅ |

**安全变更**：v6.1 新增 `BRIDGE_SECRET` 认证。默认值 `hermes-bridge-v6`，可通过环境变量覆盖。无正确 secret 的请求被拒绝。

### 架构

```
Python WS → bridge.py
              ├─ toutiao_hot / eastmoney_kuaixun → HTTP API（原生，无扩展）
              ├─ 安全认证（BRIDGE_SECRET）
              ├─ navigate / screenshot / ... → Edge 扩展 → 浏览器
              └─ 心跳保活 + 内存清理
```

源自分支 `@jackwener/opencli` v1.8.0（27K stars）的公开适配器，经三轮安全审查（multi-perspective-review）后直接吸收进 bridge。

---

## hot_topics.py — 独立热点API

纯 Python 零依赖模块，可直接喂给任何 AI（Cursor/Claude/Copilot/Gemini）：

```python
from hot_topics import toutiao_hot, eastmoney_kuaixun, sinafinance_news

# 头条热搜 TOP10
for item in toutiao_hot(10):
    print(f"{item['rank']}. {item['title']} | 热度:{item.get('hot_value',0):,}")

# 财经快讯
for item in eastmoney_kuaixun(20, column="102"):
    print(f"{item['time']} {item['title']}")

# 新浪财经
for item in sinafinance_news(20):
    print(f"{item['time']} {item['title']}")
```

| 函数 | 数据源 | 需要API Key？ | 速率 |
|------|--------|:---:|------|
| `toutiao_hot(limit)` | 今日头条热搜 | ❌ | 实时 |
| `eastmoney_kuaixun(limit, column)` | 东方财富快讯 | ❌ | 实时 |
| `sinafinance_news(limit)` | 新浪财经 | ❌ | 实时 |

**蒸馏记录**：经 multi-perspective-review 三轮审查（规范14→创意5→攻击6），全部缺陷已修复：
- R1: `_parse_limit` 参数解析、`.get()` 防御性编码、null 注入修复
- R2: 4份拷贝合并为1源、空数据优雅降级、安全密钥架构
- R3: BRIDGE_SECRET 强制执行认证

---

## CloakBrowser — 反爬隐身 Chromium

对于被强反爬保护的网站（Cloudflare/BrowserScan/百度验证码），用 CloakBrowser 作为替代后端。

```python
from cloakbrowser import launch
import os
os.environ['CLOAKBROWSER_BINARY_PATH'] = '/path/to/chrome'  # ~/cloakbrowser/chrome

browser = launch(headless=True)
page = browser.new_page()
page.goto('https://top.baidu.com/board?tab=realtime')
text = page.inner_text('body')          # 反爬全覆盖通过
browser.close()
```

| 场景 | 用什么 |
|------|--------|
| 轻量抓取/Jina 能搞定 | Jina Reader |
| HTTP 可直接请求 | Scrapling |
| 反爬强站（Cloudflare/BrowserScan） | CloakBrowser |
| 已登录交互/发帖 | Bridge (Edge) |
| 实时热点数据 | Bridge 原生命令 |

---

## 与 Hermes Agent 集成

本项目提供 Hermes Skill 文件（`skills/` 目录）。Skill 按场景分工：

| Skill | 用途 | 何时加载 |
|-------|------|---------|
| `browser-control` | 统一入口：WS命令/代理/搜索/内容研究/图片/网络诊断 | 所有浏览器操作 |
| `jina-reader` | Jina Reader API：URL→Markdown/全文搜索 | 读网页内容 |
| `scrapling-official` | Scrapling 爬虫：get/fetch/stealthy | HTTP抓取 |

安装：
```bash
mkdir -p ~/.hermes/skills/automation/browser-control/
cp skills/browser-control.md ~/.hermes/skills/automation/browser-control/SKILL.md
```

---

## 常见问题排查

### ❌ `python` 提示"不是内部或外部命令"
重新安装 Python 时勾选 `Add Python to PATH`，重启 CMD。

### ❌ `ModuleNotFoundError: No module named 'websockets'`
```cmd
pip install websockets
```

### ❌ 扩展图标显示「未连接」
确认 `python bridge.py` 在运行，端口 9876 未被占用。

### ❌ 桥接启动时说 `Address already in use`
```cmd
netstat -ano | findstr :9876
taskkill /PID <PID> /F
```
或用 `start_bridge.ps1` 自动处理。

### ❌ `read_text` 返回空或 `content script not ready`
刷新页面（F5），或在 `edge://extensions` 重载扩展。

### ❌ 页面被弹窗/广告遮挡
```cmd
python hermes_client.py dismiss_popups
```

### ❌ Windows 防火墙弹窗
点「允许访问」——bridge 只在 localhost 监听。

---

## 项目文件结构

```
hermes-browser-bridge/
├── bridge.py               # WS 服务端 v6.1（原生命令+安全认证+心跳）
├── hermes_client.py         # CLI 客户端
├── hot_topics.py            # 独立热点API（纯Python零依赖）
├── start_bridge.ps1         # Windows 一键启动脚本
├── proxy_manager.py         # 全局代理开关
├── extension/               # Edge/Chrome 扩展
│   ├── manifest.json
│   ├── background.js         # 扩展后台
│   └── content.js            # 页面注入脚本
├── skills/                   # Hermes Agent Skill 文件
│   ├── browser-control.md
│   ├── jina-reader.md
│   └── scrapling-official.md
├── CLAUDE.md                 # Agent 行为规则
└── README.md                 # 本文
```

---

## 开发踩坑记录

1. **NativeMessaging 注册表**：扩展连不上时，检查 `HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.hermes.browser_bridge`
2. **心跳机制 v6**：30s ping/pong 防 Edge sleeping tabs 休眠 + 超时 futures 自动清理
3. **独立窗口铁律**：Agent 操作必须用 `create_window`，绝不用 `new_tab` 打扰用户
4. **端口冲突 v2**：`start_bridge.ps1` 智能检测 PID=0/TIME_WAIT 残留，自动恢复
5. **OpenCLI 吸收**：提取公开适配器→Python→原生命令→三轮蒸馏→安全认证，零额外进程
6. **内存泄漏修复**：off-screen document 被动休眠→心跳保活→30s 清理超时 pending
7. **bridge 端安全**：v6.1 强制 BRIDGE_SECRET 验证，防止恶意本地进程通过 WS 调用原生命令

---

## License

MIT
