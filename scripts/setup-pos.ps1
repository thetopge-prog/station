# ══════════════════════════════════════════════════════════════════════════
#  مُعِدّ جهاز الكاشير — Station POS one-shot installer
#  يكتشف طابعة الفواتير، يشاركها إن لم تكن مشاركة، يثبّت وكيل الطباعة على
#  المنفذ 9988 ويشغّله مع بدء التشغيل، يختبر فتح الدرج، ويصنع اختصار
#  «كاشير ستيشن». آمن لإعادة التشغيل في أي وقت.
#
#  ══ التعايش مع النظام القديم ══
#  المحل يشغّل ستيشن تجريبياً بالتوازي مع نظامه الحالي على نفس الجهاز ونفس
#  الطابعات. فكل ما يمسّ إعدادات ويندوز المشتركة صار اختيارياً، ومطفأً
#  افتراضياً. ما يفعله هذا الملف تلقائياً لا يغيّر شيئاً يعتمد عليه الآخر:
#    · وكيل ستيشن على 9988 — والقديم يحتفظ بـ 9977
#    · لا يوقف إلا وكيل ستيشن نفسه من تركيب سابق
#    · لا يشارك الطابعة إلا إن لم تكن مشاركة أصلاً (ولا يمسّ مشاركة قائمة)
#    · لا يغيّر الطابعة الافتراضية — إلا بـ -MakeDefault صراحةً
#
#  التشغيل (PowerShell كمسؤول):
#    powershell -ExecutionPolicy Bypass -File scripts\setup-pos.ps1
#  وعند الانتقال الكامل إلى ستيشن لاحقاً، أضف:  -MakeDefault
# ══════════════════════════════════════════════════════════════════════════
param(
  # يغيّر الطابعة الافتراضية للجهاز ويوقف تبديل ويندوز التلقائي لها.
  # مطفأ افتراضياً: الطابعة الافتراضية إعداد يخصّ الجهاز كله، وقد يطبع النظام
  # القديم عليها. تجربة نظام جديد لا يجوز أن تغيّر مسار طباعة نظام يعمل.
  [switch]$MakeDefault
)
$ErrorActionPreference = "Continue"
chcp 65001 | Out-Null

function Say($msg, $ok = $true) {
  $mark = if ($ok) { "[ OK ]" } else { "[ !! ]" }
  Write-Host "$mark $msg"
}

# ── 0) صلاحيات المسؤول (يرفع نفسه تلقائياً إن أمكن) ─────────────────────────
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  if ($PSCommandPath) {
    # يمرَّر معه، وإلا ضاع الاختيار عند رفع الصلاحيات وعاد السكربت لسلوكه الافتراضي
    $fwd = if ($MakeDefault) { " -MakeDefault" } else { "" }
    Start-Process powershell -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File `"$PSCommandPath`"$fwd"
    exit
  }
  Say "Run PowerShell as Administrator, then try again" $false
  Read-Host "Press Enter to close"
  exit 1
}

Write-Host ""
Write-Host "====== Station POS setup ======"
Write-Host ""

# ── 1) اكتشاف طابعة الفواتير ────────────────────────────────────────────────
$pat = "POS|-80|80mm|58|Receipt|Thermal|BIXOLON|EPSON TM|TM-|XP-|Xprinter|SAM4S|Citizen|POSBANK|SEWOO|Rongta|GP-|SPRT|HPRT"
$all = @(Get-Printer | Where-Object { $_.Name -notmatch "OneNote|PDF|XPS|Fax" })
if (-not $all) {
  Say "No printer installed. Install the receipt printer driver first, then re-run" $false
  Read-Host "Press Enter to close"
  exit 1
}
$defaultName = (Get-CimInstance Win32_Printer | Where-Object { $_.Default }).Name
$cands = @($all | Where-Object { $_.Name -match $pat })
$chosen = $null
if ($defaultName -and ($cands | Where-Object { $_.Name -eq $defaultName })) { $chosen = $all | Where-Object { $_.Name -eq $defaultName } | Select-Object -First 1 }
elseif ($cands) { $chosen = $cands | Select-Object -First 1 }
elseif ($defaultName) { $chosen = $all | Where-Object { $_.Name -eq $defaultName } | Select-Object -First 1 }
else { $chosen = $all | Select-Object -First 1 }
Say "Receipt printer found: $($chosen.Name)"

