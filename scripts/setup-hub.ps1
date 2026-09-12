# ══════════════════════════════════════════════════════════════════════════
#  مُعِدّ الهَب — ستيشن يعمل داخل المحل بلا إنترنت
#
#  يُشغَّل على جهاز داخل المحل (جهاز الكاشير يصلح). يفعل وحده:
#    · يثبّت Node 24 إن لم يكن موجوداً (winget)
#    · ينزّل آخر نسخة من ستيشن إلى C:\station\app (بلا git)
#    · يبني التطبيق ويسجّله خدمةً تبدأ مع ويندوز على المنفذ 3000
#    · يفتح المنفذ في جدار الحماية ويطبع عنوان الشاشات
#
#  الأسرار لا تمرّ من هنا: أول تشغيل يفتح C:\station\.env.local في المفكّرة
#  بأسماء المتغيّرات فقط — تُلصق قيمها من Netlify ← Environment variables،
#  ثم يُعاد تشغيل السكربت. الملف يبقى خارج مجلد التطبيق فلا يُمسّ عند التحديث.
#
#  التحديث = تشغيل السكربت نفسه مرة أخرى. قاعدة الهَب في C:\station\data
#  وتبقى كما هي.
#
#  التشغيل (PowerShell كمسؤول):
#    powershell -ExecutionPolicy Bypass -File scripts\setup-hub.ps1
# ══════════════════════════════════════════════════════════════════════════
param([int]$Port = 3000)
$ErrorActionPreference = "Stop"
chcp 65001 | Out-Null

function Say($msg, $ok = $true) { Write-Host ($(if ($ok) { "[ OK ] " } else { "[ !! ] " }) + $msg) }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  if ($PSCommandPath) { Start-Process powershell -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File `"$PSCommandPath`" -Port $Port"; exit }
  Say "Run PowerShell as Administrator, then try again" $false; Read-Host "Press Enter to close"; exit 1
}

$root = "C:\station"
$app  = Join-Path $root "app"
$data = Join-Path $root "data"
$env_ = Join-Path $root ".env.local"
New-Item -ItemType Directory -Force -Path $root, $data | Out-Null

Write-Host ""; Write-Host "====== Station Hub setup ======"; Write-Host ""

# ── 1) الأسرار: ملف خارج التطبيق، يكتبه الإنسان لا السكربت ─────────────────
if (-not (Test-Path $env_) -or -not (Select-String -Path $env_ -Pattern "^SUPABASE_SERVICE_ROLE_KEY=.+" -Quiet)) {
  @"
# ستيشن هَب — الصق القيم من Netlify ← Site configuration ← Environment variables
# (نفس القيم التي يعمل بها الموقع). احفظ الملف ثم أعد تشغيل سكربت التركيب.
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STATION_WEBHOOK_SECRET=
STATION_DISPLAY_KEY=
# قاعدة الهَب المحلية — تبقى عند التحديث
STATION_HUB_DB=$data\station.db
"@ | Out-File -FilePath $env_ -Encoding utf8
  Say "Fill the variables in the Notepad window, save, then run this script again" $false
  Start-Process notepad.exe $env_
  Read-Host "Press Enter to close"
  exit 1
}
Say ".env.local found"

# ── 2) Node 24 ──────────────────────────────────────────────────────────────
$nodeOk = $false
try { $v = (& node -v) -replace "^v", ""; $nodeOk = ([int]($v.Split(".")[0]) -ge 24) } catch {}
if (-not $nodeOk) {
  Say "Installing Node.js (winget)..."
  winget install --id OpenJS.NodeJS --silent --accept-package-agreements --accept-source-agreements | Out-Null
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
  $v = (& node -v) -replace "^v", ""
  if ([int]($v.Split(".")[0]) -lt 24) { Say "Node 24+ is required, found $v" $false; exit 1 }
}
Say "Node $(& node -v)"

# ── 3) آخر نسخة من ستيشن — zip من GitHub، بلا git ────────────────────────
$zip = Join-Path $env:TEMP "station-main.zip"
$tmp = Join-Path $env:TEMP "station-main"
Say "Downloading Station..."
Invoke-WebRequest "https://github.com/thetopge-prog/station/archive/refs/heads/main.zip" -OutFile $zip
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive $zip -DestinationPath $tmp -Force
# التطبيق يقع تحت مجلد b في المستودع
$src = Get-ChildItem $tmp -Directory | Select-Object -First 1
$srcApp = if (Test-Path (Join-Path $src.FullName "b\package.json")) { Join-Path $src.FullName "b" } else { $src.FullName }

# أوقف الهَب القديم قبل استبدال ملفاته
try { Stop-ScheduledTask -TaskName "StationHub" -ErrorAction SilentlyContinue } catch {}
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.CommandLine -match "station" } | Stop-Process -Force -ErrorAction SilentlyContinue

if (Test-Path $app) { Remove-Item $app -Recurse -Force }
Move-Item $srcApp $app
Copy-Item $env_ (Join-Path $app ".env.local") -Force
Say "Station copied to $app"

# ── 4) بناء ─────────────────────────────────────────────────────────────────
Push-Location $app
try {
  Say "npm ci (a few minutes the first time)..."
  & npm ci --no-audit --no-fund 2>&1 | Select-Object -Last 3
  Say "npm run build..."
  & npm run build 2>&1 | Select-Object -Last 5
  if (-not (Test-Path ".next\standalone\server.js")) { Say "Build failed — see the output above" $false; exit 1 }
} finally { Pop-Location }
Say "Built"

# ── 5) خدمة تبدأ مع ويندوز ──────────────────────────────────────────────────
$node = (Get-Command node).Source
$action = New-ScheduledTaskAction -Execute $node -Argument "scripts\hub-start.mjs $Port" -WorkingDirectory $app
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName "StationHub" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName "StationHub"
Say "StationHub service registered and started"

# ── 6) جدار الحماية + العنوان ───────────────────────────────────────────────
if (-not (Get-NetFirewallRule -DisplayName "Station Hub $Port" -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName "Station Hub $Port" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
}
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch "^(127\.|169\.254\.)" -and $_.PrefixOrigin -ne "WellKnown" } | Select-Object -First 1).IPAddress
Write-Host ""
Write-Host "====== Done ======"
Write-Host "  Hub:      http://${ip}:$Port"
Write-Host "  Cashier:  http://${ip}:$Port/cashier"
Write-Host "  Kitchen:  http://${ip}:$Port/kds"
Write-Host "  Expedite: http://${ip}:$Port/expediter"
Write-Host "  Menu QR:  http://${ip}:$Port/menu"
Write-Host ""
Write-Host "  Give this PC a fixed IP in the router, then point every screen at these addresses."
Write-Host "  To update Station later: run this script again."
Read-Host "Press Enter to close"
