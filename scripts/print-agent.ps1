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
  [int]$Port = 9988,
  [string]$DrawerShare = "POS80",
  # The Windows printer NAME. Preferred over the share: raw bytes go straight to
  # the spooler, so no SMB, no loopback, no share permissions in the path.
  [string]$PrinterName = "",
  [switch]$Install
)

$ErrorActionPreference = "Stop"

if ($Install) {
  # Start on boot, before anyone signs in, so the till is ready when the shop
  # opens. -WindowStyle Hidden keeps a console off the cashier screen.
  $target = $MyInvocation.MyCommand.Path
  $action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$target`" -Port $Port -DrawerShare `"$DrawerShare`" -PrinterName `"$PrinterName`""
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName "StationPrintAgent" -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings -Force | Out-Null
  Write-Host "Print agent installed - starts automatically with Windows."
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

<#
  Raw bytes to the spooler by printer NAME — OpenPrinter / StartDocPrinter /
  WritePrinter, which is how till software has always done this.

  The share path below it was the only route and it answered 500 on the shop's
  machine: writing to \host\SHARE goes through SMB even when the printer is
  attached to that very computer, so it inherits loopback hardening, share
  permissions and the Server service. None of that has anything to do with
  printing. This route touches none of it.
#>
if (-not ([System.Management.Automation.PSTypeName]'Station.RawPrint').Type) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace Station {
  public class RawPrint {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    public class DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
                           [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
                           [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
    [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool OpenPrinter(string src, out IntPtr h, IntPtr pd);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool ClosePrinter(IntPtr h);
    [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool StartDocPrinter(IntPtr h, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool EndDocPrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool StartPagePrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError=true)] static extern bool EndPagePrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError=true)]
    static extern bool WritePrinter(IntPtr h, IntPtr buf, int count, out int written);

    public static void Send(string printer, byte[] bytes) {
      IntPtr h; if (!OpenPrinter(printer, out h, IntPtr.Zero))
        throw new Exception("OpenPrinter failed for '" + printer + "': " + Marshal.GetLastWin32Error());
      try {
        DOCINFO di = new DOCINFO(); di.pDocName = "Station"; di.pDataType = "RAW";
        if (!StartDocPrinter(h, 1, di)) throw new Exception("StartDocPrinter: " + Marshal.GetLastWin32Error());
        try {
          if (!StartPagePrinter(h)) throw new Exception("StartPagePrinter: " + Marshal.GetLastWin32Error());
          IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
          try {
            Marshal.Copy(bytes, 0, p, bytes.Length);
            int written;
            if (!WritePrinter(h, p, bytes.Length, out written))
              throw new Exception("WritePrinter: " + Marshal.GetLastWin32Error());
          } finally { Marshal.FreeCoTaskMem(p); }
          EndPagePrinter(h);
        } finally { EndDocPrinter(h); }
      } finally { ClosePrinter(h); }
    }
  }
}
'@
}

function Send-Share([string]$Share, [byte[]]$Bytes) {
  $errs = @()

  <#
    Resolve which printer this job is FOR, then hand it to the spooler.

    The first version of this preferred -PrinterName for everything, which
    quietly sent every kitchen ticket to the till printer: one printer, four
    destinations, no error. Routing has to come from what the caller asked for.

    The value from the app is matched three ways, in this order:
      1. a Windows SHARE name  (POS80)
      2. a Windows PRINTER name (POS-23)  ← so a printer that was never shared
         still works, and nobody has to enable sharing on four devices
      3. the drawer's own printer, for the /kick pulse
  #>
  $name = $null
  if ($Share) {
    try { $name = @(Get-Printer -ErrorAction SilentlyContinue | Where-Object { $_.ShareName -eq $Share })[0].Name } catch { }
    if (-not $name) {
      try { $name = @(Get-Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $Share })[0].Name } catch { }
    }
  }
  if (-not $name -and $PrinterName -and (-not $Share -or $Share -eq $DrawerShare)) { $name = $PrinterName }

  if ($name) {
    try { [Station.RawPrint]::Send($name, $Bytes); return }
    catch { $errs += ("spooler '" + $name + "': " + $_.Exception.Message) }
  } else {
    $errs += ("no local printer matches '" + $Share + "' by share name or printer name")
  }

  # A printer attached to ANOTHER till is reachable only over SMB.
  foreach ($h in @("127.0.0.1", "localhost", $env:COMPUTERNAME)) {
    $path = "\\$h\$Share"
    try {
      $fs = [System.IO.File]::OpenWrite($path)
      try { $fs.Write($Bytes, 0, $Bytes.Length); $fs.Flush() } finally { $fs.Close() }
      return
    } catch { $errs += ("{0}: {1}" -f $path, $_.Exception.Message) }
  }
  throw ("could not reach the printer. " + ($errs -join " | "))
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
      "/printers" {
        # What Windows actually has installed, handed to /setup so nobody has to
        # read an IP off the back of a printer and retype it into a form. The
        # two values the system needs are PrinterHostAddress (network) and
        # ShareName (USB); the rest is for recognising the device on screen.
        #
        # Every property is read defensively: a local port (PORTPROMPT:, a PDF
        # writer) has no PortNumber at all, and reaching for one throws — which
        # took the whole endpoint down with it.
        $list = @()
        foreach ($pr in @(Get-Printer -ErrorAction SilentlyContinue)) {
          $port = $null
          try { $port = @(Get-PrinterPort -Name $pr.PortName -ErrorAction SilentlyContinue)[0] } catch { }
          $hostAddr = $null
          $portNum = $null
          if ($port) {
            if ($port.PSObject.Properties.Match('PrinterHostAddress').Count) { $hostAddr = $port.PrinterHostAddress }
            if ($port.PSObject.Properties.Match('PortNumber').Count) { $portNum = $port.PortNumber }
          }
          $list += [pscustomobject]@{
            name   = [string]$pr.Name
            share  = if ($pr.Shared) { [string]$pr.ShareName } else { $null }
            host   = if ($hostAddr) { [string]$hostAddr } else { $null }
            port   = if ($portNum) { [string]$portNum } else { $null }
            driver = [string]$pr.DriverName
          }
        }
        $res.ContentType = "application/json; charset=utf-8"
        $body = ConvertTo-Json @($list) -Compress -Depth 3
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
        Write-Host ("printed: {0} x{1}" -f $job.printerName, $copies)
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
    # The installer and the till both surface this text. A 500 with an empty
    # body is how a printing fault stays a mystery for a week.
    $msg = $_.Exception.Message
    Write-Host ("print error: {0}" -f $msg) -ForegroundColor Yellow
    try {
      $res.StatusCode = 500
      $out = [System.Text.Encoding]::UTF8.GetBytes($msg)
      $res.ContentLength64 = $out.Length
      $res.OutputStream.Write($out, 0, $out.Length)
      $res.Close()
    } catch { }
  }
}
