"use client";

import { useState } from "react";
import { AlertTriangle, MoreHorizontal, Printer, X } from "lucide-react";
import { PrintFixPanel } from "./PrintFixPanel";
import { EmergencyCommands } from "./EmergencyCommands";

/**
 * «المزيد» — ما لا يُستعمل كل يوم، ولا يجوز أن يختفي يوم يُحتاج.
 *
 * طلبته الإدارة بعد ليلةٍ توقّفت فيها الطابعتان والمحل يبيع: زرّ الإصلاح كان
 * يظهر مع تحذير الطباعة وحده، أي **بعد أن تفشل بيعة**. وهذا متأخّر: من يعرف
 * أن الطابعة واقفة يريد إصلاحها قبل أن يقف زبون ينتظر إيصاله.
 *
 * فهنا مكانٌ ثابت لا يعتمد على وقوع العطل. و«طوارئ» أوّله لأنه سبب وجوده.
 */
export function MorePanel() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-border px-3 text-sm font-bold hover:bg-secondary"
      >
        <MoreHorizontal className="size-4" />
        المزيد
      </button>
    );
  }

  return (
    <div dir="rtl" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setOpen(false)}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-card p-5 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <p className="text-lg font-black">المزيد</p>
          <button onClick={() => setOpen(false)} aria-label="إغلاق" className="rounded-full p-1">
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border-2 border-destructive/40 p-4">
          <p className="flex items-center gap-1.5 text-base font-black text-destructive">
            <AlertTriangle className="size-4" />
            طوارئ
          </p>

          <p className="mt-2 flex items-center gap-1.5 text-sm font-black">
            <Printer className="size-4" />
            الطابعة ما تطبع
          </p>
          <p className="mb-2 mt-1 text-xs font-bold text-muted-foreground">
            اضغط «أصلح الطباعة» — يفحص الجهاز، وإذا كان الوكيل واقفاً ينزّل لك
            أداة تضغطها مرّتين وترجع الطباعة وحدها.
          </p>
          {/* نفس اللوحة التي تظهر مع تحذير الطباعة — واحدةٌ لا اثنتان، فلا
              يتحسّن مسارٌ ويبقى الآخر قديماً */}
          <PrintFixPanel />

          <EmergencyCommands />

          <p className="mt-4 text-xs font-bold leading-relaxed text-muted-foreground">
            وما يضيع شيء: كل طلب محفوظ، والإيصالات تنطبع من «سجلّ الطلبات» ←
            «إعادة طباعة» بعد ما ترجع الطابعة.
          </p>
        </div>
      </div>
    </div>
  );
}
