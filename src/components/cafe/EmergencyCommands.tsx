"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * أوامر الطوارئ — مكتوبةً لتُنسخ، لا ليحفظها أحد.
 *
 * ليلة توقّفت الطابعتان كان الأمر الذي يُصلحها معروفاً، ولم يكن مكتوباً في
 * أي شاشة — فانتظر المحل من يكتبه. وهذه الصفحة تُغلق ذلك: من يقف أمام الجهاز
 * ينسخ ويلصق.
 *
 * ومكانها «المزيد ← طوارئ» لا صفحة التركيب: تلك صلاحيتها «مطوّر» ولا أحد في
 * المحل يملكها — فأمرٌ خلف بابٍ مقفل كأنه غير مكتوب.
 *
 * ⚠ وكلّها تُلصق في **PowerShell كمسؤول**: مهمّة الوكيل مسجَّلة بصلاحية
 * النظام، فلا تُشغَّل من نافذةٍ عادية.
 */

type Cmd = { when: string; cmd: string };

const CMDS: Cmd[] = [
  {
    when: "١ — شغّل وكيل الطباعة (جرّب هذا أولاً)",
    cmd: "schtasks /run /tn StationPrintAgent",
  },
  {
    when: "٢ — هل ردّ الوكيل؟",
    cmd: "Invoke-WebRequest http://127.0.0.1:9988/ping -TimeoutSec 5",
  },
  {
    when: "٣ — الطابعة متجمّدة وورقها عالق",
    cmd: "Restart-Service Spooler -Force",
  },
  {
    when: "٤ — قال «المهمّة غير موجودة»: أعِد تركيب الوكيل",
    cmd: 'New-Item -ItemType Directory -Force C:\\Station | Out-Null; irm https://raw.githubusercontent.com/thetopge-prog/station/main/scripts/print-agent.ps1 -OutFile C:\\Station\\print-agent.ps1; powershell -ExecutionPolicy Bypass -File C:\\Station\\print-agent.ps1 -Install',
  },
  {
    when: "٥ — ما زال صامتاً: اقرأ آخر ما قاله",
    cmd: 'Get-Content "$env:ProgramData\\Station\\print-agent.log" -Tail 40',
  },
  {
    when: "٦ — هل أحدٌ آخر محتلّ المنفذ؟",
    cmd: "Get-NetTCPConnection -LocalPort 9988 -ErrorAction SilentlyContinue | Format-Table -AutoSize",
  },
];

export function EmergencyCommands() {
  const [copied, setCopied] = useState<string | null>(null);

  return (
    <div className="mt-4 space-y-2">
      <p className="text-sm font-black">الأوامر — انسخها والصقها</p>
      <p className="text-xs font-bold text-muted-foreground">
        افتح <span className="font-black">PowerShell كمسؤول</span>: زرّ ويندوز ← اكتب{" "}
        <span dir="ltr">powershell</span> ← كليك يمين ← «تشغيل كمسؤول».
      </p>

      {CMDS.map((c) => (
        <div key={c.cmd} className="rounded-xl border border-border p-2">
          <p className="mb-1 text-xs font-black">{c.when}</p>
          <div className="flex items-start gap-2">
            <code
              dir="ltr"
              className="flex-1 overflow-x-auto whitespace-pre rounded-lg bg-secondary px-2 py-1.5 text-left text-[11px] font-bold leading-relaxed"
            >
              {c.cmd}
            </code>
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(c.cmd);
                setCopied(c.cmd);
              }}
              aria-label="انسخ"
              className="min-h-9 shrink-0 rounded-lg border border-border px-2 text-xs font-black"
            >
              {copied === c.cmd ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
            </button>
          </div>
        </div>
      ))}

      <p className="text-xs font-bold leading-relaxed text-muted-foreground">
        بعد ما يرجع الوكيل: حدّث شاشة الكاشير واضغط «أصلح الطباعة» — التذاكر
        العالقة تنطبع وحدها.
      </p>
    </div>
  );
}
