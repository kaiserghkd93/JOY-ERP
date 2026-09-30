Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$backendDir  = "C:\Users\240710P\OneDrive\joy_erp\backend"
$frontendDir = "C:\Users\240710P\OneDrive\joy_erp\frontend"

# ── 서버 시작 ──────────────────────────────────────────────────
$script:bProc = Start-Process "cmd" -ArgumentList "/c python -m uvicorn app.main:app --host 0.0.0.0 --port 8001" -WorkingDirectory $backendDir -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 4

$script:fProc = Start-Process "cmd" -ArgumentList "/c npm run dev" -WorkingDirectory $frontendDir -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 5

Start-Process "http://localhost:5173"

# ── 상태창 ─────────────────────────────────────────────────────
$form = New-Object System.Windows.Forms.Form
$form.Text            = "NEXGEM ERP"
$form.Size            = New-Object System.Drawing.Size(360, 220)
$form.StartPosition   = "CenterScreen"
$form.FormBorderStyle = "FixedSingle"
$form.MaximizeBox     = $false
$form.BackColor       = [System.Drawing.Color]::White

$dot = New-Object System.Windows.Forms.Label
$dot.Text      = "● ERP 서버 실행 중"
$dot.Font      = New-Object System.Drawing.Font("맑은 고딕", 14, [System.Drawing.FontStyle]::Bold)
$dot.ForeColor = [System.Drawing.Color]::FromArgb(30, 160, 60)
$dot.Location  = New-Object System.Drawing.Point(24, 24)
$dot.AutoSize  = $true

$info = New-Object System.Windows.Forms.Label
$info.Text      = "  Backend   :  http://localhost:8001`n  Frontend  :  http://localhost:5173"
$info.Font      = New-Object System.Drawing.Font("Consolas", 9)
$info.ForeColor = [System.Drawing.Color]::FromArgb(60,60,60)
$info.Location  = New-Object System.Drawing.Point(24, 72)
$info.AutoSize  = $true

$line = New-Object System.Windows.Forms.Label
$line.BorderStyle = "Fixed3D"
$line.Location    = New-Object System.Drawing.Point(24, 130)
$line.Size        = New-Object System.Drawing.Size(300, 2)

$hint = New-Object System.Windows.Forms.Label
$hint.Text      = "이 창을 닫으면 서버가 자동으로 종료됩니다."
$hint.Font      = New-Object System.Drawing.Font("맑은 고딕", 8)
$hint.ForeColor = [System.Drawing.Color]::FromArgb(160,160,160)
$hint.Location  = New-Object System.Drawing.Point(24, 148)
$hint.AutoSize  = $true

$form.Controls.AddRange(@($dot, $info, $line, $hint))

# ── 닫을 때 서버 종료 ──────────────────────────────────────────
$form.Add_FormClosing({
    if ($script:bProc -and !$script:bProc.HasExited) {
        Start-Process "taskkill" -ArgumentList "/F /T /PID $($script:bProc.Id)" -WindowStyle Hidden
    }
    if ($script:fProc -and !$script:fProc.HasExited) {
        Start-Process "taskkill" -ArgumentList "/F /T /PID $($script:fProc.Id)" -WindowStyle Hidden
    }
})

[System.Windows.Forms.Application]::Run($form)
