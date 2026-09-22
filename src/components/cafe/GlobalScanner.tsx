"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ScanLine } from "lucide-react";
import { parseScan, useBarcodeScanner } from "./use-barcode-scanner";
import { confirmAssembled, confirmAssembledByCode } from "@/lib/cafe/prep-actions";
import { chimeReady } from "@/lib/cafe/chime";
import { canAccess, type StaffRole } from "@/lib/cafe/roles";

/**
 * القارئ يعمل في كل شاشة، لا في شاشة التجهيز وحدها.
 *
 * كان المستمع داخل ExpediterClient، فالمسح لا يُجهّز طلباً إلا إن صادف أن
 * الشاشة مفتوحة — والموظّف يقف على الكاشير فيمسح ولا يحدث شيء. القارئ لوحة
 * مفاتيح موصولة بالجهاز كلّه لا بصفحة، فالمستمع مكانه القشرة: ما إن يسجّل
 * الموظّف دخوله حتى يعمل المسح من أي صفحة.
 *
 * ويُستثنى مساران يملكان معالجهما: /expediter (يُحدّث صفّه فوراً) و/scanner
 * (أداة الفحص تعرض الرمز الخام ولا تُجهّز شيئاً) — وإلا عولج المسح مرّتين.
 */
export function GlobalScanner({ roles }: { roles: StaffRole[] }) {
  const pathname = usePathname();
  const own = pathname.startsWith("/expediter") || pathname.startsWith("/scanner");
  const allowed = canAccess(roles, ["expediter", "cashier"]);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  // الرسالة تختفي وحدها — لا زرّ إغلاق على شاشة لمس مشغولة
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const onScan = useCallback(
    async (raw: string) => {
      const scan = parseScan(raw);
      if (!scan) return setToast({ ok: false, text: `رمز غير معروف: ${raw.slice(0, 24)}` });
      const res = scan.kind === "uuid" ? await confirmAssembled(scan.id) : await confirmAssembledByCode(scan.seq, scan.code);
      if (!res.ok) return setToast({ ok: false, text: (res as { error?: string }).error ?? "تعذّر التأكيد" });
      const seq = scan.kind === "code" ? scan.seq : "orderSeq" in res ? res.orderSeq : null;
      chimeReady();
      setToast({ ok: true, text: `طلب ${seq != null ? String(seq).padStart(3, "0") : ""} → جاهز ✓` });
    },
    [],
  );

  // الخطّاف يُنادى دائماً (قاعدة الخطّافات)، والمعالج وحده هو من يصمت
  useBarcodeScanner((code) => {
    if (own || !allowed) return;
    void onScan(code);
  });

  if (!toast) return null;
  return (
    <div
      role="status"
      className={`fixed inset-x-0 top-3 z-[60] mx-auto flex w-fit max-w-[92vw] items-center gap-2 rounded-2xl px-4 py-3 text-base font-black shadow-lg ${
        toast.ok ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground"
      }`}
    >
      <ScanLine className="size-5 shrink-0" />
      <span className="truncate">{toast.text}</span>
    </div>
  );
}