# ── 2) مشاركة الطابعة (أو استخدام مشاركتها الحالية) ────────────────────────
try { Start-Service LanmanServer -ErrorAction Stop } catch {}
$share = $null
if ($chosen.Shared -and $chosen.ShareName) {
  $share = $chosen.ShareName
  Say "Printer already shared as: $share (kept as-is)"
} else {
  $share = "POS80"
  try {
    Set-Printer -Name $chosen.Name -Shared $true -ShareName $share -ErrorAction Stop
    Say "Printer shared as: $share"
  } catch {
    Say "Could not share automatically: $($_.Exception.Message) - share it by hand as POS80" $false
  }
}

# ── 3) الطابعة الافتراضية — باختيارك وحدك ──────────────────────────────────
# ستيشن يطبع تذاكره عبر وكيله (بايتات ESC/POS إلى المشاركة أو إلى IP:9100)،
# ولا يمرّ بالطابعة الافتراضية إطلاقاً. فتغييرها لا يفيدنا، وقد يضرّ النظام
# الآخر إن كان يطبع على «الافتراضية».
if ($MakeDefault) {
  try {
    (New-Object -ComObject WScript.Network).SetDefaultPrinter($chosen.Name)
    New-ItemProperty -Path "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Windows" -Name "LegacyDefaultPrinterMode" -Value 1 -PropertyType DWord -Force | Out-Null
    Say "Set as the default printer (Windows auto-switching turned off)"
  } catch {
    Say "Could not set the default printer - set it in Windows printer settings" $false
  }
} else {
  Say "Default printer NOT changed - the other system is untouched (add -MakeDefault when you switch over)"
}

# ── 4) تنزيل وكيل الطباعة ───────────────────────────────────────────────────
# هذا الوكيل يطبع الفواتير والتذاكر ويفتح الدرج. النسخة القديمة كانت تفتح الدرج
# فقط، فكان الجهاز يبدو مضبوطاً بينما لا تخرج منه ورقة واحدة.
$dir = "C:\station"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$agentPath = "$dir\print-agent.ps1"
$agentUrl = "https://raw.githubusercontent.com/thetopge-prog/station/main/scripts/print-agent.ps1"
try {
  Invoke-WebRequest $agentUrl -OutFile $agentPath -UseBasicParsing -TimeoutSec 30
  Say "Print agent downloaded to $agentPath"
} catch {
  Say "Could not download the print agent: $($_.Exception.Message)" $false
  Say "Without it nothing will print. Check the internet and re-run this installer." $false
  Read-Host "Press Enter to close"
  exit 1
}

