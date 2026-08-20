"use client";

import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { Check, LogIn, Minus, Plus, ShoppingCart, X } from "lucide-react";
import type { MenuCategoryView, MenuItemView } from "@/lib/cafe/menu-data";
import { formatIqdLabel } from "@/lib/cafe/money";
import { submitOrder, type OrderLineInput } from "@/lib/cafe/order-actions";
import { useCart } from "./use-cart";
import { MenuIcon } from "./MenuIcon";
import { StationMark } from "./Logo";
import { CHANNEL_OF, FulfilmentPicker, missingFields, type FulfilmentMode } from "./FulfilmentPicker";
import { SurpriseMe } from "./SurpriseMe";

/** Primary customer menu — full-screen: category rail on the RIGHT, product grid
 *  on the LEFT, cart + checkout, size picker, and — for anyone who opened the
 *  link rather than scanning a table sticker — the fulfilment chooser. */

// Station brand: bright and orange like the packaging, not the old dark coffee
// room. --activeink is the ink that sits ON orange (buttons, the active
// category, the cart bar), so it has to stay white.
const VARS: Record<string, string> = {
  "--accent": "#FF6B00", "--accent2": "#FF8A33", "--panel": "#FFF3E9", "--panelsoft": "#FFFFFF",
  "--text": "#2C1E16", "--muted": "#8A6F5E", "--line": "rgba(255,107,0,0.20)", "--active": "#FF6B00", "--activeink": "#FFFFFF",
};
const GRAD = "radial-gradient(1100px 700px at 88% -8%, rgba(255,107,0,0.13), transparent 55%), linear-gradient(160deg, #FFFDFB, #FFF4EA)";

/** menu image → CDN path; returns both the light -sm variant and the full one
 *  (admin-uploaded images have no -sm, so we fall back to full then to an icon). */
function imgSrcs(url: string | null): { sm: string; full: string } | null {
  if (!url) return null;
  const m = url.match(/\/storage\/v1\/object\/public\/menu\/(.+)$/);
  const full = m ? `/img/${m[1]}` : url;
  return { sm: full.replace(/\.webp(\?|$)/, "-sm.webp$1"), full };
}
function onImgError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  const full = img.dataset.full;
  if (full && img.src !== full) img.src = full; // -sm missing → try full
  else img.style.display = "none"; // full missing too → show the icon behind
}

// The cafe build layered steam / frost / ice-drips over every card, chosen by
// category name. On a fast-food menu those names never match, so EVERY item
// fell through to "cold" and got blue droplets over a burger. Deleted: the
// motion now lives in MenuIcon (heat wisps, sizzle specks, drips), which knows
// what the item actually is. All that remains here is a warm glow behind the
// art so a photo-less card is not a flat rectangle.
const GLOW = "radial-gradient(120% 70% at 50% 30%, rgba(255,107,0,0.14), transparent 62%)";
const FIELD = "w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]";

