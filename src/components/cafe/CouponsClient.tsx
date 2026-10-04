"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Copy, Gift } from "lucide-react";
import { toggleCoupon, type CouponRow } from "@/lib/cafe/coupon-actions";
import { couponLabel } from "@/lib/cafe/coupon";
import { formatIqdLabel } from "@/lib/cafe/money";

/**
 * «الخصومات والكوبونات» — القائمة.
 *
 * ولا تُنشأ الكوبونات من هنا: الكوبون تعويضٌ يُعطى والزبون واقف، فمكان إنشائه
 * شاشة الكاشير لحظة البيع (`CouponPanel`). وهذه الصفحة للمراجعة — ماذا أُعطي،
 * ولمن، وكم استُعمل.
 */
export function CouponsClient({ rows, isAdmin }: { rows: CouponRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const live = rows.filter((r) => alive(r, today));
  const spent = rows.reduce((t, r) => t + r.used_count * (r.kind === "percent" ? 0 : r.value), 0);

  async function flip(id: string) {
    setBusy(id);
    await toggleCoupon(id);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">الخصومات والكوبونات</h1>
        <p className="mt-1 text-sm font-bold text-muted-foreground">
          {isAdmin ? "كل الكوبونات" : "الكوبونات التي أنشأتها"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Kpi label="كوبونات فعّالة" value={String(live.length)} />
        <Kpi label="استُعملت" value={String(rows.reduce((t, r) => t + r.used_count, 0))} />
        {/* النسب لا تُجمع بالدينار — قيمتها تختلف بكل طلب، فتُستثنى صراحةً */}
        {isAdmin && <Kpi label="قيمة المبالغ المخصومة" value={formatIqdLabel(spent)} />}
      </div>

      {!rows.length && (
        <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm font-bold text-muted-foreground">
          ما عدنا كوبونات بعد. تُنشأ من شاشة الكاشير بعد الدفع — زرّ «كوبون تعويض للزبون».
        </p>
      )}

      <div className="space-y-2">
        {rows.map((r) => {
          const ok = alive(r, today);
          return (
            <div key={r.id} className={`rounded-2xl border border-border bg-card p-3 ${ok ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Gift className={`size-4 ${ok ? "text-primary" : "text-muted-foreground"}`} />
                  <button
                    onClick={() => {
                      void navigator.clipboard?.writeText(r.code);
                      setCopied(r.code);
                    }}
                    className="flex items-center gap-1 text-lg font-black tracking-widest"
                    dir="ltr"
                  >
                    {r.code}
                    <Copy className="size-3 text-muted-foreground" />
                  </button>
                  {copied === r.code && <span className="text-xs font-bold text-success">نُسخ</span>}
                </div>
                <span className="text-sm font-black">{couponLabel(r, r.item_name)}</span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-muted-foreground">
                <span>{r.customer_name || r.phone || "بلا زبون محدّد"}</span>
                <span>
                  استُعمل {r.used_count} من {r.max_uses}
                </span>
                {r.min_order ? <span>أقلّ طلب {formatIqdLabel(r.min_order)}</span> : null}
                {r.expires_on ? <span>لغاية {r.expires_on}</span> : null}
                {isAdmin && r.created_by_name ? <span>— {r.created_by_name}</span> : null}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <StateChip row={r} today={today} />
                <button
                  onClick={() => void flip(r.id)}
                  disabled={busy === r.id}
                  className="mr-auto min-h-9 rounded-lg border border-border px-3 text-xs font-black disabled:opacity-50"
                >
                  {r.is_active ? "إيقاف" : "إعادة تفعيل"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function alive(r: CouponRow, today: string): boolean {
  return r.is_active && r.used_count < r.max_uses && (!r.expires_on || r.expires_on >= today);
}

/** سببُ الموت يُقال صراحةً — «غير فعّال» لا تُشخَّص */
function StateChip({ row, today }: { row: CouponRow; today: string }) {
  const [text, good] = !row.is_active
    ? ["موقوف", false]
    : row.used_count >= row.max_uses
      ? ["استُعمل كلّه", false]
      : row.expires_on && row.expires_on < today
        ? ["منتهٍ", false]
        : ["فعّال", true];
  return (
    <span className={`flex items-center gap-1 text-xs font-black ${good ? "text-success" : "text-muted-foreground"}`}>
      {good ? <CheckCircle2 className="size-3.5" /> : <Ban className="size-3.5" />}
      {text as string}
    </span>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-black tabular-nums">{value}</p>
    </div>
  );
}
