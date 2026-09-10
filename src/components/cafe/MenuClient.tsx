"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Minus, Plus, ShoppingBag, X } from "lucide-react";
import type { MenuCategoryView, MenuItemView } from "@/lib/cafe/menu-data";
import { formatIqdLabel } from "@/lib/cafe/money";
import { submitOrder, type OrderLineInput } from "@/lib/cafe/order-actions";
import { CHANNEL_OF, MODES, missingFields, type FulfilmentMode } from "./FulfilmentPicker";
import { useCart } from "./use-cart";
import { useAttention } from "./use-attention";
import { recommendedFor } from "@/lib/cafe/upsell";
import { cleanPhone } from "@/lib/cafe/phone";
import { imgSrcs, onImgError } from "@/lib/cafe/menu-img";
import { CART_KEY, cartLine, restoreCart } from "@/lib/cafe/cart-storage";
import { MenuIcon } from "./MenuIcon";
import { MealExtras } from "./MealExtras";
import { StationSmiley } from "./Logo";
import { BRAND } from "@/lib/brand";

/**
 * منيو الزبون.
 *
 * قائمة واحدة تُمرَّر من أعلاها إلى أسفلها، كما يقرأ الناس منيو المطاعم على
 * هواتفهم: شرائح أقسام ثابتة تحت الرأس تتبع التمرير، وسطر لكل صنف فيه صورة
 * مربّعة واسم ووصف وسعر، وزرّ إضافة هادئ في طرفه. لا عمود جانبي ولا شبكة
 * مزدحمة ولا أيقونات تهتزّ — الصورة الحقيقية تبيع، والحركة تشتّت.
 *
 * «افتح» غير «أضف»: النقر على جسم السطر يعرض الصنف مكبَّراً، والنقر على «+»
 * وحده يضيفه. هذا ما يعيد الإضافة بنقرة واحدة دون الخطأ القديم، حين كان النقر
 * على الصورة للنظر يطلب الصنف بصمت.
 *
 * السلة تُحفظ على الهاتف — لا على جهاز الطاولة أو الكشك، حيث يلتقطه زبون آخر
 * بعد دقائق. والسعر دائماً من المنيو الحالي لا من المحفوظ.
 */

const FIELD =
  "min-h-12 w-full rounded-xl border border-input bg-card px-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-ring";

/** الجملة الأخيرة التي يقرؤها الزبون — غموضها يصير مكالمة للمطعم. */
const NEXT_STEP: Record<FulfilmentMode, (table: string | null) => string> = {
  dinein: (t) => (t ? `طاولتك رقم ${t} — تفضّل بالجلوس وسيصلك طلبك` : "سيدلّك موظفنا على طاولتك"),
  pickup: () => "سنجهّزه خلال ١٥ دقيقة تقريباً — أبرِز الرمز عند الاستلام",
  delivery: () => "سنتصل بك لتأكيد العنوان ثم ينطلق الطلب إليك",
  curbside: () => "سنراسلك على واتساب عند الجاهزية — اتصل بنا قبل وصولك بدقيقتين",
};

type Sheet = { item: MenuItemView; variantId: string | null; flavor: string | null };

