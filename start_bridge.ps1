# Smart Bridge Starter v2 — 端口冲突检测 + 自动恢复
$python = "C:\Users\10737\AppData\Local\Programs\Python\Python312\python.exe"
$script = "C:\Users\10737\Desktop\hermes-extension\bridge.py"
$port = 9876

Write-Host "=== Bridge Starter v2 ==="

# 1. Check port usage (LISTEN only, ignore stale TIME_WAIT)
$conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
if ($conn) {
    $pid_old = $conn.OwningProcess
    
    # PID 0 = stale socket, ignore
    if ($pid_old -eq 0) {
        Write-Host "Port $port has stale entry (PID=0), ignoring..."
    } else {
        $proc = Get-Process -Id $pid_old -ErrorAction SilentlyContinue
        Write-Host "Port $port LISTEN: PID=$pid_old ($($proc.ProcessName))"
        
        if ($proc.ProcessName -match "python") {
            $cmdline = (Get-CimInstance Win32_Process -Filter "ProcessId=$pid_old").CommandLine
            if ($cmdline -match "bridge\.py") {
                Write-Host "  -> Old bridge, killing..."
                Stop-Process -Id $pid_old -Force
                Start-Sleep -Seconds 2
            }
        }
        
        $conn2 = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
        if ($conn2 -and $conn2.OwningProcess -ne 0) {
            Write-Host "ERROR: Port $port still occupied"
            exit 1
        }
    }
}

# 2. Start bridge
Write-Host "Starting bridge..."
Start-Process -FilePath $python -ArgumentList $script -WindowStyle Hidden
Start-Sleep -Seconds 3

# 3. Verify
$verify = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($verify -and $verify.State -eq "Listen") {
    Write-Host "OK: Bridge listening on port $port"
    Start-Sleep -Seconds 2
    $est = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Established" }
    if ($est) {
        Write-Host "OK: Extension connected ($($est.Count) connections)"
    } else {
        Write-Host "WARN: Port open but no extension connection"
    }
} else {
    Write-Host "ERROR: Bridge failed to start"
    exit 1
}

Write-Host "=== Done ==="
