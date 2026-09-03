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
  [switch]$Install,
  # Diagnostic: render a doc (JSON file) to a byte file and exit. No printer,
  # no port. Lets the raster be inspected on any machine, without the shop.
  # NOT $Out: variable names are case-insensitive, and a typed [string] parameter
  # at script scope would silently coerce the handler's `$out = Render-Doc ...`
  # byte array into a string. The log caught exactly that on its first run.
  [string]$RenderOnly = "",
  [string]$OutFile = ""
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

# The agent runs hidden. Everything it would have said to a console goes here
# too, so a fault that has been happening for a week can be read in a minute.
$LogPath = Join-Path $env:ProgramData "Station\print-agent.log"
function Log([string]$Msg) {
  try {
    $dir = Split-Path $LogPath
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    # one line per entry: .NET exception text carries its own newlines
    Add-Content -Path $LogPath -Value ((Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "  " + ($Msg -replace "\r?\n", " ")) -Encoding UTF8
  } catch { }
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

<#
  The spooler accepts a job for a paused or offline printer and keeps it for
  ever - and "accepted" reached the till as "printed". So the printer is asked
  how it is before we say anything, and the queue is asked afterwards whether
  the job actually left. Transient states (Printing, Busy, WarmingUp) are not
  faults: the second copy arrives while the first is still going.
#>
$PRINTER_FAULTS = @("Offline", "Paused", "Error", "PaperJam", "PaperOut", "PaperProblem", "DoorOpen",
                    "UserInterventionRequired", "NotAvailable", "OutOfMemory", "PendingDeletion")

function Assert-PrinterReady([string]$Name) {
  $p = $null
  try { $p = Get-Printer -Name $Name -ErrorAction Stop } catch { return }   # unknown is not a fault
  $bad = @()
  if ($p.WorkOffline) { $bad += "set to 'Use Printer Offline'" }
  if ($p.PrinterStatus -and ([string]$p.PrinterStatus) -in $PRINTER_FAULTS) { $bad += [string]$p.PrinterStatus }
  if ($bad.Count) { throw ("printer '" + $Name + "' is " + ($bad -join ", ") + " - fix it in Windows > Printers & scanners") }
}

function Assert-JobLeft([string]$Name) {
  Start-Sleep -Milliseconds 700
  $stuck = @(Get-PrintJob -PrinterName $Name -ErrorAction SilentlyContinue |
    Where-Object { $_.DocumentName -eq "Station" -and ([string]$_.JobStatus) -match "Error|Offline|PaperOut|Paused|UserIntervention|Blocked" })
  if ($stuck.Count) { throw ("printer '" + $Name + "' took the job but holds it: " + [string]$stuck[0].JobStatus) }
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
    Assert-PrinterReady $name
    try { [Station.RawPrint]::Send($name, $Bytes) }
    catch { $errs += ("spooler '" + $name + "': " + $_.Exception.Message); $name = $null }
    if ($name) { Assert-JobLeft $name; return }
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


<#
  ── Arabic as a PICTURE, not as characters ────────────────────────────────

  The shop's printer was asked, 56 different ways, to render Arabic from a code
  page. It answered in Cyrillic, Greek, Thai and Chinese, and never once in
  Arabic — because it has no Arabic code page to select. No amount of choosing
  between numbers was ever going to work, and every choice offered was a way to
  get it wrong.

  So the printer is no longer asked. These lines are drawn here, with a Windows
  font, by the same shaping engine that draws Arabic in Word — correctly joined,
  every time, on any printer that can print a picture. Which is all of them:
  ESC/POS raster is as old as the format.

  576 dots is 80mm at 203dpi, the standard width of these units.
#>
Add-Type -AssemblyName System.Drawing

function Render-Doc([object]$Doc) {
  $W = 576
  $base = 22.0
  $fam = New-Object System.Drawing.FontFamily("Tahoma")   # ships with Windows, has Arabic

  # First pass measures, so the bitmap is exactly as tall as the slip.
  $probe = New-Object System.Drawing.Bitmap(1, 1)
  $pg = [System.Drawing.Graphics]::FromImage($probe)
  $items = @()
  $total = 8
  foreach ($ln in $Doc.lines) {
    $style = if ($ln.bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    $font = New-Object System.Drawing.Font($fam, ($base * [double]$ln.h), $style, [System.Drawing.GraphicsUnit]::Pixel)
    $text = [string]$ln.t
    if ($text -eq "") { $text = " " }
    $sz = $pg.MeasureString($text, $font, $W)
    $h = [int][Math]::Ceiling($sz.Height)
    $items += [pscustomobject]@{ text = $text; font = $font; h = $h; align = [string]$ln.align }
    $total += $h
  }
  $pg.Dispose(); $probe.Dispose()

  $bmp = New-Object System.Drawing.Bitmap($W, $total)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::White)
  # Grid-fit, no anti-aliasing: a thermal head is one bit deep, and grey pixels
  # become random black ones.
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit

  $fmt = New-Object System.Drawing.StringFormat
  # Right-to-left is the default because the slips are Arabic; GDI+ does the
  # shaping and the bidi ordering, which is exactly what we could not do before.
  $fmt.FormatFlags = [System.Drawing.StringFormatFlags]::DirectionRightToLeft
  $black = [System.Drawing.Brushes]::Black

  $y = 4
  foreach ($it in $items) {
    switch ($it.align) {
      "c" { $fmt.Alignment = [System.Drawing.StringAlignment]::Center }
      "l" { $fmt.Alignment = [System.Drawing.StringAlignment]::Far }     # RTL flips near/far
      default { $fmt.Alignment = [System.Drawing.StringAlignment]::Near }
    }
    $rect = New-Object System.Drawing.RectangleF(0, $y, $W, $it.h)
    $g.DrawString($it.text, $it.font, $black, $rect, $fmt)
    $y += $it.h
    $it.font.Dispose()
  }
  $g.Dispose()

  # ── to ESC/POS raster: GS v 0 m xL xH yL yH ──────────────────────────────
  $bytesPerRow = [int]($W / 8)
  $out = New-Object System.Collections.Generic.List[byte]
  $out.AddRange([byte[]](0x1b, 0x40))                       # init

  $rect = New-Object System.Drawing.Rectangle(0, 0, $W, $total)
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $stride = $data.Stride
  $buf = New-Object byte[] ($stride * $total)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $buf, 0, $buf.Length)
  $bmp.UnlockBits($data)

  # In bands, never one block the height of the slip.
  #
  # Cheap POS80 clones accept a GS v 0 block up to their line buffer and DROP
  # anything taller, silently. So the short expediter ticket came out and the
  # customer receipt and the daily strip did not - and Windows, which only
  # sees the spooler, reported all three as printed. 240 rows is under the
  # smallest buffer known; it is what every printer driver does anyway.
  $BAND = 240
  for ($top = 0; $top -lt $total; $top += $BAND) {
    $h = [Math]::Min($BAND, $total - $top)
    $out.AddRange([byte[]](0x1d, 0x76, 0x30, 0x00))
    $out.Add([byte]($bytesPerRow -band 0xFF)); $out.Add([byte](($bytesPerRow -shr 8) -band 0xFF))
    $out.Add([byte]($h -band 0xFF));           $out.Add([byte](($h -shr 8) -band 0xFF))
    for ($row = $top; $row -lt ($top + $h); $row++) {
      $o = $row * $stride
      for ($b = 0; $b -lt $bytesPerRow; $b++) {
        $v = 0
        for ($bit = 0; $bit -lt 8; $bit++) {
          $x = $b * 8 + $bit
          # blue channel is enough on a black-and-white bitmap; < 128 is ink
          if ($buf[$o + $x * 4] -lt 128) { $v = $v -bor (0x80 -shr $bit) }
        }
        $out.Add([byte]$v)
      }
    }
  }
  $bmp.Dispose()
  # The comma is the fix. PowerShell unrolls a List on return, so the caller
  # received 21,690 loose bytes as Object[]; its $out.AddRange then fell back to
  # member enumeration and failed on the first [Byte]. Every doc job died there,
  # and the spooler was never even asked. Wrapped, the List arrives whole.
  return ,$out
}

<#
  The QR stays a NATIVE command rather than part of the picture.

  Every ESC/POS printer draws its own QR from GS ( k, and its own is sharper
  than anything we would rasterise at 203dpi — a scanner has to read this from
  a phone at arm's length. Only the text needs to be a picture; the text is the
  only part the printer cannot do.
#>
function Qr-Bytes([string]$Data) {
  $d = [System.Text.Encoding]::UTF8.GetBytes($Data)
  $len = $d.Length + 3
  $out = New-Object System.Collections.Generic.List[byte]
  $out.AddRange([byte[]](0x1b, 0x61, 0x01))                                  # centre
  $out.AddRange([byte[]](0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00))  # model 2
  $out.AddRange([byte[]](0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06))        # module size 6
  $out.AddRange([byte[]](0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31))        # ECC L
  $out.AddRange([byte[]](0x1d, 0x28, 0x6b, [byte]($len -band 0xFF), [byte](($len -shr 8) -band 0xFF), 0x31, 0x50, 0x30))
  $out.AddRange($d)
  $out.AddRange([byte[]](0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30))        # print
  return ,$out
}

function Send-Bytes($TargetHost, $TargetPort, $Share, [byte[]]$Bytes) {
  if ($TargetHost) { Send-Tcp $TargetHost $TargetPort $Bytes }
  elseif ($Share) { Send-Share $Share $Bytes }
  else { throw "printer not configured" }
}

if ($RenderOnly) {
  $doc = (Get-Content -Raw -Encoding UTF8 $RenderOnly) | ConvertFrom-Json
  $bytes = (Render-Doc $doc).ToArray()
  [System.IO.File]::WriteAllBytes($OutFile, $bytes)
  Write-Host ("rendered {0} bytes -> {1}" -f $bytes.Length, $OutFile)
  exit 0
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

        # A job carries either a picture to draw (doc) or ready-made bytes
        # (data). The doc path is the one the shop uses: see Render-Doc.
        if ($job.doc) {
          $out = Render-Doc $job.doc
          if ($job.doc.qr) { $out.AddRange((Qr-Bytes ([string]$job.doc.qr))) }
          $out.AddRange([byte[]](0x1b, 0x64, 0x03))            # feed
          if ($job.doc.kick) { $out.AddRange([byte[]](0x1b, 0x70, 0x00, 0x19, 0xfa)) }
          $out.AddRange([byte[]](0x1d, 0x56, 0x42, 0x00))      # partial cut
          $bytes = $out.ToArray()
        } else {
          $bytes = [Convert]::FromBase64String($job.data)
        }
        $copies = if ($job.copies) { [int]$job.copies } else { 1 }
        $portToUse = if ($job.port) { [int]$job.port } else { 9100 }
        for ($i = 0; $i -lt $copies; $i++) {
          Send-Bytes $job.host $portToUse $job.share $bytes
        }
        $line = ("printed: {0} x{1} {2}B -> {3}" -f $job.printerName, $copies, $bytes.Length, ($(if ($job.host) { $job.host } else { $job.share })))
        Write-Host $line
        Log $line
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
    Log ("print error: " + $msg)
    try {
      $res.StatusCode = 500
      $out = [System.Text.Encoding]::UTF8.GetBytes($msg)
      $res.ContentLength64 = $out.Length
      $res.OutputStream.Write($out, 0, $out.Length)
      $res.Close()
    } catch { }
  }
}
