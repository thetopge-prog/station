"use client";

import { useState } from "react";
import { Check, Gift, Send, X } from "lucide-react";
import { createCoupon } from "@/lib/cafe/coupon-actions";
import { couponLabel, couponMessage, DEFAULT_DAYS, type CouponKind } from "@/lib/cafe/coupon";
import { normaliseIraqiPhone, whatsappOrderLink } from "@/lib/brand";
import { SITE_URL } from "@/lib/site/url";

/**
 * «كوبون تعويض» — من شاشة الكاشير، لحظة ما يقف الزبون أمامه.
 *
 * التعويض يُعطى وقته: زبونٌ انتظر طويلاً أو وصله طلبٌ ناقص يُعوَّض وهو ما زال
 * واقفاً، لا بعد يومين في لوحة إدارة. فالزرّ هنا، في لوحة ما بعد الدفع.
 *
 * ومطويٌّ خلف زرّ على نمط `PagerQrPanel`: شاشة الكاشير مزدحمة، ومسار البيع لا
 * يُوسَّع بشيءٍ يُستعمل أحياناً.
 */
export function CouponPanel({
  phone,
  name,
  orderId = null,
  orderNumber = null,
  compact = false,
}: {
  phone: string | null;
  name: string | null;
  /** الطلب الذي سبّب التعويض (0121) — يُحفظ مع الكوبون ويُذكر في الرسالة */
  orderId?: string | null;
  orderNumber?: number | string | null;
  /** زرٌّ صغير في صفّ السجلّ بدل زرٍّ عريض في لوحة الدفع */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CouponKind>("amount");
  const [value, setValue] = useState(5000);
  const [uses, setUses] = useState(1);
  const [minOrder, setMinOrder] = useState(0);
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<{ code: string; expiresOn: string } | null>(null);

  async function make() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const res = await createCoupon({
      kind,
      value,
      phone,
      name,
      uses,
      minOrder: minOrder > 0 ? minOrder : null,
      days,
      orderId,
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    setMade({ code: res.code, expiresOn: res.expiresOn });
  }

  function send() {
    if (!made || !phone) return;
    // ⚠ window.open أوّلاً وبلا await قبله: حاجب النوافذ لا يسمح بفتحٍ إلا في
    // نفس دورة الضغطة. نفس القاعدة الموثّقة في ReviewsClient.
    const text = couponMessage({
      name,
      about: orderNumber ? String(orderNumber).padStart(3, "0") : null,
      label: couponLabel({ kind, value }),
      code: made.code,
      url: `${SITE_URL}/coupon/${made.code}`,
      expiresOn: made.expiresOn,
      minOrder: minOrder > 0 ? minOrder : null,
      uses,
    });
    window.open(whatsappOrderLink(text, normaliseIraqiPhone(phone)), "_blank", "noopener");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={
          compact
            ? "touch-pos flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-sm font-bold text-primary hover:bg-primary/10"
            : "flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-primary px-3 text-sm font-black text-primary transition hover:bg-primary hover:text-primary-foreground"
        }
      >
        <Gift className="size-4" />
        كوبون تعويض
      </button>
    );
  }

  return (
    <div dir="rtl" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setOpen(false)}>
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-3xl bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div className="text-right">
            <p className="text-lg font-black">
              كوبون تعويض{orderNumber ? ` — طلب ${String(orderNumber).padStart(3, "0")}` : ""}
            </p>
            <p className="text-xs font-bold text-muted-foreground">
              {name || "بلا اسم"} {phone ? `· ${phone}` : "· بلا رقم"}
            </p>
          </div>
          <button onClick={() => setOpen(false)} aria-label="إغلاق" className="rounded-full p-1">
            <X className="size-5" />
          </button>
        </div>

        {!phone && (
          <p className="mt-3 rounded-xl bg-secondary p-3 text-xs font-bold text-muted-foreground">
            ما عدنا رقم هذا الزبون — يتولّد الرمز وتعطيه إيّاه بالكلام، وما راح تنفتح رسالة واتساب.
          </p>
        )}

        {made ? (
          <div className="mt-4 text-center">
            <Check className="mx-auto size-10 text-success" />
            <p className="mt-2 text-sm font-bold text-muted-foreground">رمز الكوبون</p>
            <p className="my-2 text-4xl font-black tracking-[0.2em] tabular-nums" dir="ltr">
              {made.code}
            </p>
            <p className="text-xs font-bold text-muted-foreground">
              {couponLabel({ kind, value })} · صالح لغاية {made.expiresOn}
            </p>
            {phone && (
              <button
                onClick={send}
                className="mt-4 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-black text-primary-foreground"
              >
                <Send className="size-4" />
                أرسله بواتساب
              </button>
            )}
            <button onClick={() => setOpen(false)} className="mt-2 min-h-11 w-full rounded-xl border border-border text-sm font-black">
              تمام
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {([["amount", "مبلغ"], ["percent", "نسبة ٪"]] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => {
                    setKind(k);
                    setValue(k === "percent" ? 20 : 5000);
                  }}
                  className={`min-h-11 rounded-xl text-sm font-black ${kind === k ? "bg-primary text-primary-foreground" : "border border-border"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <Field label={kind === "percent" ? "النسبة ٪" : "مبلغ الخصم (د.ع)"}>
              <input
                type="number"
                inputMode="numeric"
                value={value}
                onChange={(e) => setValue(Math.max(0, Number(e.target.value) || 0))}
                className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-black"
              />
            </Field>

            <Field label="كم مرّة يستعمله">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={uses}
                onChange={(e) => setUses(Math.max(1, Number(e.target.value) || 1))}
                className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-black"
              />
            </Field>

            <Field label="أقلّ طلب (اختياري — يحميك من وجبة مجانية)">
              <input
                type="number"
                inputMode="numeric"
                value={minOrder || ""}
                placeholder="بلا حدّ"
                onChange={(e) => setMinOrder(Math.max(0, Number(e.target.value) || 0))}
                className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-black"
              />
            </Field>

            <Field label="صالح كم يوم">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={days}
                onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
                className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-black"
              />
            </Field>

            {err && <p className="text-sm font-black text-destructive">{err}</p>}

            <button
              onClick={make}
              disabled={busy}
              className="min-h-12 w-full rounded-xl bg-primary text-sm font-black text-primary-foreground disabled:opacity-60"
            >
              {busy ? "…" : "ولّد الكوبون"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
