# ══════════════════════════════════════════════════════════════════════════
#  مُعِدّ جهاز الكاشير — Station POS one-shot installer
#  يكتشف طابعة الفواتير، يشاركها، يجعلها الافتراضية، يثبّت وكيل القاصة
#  ويشغّله مع بدء التشغيل، يختبر فتح الدرج، ويصنع اختصار «كاشير ستيشن»
#  بوضع الطباعة الصامتة. آمن لإعادة التشغيل في أي وقت.
#
#  التشغيل (PowerShell كمسؤول):
#    powershell -ExecutionPolicy Bypass -File scripts\setup-pos.ps1   # run from the project folder
# ══════════════════════════════════════════════════════════════════════════
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
    Start-Process powershell -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
  }
  Say "شغّل PowerShell كمسؤول (Run as Administrator) ثم أعد المحاولة" $false
  Read-Host "اضغط Enter للإغلاق"
  exit 1
}

Write-Host ""
Write-Host "══════ إعداد كاشير ستيشن ══════"
Write-Host ""

# ── 1) اكتشاف طابعة الفواتير ────────────────────────────────────────────────
$pat = "POS|-80|80mm|58|Receipt|Thermal|BIXOLON|EPSON TM|TM-|XP-|Xprinter|SAM4S|Citizen|POSBANK|SEWOO|Rongta|GP-|SPRT|HPRT"
$all = @(Get-Printer | Where-Object { $_.Name -notmatch "OneNote|PDF|XPS|Fax" })
if (-not $all) {
  Say "لا توجد أي طابعة مثبتة! ثبّت تعريف طابعة الفواتير أولاً ثم أعد التشغيل" $false
  Read-Host "اضغط Enter للإغلاق"
  exit 1
}
$defaultName = (Get-CimInstance Win32_Printer | Where-Object { $_.Default }).Name
$cands = @($all | Where-Object { $_.Name -match $pat })
$chosen = $null
if ($defaultName -and ($cands | Where-Object { $_.Name -eq $defaultName })) { $chosen = $all | Where-Object { $_.Name -eq $defaultName } | Select-Object -First 1 }
elseif ($cands) { $chosen = $cands | Select-Object -First 1 }
elseif ($defaultName) { $chosen = $all | Where-Object { $_.Name -eq $defaultName } | Select-Object -First 1 }
else { $chosen = $all | Select-Object -First 1 }
Say "طابعة الفواتير المكتشفة: $($chosen.Name)"

# ── 2) مشاركة الطابعة (أو استخدام مشاركتها الحالية) ────────────────────────
try { Start-Service LanmanServer -ErrorAction Stop } catch {}
$share = $null
if ($chosen.Shared -and $chosen.ShareName) {
  $share = $chosen.ShareName
  Say "الطابعة مشاركة مسبقاً بالاسم: $share (سيُستخدم كما هو)"
} else {
  $share = "POS80"
  try {
    Set-Printer -Name $chosen.Name -Shared $true -ShareName $share -ErrorAction Stop
    Say "تمت مشاركة الطابعة بالاسم: $share"
  } catch {
    Say "تعذّرت المشاركة تلقائياً: $($_.Exception.Message) — شاركها يدوياً بالاسم POS80" $false
  }
}

# ── 3) جعلها الطابعة الافتراضية وتثبيت ذلك ─────────────────────────────────
try {
  (New-Object -ComObject WScript.Network).SetDefaultPrinter($chosen.Name)
  New-ItemProperty -Path "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Windows" -Name "LegacyDefaultPrinterMode" -Value 1 -PropertyType DWord -Force | Out-Null
  Say "أصبحت الافتراضية (وأوقفنا تبديل Windows التلقائي لها)"
} catch {
  Say "تعذّر ضبط الافتراضية تلقائياً — اضبطها من إعدادات الطابعات" $false
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
  Say "نُزّل وكيل الطباعة إلى $agentPath"
} catch {
  Say "تعذّر تنزيل وكيل الطباعة: $($_.Exception.Message)" $false
  Say "بدون هذا الملف لن تُطبع أي تذكرة. تأكد من الإنترنت وأعد تشغيل المُثبّت." $false
  Read-Host "اضغط Enter للإغلاق"
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

& powershell -NoProfile -ExecutionPolicy Bypass -File $agentPath -Install -DrawerShare $share | Out-Null
Start-Sleep -Seconds 3
try {
  Invoke-WebRequest "http://127.0.0.1:9988/ping" -UseBasicParsing -TimeoutSec 5 | Out-Null
  Say "وكيل الطباعة يعمل، ويبدأ تلقائياً مع الجهاز (المشاركة: $share)"
} catch {
  Say "الوكيل لم يستجب بعد — أعد تشغيل الجهاز، فهو مسجّل للعمل مع الإقلاع" $false
}

# ── 6) اختبار فتح الدرج ─────────────────────────────────────────────────────
try {
  Invoke-WebRequest "http://127.0.0.1:9988/kick" -UseBasicParsing -TimeoutSec 6 | Out-Null
  Say "أُرسلت نبضة الاختبار — إن انفتح الدرج الآن فكل شيء مضبوط 💰"
} catch {
  Say "لم يستجب الوكيل للاختبار — أعد تشغيل الجهاز وجرّب http://127.0.0.1:9988/kick" $false
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
  Say "اختصار «كاشير ستيشن» (نافذة تطبيق نظيفة بلا متصفح + أيقونة ستيشن + طباعة صامتة)"

  # ── يفتح الكاشير تلقائياً عند تشغيل ويندوز (نسخة من الاختصار في مجلد بدء التشغيل) ──
  $startupLnk = $ws.CreateShortcut("$startupDir\كاشير ستيشن.lnk")
  $startupLnk.TargetPath  = $browser
  $startupLnk.Arguments   = $lnk.Arguments
  $startupLnk.IconLocation = $lnk.IconLocation
  $startupLnk.Save()
  Say "الكاشير سيفتح تلقائياً عند بدء تشغيل ويندوز 🚀"
} else {
  Say "لم أجد Chrome أو Edge — ثبّت أحدهما ثم أعد التشغيل" $false
}

Write-Host ""
Write-Host "══════ اكتمل الإعداد ══════"
Write-Host "الطابعة: $($chosen.Name)  |  المشاركة: $share  |  الوكيل: 127.0.0.1:9988"
Write-Host "الكاشير + وكيل الدرج يبدآن تلقائياً عند تشغيل ويندوز (بعد تسجيل الدخول)."
Write-Host "المتبقي عليك: أول مرة سجّل الدخول في «كاشير ستيشن» وفعّل خياري 🖨️ و 💰 داخل الشاشة."
Write-Host ""
Write-Host "اختياري — لتشغيل غير مراقَب تماماً (بلا كتابة كلمة سر ويندوز عند الإقلاع):"
Write-Host "  شغّل  netplwiz  ← ألغِ تحديد «يجب على المستخدمين إدخال اسم وكلمة مرور» ← أدخل كلمة السر مرة."
Write-Host "  (هذا إعداد ويندوز يخصّك؛ يخزّن كلمة السر محلياً — فعّله فقط على جهاز الكاشير المخصّص.)"
Write-Host ""
Read-Host "اضغط Enter للإغلاق"
