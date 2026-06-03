# Hermes Browser Bridge — 安装指南

## 架构

```
┌──────────────────────────────────────────────────────────────┐
│  Windows                                                      │
│  ┌─ Edge 扩展 ─────────────────────────────────────────────┐ │
│  │  content.js (读写页面) ←→ background.js (WS client)     │ │
│  └──────────────┬──────────────────────────────────────────┘ │
│                 │ ws://localhost:9876                         │
│  ┌──────────────▼──────────────────────────────────────────┐ │
│  │  bridge.py v6.1 (WS Server)                             │ │
│  │  ├─ 原生命令: toutiao_hot / eastmoney_kuaixun (HTTP)    │ │
│  │  ├─ 扩展转发: navigate / screenshot / ...               │ │
│  │  └─ 安全认证: BRIDGE_SECRET                             │ │
│  └──────────────┬──────────────────────────────────────────┘ │
└─────────────────┼───────────────────────────────────────────┘
                  │ ws://localhost:9876
┌─────────────────┼───────────────────────────────────────────┐
│  WSL / Linux    │                                            │
│  ┌──────────────▼──────────────────────────────────────────┐ │
│  │  Hermes Agent  /  CLI                                   │ │
│  │  → WS原生命令 (无需扩展)                                 │ │
│  │  → hermes_client.py (浏览器操控)                         │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─ 辅助工具 ────────────────────────────────────────────┐   │
│  │  CloakBrowser  → 隐身反爬 (过 Cloudflare/百度)          │   │
│  │  hot_topics.py → 独立热点 API (喂给任何 AI)             │   │
│  │  libreoffice   → MD→DOCX 文档转换                       │   │
│  └────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

## 安装（3 步）

### 步骤 1：安装 Python 依赖

```bash
pip install websockets
```

### 步骤 2：启动桥接

**Windows 上（推荐）**：双击 `start_bridge.ps1`（自动检测端口冲突、杀旧进程、验证扩展连接）

**或 WSL 上**：
```bash
python3 ~/hermes-browser-bridge/bridge.py
```

看到 `Bridge v6: ws://localhost:9876` 即成功。保持运行。

### 步骤 3：安装浏览器扩展

1. Edge → `edge://extensions` → 开发人员模式
2. 加载解压缩的扩展 → 选择 `extension/` 文件夹
3. 打开任意网页，点击扩展图标 → 应显示「已连接」

Windows 路径不可用时：复制扩展文件夹到 `C:\Users\你的用户名\Desktop\hermes-extension\`

## 使用

### 原生命令（无需扩展，v6.1 新增）

```python
# WS 协议，需要 BRIDGE_SECRET 认证
await ws.send(json.dumps({
    "type": "command", "action": "toutiao_hot",
    "params": {"limit": 10},
    "secret": "hermes-bridge-v6"
}))
```

| 命令 | 功能 | 数据源 |
|------|------|--------|
| `toutiao_hot` | 今日头条热搜 | 公开 API |
| `eastmoney_kuaixun` | 东方财富快讯 | 公开 API |

### 浏览器操控

```python
from hermes_tools import terminal

terminal("python3 ~/hermes-browser-bridge/hermes_client.py read_text", timeout=10)
terminal("python3 ~/hermes-browser-bridge/hermes_client.py navigate 'https://baidu.com'", timeout=15)
terminal("python3 ~/hermes-browser-bridge/hermes_client.py click '.publish-btn'", timeout=10)
```

### 独立热点 API（无需桥接）

```python
from hot_topics import toutiao_hot, eastmoney_kuaixun
for item in toutiao_hot(10):
    print(f"{item['rank']}. {item['title']}")
```

## 安全

v6.1 起强制 `BRIDGE_SECRET` 认证。默认值 `hermes-bridge-v6`，通过环境变量覆盖：

```bash
export BRIDGE_SECRET="your-secret-here"
```

## 故障排查

| 问题 | 解决 |
|------|------|
| 扩展「未连接」 | bridge.py 是否在运行？port 9876？ |
| `no extension` | 重载扩展（`edge://extensions` → 🔄） |
| content script not ready | 刷新页面 |
| `Address already in use` | `start_bridge.ps1` 自动处理 |
| 端口冲突 | `netstat -ano \| findstr :9876` |
| 原生命令 `auth required` | 确认 WS 消息含 `secret` 字段 |
