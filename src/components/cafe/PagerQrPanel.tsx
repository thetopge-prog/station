"use client";

import { useState } from "react";
import { BellRing, X } from "lucide-react";
import { QrBlock } from "./QrBlock";
import { SITE_URL } from "@/lib/site/url";

/**
 * رمز البيجر على شاشة الكاونتر — لمن لا يأخذ إيصالاً.
 *
 * الإيصال يحمل الرمز مطبوعاً، وهو يكفي أكثر الزبائن. وهذا لمن قال «ما أريد
 * إيصال»: يضغط الكاشير الزرّ فيظهر الرمز كبيراً على شاشته، يمسحه الزبون
 * ويمضي — بلا جهازٍ إضافي ولا شاشةٍ ثانية تُشترى.
 *
 * وهو مطويٌّ خلف زرّ لا معروضٌ دائماً: شاشة الكاشير مزدحمة، ومسار البيع لا
 * يُوسَّع بشيءٍ يُستعمل أحياناً.
 */
export function PagerQrPanel({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [open, setOpen] = useState(false);
  const url = `${SITE_URL}/t/${orderId}`;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-primary px-3 text-sm font-black text-primary transition hover:bg-primary hover:text-primary-foreground"
      >
        <BellRing className="size-4" />
        اعرض رمز التنبيه للزبون
      </button>
    );
  }

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-card p-5 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="text-right">
            <p className="text-lg font-black">طلب رقم {orderNumber}</p>
            <p className="text-xs font-bold text-muted-foreground">خلّي الزبون يمسحه بكاميرته</p>
          </div>
          <button onClick={() => setOpen(false)} aria-label="إغلاق" className="rounded-full p-1">
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-3 flex justify-center">
          <QrBlock value={url} size={220} />
        </div>

        <p className="mt-3 text-base font-black">📳 ينبّهه هاتفه لمّا يجهز</p>
        <p className="mt-1 text-xs font-bold leading-relaxed text-muted-foreground">
          يقدر يقعد أو يطلع للسيارة — ما يحتاج يوقف بالانتظار.
        </p>
      </div>
    </div>
  );
}