export function TabletMenuClient({
  menu,
  table = null,
  channel = "qr",
  offers = {},
}: {
  menu: MenuCategoryView[];
  table?: string | null;
  channel?: "qr" | "kiosk";
  /** item_id → today's offer price (0 = مجاناً) set by management */
  offers?: Record<string, number>;
}) {
  const [activeCat, setActiveCat] = useState(menu[0]?.name_ar ?? "");
  const mainRef = useRef<HTMLElement>(null);
  const { lines, total, count, dispatch } = useCart();
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // Fulfilment. A table QR (?t=5) already answers "where are you", so that path
  // is pinned to dine-in and never shows the picker.
  const scanned = Boolean(table);
  const [mode, setMode] = useState<FulfilmentMode | null>(scanned ? "dinein" : null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [carNote, setCarNote] = useState("");
  const [guests, setGuests] = useState(2);
  const [payment, setPayment] = useState<"cash" | "card">("cash");

  /** what the confirmation screen shows — more than a number for a web order */
  const [confirmed, setConfirmed] = useState<
    { orderNumber: string; pickupCode: string | null; table: string | null; mode: FulfilmentMode } | null
  >(null);

  // product modal (size picker)
  const [modalItem, setModalItem] = useState<MenuItemView | null>(null);
  const [modalVariant, setModalVariant] = useState<string | null>(null);

  const cat = menu.find((c) => c.name_ar === activeCat) ?? menu[0];

  // Sauces (and any future photo-less category) were rendering at the same
  // 4:5 photo aspect as a burger — a giant orange icon and «0 د.ع» filling half
  // the screen for a free condiment. When nothing in the category has a photo
  // there is nothing to show at that size, so the tiles go small and dense.
  const compact = (cat?.items ?? []).length > 0 && (cat?.items ?? []).every((i) => !i.image_url);

  /**
   * Today's price for an item — management can set a per-item offer from
   * /pastries («عروض اليوم»), and it must beat the menu price everywhere the
   * customer sees a number. Previously this only reached the cross-sell strip,
   * so an advertised offer never actually showed on the grid it advertised.
   */
  const priceOf = (it: MenuItemView) => offers[it.id] ?? it.price;

  function selectCat(name: string) {
    setActiveCat(name);
    mainRef.current?.scrollTo({ top: 0 });
  }
  function add(it: MenuItemView, variantId: string | null, unitPrice: number) {
    const v = it.variants.find((x) => x.id === variantId);
    const key = `${it.id}|${variantId ?? ""}`;
    const name = it.name_ar + (v ? ` — ${v.name_ar}` : "");
    dispatch({ type: "add", line: { key, itemId: it.id, name, variantId, flavor: null, unitPrice } });
  }
  function onPlus(it: MenuItemView) {
    // a priced size choice opens the modal; everything else goes straight in
    if (it.variants.length > 0) {
      setModalItem(it);
      setModalVariant(it.variants[0]?.id ?? null);
    } else {
      add(it, null, priceOf(it));
    }
  }
  const modalPrice = modalItem ? (modalItem.variants.find((v) => v.id === modalVariant)?.price ?? modalItem.price) : 0;

  async function checkout() {
    if (!lines.length || busy) return;

    const gap = missingFields(mode, { name, phone, address });
    if (gap) return setErr(gap);

    setBusy(true);
    setErr(null);
    const payload: OrderLineInput[] = lines.map((l) => ({ item_id: l.itemId, variant_id: l.variantId, flavor: l.flavor, qty: l.qty }));

    // "#auto" asks the server to claim a free table inside the same transaction
    // that inserts the order, so two customers can never be sent to table 7.
    const tableArg = scanned ? table : mode === "dinein" ? "#auto" : null;

    const res = await submitOrder({
      channel: scanned ? channel : CHANNEL_OF[mode!],
      table: tableArg,
      lines: payload,
      name: name.trim() || null,
      phone: phone.trim() || null,
      note: note.trim() || null,
      address: mode === "delivery" ? address.trim() || null : null,
      carNote: mode === "curbside" ? carNote.trim() || null : null,
      guests: mode === "dinein" ? guests : null,
      paymentPref: scanned ? null : payment,
    });
    setBusy(false);
    if (!res.ok) return setErr(res.error);

    dispatch({ type: "clear" });
    setNote("");
    setAddress("");
    setCarNote("");
    setCartOpen(false);
    setConfirmed({
      orderNumber: res.orderNumber,
      pickupCode: res.pickupCode ?? null,
      table: res.table ?? table ?? null,
      mode: mode ?? "dinein",
    });
  }

  return (
    <div dir="rtl" style={{ ...(VARS as CSSProperties), background: GRAD }} className="flex h-dvh flex-col text-[var(--text)]">
      {/* top bar */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <StationMark className="size-9 shrink-0" />
          <span className="text-lg font-extrabold text-[var(--accent)]">ستيشن</span>
        </div>
        {table ? (
          <span className="rounded-full border border-[var(--accent)] bg-[var(--accent)]/10 px-4 py-1.5 text-sm font-extrabold text-[var(--accent)]">
            🍽️ طاولة {table}
          </span>
        ) : (
          <h1 className="text-base font-bold text-[var(--muted)]">المنيو</h1>
        )}
        <Link
          href="/sign-in"
          aria-label="دخول الموظفين"
          title="دخول الموظفين"
          className="flex size-10 items-center justify-center rounded-full border border-[var(--line)] text-[var(--accent)] transition hover:bg-[var(--panel)]"
        >
          <LogIn className="size-5" />
        </Link>
      </header>

      <div className="flex min-h-0 flex-1 flex-row-reverse">
        {/* product grid — LEFT */}
        <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto p-4 pb-24">
          {/* the chef pick sits above the grid: a customer who cannot decide
              should meet it before scrolling, not after */}
          <div className="mb-4">
            <SurpriseMe variant="customer" />
          </div>
          <h2 className="mb-3 px-1 text-xl font-extrabold text-[var(--accent)]">{cat?.name_ar}</h2>
          <div className={compact ? "grid grid-cols-3 gap-2.5 sm:grid-cols-4 xl:grid-cols-5" : "grid grid-cols-2 gap-3 xl:grid-cols-3"}>
            {(cat?.items ?? []).map((it) => {
              const s = imgSrcs(it.image_url);
              return (
                <article key={it.id} className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panelsoft)]">
                  <div className={`relative bg-[var(--panel)] ${compact ? "aspect-square" : "aspect-[4/5]"}`}>
                    <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: GLOW }} />
                    <MenuIcon
                      name={it.name_ar}
                      category={cat?.name_ar}
                      className={`absolute inset-0 m-auto text-[var(--accent)] ${compact ? "size-12" : "size-24"}`}
                    />
                    {s && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.sm} data-full={s.full} alt={it.name_ar} loading="lazy" onError={onImgError} className="absolute inset-0 h-full w-full object-cover" />
                    )}
                    {/* add button floats on the image → keeps the footer clean + identical on all phones */}
                    <button
                      onClick={() => onPlus(it)}
                      aria-label="أضف للسلة"
                      className={`absolute bottom-2 left-2 z-10 flex items-center justify-center rounded-full bg-[var(--accent)] text-[var(--activeink)] shadow-lg transition active:scale-90 ${
                        compact ? "size-8" : "size-10"
                      }`}
                    >
                      <Plus className={compact ? "size-4" : "size-5"} />
                    </button>
                  </div>
                  <div className={compact ? "px-2 py-2 text-center" : "px-3 py-2.5 text-right"}>
                    <p
                      className={
                        compact
                          ? "truncate text-[13px] font-bold leading-tight"
                          : "line-clamp-2 min-h-[2.4em] text-[15px] font-bold leading-tight"
                      }
                    >
                      {it.name_ar}
                    </p>
                    <p
                      className={`mt-1 flex items-baseline gap-1.5 whitespace-nowrap font-extrabold tabular-nums text-[var(--accent)] ${
                        compact ? "justify-center text-sm" : "justify-end text-lg"
                      }`}
                    >
                      {priceOf(it) !== it.price && priceOf(it) > 0 && (
                        <s className="text-xs font-bold text-[var(--muted)]">{formatIqdLabel(it.price)}</s>
                      )}
                      {/* a zero price is not «0 د.ع» — it is free, and saying so
                          is the difference between a menu and a spreadsheet */}
                      {priceOf(it) > 0 ? formatIqdLabel(priceOf(it)) : "مجاناً"}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </main>

        {/* category rail — RIGHT */}
        <aside className="w-[132px] shrink-0 overflow-y-auto border-l border-[var(--line)] bg-[var(--panelsoft)]/60 py-2 sm:w-[184px]">
          {menu.map((c) => {
            const on = c.name_ar === activeCat;
            return (
              <button key={c.name_ar} onClick={() => selectCat(c.name_ar)} className={`flex w-full flex-col items-center gap-1.5 px-2 py-3.5 text-center transition ${on ? "bg-[var(--active)] text-[var(--activeink)]" : "text-[var(--muted)] hover:bg-[var(--panel)]"}`}>
                <MenuIcon name={c.name_ar} category={c.name_ar} className={`size-8 ${on ? "text-[var(--activeink)]" : "text-[var(--accent)]"}`} />
                <span className="text-[13px] font-bold leading-tight">
                  {c.name_ar.split(" ").map((w, i) => (
                    <span key={i} className="block">{w}</span>
                  ))}
                </span>
              </button>
            );
          })}
        </aside>
      </div>

      {/* cart bar */}
      {count > 0 && !cartOpen && !confirmed && !modalItem && (
        <button onClick={() => setCartOpen(true)} className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-5xl items-center justify-between gap-3 bg-[var(--accent)] px-5 py-4 font-extrabold text-[var(--activeink)] shadow-lg">
          <span className="flex items-center gap-2"><ShoppingCart className="size-5" /> عرض السلة ({count})</span>
          <span className="tabular-nums">{formatIqdLabel(total)}</span>
        </button>
      )}

      {/* product modal — size + cross-sell */}
      {modalItem && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setModalItem(null)}>
          <div style={{ ...(VARS as CSSProperties) }} className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[var(--panelsoft)] p-5 text-[var(--text)] sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-extrabold">{modalItem.name_ar}</h2>
              <div className="flex items-center gap-2">
                {count > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-[var(--accent)]/15 px-2.5 py-1 text-sm font-bold text-[var(--accent)]">
                    <ShoppingCart className="size-4" /> {count}
                  </span>
                )}
                <button onClick={() => setModalItem(null)} aria-label="إغلاق" className="rounded-full border border-[var(--line)] p-1.5"><X className="size-5" /></button>
              </div>
            </div>

            {modalItem.variants.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-2 text-sm font-bold text-[var(--muted)]">اختر الحجم</h3>
                <div className="flex flex-wrap gap-2">
                  {modalItem.variants.map((v) => (
                    <button key={v.id} onClick={() => setModalVariant(v.id)} className={`rounded-xl border px-4 py-2.5 font-bold transition ${modalVariant === v.id ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--activeink)]" : "border-[var(--line)]"}`}>
                      {v.name_ar} · <span className="tabular-nums">{formatIqdLabel(v.price)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => {
                add(modalItem, modalVariant, modalPrice);
                setModalItem(null);
              }}
              className="w-full rounded-2xl bg-[var(--accent)] py-4 text-lg font-extrabold text-[var(--activeink)] transition active:scale-[0.99]"
            >
              أضف للسلة · {formatIqdLabel(modalPrice)}
            </button>
          </div>
        </div>
      )}

      {/* cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/60" onClick={() => setCartOpen(false)}>
          <div style={{ ...(VARS as CSSProperties) }} className="max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-[var(--panelsoft)] p-5 text-[var(--text)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-[var(--accent)]">سلة الطلب {table ? `· طاولة ${table}` : ""}</h2>
              <button onClick={() => setCartOpen(false)} aria-label="إغلاق" className="rounded-full border border-[var(--line)] p-1.5"><X className="size-5" /></button>
            </div>
            <ul className="space-y-2">
              {lines.map((l) => (
                <li key={l.key} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{l.name}</p>
                    <p className="text-sm tabular-nums text-[var(--accent)]">{formatIqdLabel(l.unitPrice * l.qty)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button onClick={() => dispatch({ type: "dec", key: l.key })} aria-label="إنقاص" className="rounded-full border border-[var(--line)] p-1.5"><Minus className="size-4" /></button>
                    <span className="w-6 text-center font-bold tabular-nums">{l.qty}</span>
                    <button onClick={() => dispatch({ type: "inc", key: l.key })} aria-label="زيادة" className="rounded-full border border-[var(--line)] p-1.5"><Plus className="size-4" /></button>
                  </div>
                </li>
              ))}
            </ul>
            {!scanned && (
              <div className="mt-4">
                <FulfilmentPicker value={mode} onChange={setMode} />
              </div>
            )}

            <div className="mt-3 space-y-2">
              {!scanned && (
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم" className={FIELD} />
              )}
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder={
                  mode === "delivery" || mode === "curbside" ? "رقم الهاتف (مطلوب)" : "رقم الهاتف (اختياري — لجمع النقاط)"
                }
                dir="ltr"
                className={FIELD}
              />
              {mode === "delivery" && (
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="العنوان بالتفصيل — أقرب نقطة دالة" className={FIELD} />
              )}
              {mode === "curbside" && (
                <input value={carNote} onChange={(e) => setCarNote(e.target.value)} placeholder="وصف السيارة (كيا بيضاء…)" className={FIELD} />
              )}
              {mode === "dinein" && !scanned && (
                <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
                  <span className="text-sm font-bold">عدد الأشخاص</span>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setGuests((g) => Math.max(1, g - 1))} aria-label="إنقاص" className="rounded-full border border-[var(--line)] p-1.5"><Minus className="size-4" /></button>
                    <span className="w-6 text-center font-black tabular-nums">{guests}</span>
                    <button type="button" onClick={() => setGuests((g) => Math.min(20, g + 1))} aria-label="زيادة" className="rounded-full border border-[var(--line)] p-1.5"><Plus className="size-4" /></button>
                  </div>
                </div>
              )}
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (بدون مخلل، صوص إضافي، حار…)" className={FIELD} />

              {!scanned && mode && (
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-[var(--panel)] p-1.5">
                  {([["cash", "💵 نقدي"], ["card", "💳 كي كارد"]] as const).map(([k, lbl]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setPayment(k)}
                      className={`rounded-lg py-2 text-sm font-bold transition ${payment === k ? "bg-[var(--accent)] text-[var(--activeink)]" : ""}`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
            <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-3">
              <span className="text-[var(--muted)]">الإجمالي</span>
              <span className="text-xl font-extrabold tabular-nums text-[var(--accent)]">{formatIqdLabel(total)}</span>
            </div>
            <button onClick={checkout} disabled={busy} className="mt-3 w-full rounded-2xl bg-[var(--accent)] py-4 text-lg font-extrabold text-[var(--activeink)] transition active:scale-[0.99] disabled:opacity-60">
              {busy ? "جارٍ الإرسال…" : "إتمام الطلب"}
            </button>
          </div>
        </div>
      )}

      {/* confirmation */}
      {confirmed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={() => setConfirmed(null)}>
          <div style={{ ...(VARS as CSSProperties) }} className="w-full max-w-sm rounded-3xl bg-[var(--panelsoft)] p-8 text-center text-[var(--text)]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-[var(--accent)]"><Check className="size-10 text-[var(--activeink)]" /></div>
            <h2 className="mt-4 text-2xl font-extrabold">تم إرسال طلبك ✓</h2>
            <p className="mt-2 text-[var(--muted)]">رقم الطلب</p>
            <p className="text-4xl font-extrabold text-[var(--accent)]">{confirmed.orderNumber}</p>

            {/* the code is what staff ask for at handover — make it copyable by eye */}
            {confirmed.pickupCode && confirmed.mode !== "dinein" && (
              <div className="mt-4 rounded-2xl border-2 border-[var(--accent)] bg-[var(--panel)] p-3">
                <p className="text-xs font-bold text-[var(--muted)]">رمز الاستلام</p>
                <p className="text-3xl font-black tabular-nums text-[var(--accent)]" dir="ltr">{confirmed.pickupCode}</p>
              </div>
            )}

            <p className="mt-3 text-sm font-bold text-[var(--muted)]">{NEXT_STEP[confirmed.mode](confirmed.table)}</p>
            <button onClick={() => setConfirmed(null)} className="mt-5 w-full rounded-2xl border border-[var(--accent)] py-3 font-bold text-[var(--accent)]">طلب آخر</button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * What the customer is told to do next, per fulfilment mode. Kept out of the
 * component so the four sentences sit side by side and stay consistent — this
 * is the last thing a customer reads, and vague copy here turns into a phone
 * call to the shop.
 */
const NEXT_STEP: Record<FulfilmentMode, (table: string | null) => string> = {
  dinein: (t) => (t ? `طاولتك رقم ${t} — تفضّل بالجلوس وسيصلك طلبك` : "سيدلّك موظفنا على طاولتك"),
  pickup: () => "سنجهّزه خلال ١٥ دقيقة تقريباً — أبرِز الرمز عند الاستلام",
  delivery: () => "سنتصل بك لتأكيد العنوان ثم ينطلق الطلب إليك",
  curbside: () => "سنراسلك على واتساب عند الجاهزية — اتصل بنا قبل وصولك بدقيقتين",
};
