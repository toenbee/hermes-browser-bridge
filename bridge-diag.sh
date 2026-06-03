#!/bin/bash
# bridge-diag.sh — 一键诊断 bridge 状态
echo "=== Hermes Bridge 诊断 $(date) ==="
echo ""

# 1. 进程状态
echo "--- Bridge 进程 ---"
PID=$(pgrep -f bridge.py 2>/dev/null)
if [ -n "$PID" ]; then
    echo "✅ 运行中 PID=$PID"
    ps -p "$PID" -o pid,rss,vsz,pcpu,etime --no-headers 2>/dev/null | while read p rss vsz cpu et; do
        echo "   内存: ${rss}KB (RSS) / ${vsz}KB (VSZ) | CPU: ${cpu}% | 运行时间: $et"
    done
else
    echo "❌ 未运行"
fi
echo ""

# 2. 端口
echo "--- 端口 9876 ---"
if ss -tlnp 2>/dev/null | grep -q 9876; then
    echo "✅ 监听中"
else
    echo "❌ 未监听"
fi
echo ""

# 3. 扩展连接
echo "--- 扩展连接 ---"
EXT=$(powershell.exe -Command "netstat -ano 2>/dev/null | findstr ':9876' | findstr ESTABLISHED" 2>/dev/null)
if [ -n "$EXT" ]; then
    echo "✅ 已连接"
    echo "$EXT" | head -5
else
    echo "❌ 扩展未连接"
fi
echo ""

# 4. Edge 内存 TOP5
echo "--- Edge 进程 TOP5 ---"
powershell.exe -Command "
Get-Process -Name msedge -ErrorAction SilentlyContinue | 
    Sort-Object -Property WorkingSet64 -Descending | 
    Select-Object -First 5 | 
    Format-Table Id,@{N='Mem(MB)';E={[math]::Round(\$_.WorkingSet64/1MB,1)}},CPU -AutoSize
" 2>/dev/null || echo "无法获取（Edge可能未运行）"

echo ""
echo "=== 修复命令 ==="
echo "重启 bridge: powershell.exe -File C:\\Users\\10737\\Desktop\\hermes-extension\\start_bridge.ps1"
echo "重新加载扩展: Edge → 扩展管理 → Hermes Bridge → 重新加载"