export function MenuClient({
  menu,
  table = null,
  channel = "qr",
  offers = {},
  initialMode = null,
}: {
  menu: MenuCategoryView[];
  table?: string | null;
  channel?: "qr" | "kiosk";
  /** سعر العرض لكل صنف — يحلّ محلّ السعر الأساسي حيث وُجد */
  offers?: Record<string, number>;
  /** من روابط /delivery و/pickup و/car: الطريقة محدَّدة سلفاً */
  initialMode?: FulfilmentMode | null;
}) {
  const scanned = !!table;
  const cats = useMemo(() => menu.filter((c) => c.items.length > 0), [menu]);
  const { lines, total, count, dispatch } = useCart();
  const attention = useAttention();

  const [activeCat, setActiveCat] = useState(cats[0]?.name_ar ?? "");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<FulfilmentMode | null>(scanned ? "dinein" : initialMode);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [carNote, setCarNote] = useState("");
  const [guests, setGuests] = useState(2);
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState<"cash" | "card">("cash");
  const [confirmed, setConfirmed] = useState<{ orderNumber: string; pickupCode: string | null; table: string | null; mode: FulfilmentMode } | null>(null);

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const pillRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const lastTrigger = useRef<HTMLElement | null>(null);

  const priceOf = (it: MenuItemView) => offers[it.id] ?? it.price;
  const cartIds = useMemo(() => new Set(lines.map((l) => l.itemId)), [lines]);
  const qtyOf = (id: string) => lines.filter((l) => l.itemId === id).reduce((s, l) => s + l.qty, 0);

  // ── حفظ السلة على الهاتف فقط ──────────────────────────────────────────────
  const persist = !scanned && channel !== "kiosk";
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!persist) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(CART_KEY);
    } catch {
      /* وضع خاص: لا حفظ */
    }
    dispatch({ type: "hydrate", lines: restoreCart(saved, menu, offers) });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- قراءة واحدة لتخزين الجهاز عند التحميل
    setHydrated(true);
  }, [persist, menu, offers, dispatch]);
  useEffect(() => {
    if (!persist || !hydrated) return;
    try {
      localStorage.setItem(CART_KEY, JSON.stringify({ at: Date.now(), lines }));
    } catch {
      /* وضع خاص */
    }
  }, [persist, hydrated, lines]);

  // ── الشرائح تتبع التمرير ──────────────────────────────────────────────────
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const c = e.target.getAttribute("data-cat");
          if (c) setActiveCat(c);
        }
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    for (const el of Object.values(sectionRefs.current)) if (el) obs.observe(el);
    return () => obs.disconnect();
  }, [cats]);
  useEffect(() => {
    pillRefs.current[activeCat]?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeCat]);
  function goTo(c: string) {
    setActiveCat(c);
    attention.visitCategory(c);
    sectionRefs.current[c]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ── Escape يغلق الورقة والدرج ─────────────────────────────────────────────
  useEffect(() => {
    if (!sheet && !cartOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSheet(null);
        setCartOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, cartOpen]);
  function closeSheet() {
    setSheet(null);
    lastTrigger.current?.focus();
  }

  // ── الإضافة ───────────────────────────────────────────────────────────────
  function addDirect(it: MenuItemView) {
    attention.tap(it.id);
    const { qty: _q, ...line } = cartLine(it, null, null, offers);
    void _q;
    dispatch({ type: "add", line });
  }
  function openSheet(it: MenuItemView, trigger: HTMLElement | null) {
    attention.tap(it.id);
    lastTrigger.current = trigger;
    setSheet({ item: it, variantId: it.variants[0]?.id ?? null, flavor: it.flavors[0] ?? null });
  }
  function addFromSheet() {
    if (!sheet) return;
    const v = sheet.item.variants.find((x) => x.id === sheet.variantId) ?? null;
    const { qty: _q, ...line } = cartLine(sheet.item, v, sheet.flavor, offers);
    void _q;
    dispatch({ type: "add", line });
    closeSheet();
  }
  const sheetUnit = (() => {
    if (!sheet) return 0;
    const v = sheet.item.variants.find((x) => x.id === sheet.variantId) ?? null;
    return cartLine(sheet.item, v, sheet.flavor, offers).unitPrice;
  })();
  // الوجبة هي الخيار الأغلى — بالسعر لا بالكلمة، فكل قسم يسمّيها بكلمة (0072)
  const mealSelected = (() => {
    const prices = sheet?.item.variants.map((v) => v.price) ?? [];
    if (prices.length < 2) return false;
    const top = Math.max(...prices);
    const chosen = sheet?.item.variants.find((x) => x.id === sheet.variantId)?.price;
    return top > Math.min(...prices) && chosen === top;
  })();

  // ── الإرسال ───────────────────────────────────────────────────────────────
  async function checkout() {
    if (!lines.length || busy) return;
    const gap = missingFields(mode, { name, phone, address });
    if (gap) return setErr(gap);
    setBusy(true);
    setErr(null);
    const payload: OrderLineInput[] = lines.map((l) => ({ item_id: l.itemId, variant_id: l.variantId, flavor: l.flavor, qty: l.qty }));
    // «#auto» يطلب من الخادم حجز طاولة حرّة داخل معاملة الطلب نفسها
    const tableArg = scanned ? table : mode === "dinein" ? "#auto" : null;
    const res = await submitOrder({
      channel: scanned ? channel : CHANNEL_OF[mode!],
      table: tableArg,
      lines: payload,
      name: name.trim() || null,
      // موحَّد: +964 و07 والأرقام العربية كلّها زبون واحد وبطاقة ولاء واحدة
      phone: cleanPhone(phone) || null,
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
    attention.reset();
    setConfirmed({ orderNumber: res.orderNumber, pickupCode: res.pickupCode ?? null, table: res.table ?? table ?? null, mode: mode ?? "dinein" });
  }

  // «داخل المطعم» خيار فقط لمن جاء برابطه؛ من الشارع يختار من ثلاثة
  const modes = MODES.filter((m) => m.mode !== "dinein" || initialMode === "dinein");

  return (
    <div dir="rtl" className="touch-pos min-h-dvh bg-background text-foreground">
      <p className="sr-only" aria-live="polite">
        {count} في السلة
      </p>

      {/* ── الرأس ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <StationSmiley className="size-9 text-primary" />
            <div className="leading-tight">
              <p className="station-script text-2xl text-primary">{BRAND.nameLatin}</p>
              <p className="-mt-1 text-[11px] font-bold text-muted-foreground">{BRAND.taglineAr}</p>
            </div>
          </div>
          {scanned && <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-black text-primary">🍽️ طاولة {table}</span>}
        </div>
        <nav aria-label="الأقسام" className="mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none]">
          {cats.map((c) => {
            const on = c.name_ar === activeCat;
            return (
              <button
                key={c.name_ar}
                ref={(el) => {
                  pillRefs.current[c.name_ar] = el;
                }}
                onClick={() => goTo(c.name_ar)}
                aria-current={on ? "true" : undefined}
                className={`min-h-10 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-black transition ${
                  on ? "bg-primary text-primary-foreground shadow-[var(--shadow-station)]" : "bg-secondary text-foreground"
                }`}
              >
                {c.name_ar}
              </button>
            );
          })}
        </nav>
      </header>

      {/* ── الأقسام ────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-2xl px-4 pb-32">
        {cats.map((cat) => (
          <section
            key={cat.name_ar}
            data-cat={cat.name_ar}
            ref={(el) => {
              sectionRefs.current[cat.name_ar] = el;
            }}
            className="scroll-mt-28"
          >
            <h2 className="mb-1 mt-6 text-xl font-black">{cat.name_ar}</h2>
            <ul className="divide-y divide-border">
              {cat.items.map((it) => {
                const s = imgSrcs(it.image_url);
                const price = priceOf(it);
                const onOffer = price !== it.price;
                const needsSheet = it.variants.length > 0 || it.flavors.length > 0;
                const qty = qtyOf(it.id);
                const plainKey = `${it.id}||`;
                return (
                  <li key={it.id} ref={attention.track(it.id, cat.name_ar)} className="flex items-center gap-3 py-3">
                    {/* جسم السطر: يفتح الصنف للنظر */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e) => openSheet(it, e.currentTarget)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openSheet(it, e.currentTarget);
                        }
                      }}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="grid size-[88px] shrink-0 place-items-center overflow-hidden rounded-2xl bg-secondary">
                        {s ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.sm} data-full={s.full} alt="" loading="lazy" onError={onImgError} className="size-full object-cover" />
                        ) : (
                          <MenuIcon name={it.name_ar} category={cat.name_ar} animated={false} className="size-8 text-primary" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 font-black leading-snug">{it.name_ar}</p>
                        {it.description && <p className="mt-0.5 line-clamp-1 text-sm font-bold text-muted-foreground">{it.description}</p>}
                        <p className="mt-1 flex items-center gap-2 font-extrabold tabular-nums text-primary">
                          {price > 0 ? formatIqdLabel(price) : "مجاناً"}
                          {onOffer && (
                            <>
                              <s className="text-xs font-bold text-muted-foreground">{formatIqdLabel(it.price)}</s>
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-black text-primary">عرض</span>
                            </>
                          )}
                          {it.variants.length > 1 && !onOffer && <span className="text-xs font-bold text-muted-foreground">يبدأ من</span>}
                        </p>
                      </div>
                    </div>

                    {/* الطرف الأيسر: أضف، أو غيّر العدد */}
                    {!needsSheet && qty > 0 ? (
                      <div className="flex shrink-0 items-center rounded-full border-2 border-primary">
                        <button onClick={() => dispatch({ type: "dec", key: plainKey })} aria-label={`إنقاص ${it.name_ar}`} className="grid size-11 place-items-center text-primary">
                          <Minus className="size-4" />
                        </button>
                        <span className="w-6 text-center font-black tabular-nums">{qty}</span>
                        <button onClick={() => dispatch({ type: "inc", key: plainKey })} aria-label={`زيادة ${it.name_ar}`} className="grid size-11 place-items-center text-primary">
                          <Plus className="size-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => (needsSheet ? openSheet(it, e.currentTarget) : addDirect(it))}
                        aria-label={`أضف ${it.name_ar}`}
                        className="relative grid size-11 shrink-0 place-items-center rounded-full border-2 border-primary text-primary transition active:scale-95"
                      >
                        <Plus className="size-5" />
                        {qty > 0 && (
                          <span className="absolute -top-1.5 -left-1.5 grid size-5 place-items-center rounded-full bg-primary text-[11px] font-black text-primary-foreground">
                            {qty}
                          </span>
                        )}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <p className="mt-10 text-center text-xs font-bold text-muted-foreground">
          {BRAND.addressAr} · {BRAND.phoneDisplay}
        </p>
      </main>

      {/* ── شريط السلة ──────────────────────────────────────────────────── */}
      {count > 0 && !cartOpen && !confirmed && !sheet && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-2xl p-3">
          <button
            onClick={() => setCartOpen(true)}
            className="flex min-h-14 w-full items-center justify-between rounded-2xl bg-primary px-5 text-primary-foreground shadow-[var(--shadow-station-lg)] transition active:scale-[0.99]"
          >
            <span className="flex items-center gap-2 font-black">
              <ShoppingBag className="size-5" />
              عرض السلة
              <span className="rounded-full bg-white/20 px-2 text-sm">{count}</span>
            </span>
            <span className="text-lg font-black tabular-nums">{formatIqdLabel(total)}</span>
          </button>
        </div>
      )}

      {/* ── ورقة الصنف ──────────────────────────────────────────────────── */}
      {sheet && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center" onClick={closeSheet}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sheet-title"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card p-5 shadow-[var(--shadow-station-lg)] sm:rounded-3xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 id="sheet-title" className="text-xl font-black">
                {sheet.item.name_ar}
              </h3>
              <button autoFocus onClick={closeSheet} aria-label="إغلاق" className="grid size-11 place-items-center rounded-full bg-secondary">
                <X className="size-5" />
              </button>
            </div>
            {(() => {
              const s = imgSrcs(sheet.item.image_url);
              return s ? (
                <div className="mb-3 aspect-[4/3] overflow-hidden rounded-2xl bg-secondary">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.full} alt={sheet.item.name_ar} className="size-full object-cover" />
                </div>
              ) : null;
            })()}
            {sheet.item.description && <p className="mb-3 text-sm font-bold leading-relaxed text-muted-foreground">{sheet.item.description}</p>}

            {sheet.item.variants.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 text-xs font-black text-muted-foreground">اختر الحجم</p>
                <div className="flex flex-wrap gap-2">
                  {sheet.item.variants.map((v) => {
                    const on = v.id === sheet.variantId;
                    const p = cartLine(sheet.item, v, null, offers).unitPrice;
                    return (
                      <button
                        key={v.id}
                        onClick={() => setSheet({ ...sheet, variantId: v.id })}
                        aria-pressed={on}
                        className={`min-h-11 rounded-xl border-2 px-4 font-black transition ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}
                      >
                        {v.name_ar} · {formatIqdLabel(p)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {sheet.item.flavors.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 text-xs font-black text-muted-foreground">اختر النكهة</p>
                <div className="flex flex-wrap gap-2">
                  {sheet.item.flavors.map((f) => {
                    const on = f === sheet.flavor;
                    return (
                      <button
                        key={f}
                        onClick={() => setSheet({ ...sheet, flavor: f })}
                        aria-pressed={on}
                        className={`min-h-11 rounded-xl border-2 px-4 font-black transition ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {mealSelected && <MealExtras />}
            <button onClick={addFromSheet} className="min-h-14 w-full rounded-2xl bg-primary text-lg font-black text-primary-foreground transition active:scale-[0.99]">
              أضف للسلة · {formatIqdLabel(sheetUnit)}
            </button>
          </div>
        </div>
      )}

      {/* ── درج السلة ───────────────────────────────────────────────────── */}
      {cartOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setCartOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-title"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card p-5 shadow-[var(--shadow-station-lg)] sm:rounded-3xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 id="cart-title" className="text-xl font-black">
                سلة الطلب
              </h3>
              <button autoFocus onClick={() => setCartOpen(false)} aria-label="إغلاق" className="grid size-11 place-items-center rounded-full bg-secondary">
                <X className="size-5" />
              </button>
            </div>

            <ul className="divide-y divide-border">
              {lines.map((l) => (
                <li key={l.key} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-black">{l.name}</p>
                    <p className="text-sm font-bold text-muted-foreground tabular-nums">{formatIqdLabel(l.unitPrice * l.qty)}</p>
                  </div>
                  <div className="flex shrink-0 items-center rounded-full border-2 border-primary">
                    <button onClick={() => dispatch({ type: "dec", key: l.key })} aria-label="إنقاص" className="grid size-11 place-items-center text-primary">
                      <Minus className="size-4" />
                    </button>
                    <span className="w-6 text-center font-black tabular-nums">{l.qty}</span>
                    <button onClick={() => dispatch({ type: "inc", key: l.key })} aria-label="زيادة" className="grid size-11 place-items-center text-primary">
                      <Plus className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
              {lines.length === 0 && <li className="py-6 text-center text-sm font-bold text-muted-foreground">السلة فارغة</li>}
            </ul>

            {/* «مقترح لك» — ممّا نظر إليه هذا الزبون في هذه الجلسة */}
            {(() => {
              const recs = recommendedFor({ menu, rankedItemIds: attention.ranked().map((r) => r.id), topCategories: attention.topCategories(), inCart: cartIds });
              if (!recs.length) return null;
              return (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-black text-muted-foreground">مقترح لك</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {recs.map((r) => (
                      <button key={r.id} onClick={() => addDirect(r)} className="w-28 shrink-0 rounded-xl border-2 border-border bg-background p-2 text-center transition active:scale-95">
                        <p className="truncate text-xs font-black">{r.name_ar}</p>
                        <p className="text-xs font-extrabold text-primary">{formatIqdLabel(priceOf(r))}</p>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {!scanned && (
              <div className="mt-4">
                <p className="mb-1.5 text-xs font-black text-muted-foreground">كيف تريد طلبك؟</p>
                <div className={`grid gap-1 rounded-2xl bg-secondary p-1 ${modes.length === 4 ? "grid-cols-2" : "grid-cols-3"}`}>
                  {modes.map(({ mode: m, label, icon: Icon }) => {
                    const on = mode === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        aria-pressed={on}
                        className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs font-black transition ${on ? "bg-primary text-primary-foreground shadow-[var(--shadow-station)]" : "text-foreground"}`}
                      >
                        <Icon className="size-5" />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-3 space-y-2">
              {!scanned && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم" className={FIELD} />}
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder={mode === "delivery" || mode === "curbside" ? "رقم الهاتف (مطلوب)" : "رقم الهاتف (اختياري — لجمع النقاط)"}
                dir="ltr"
                className={FIELD}
              />
              {mode === "delivery" && <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="العنوان بالتفصيل — أقرب نقطة دالة" className={FIELD} />}
              {mode === "curbside" && <input value={carNote} onChange={(e) => setCarNote(e.target.value)} placeholder="وصف السيارة (كيا بيضاء…)" className={FIELD} />}
              {mode === "dinein" && !scanned && (
                <div className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2">
                  <span className="text-sm font-black">عدد الأشخاص</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setGuests((g) => Math.max(1, g - 1))} aria-label="إنقاص" className="grid size-10 place-items-center rounded-full border border-border">
                      <Minus className="size-4" />
                    </button>
                    <span className="w-6 text-center font-black tabular-nums">{guests}</span>
                    <button type="button" onClick={() => setGuests((g) => Math.min(20, g + 1))} aria-label="زيادة" className="grid size-10 place-items-center rounded-full border border-border">
                      <Plus className="size-4" />
                    </button>
                  </div>
                </div>
              )}
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (بدون مخلل، صوص إضافي، حار…)" className={FIELD} />
              {!scanned && mode && (
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
                  {([["cash", "💵 نقدي"], ["card", "💳 كي كارد"]] as const).map(([k, lbl]) => (
                    <button key={k} type="button" onClick={() => setPayment(k)} aria-pressed={payment === k} className={`min-h-10 rounded-lg text-sm font-black transition ${payment === k ? "bg-primary text-primary-foreground" : ""}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {err && <p className="mt-2 text-sm font-bold text-destructive">{err}</p>}
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <span className="font-bold text-muted-foreground">الإجمالي</span>
              <span className="text-2xl font-black tabular-nums text-primary">{formatIqdLabel(total)}</span>
            </div>
            <button onClick={checkout} disabled={busy || lines.length === 0} className="mt-3 min-h-14 w-full rounded-2xl bg-primary text-lg font-black text-primary-foreground transition active:scale-[0.99] disabled:opacity-60">
              {busy ? "جارٍ الإرسال…" : "إتمام الطلب"}
            </button>
          </div>
        </div>
      )}

      {/* ── تم ──────────────────────────────────────────────────────────── */}
      {confirmed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6">
          <div className="w-full max-w-sm text-center">
            <div className="mx-auto mb-4 grid size-20 place-items-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-10" strokeWidth={3} />
            </div>
            <p className="text-xl font-black">تم إرسال طلبك</p>
            <p className="mt-1 text-sm font-bold text-muted-foreground">رقم طلبك</p>
            <p className="text-7xl font-black tabular-nums text-primary">{confirmed.orderNumber}</p>
            {confirmed.pickupCode && confirmed.mode !== "dinein" && (
              <div className="mx-auto mt-3 w-fit rounded-2xl border-2 border-dashed border-primary px-6 py-2">
                <p className="text-xs font-black text-muted-foreground">رمز الاستلام</p>
                <p dir="ltr" className="text-4xl font-black tracking-widest text-primary">
                  {confirmed.pickupCode}
                </p>
              </div>
            )}
            <p className="mt-4 text-sm font-bold leading-relaxed">{NEXT_STEP[confirmed.mode](confirmed.table)}</p>
            <button onClick={() => setConfirmed(null)} className="mt-6 min-h-12 w-full rounded-2xl bg-primary font-black text-primary-foreground">
              طلب جديد
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
