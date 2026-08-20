"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tag, Trash2 } from "lucide-react";
import {
  addOffer,
  toggleOffer,
  deleteOffer,
  setItemOffer,
  clearItemOffer,
  type Offer,
  type ItemOffer,
} from "@/lib/cafe/offer-actions";
import { formatIqdLabel } from "@/lib/cafe/money";
import { PriceInput } from "./PriceInput";

/**
 * «العروض» — two things the customer sees on the menu.
 *
 *   1. A banner offer: free text, on or off.
 *   2. A price for one item, for today only.
 *
 * What used to live here as well was a pastry-batch tracker: deposit a tray of
 * croissants, count down six days of shelf life, turn what was about to expire
 * into a discount. Station is a fast-food kitchen that cooks to order, so the
 * table stayed empty — and its alert count was still queried on EVERY staff
 * page load to render a badge that could only ever say zero.
 */

/** how many items to show before the picker becomes unusable on a tablet */
const MAX_PICKER = 400;

export function OffersClient({
  offers,
  itemOffers = [],
  items = [],
}: {
  offers: Offer[];
  itemOffers?: ItemOffer[];
  items?: { id: string; name_ar: string; price: number; category: string }[];
}) {
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [offerTitle, setOfferTitle] = useState("");
  const [offerDesc, setOfferDesc] = useState("");
  const [offerItemId, setOfferItemId] = useState("");
  const [offerPrice, setOfferPrice] = useState(0);
  const [offerFree, setOfferFree] = useState(false);

  async function act(fn: () => Promise<unknown>) {
    await fn();
    router.refresh();
  }

  async function saveItemOffer() {
    if (!offerItemId) {
      setMsg("اختر صنفاً.");
      return;
    }
    setMsg(null);
    await act(() => setItemOffer(offerItemId, offerFree ? 0 : offerPrice));
    setOfferItemId("");
    setOfferPrice(0);
    setOfferFree(false);
  }

  async function submitOffer(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await addOffer({ title: offerTitle, description: offerDesc });
    setBusy(false);
    if (!res.ok) return setMsg(res.error);
    setOfferTitle("");
    setOfferDesc("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Tag className="size-6 text-primary" />
        العروض
      </h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── banner offers ── */}
        <section className="space-y-3">
          <h2 className="font-bold">العروض المعروضة للزبائن</h2>
          <form onSubmit={submitOffer} className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <input
              value={offerTitle}
              onChange={(e) => setOfferTitle(e.target.value)}
              required
              placeholder="عنوان العرض"
              className="min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              value={offerDesc}
              onChange={(e) => setOfferDesc(e.target.value)}
              placeholder="التفاصيل (اختياري)"
              className="min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "…" : "إضافة عرض"}
            </button>
            {msg && <p className="text-sm text-destructive">{msg}</p>}
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
                      <button
                        onClick={() => act(() => toggleOffer(o.id, !o.active))}
                        className={`min-h-11 rounded-lg px-3 text-xs font-semibold ${o.active ? "bg-primary text-primary-foreground" : "border border-border"}`}
                      >
                        {o.active ? "فعّال" : "متوقف"}
                      </button>
                      <button
                        onClick={() => act(() => deleteOffer(o.id))}
                        aria-label="حذف"
                        className="min-h-11 min-w-11 rounded-lg border border-border p-1.5 text-destructive hover:bg-secondary"
                      >
                        <Trash2 className="mx-auto size-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── today's price on one item ── */}
        <section className="space-y-3">
          <h2 className="flex flex-wrap items-center gap-1.5 font-bold">
            🎁 سعر اليوم على صنف
            <span className="text-xs font-normal text-muted-foreground">(يظهر للزبون على المنيو — مجاناً أو بسعر تضعه)</span>
          </h2>
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
            <label className="text-sm">
              <span className="text-muted-foreground">الصنف</span>
              <select
                value={offerItemId}
                onChange={(e) => setOfferItemId(e.target.value)}
                className="mt-1 block min-h-11 w-56 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">اختر صنفاً…</option>
                {items.slice(0, MAX_PICKER).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.category} — {p.name_ar} · {formatIqdLabel(p.price)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-1.5 text-sm font-semibold">
              <input type="checkbox" checked={offerFree} onChange={(e) => setOfferFree(e.target.checked)} className="size-5 accent-primary" />
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
            <button
              onClick={saveItemOffer}
              className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
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
                    <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                      {o.offer_price === 0 ? "مجاناً" : formatIqdLabel(o.offer_price)}
                    </span>
                    <button
                      onClick={() => act(() => clearItemOffer(o.item_id))}
                      aria-label="إلغاء العرض"
                      className="min-h-11 min-w-11 rounded-lg border border-border p-1.5 text-destructive hover:bg-secondary"
                    >
                      <Trash2 className="mx-auto size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
