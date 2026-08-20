"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Croissant, Tag, Trash2 } from "lucide-react";
import {
  addPastryBatch,
  addOffer,
  createOfferFromBatch,
  toggleOffer,
  deleteOffer,
  retireBatch,
  setItemOffer,
  clearItemOffer,
  type PastryBatch,
  type Offer,
  type ItemOffer,
} from "@/lib/cafe/pastry-actions";
import { formatIqdLabel } from "@/lib/cafe/money";
import { PriceInput } from "./PriceInput";

const STATE_STYLE: Record<string, string> = {
  fresh: "border-emerald-500/50 bg-emerald-500/5",
  soon: "border-amber-500 bg-amber-500/10",
  expired: "border-destructive bg-destructive/10",
};

export function PastriesClient({
  batches,
  offers,
  itemOffers = [],
  pastryItems = [],
}: {
  batches: PastryBatch[];
  offers: Offer[];
  itemOffers?: ItemOffer[];
  pastryItems?: { id: string; name_ar: string; price: number }[];
}) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [depOn, setDepOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [offerTitle, setOfferTitle] = useState("");
  const [offerDesc, setOfferDesc] = useState("");
  const [offerItemId, setOfferItemId] = useState("");
  const [offerPrice, setOfferPrice] = useState(0);
  const [offerFree, setOfferFree] = useState(false);

  const alerts = batches.filter((b) => b.state !== "fresh");

  async function saveItemOffer() {
    if (!offerItemId) {
      setMsg("اختر معجّناً.");
      return;
    }
    await act(() => setItemOffer(offerItemId, offerFree ? 0 : offerPrice));
    setOfferItemId("");
    setOfferPrice(0);
    setOfferFree(false);
  }

  async function submitBatch(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await addPastryBatch({ item_name: name, quantity: Number(qty), deposited_on: depOn || undefined });
    setBusy(false);
    if (!res.ok) return setMsg(res.error);
    setName("");
    setQty("");
    setDepOn("");
    router.refresh();
  }
  async function submitOffer(e: React.FormEvent) {
    e.preventDefault();
    const res = await addOffer({ title: offerTitle, description: offerDesc });
    if (!res.ok) return setMsg(res.error);
    setOfferTitle("");
    setOfferDesc("");
    router.refresh();
  }
  async function act(fn: () => Promise<unknown>) {
    await fn();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Croissant className="size-6 text-primary" />
        إدارة المعجنات والعروض
      </h1>

      {/* expiry alert */}
      {alerts.length > 0 && (
        <div className="flex items-start gap-2 rounded-2xl border-2 border-amber-500 bg-amber-500/10 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm">
            <p className="font-bold text-amber-700 dark:text-amber-300">تنبيه: {alerts.length} دفعة معجنات قاربت على الانتهاء</p>
            <p className="text-muted-foreground">
              {alerts.map((b) => `${b.item_name} (${b.days_remaining < 0 ? "منتهية" : `${b.days_remaining} يوم`})`).join("، ")} — قدّمها ضمن «عرض اليوم» قبل انتهائها.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── pastries ── */}
        <section className="space-y-3">
          <h2 className="font-bold">🥐 المعجنات المودعة</h2>
          <form onSubmit={submitBatch} className="grid gap-2 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_80px_auto]">
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="النوع (كرواسون، دونات…)" className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" min={0} placeholder="العدد" dir="ltr" className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <button type="submit" disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
              {busy ? "…" : "إيداع"}
            </button>
            <label className="text-xs text-muted-foreground sm:col-span-3">
              تاريخ الإيداع (افتراضياً اليوم) — الصلاحية 6 أيام
              <input value={depOn} onChange={(e) => setDepOn(e.target.value)} type="date" dir="ltr" className="mr-2 rounded-lg border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </label>
            {msg && <p className="text-sm text-destructive sm:col-span-3">{msg}</p>}
          </form>

          {batches.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">لا توجد معجنات مودعة.</p>
          ) : (
            <div className="space-y-2">
              {batches.map((b) => (
                <div key={b.id} className={`flex items-center justify-between gap-2 rounded-xl border-2 p-3 ${STATE_STYLE[b.state]}`}>
                  <div className="min-w-0">
                    <p className="font-bold">
                      {b.item_name} <span className="text-muted-foreground">×{b.quantity}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      أُودعت {b.deposited_on} ·{" "}
                      {b.state === "expired" ? (
                        <span className="font-bold text-destructive">منتهية الصلاحية</span>
                      ) : b.state === "soon" ? (
                        <span className="font-bold text-amber-600 dark:text-amber-400">تنتهي خلال {b.days_remaining} يوم</span>
                      ) : (
                        <span>متبقٍ {b.days_remaining} يوم</span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {b.state !== "fresh" && (
                      <button onClick={() => act(() => createOfferFromBatch(b.id))} className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90">
                        🎁 عرض اليوم
                      </button>
                    )}
                    <button onClick={() => act(() => retireBatch(b.id))} aria-label="إزالة" title="نفدت / أُتلفت" className="rounded-lg border border-border p-1.5 hover:bg-secondary">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── offers ── */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-1.5 font-bold">
            <Tag className="size-4 text-primary" />
            العروض المعروضة للزبائن
          </h2>
          <form onSubmit={submitOffer} className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <input value={offerTitle} onChange={(e) => setOfferTitle(e.target.value)} required placeholder="عنوان العرض" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <input value={offerDesc} onChange={(e) => setOfferDesc(e.target.value)} placeholder="التفاصيل (اختياري)" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
              إضافة عرض
            </button>
          </form>

          {offers.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">لا توجد عروض.</p>
          ) : (
            <div className="space-y-2">
              {offers.map((o) => (
                <div key={o.id} className={`rounded-xl border p-3 ${o.active ? "border-primary/40 bg-primary/5" : "border-border bg-card opacity-60"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold">{o.title}</p>
                      {o.description && <p className="text-xs text-muted-foreground">{o.description}</p>}
                      {o.ends_on && <p className="text-[11px] text-muted-foreground">ينتهي: {o.ends_on}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button onClick={() => act(() => toggleOffer(o.id, !o.active))} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${o.active ? "bg-primary text-primary-foreground" : "border border-border"}`}>
                        {o.active ? "فعّال" : "متوقف"}
                      </button>
                      <button onClick={() => act(() => deleteOffer(o.id))} aria-label="حذف" className="rounded-lg border border-border p-1.5 text-destructive hover:bg-secondary">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* daily per-item offers — shown in the hot-drink pastry cross-sell */}
      <section className="space-y-3">
        <h2 className="flex flex-wrap items-center gap-1.5 font-bold">
          🎁 عروض اليوم على المعجنات
          <span className="text-xs font-normal text-muted-foreground">(تُقترح مع المشروب الساخن — مجاناً أو بسعر تضعه)</span>
        </h2>
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
          <label className="text-sm">
            <span className="text-muted-foreground">المعجّن</span>
            <select
              value={offerItemId}
              onChange={(e) => setOfferItemId(e.target.value)}
              className="mt-1 block w-52 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">اختر معجّناً…</option>
              {pastryItems.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name_ar} — {formatIqdLabel(p.price)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-sm font-semibold">
            <input type="checkbox" checked={offerFree} onChange={(e) => setOfferFree(e.target.checked)} className="accent-primary" />
            مجاناً
          </label>
          {!offerFree && (
            <div className="text-sm">
              <span className="text-muted-foreground">سعر العرض</span>
              <div className="mt-1">
                <PriceInput value={offerPrice} onChange={setOfferPrice} />
              </div>
            </div>
          )}
          <button onClick={saveItemOffer} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
            حفظ العرض
          </button>
        </div>
        {itemOffers.length > 0 && (
          <div className="space-y-2">
            {itemOffers.map((o) => (
              <div key={o.item_id} className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/5 p-3">
                <p className="font-bold">
                  {o.name_ar} <span className="text-sm text-muted-foreground">({formatIqdLabel(o.price)})</span>
                </p>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{o.offer_price === 0 ? "مجاناً" : formatIqdLabel(o.offer_price)}</span>
                  <button onClick={() => act(() => clearItemOffer(o.item_id))} aria-label="إلغاء العرض" className="rounded-lg border border-border p-1.5 text-destructive hover:bg-secondary">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