# ── 5) تشغيله مع إقلاع الجهاز، والآن ───────────────────────────────────────
# وكيل ستيشن على المنفذ 9988، لا 9977.
# 9977 يحجزه وكيل النظام الآخر العامل على نفس الجهاز، والمُثبِّت كان يقتله
# ليأخذ المنفذ — أي أن تركيب ستيشن كان يُعطّل درج النظام الآخر. المحل يشغّل
# النظامين معاً أثناء التجربة، فلا يجوز لأحدهما أن يمسّ الآخر.
# يُقتل وكيل ستيشن وحده إن كان يعمل من تركيب سابق:
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
  Where-Object { $_.CommandLine -like "*print-agent.ps1*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

& powershell -NoProfile -ExecutionPolicy Bypass -File $agentPath -Install -DrawerShare "$share" -PrinterName "$($chosen.Name)" | Out-Null
Start-Sleep -Seconds 3
try {
  Invoke-WebRequest "http://127.0.0.1:9988/ping" -UseBasicParsing -TimeoutSec 5 | Out-Null
  Say "Print agent is running and starts with Windows (share: $share)"
} catch {
  Say "Agent not answering yet - reboot; it is registered to start on boot" $false
}

# ── 6) اختبار فتح الدرج ─────────────────────────────────────────────────────
try {
  Invoke-WebRequest "http://127.0.0.1:9988/kick" -UseBasicParsing -TimeoutSec 15 | Out-Null
  Say "Drawer test sent - if the drawer just opened, printing is wired correctly"
} catch {
  # The agent answers a failure with the real reason in the body. Printing uses
  # the same path as this pulse, so a silent failure here is a shop that
  # discovers on a busy evening that nothing prints.
  # PowerShell 5.1 puts a failed response body in ErrorDetails; the stream is
  # the fallback. Without one of the two, all the shop sees is "(500) Internal
  # Server Error", which names nothing.
  $why = ""
  try { $why = $_.ErrorDetails.Message } catch { }
  if (-not $why) { try { $why = (New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } catch { } }
  if (-not $why) { $why = $_.Exception.Message }
  Say "DRAWER/PRINT TEST FAILED: $why" $false
  Say "Printing uses this same path - fix this before trading on Station." $false
  Say "Check: printer online, sharing enabled, share name = $share" $false
}

# ── 7) اختصار «كاشير ستيشن» بوضع الطباعة الصامتة ──────────────────────────
$browser = @(
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($browser) {
  # أيقونة ستيشن للاختصار (تُنزَّل مرة واحدة؛ إن فشل التنزيل نستخدم أيقونة المتصفح)
  $ico = "$dir\station.ico"
  try {
    Invoke-WebRequest "https://station-anbar.netlify.app/logo.ico" -OutFile $ico -UseBasicParsing -TimeoutSec 20
  } catch { $ico = $null }

  $ws = New-Object -ComObject WScript.Shell
  $lnk = $ws.CreateShortcut("$([Environment]::GetFolderPath('CommonDesktopDirectory'))\كاشير ستيشن.lnk")
  $lnk.TargetPath = $browser
  # نافذة تطبيق مستقلة بلا أشرطة متصفح (--app) + طباعة صامتة + ملء الشاشة — تفتح الكاشير مباشرة كتطبيق
  $lnk.Arguments = "--app=https://station-anbar.netlify.app/cashier --kiosk-printing --start-maximized --no-first-run"
  if ($ico -and (Test-Path $ico)) { $lnk.IconLocation = "$ico,0" } else { $lnk.IconLocation = "$browser,0" }
  $lnk.Save()
  Say "Desktop shortcut created: Station POS (app window, silent printing)"

  # ── يفتح الكاشير تلقائياً عند تشغيل ويندوز (نسخة من الاختصار في مجلد بدء التشغيل) ──
  $startupLnk = $ws.CreateShortcut("$startupDir\كاشير ستيشن.lnk")
  $startupLnk.TargetPath  = $browser
  $startupLnk.Arguments   = $lnk.Arguments
  $startupLnk.IconLocation = $lnk.IconLocation
  $startupLnk.Save()
  Say "The till will open automatically when Windows starts"
} else {
  Say "Chrome or Edge not found - install one, then re-run" $false
}

Write-Host ""
Write-Host "====== Setup complete ======"
Write-Host "Printer: $($chosen.Name)  |  Share: $share  |  Agent: 127.0.0.1:9988"
Write-Host "Till + print agent start automatically with Windows (after sign-in)."
Write-Host "Left to do: sign in once in Station POS and enable printing + drawer in the screen."
Write-Host ""
Write-Host "Optional - for fully unattended boot (no Windows password prompt):"
Write-Host "  Run  netplwiz  -> untick 'Users must enter a user name and password' -> enter the password once."
Write-Host "  (Windows setting; stores the password locally - only do this on the dedicated till PC.)"
Write-Host ""
Read-Host "Press Enter to close"
