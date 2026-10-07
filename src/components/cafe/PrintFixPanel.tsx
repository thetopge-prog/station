"use client";

import { useState } from "react";
import { Check, Copy, Download, Wrench, X } from "lucide-react";
import { agentAlive, pendingPrintCount, printJobs } from "@/lib/cafe/print-client";

/**
 * «إصلاح الطباعة» — ليصلحها من يقف عند الجهاز، لا من يفهم ويندوز.
 *
 * وكيل الطباعة برنامجٌ محلّي على جهاز الكاشير (المنفذ 9988)، ولا منفذ له إلى
 * الإنترنت — فلا الخادم ولا أنا نقدر أن نعيد تشغيله عن بُعد. وحين يسكت
 * تتوقّف الطابعتان معاً، ويقف المحل حتى يصل من يكتب أمراً في شاشة سوداء.
 *
 * فالعلاج أن يصير الأمر **ملفّاً يُنزَّل ويُضغط مرّتين**: الكاشير يضغط زرّاً،
 * فينزل ملف، يفتحه ويضغط «نعم» — ويرجع الورق. ولا كلمة سرّ ولا شرح بالهاتف.
 *
 * والملفّ يُبنى في المتصفّح لا على الخادم: لا رفع، ولا مسار يُنسى، ولا ملفّ
 * ينفّذ أوامر يُستضاف على الإنترنت.
 */

/**
 * ما يفعله الملفّ، بالترتيب — ومن الأعمّ إلى الأخصّ:
 *   ١. يرفع صلاحيته بنفسه (المهمّة مسجَّلة بصلاحية النظام فلا تُشغَّل بدونها)
 *   ٢. يعيد تشغيل خدمة الطباعة — تحلّ التجمّد وطابور الورق العالق
 *   ٣. يشغّل مهمّة الوكيل
 *   ٤. يفحص هل ردّ فعلاً، فيقول نعم أو لا — لا «تمّ» بلا دليل
 */
const FIX_BAT = String.raw`@echo off
chcp 65001 >nul
net session >nul 2>&1 || (powershell -Command "Start-Process '%~f0' -Verb RunAs" & exit /b)
echo.
echo ===== اصلاح طباعة ستيشن =====
echo.
echo [1/3] اعادة تشغيل خدمة الطباعة...
net stop Spooler >nul 2>&1
net start Spooler >nul 2>&1
echo [2/3] تشغيل وكيل الطباعة...
schtasks /run /tn StationPrintAgent >nul 2>&1
timeout /t 4 /nobreak >nul
echo [3/3] فحص...
powershell -NoProfile -Command "try{ $null=Invoke-WebRequest http://127.0.0.1:9988/ping -TimeoutSec 5; Write-Host ''; Write-Host '  تمام - الطباعة رجعت. حدث صفحة الكاشير وجرب.' }catch{ Write-Host ''; Write-Host '  الوكيل ما زال صامتا - اتصل بالدعم.' }"
echo.
pause
`;

const CMD = "schtasks /run /tn StationPrintAgent";

export function PrintFixPanel() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "checking" | "alive" | "dead">("idle");
  const [copied, setCopied] = useState(false);

  async function check() {
    setState("checking");
    const up = await agentAlive(2500);
    if (up && pendingPrintCount() > 0) {
      // الوكيل رجع والتذاكر ما زالت في طابور هذا المتصفّح — تُدفع الآن بلا
      // أن يعيد أحدٌ طباعتها يدوياً
      await printJobs([]).catch(() => {});
    }
    setState(up ? "alive" : "dead");
  }

  function download() {
    const url = URL.createObjectURL(new Blob([FIX_BAT], { type: "application/octet-stream" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "اصلاح-الطباعة.bat";
    a.click();
    // المتصفّح ينسخ البيانات عند النقر، فالتحرير بعده آمن ويمنع تسرّب الذاكرة
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          void check();
        }}
        className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-destructive px-3 text-sm font-black text-white"
      >
        <Wrench className="size-4" />
        أصلح الطباعة
      </button>
    );
  }

  return (
    <div dir="rtl" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(false)}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-card p-5 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <p className="text-lg font-black">إصلاح الطباعة</p>
          <button onClick={() => setOpen(false)} aria-label="إغلاق" className="rounded-full p-1">
            <X className="size-5" />
          </button>
        </div>

        {state === "checking" && <p className="mt-4 text-sm font-bold text-muted-foreground">جارٍ الفحص…</p>}

        {state === "alive" && (
          <div className="mt-4 rounded-2xl border-2 border-success bg-success/10 p-4 text-center">
            <Check className="mx-auto size-8 text-success" />
            <p className="mt-2 text-sm font-black">وكيل الطباعة يستجيب على هذا الجهاز.</p>
            <p className="mt-1 text-xs font-bold text-muted-foreground">
              إذا ما زالت الورقة ما تطلع، فالمشكلة في الطابعة نفسها: تأكّد من الكهرباء، والورق، والكيبل.
            </p>
          </div>
        )}

        {state === "dead" && (
          <div className="mt-4 space-y-4">
            <p className="rounded-xl border-2 border-destructive bg-destructive/10 p-3 text-sm font-black text-destructive">
              وكيل الطباعة متوقّف على هذا الجهاز. سوِّ واحدة من هذي:
            </p>

            <Step n="١" title="الأسهل — نزّل الأداة واضغطها مرّتين">
              <button
                onClick={download}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-black text-primary-foreground"
              >
                <Download className="size-4" />
                نزّل أداة الإصلاح
              </button>
              <p className="mt-2 text-xs font-bold text-muted-foreground">
                بعد ما ينزل الملف: افتحه، واضغط «نعم» إذا سألك ويندوز، وانتظر يكتب «تمام».
                بعدها حدّث هذي الصفحة.
              </p>
            </Step>

            <Step n="٢" title="أو أعِد تشغيل الكمبيوتر">
              <p className="text-xs font-bold text-muted-foreground">
                الوكيل يبدأ وحده مع ويندوز. إطفاء الجهاز وتشغيله يحلّها بلا أي شيء ثاني.
              </p>
            </Step>

            <Step n="٣" title="أو انسخ هذا الأمر لمن يفهم">
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-lg bg-secondary px-3 py-2 text-left text-xs font-bold" dir="ltr">
                  {CMD}
                </code>
                <button
                  onClick={() => {
                    void navigator.clipboard?.writeText(CMD);
                    setCopied(true);
                  }}
                  className="min-h-10 shrink-0 rounded-lg border border-border px-3 text-xs font-black"
                >
                  {copied ? "نُسخ" : <Copy className="size-4" />}
                </button>
              </div>
              <p className="mt-1 text-xs font-bold text-muted-foreground">يُلصق في PowerShell كمسؤول.</p>
            </Step>

            <button onClick={() => void check()} className="min-h-11 w-full rounded-xl border border-border text-sm font-black">
              افحص مرّة ثانية
            </button>
          </div>
        )}

        <p className="mt-4 text-xs font-bold text-muted-foreground">
          ولا تقلق على الطلبات: كلّها محفوظة، وتنطبع من «سجلّ الطلبات» ← «إعادة طباعة» بعد ما ترجع.
        </p>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border p-3">
      <p className="mb-2 text-sm font-black">
        <span className="ml-1 inline-flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{n}</span>
        {title}
      </p>
      {children}
    </div>
  );
}
