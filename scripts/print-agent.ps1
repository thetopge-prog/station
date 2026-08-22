# print-agent.ps1 — Station local print agent.
#
# The one piece of the system that can actually reach a printer. The POS runs in
# a browser (no TCP sockets) against a Netlify-hosted server (no route into the
# shop LAN), so printing has to happen from a process on the cashier PC.
#
#   GET  /ping            -> 200, used by the POS to warn if the agent is down
#   GET  /kick            -> cash-drawer pulse on the receipt printer
#   POST /print           -> { host, port, share, copies, data(base64) }
#                            host  -> raw TCP ESC/POS  (network printer, :9100)
#                            share -> copy to \\127.0.0.1\<share>  (USB printer)
#
# Replaces drawer-agent.ps1 — it kept /kick, so the old cafe behaviour is intact.
#
# Install (as the shop admin, once):
#   powershell -ExecutionPolicy Bypass -File scripts\print-agent.ps1 -Install
# Run in the foreground to watch it:
#   powershell -ExecutionPolicy Bypass -File scripts\print-agent.ps1

param(
  [int]$Port = 9977,
  [string]$DrawerShare = "POS80",
  [switch]$Install
)

$ErrorActionPreference = "Stop"

if ($Install) {
  # Start on boot, before anyone signs in, so the till is ready when the shop
  # opens. -WindowStyle Hidden keeps a console off the cashier screen.
  $target = $MyInvocation.MyCommand.Path
  $action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$target`" -Port $Port -DrawerShare $DrawerShare"
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName "StationPrintAgent" -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings -Force | Out-Null
  Write-Host "تم تثبيت وكيل الطباعة — يبدأ تلقائياً مع تشغيل الجهاز."
  Start-ScheduledTask -TaskName "StationPrintAgent"
  exit 0
}

# ESC p 0 25 250 — the drawer solenoid pulse, same bytes the cafe build used.
$DRAWER_PULSE = [byte[]](27, 112, 0, 25, 250)

function Send-Tcp([string]$TargetHost, [int]$TargetPort, [byte[]]$Bytes) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    # A dead printer must not hang the till: connect with a short deadline and
    # give up rather than blocking the cashier's next sale.
    $async = $client.BeginConnect($TargetHost, $TargetPort, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(2000, $false)) { throw "timeout" }
    $client.EndConnect($async)
    $client.SendTimeout = 4000
    $stream = $client.GetStream()
    $stream.Write($Bytes, 0, $Bytes.Length)
    $stream.Flush()
  } finally {
    $client.Close()
  }
}

function Send-Share([string]$Share, [byte[]]$Bytes) {
  $path = "\\127.0.0.1\$Share"
  $fs = [System.IO.File]::OpenWrite($path)
  try {
    $fs.Write($Bytes, 0, $Bytes.Length)
    $fs.Flush()
  } finally {
    $fs.Close()
  }
}

function Send-Bytes($TargetHost, $TargetPort, $Share, [byte[]]$Bytes) {
  if ($TargetHost) { Send-Tcp $TargetHost $TargetPort $Bytes }
  elseif ($Share) { Send-Share $Share $Bytes }
  else { throw "printer not configured" }
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "وكيل طباعة ستيشن يعمل على http://127.0.0.1:$Port"

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response

    # The POS page is served over https from Netlify; these headers are what
    # let it talk to a plain-http localhost agent at all.
    $res.AddHeader("Access-Control-Allow-Origin", "*")
    $res.AddHeader("Access-Control-Allow-Headers", "Content-Type")
    $res.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    $res.AddHeader("Access-Control-Allow-Private-Network", "true")

    if ($req.HttpMethod -eq "OPTIONS") {
      $res.StatusCode = 204
      $res.Close()
      continue
    }

    $path = $req.Url.AbsolutePath
    $body = "ok"

    switch ($path) {
      "/ping" {
        $body = "station-print-agent"
      }
      "/kick" {
        Send-Share $DrawerShare $DRAWER_PULSE
      }
      "/print" {
        $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
        $json = $reader.ReadToEnd()
        $reader.Close()
        $job = $json | ConvertFrom-Json
        $bytes = [Convert]::FromBase64String($job.data)
        $copies = if ($job.copies) { [int]$job.copies } else { 1 }
        $portToUse = if ($job.port) { [int]$job.port } else { 9100 }
        for ($i = 0; $i -lt $copies; $i++) {
          Send-Bytes $job.host $portToUse $job.share $bytes
        }
        Write-Host ("طُبع: {0} ({1} نسخة)" -f $job.printerName, $copies)
      }
      default {
        $res.StatusCode = 404
        $body = "not found"
      }
    }

    $buf = [System.Text.Encoding]::UTF8.GetBytes($body)
    $res.ContentLength64 = $buf.Length
    $res.OutputStream.Write($buf, 0, $buf.Length)
    $res.Close()
  } catch {
    # One bad job (printer off, paper out, malformed request) must never take
    # the agent down — the next sale still has to print.
    Write-Host ("خطأ طباعة: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
    try {
      $res.StatusCode = 500
      $res.Close()
    } catch { }
  }
}
