"use client";
import { lateCutoffState } from "@/lib/cafe/time";

import { orderAcceptedLink } from "@/lib/brand";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { FreshBuild } from "@/components/cafe/FreshBuild";
import {
  Check,
  MessageCircle,
  Minus,
  Pencil,
  Plus,
  Printer,
  Trash2, Search } from "lucide-react";
import type { MenuCategoryView, MenuItemView } from "@/lib/cafe/menu-data";
import { cheapestVariant } from "@/lib/cafe/variant";
import { formatIqdLabel } from "@/lib/cafe/money";
import { cashierCheckout, type PayMethod } from "@/lib/cafe/cashier-actions";
import type { Partner } from "@/lib/cafe/partner-actions";
import { buildOrderJobs, buildReceiptJob } from "@/lib/cafe/printer-actions";
import {
  printJobs,
  kickDrawer as kickDrawerAgent,
} from "@/lib/cafe/print-client";
import { claimPrint, releasePrint } from "@/lib/cafe/print-spool-actions";
import { redeemReward, type Card } from "@/lib/cafe/loyalty-actions";
import { Receipt, type ReceiptData } from "./Receipt";
import { MenuIcon } from "./MenuIcon";
import { CallBanner } from "./CallBanner";
import { ShortageAlert } from "./ShortageAlert";
import {
  customerForCall,
  rememberAddress,
  type LastLine,
} from "@/lib/cafe/call-actions";
import { cleanPhone, normalizeIraqiPhone } from "@/lib/cafe/phone";
import { needsName } from "@/lib/cafe/customer-required";
import { useShortcut } from "./use-shortcut";
import { searchMenu } from "@/lib/cafe/menu-lang";
import { LateDrawerNotice } from "./LateDrawerNotice";
import { FridayPrayerNotice } from "./FridayPrayerNotice";
import { PartnerLogo } from "./PartnerLogo";
import { cloneMenuItem } from "@/lib/cafe/menu-actions-cashier";

type Line = {
  key: string;
  itemId: string;
  name: string;
  variantId: string | null;
  flavor: string | null;
  unitPrice: number;
  qty: number;
  /** «بدون بصل» — on this line; part of the key, so two burgers with two notes are two lines */
  note: string | null;
};
type Cart = Record<string, Line>;
type CartAction =
  | { type: "add"; line: Omit<Line, "qty"> }
  | { type: "inc"; key: string }
  | { type: "dec"; key: string }
  /** the pencil: a line edited in place, possibly under a new key */
  | { type: "replace"; key: string; line: Line }
  /** drop a whole basket in at once — repeating a previous order */
  | { type: "load"; lines: Line[] }
  | { type: "clear" };

const lineKey = (l: Pick<Line, "itemId" | "variantId" | "flavor" | "note">) =>
  `${l.itemId}|${l.variantId ?? ""}|${l.flavor ?? ""}|${l.note ?? ""}`;

function cartReducer(state: Cart, action: CartAction): Cart {
  switch (action.type) {
    case "replace": {
      const n = { ...state };
      delete n[action.key];
      const ex = n[action.line.key];
      n[action.line.key] = ex
        ? { ...action.line, qty: ex.qty + action.line.qty }
        : action.line;
      return n;
    }
    case "add": {
      const ex = state[action.line.key];
      return {
        ...state,
        [action.line.key]: { ...action.line, qty: (ex?.qty ?? 0) + 1 },
      };
    }
    case "inc": {
      const l = state[action.key];
      return l ? { ...state, [action.key]: { ...l, qty: l.qty + 1 } } : state;
    }
    case "dec": {
      const l = state[action.key];
      if (!l) return state;
      if (l.qty <= 1) {
        const n = { ...state };
        delete n[action.key];
        return n;
      }
      return { ...state, [action.key]: { ...l, qty: l.qty - 1 } };
    }
    case "load":
      return Object.fromEntries(action.lines.map((l) => [l.key, l]));
    case "clear":
      return {};
  }
}

/**
 * 44px — the smallest thing a finger hits reliably without looking.
 *
 * A cashier at a rush is not aiming; they are glancing at the queue and tapping
 * from memory. The controls that were 18–22px here are also the ones that cost
 * the most when missed: the size chip that sets the price, and the qty buttons
 * that decide how many. Density is worth less than not having to re-ring an order.
 */
const TAP = "grid min-h-11 min-w-11 place-items-center";

export function CashierClient({
  menu: menuProp,
  tables,
  partners = [],
  cashierName = null,
  expediterName = null,
}: {
  menu: MenuCategoryView[];
  tables: string[];
  /** شركات التوصيل النشطة — an empty list hides the whole postpaid option */
  partners?: Partner[];
  /** كابتن الطلب — printed on every slip */
  cashierName?: string | null;
  /** اسم المجهّز — whoever holds the expediter shift right now */
  expediterName?: string | null;
}) {
  // local copy: a cloned item goes on the grid now, not after the server's 30 s menu cache
  const [menu, setMenu] = useState(menuProp);
  const [activeCat, setActiveCat] = useState(menuProp[0]?.name_ar ?? "");
  const [cart, dispatch] = useReducer(cartReducer, {});
  const [discountIqd, setDiscountIqd] = useState(0);
  // الخصم بالنسبة: المحل يقول «خصم عشرين بالمئة» لا «خصم ٣٬٤٥٠». الدينار يبقى
  // مصدر الحقيقة المُرسَل للخادم، والنسبة تُحسب عليه كلّما تغيّرت السلة.
  const [discountPct, setDiscountPct] = useState(0);
  const [discountMode, setDiscountMode] = useState<"iqd" | "pct">("iqd");
  const [customer, setCustomer] = useState<Card | null>(null);
  const [loyaltyMsg, setLoyaltyMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [success, setSuccess] = useState<{
    orderNumber: string;
    awarded: number;
    /** wa.me with «تم استلام طلبك رقم N» ready — for any order that has a phone */
    waLink: string | null;
  } | null>(null);
  // «واتساب تلقائي بعد الطلب» — per-device, set on the incoming-orders page
  const autoWaRef = useRef(false);
  // cash opens the drawer; Qi-card payments happen on the Qi device — no drawer.
  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  // «على حساب أحمد» — من يدفع لاحقاً؛ يُسجَّل في الديون باسمه
  // فارغ = اسم الزبون المكتوب أعلاه؛ يُكتب فقط حين يدفع شخص غير الزبون
  const [debtorName, setDebtorName] = useState("");
  const [partnerId, setPartnerId] = useState<string>("");
  // شركة «مخصّص» (زاد): ما دفعه المندوب الآن — فارغ يعني كامل المبلغ
  const [partnerCash, setPartnerCash] = useState<string>("");
  // dine-in orders carry a table number → they show on the live tables screen.
  // «توصيل» is the counter's word for everything that leaves: the phone order
  // being keyed in. It stays channel `cashier` — the delivery channel numbers
  // from 901 (0043) and the customer block prints on phone/address, not channel.
  const [orderType, setOrderType] = useState<
    "delivery" | "dinein" | "takeaway"
  >("delivery");
  const [tableNo, setTableNo] = useState("");
  // the pencil on a cart line: name / price / qty / note. A new name or price
  // becomes a menu item (cloneMenuItem) so it can be ordered again tomorrow.
  const [edit, setEdit] = useState<{
    key: string;
    name: string;
    price: string;
    qty: string;
    note: string;
  } | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  // الزبون على الهاتف: كان يُكتب في الملاحظة «المستودع { 07866866156 }» ويضيع
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custAddress, setCustAddress] = useState("");
  // «+ تقييم كوكل» — يؤشّرها الكاشير على الطلب وهو يبيع. لا تُرسل لكل زبون
  // عمداً: هو الذي رأى الزبون وعرف إن خرج راضياً
  const [askReview, setAskReview] = useState(false);
  // البحث عن صنف: الشاشة لم يكن فيها بحثٌ قطّ، والموظّف ينتقل بين سبعة أقسام
  // ليجد صنفاً من مئة وخمسة عشر — تسعاً وتسعين مرّة في اليوم
  const [itemQ, setItemQ] = useState("");
  const searchBox = useRef<HTMLInputElement>(null);
  // الاسم صار مطلوباً مع كل رقم (قرار المالك): الشاشة تمنع قبل الضغط، والخادم
  // يمنع أيضاً — والقاعدة مكتوبة مرّة في customer-required فلا تفترق النسختان.
  // وداخل المطعم مستثنًى لأن الرقم لا يُرسَل أصلاً في هذا النوع.
  const nameMissing = orderType !== "dinein" && needsName(custPhone, custName);
  const [orderNote, setOrderNote] = useState("");
  // itemized surcharges for add-ons the customer requests (extra shot, syrup…)
  const [extras, setExtras] = useState<{ name: string; price: number }[]>([]);
  const [extraPrice, setExtraPrice] = useState(0);
  const [printWarn, setPrintWarn] = useState<string | null>(null);
  const [saleNote, setSaleNote] = useState<string | null>(null);

  // cash drawer: device setting managed on the /orders screen (same localStorage key).
  const drawerKickRef = useRef(false);
  const kickBusyRef = useRef(false);
  const checkoutBusyRef = useRef(false);
  // read inside the print effect, which must not re-run when payMethod changes
  const payMethodRef = useRef(payMethod);
  useEffect(() => {
    payMethodRef.current = payMethod;
  }, [payMethod]);
  useEffect(() => {
    drawerKickRef.current = localStorage.getItem("st-drawer") === "1";
    autoWaRef.current = localStorage.getItem("st-auto-wa") === "1";
  }, []);
  function kickDrawer() {
    // guard against a double-open if the pay action ever fires twice in quick succession
    if (!drawerKickRef.current || kickBusyRef.current) return;
    kickBusyRef.current = true;
    setTimeout(() => {
      kickBusyRef.current = false;
    }, 2500);
    void kickDrawerAgent();
  }

  // Printing on checkout goes through the local agent, and ONLY the agent: the
  // customer receipt, each busy station, and the expediter ticket - two slips
  // in this shop, where the station printers are off.
  //
  // There used to be a second path: any failure fell back to window.print(),
  // which under --kiosk-printing goes to the Windows default printer - the very
  // same POS80. So every hiccup the agent reported (including a false one) put
  // a THIRD slip on the counter, a second customer receipt, and the owner
  // asked for two. Nothing automatic prints through the browser any more; the
  // «طباعة المتصفح» button below is there for the cashier who wants it.
  // Nothing here can block the sale: this runs AFTER checkout has committed.
  useEffect(() => {
    if (!receipt?.orderId) return;
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        // Exactly one printer prints an order. The claim is an atomic update
        // (printed_at is null → now) raced by every spooler on every open
        // tab; whoever wins prints, the rest stand down. It used to be
        // claimed AFTER printing — and the spooler on another tab, polling in
        // that gap, printed the same order again: four receipts for one
        // bottle of water on the counter. Claim and build in parallel so the
        // paper is not a round trip later.
        const orderId = receipt.orderId!;
        const [mine, { jobs, unrouted }] = await Promise.all([
          claimPrint(orderId).catch(() => true),
          buildOrderJobs(orderId, { kickDrawer: drawerKickRef.current && payMethodRef.current === "cash" }),
        ]);
        if (cancelled) return;
        if (!mine) return; // another tab printed it
        const out = jobs.length
          ? await printJobs(jobs)
          : { sent: 0, queued: 0, agent: false, skipped: [], errors: [] };
        if (cancelled) return;
        // nothing reached a printer here: hand it back so the spooler retries
        if (out.sent === 0 && jobs.length) void releasePrint(orderId).catch(() => {});
        // All three warnings, not one of them. These were an if/else chain, so a
        // shop with any permanently-unrouted category (sauces legitimately are)
        // could NEVER see «تذكرة لم تُطبع» — the printer-down warning was dead
        // in exactly the shops most likely to need it.
        const warn = [
          out.skipped.length
            ? `لم تُضبط طابعة: ${[...new Set(out.skipped)].join("، ")}`
            : "",
          // the agent's own words when it has them: «Offline», «PaperOut» — not a guess
          out.queued > 0
            ? `${out.queued} تذكرة لم تُطبع — ${out.errors[0] ?? "الطابعة غير متاحة."}`
            : "",
          unrouted.length ? `لا توجد محطة لـ: ${unrouted.join("، ")}` : "",
        ].filter(Boolean);
        if (warn.length) setPrintWarn(warn.join(" · "));
      } catch {
        if (!cancelled)
          setPrintWarn(
            "تعذّرت الطباعة — استعمل «طباعة المتصفح» أو أعد طباعة الإيصال.",
          );
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [receipt]);

  // إعادة طباعة إيصال الزبون: نسخة للزبون، وأخرى إن طلبها، بلا إعادة بيع
  const [copies, setCopies] = useState(1);
  const [reprint, setReprint] = useState<string | null>(null);
  async function printCustomerReceipt() {
    if (!receipt?.orderId) return;
    setReprint("…");
    try {
      const job = await buildReceiptJob(receipt.orderId!, copies);
      if (!job) {
        setReprint("لا توجد طابعة كاشير مفعّلة.");
        return;
      }
      const out = await printJobs([job]);
      // out.sent يعني الآن «الوكيل قَبِلها» فعلاً، لا «غادرت المتصفح»
      setReprint(
        out.sent > 0
          ? `طُبعت ${copies} نسخة ✓`
          : (out.errors[0] ?? "الطابعة لم تستجب — جرّب مرة أخرى."),
      );
    } catch {
      setReprint("تعذّرت الطباعة.");
    }
  }

  const lines = Object.values(cart);
  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.unitPrice * l.qty, 0),
    [lines],
  );
  const extraTotal = useMemo(
    () => extras.reduce((s, x) => s + x.price, 0),
    [extras],
  );
  const discountBase = subtotal + extraTotal;
  // محسوب لا محفوظ: النسبة تتبع السلة من تلقائها، فلا حالة تُنسى تحديثها
  const discount =
    discountMode === "pct"
      ? Math.min(discountBase, Math.round((discountBase * discountPct) / 100))
      : discountIqd;
  const total = Math.max(0, subtotal - discount + extraTotal);

  function addExtra() {
    // description is verbal at the counter — the cashier only enters the amount
    const price = Math.max(0, Math.round(extraPrice || 0));
    if (price <= 0) return;
    setExtras((xs) => [...xs, { name: "إضافة", price }]);
    setExtraPrice(0);
  }
  const cat = menu.find((c) => c.name_ar === activeCat) ?? menu[0];
  // نتيجة البحث تحلّ محلّ القسم المفتوح، و`null` تعني «لا بحث جارٍ»
  const found = itemQ.trim() ? searchMenu(menu, itemQ) : null;
  // الصنف الموجود بالبحث يأتي من قسمٍ آخر، واسم قسمه يلزم عند الإضافة
  const catOf = useMemo(() => new Map(menu.flatMap((c) => c.items.map((i) => [i.id, c.name_ar] as const))), [menu]);

  async function saveEdit() {
    if (!edit) return;
    const cur = cart[edit.key];
    if (!cur) return setEdit(null);
    const name = edit.name.trim();
    const price = Math.max(0, Math.round(Number(edit.price) || 0));
    const qty = Math.max(1, Math.round(Number(edit.qty) || 1));
    const note = edit.note.trim() || null;
    if (!name) return setEditErr("أدخل اسم الصنف.");
    let line: Line = { ...cur, qty, note };
    if (name !== cur.name || price !== cur.unitPrice) {
      setEditBusy(true);
      setEditErr(null);
      try {
        const res = await cloneMenuItem({
          fromItemId: cur.itemId,
          name_ar: name,
          price,
        });
        if (!res.ok) return setEditErr(res.error);
        const it = res.item;
        // the clone carries no size variant (place_order rejects a variant of another item)
        line = {
          ...line,
          itemId: it.id,
          name: it.name_ar,
          unitPrice: it.price,
          variantId: null,
          flavor:
            cur.flavor && it.flavors.includes(cur.flavor) ? cur.flavor : null,
        };
        setMenu((ms) =>
          ms.map((c) => {
            const src = c.items.find((i) => i.id === cur.itemId);
            if (!src) return c;
            const exists = c.items.some((i) => i.id === it.id);
            return exists
              ? {
                  ...c,
                  items: c.items.map((i) =>
                    i.id === it.id ? { ...i, price: it.price } : i,
                  ),
                }
              : {
                  ...c,
                  items: [
                    ...c.items,
                    {
                      ...src,
                      id: it.id,
                      name_ar: it.name_ar,
                      price: it.price,
                      flavors: it.flavors,
                      variants: [],
                    },
                  ],
                };
          }),
        );
      } catch {
        return setEditErr("تعذّر الحفظ — تأكد من الاتصال.");
      } finally {
        setEditBusy(false);
      }
    }
    dispatch({
      type: "replace",
      key: edit.key,
      line: { ...line, key: lineKey(line) },
    });
    setEdit(null);
  }

  /** the ringing number — or a typed one — becomes the order's customer, existing or brand new */
  async function attachCaller(phone: string) {
    const cust = await customerForCall(phone);
    if (!cust) {
      setLoyaltyMsg("تعذّر ربط الرقم بالطلب.");
      return;
    }
    setCustomer({ id: cust.id, name_ar: cust.name_ar, points: cust.points });
    // what we know about them fills the delivery fields — nothing typed is overwritten
    setCustPhone((p) => p || phone);
    if (cust.name_ar) setCustName((n) => n || cust.name_ar!);
    if (cust.address) setCustAddress((a) => a || cust.address!);
  }

  async function redeem() {
    if (!customer) return;
    setLoyaltyMsg(null);
    const res = await redeemReward(customer.id, total);
    if (!res.ok) {
      setLoyaltyMsg(res.error);
      return;
    }
    // ponytail: redeem deducts points immediately, before payment — a cancelled
    // checkout needs a manual adjust-back. Acceptable v1.
    setDiscountMode("iqd");
    setDiscountPct(0);
    setDiscountIqd((d) => d + res.discount);
    setCustomer({ ...customer, points: res.balance });
    setLoyaltyMsg(`تم استبدال مكافأة — خصم ${formatIqdLabel(res.discount)}`);
  }

  /**
   * اختصارات شاشة الكاشير — هنا لا في القشرة: السلّة وطريقة الدفع ونافذة
   * النجاح كلّها حالةُ هذا المكوّن، ولا تراها القشرة.
   *
   * وكلّها تمرّ بنفس شروط الأزرار: F9 لا يدفع سلّةً فارغة ولا طلباً ينقصه
   * اسمُ صاحب الرقم، تماماً كالزرّ المعطَّل بجانبه.
   */
  const payBlocked =
    busy ||
    lines.length === 0 ||
    (payMethod === "partner" && !partnerId) ||
    (payMethod === "debt" && !debtorName.trim() && !custName.trim()) ||
    nameMissing;

  useShortcut("F2", true, () => {
    searchBox.current?.focus();
    searchBox.current?.select();
  });
  useShortcut("F9", !payBlocked, () => void checkout());
  useShortcut("F10", success !== null, () => void printCustomerReceipt());
  // «طلب جديد»: يغلق نافذة النجاح إن كانت مفتوحة — وهي الحالة الشائعة بعد كل
  // بيع — وإلا يُفرغ سلّةً نصفَ مكتوبة، وذلك يُسأل عنه
  useShortcut("F8", true, () => {
    if (success) return setSuccess(null);
    if (!lines.length) return;
    if (confirm("إفراغ السلّة والبدء بطلب جديد؟")) dispatch({ type: "clear" });
  });

  async function checkout() {
    // checkoutBusyRef is synchronous — `busy` state updates a tick later, so a
    // rapid double-tap would otherwise submit twice (double order + double drawer).
    if (!lines.length || checkoutBusyRef.current || busy) return;
    if (orderType === "dinein" && !tableNo) {
      setErr("اختر رقم الطاولة.");
      return;
    }
    checkoutBusyRef.current = true;
    setBusy(true);
    setErr(null);
    // try/finally so the button ALWAYS unsticks — a thrown action (expired
    // session, network drop) must never freeze the cashier on «جار التنفيذ».
    try {
      const table = orderType === "dinein" ? tableNo : null;
      const extraNote =
        extras
          .map((x) => `${x.name} (${formatIqdLabel(x.price)})`)
          .join("، ") || null;
      const payload = lines.map((l) => ({
        item_id: l.itemId,
        variant_id: l.variantId,
        flavor: l.flavor,
        qty: l.qty,
        note: l.note,
      }));
      // الاسم في الأنواع الثلاثة، والهاتف للسفري والتوصيل، والعنوان للتوصيل وحده
      const cust = {
        customerName: custName.trim() || null,
        phone: orderType === "dinein" ? null : custPhone.trim() || null,
        address: orderType === "delivery" ? custAddress.trim() || null : null,
      };
      const channel =
        orderType === "takeaway" ? ("takeaway" as const) : ("cashier" as const);
      const res = await cashierCheckout({
        lines: payload,
        askReview: askReview && !!cust.phone,
        discount,
        extra: extraTotal,
        extraNote,
        payMethod,
        partnerId: payMethod === "partner" ? partnerId : null,
        partnerCashReceived:
          payMethod === "partner" && partnerCash.trim() !== ""
            ? Number(partnerCash)
            : null,
        debtorName:
          payMethod === "debt" ? debtorName.trim() || custName.trim() : null,
        debtorPhone: payMethod === "debt" ? custPhone : null,
        customerId: customer?.id ?? null,
        table,
        note: orderNote.trim() || null,
        channel,
        ...cust,
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      // «حُفظ على هذا الجهاز» / «لم يُنسب للوردية» — the sale stands; the cashier must know which
      setSaleNote(res.warning ?? null);
      setReceipt({
        orderId: res.orderId,
        // the QR encodes orders.id so the expediter can scan the slip — the
        // same payload routeOrder puts on the ESC/POS assembly ticket
        qr: res.orderId,
        orderNumber: res.orderNumber,
        cashierName,
        expediterName,
        channel,
        pickupCode: res.pickupCode ?? null,
        table,
        note: orderNote.trim() || null,
        customerName: cust.customerName,
        customerPhone: cust.phone,
        customerAddress: cust.address,
        lines: lines.map((l) => ({
          name: l.name,
          flavor: l.flavor,
          qty: l.qty,
          unitPrice: l.unitPrice,
        })),
        subtotal,
        discount,
        extras,
        total,
        dateTime: new Date().toLocaleString("en-GB", {
          timeZone: "Asia/Baghdad",
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }),
      });
      if (payMethod === "cash") kickDrawer();
      // any customer with a phone — a delivery, a takeaway, or a caller whose
      // number the cashier typed — gets their order number on WhatsApp. The
      // shop's WhatsApp Web is open on this PC: the chat opens with the text
      // ready and the cashier taps send. No API, no template.
      const waPhone =
        cust.phone && normalizeIraqiPhone(cust.phone) ? cust.phone : null;
      const waLink = waPhone
        ? orderAcceptedLink({
            phone: waPhone,
            orderNumber: res.orderNumber,
            delivery: orderType === "delivery",
          })
        : null;
      if (waLink && autoWaRef.current)
        window.open(waLink, "_blank", "noopener");
      setSuccess({
        orderNumber: res.orderNumber,
        awarded: res.awarded,
        waLink,
      });
      dispatch({ type: "clear" });
      setCustomer(null);
      setDiscountIqd(0);
      // وإلا حملت النسبة نفسها إلى طلب الزبون التالي
      setDiscountPct(0);
      setDiscountMode("iqd");
      setExtras([]);
      setPayMethod("cash");
      setDebtorName("");
      setOrderType("delivery");
      setTableNo("");
      setOrderNote("");
      // next call from this number fills itself in; failure here is not the sale's
      if (cust.phone && cust.address)
        void rememberAddress(cust.phone, cust.address, cust.customerName).catch(
          () => {},
        );
      setCustName("");
      setCustPhone("");
      setCustAddress("");
      // تُطفأ مع بقيّة حقول الزبون: علامةٌ تبقى مضاءة تُرسل رسالةً إلى زبونٍ
      // لم يخترها له أحد
      setAskReview(false);
    } catch (e) {
      // النسخة القديمة تُقال باسمها، لا «تأكد من الاتصال».
      //
      // Next يُبطل معرّفات «إجراءات الخادم» مع كل بناء، فالصفحة المفتوحة منذ
      // ما قبل النشر تنادي معرّفاً لا وجود له. والرسالة القديمة كانت ترمي
      // اللوم على الإنترنت وهو سليم، فيقف البيع ولا يُعرف السبب.
      const why = e instanceof Error ? e.message : String(e);
      setErr(
        /server action|deployment|unexpected response/i.test(why)
          ? "النظام تحدّث والصفحة قديمة — اضغط F5 ثم أعد الطلب. (سلّتك محفوظة على الشاشة)"
          : "تعذّر إتمام الطلب — تأكد من الاتصال بالإنترنت وأعد المحاولة. إن تكرّر، حدّث الصفحة (F5).",
      );
    } finally {
      checkoutBusyRef.current = false;
      setBusy(false);
    }
  }

  // شعارات الشركات: تحت «توصيل» مباشرة حين يكون الطلب توصيلاً، وإلا تحت طرق الدفع
  const partnerBlock = (
    <>
      {payMethod === "partner" && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-2 dark:border-amber-700 dark:bg-amber-950/40">
          {/* شعارات لا قائمة منسدلة: ثلاث شركات، وإصبع على شاشة لمس */}
          <div className="grid grid-cols-3 gap-1.5">
            {partners.map((p) => (
              <button
                key={p.id}
                onClick={() => setPartnerId(p.id)}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border-2 bg-background px-2 py-1.5 text-xs font-bold transition ${
                  partnerId === p.id
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border hover:bg-secondary"
                }`}
              >
                <PartnerLogo name={p.name_ar} className="h-7" />
                <span>
                  {p.name_ar}
                  {p.settlement === "cash_at_pickup"
                    ? ` · نقد −${p.commission_pct}٪`
                    : p.settlement === "custom"
                      ? " · مخصّص"
                      : ""}
                </span>
              </button>
            ))}
          </div>
          {/* said plainly, because the cashier is the one who gets blamed if
              the drawer does not match at handover */}
          {partners.find((p) => p.id === partnerId)?.settlement === "custom" ? (
            <label className="mt-1.5 block">
              {/* الافتراضي = الإجمالي ناقص أجرة الشركة (نحن ندفعها في مناطق التوصيل
                  المجاني). الزبون دفع الأجرة للمندوب؟ يكتب الكاشير الإجمالي كاملاً. */}
              <span className="mb-1 block text-xs font-bold text-amber-800 dark:text-amber-300">
                {(() => {
                  const fee =
                    partners.find((p) => p.id === partnerId)?.delivery_fee ?? 0;
                  const def = Math.max(0, total - fee);
                  return `دفع المندوب الآن (فارغ = ${formatIqdLabel(def)}${fee ? ` بعد أجرة توصيل ${formatIqdLabel(fee)}` : ""})`;
                })()}
              </span>
              <input
                value={partnerCash}
                onChange={(e) =>
                  setPartnerCash(e.target.value.replace(/[^\d]/g, ""))
                }
                inputMode="numeric"
                dir="ltr"
                placeholder={String(
                  Math.max(
                    0,
                    total -
                      (partners.find((p) => p.id === partnerId)?.delivery_fee ??
                        0),
                  ),
                )}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-lg font-black tabular-nums"
              />
            </label>
          ) : (
            <p className="mt-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
              بالآجل — لا يدخل صندوق الكاشير ولا يُحتسب عليك في نهاية الوردية.
            </p>
          )}
        </div>
      )}
    </>
  );

  return (
    // minmax(0,1fr) + min-w-0: without them the scrollable pills row's intrinsic
    // width blows the grid past narrow POS screens (1024px) → horizontal cut.
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* الشاشة تبقى على آخر نسخة — لكن حين تكون فارغةً فقط. سلّةٌ فيها
          أصناف أو بيعٌ جارٍ يمنع التحديث حتى يُغلَق الطلب */}
      <FreshBuild idle={() => !lines.length && !busy && !checkoutBusyRef.current} />
      {/* «اختيار المجهّز» كان هنا. أُزيل بطلب صاحب المحل: في هذا المطعم
          التجهيز يجري في المطبخ على تذكرة كاملة، ولا أحد يُعيَّن من الكاشير. */}
      <FridayPrayerNotice />
      {/* البوت يتبع الوردية لا الساعة: درجٌ نُسي مفتوحاً يعني طلبات بلا مطبخ */}
      <LateDrawerNotice />
      {/* items */}
      <section className="min-w-0 space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchBox}
            value={itemQ}
            onChange={(e) => setItemQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setItemQ("")}
            placeholder="ابحث عن صنف…"
            className="min-h-11 w-full rounded-xl border border-input bg-background pe-3 ps-9 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className={`flex gap-2 overflow-x-auto pb-1 ${found ? "hidden" : ""}`}>
          {menu.map((c) => (
            <button
              key={c.name_ar}
              onClick={() => setActiveCat(c.name_ar)}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                c.name_ar === (cat?.name_ar ?? "")
                  ? "bg-primary text-primary-foreground"
                  : "border border-border hover:bg-secondary"
              }`}
            >
              {c.name_ar}
              {c.lateCutoff && (
                <span className="ms-1 text-[10px] opacity-80">{lateCutoffState().phase === "closed" ? "· متوقف" : "· يغلق 02:00"}</span>
              )}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {(found ?? cat?.items ?? []).map((it) => (
            <CashierItem
              key={it.id}
              item={it}
              category={catOf.get(it.id) ?? cat?.name_ar}
              onAdd={(line) => dispatch({ type: "add", line })}
            />
          ))}
        </div>
        {found?.length === 0 && (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm font-bold text-muted-foreground">
            لا صنف بهذا الاسم.
          </p>
        )}

      </section>

      {/* order panel */}
      <aside className="h-fit min-w-0 space-y-4 rounded-2xl border border-border bg-card p-4 lg:sticky lg:top-20">
        <h2 className="text-lg font-bold">الطلب الحالي</h2>

        {lines.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            اختر الأصناف من القائمة.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {lines.map((l) => (
              <li
                key={l.key}
                className="flex items-center justify-between gap-2 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{l.name}</p>
                  {l.flavor && (
                    <p className="text-xs text-muted-foreground">{l.flavor}</p>
                  )}
                  {l.note && (
                    <p className="text-xs font-bold text-primary">← {l.note}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatIqdLabel(l.unitPrice)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      setEditErr(null);
                      setEdit({
                        key: l.key,
                        name: l.name,
                        price: String(l.unitPrice),
                        qty: String(l.qty),
                        note: l.note ?? "",
                      });
                    }}
                    aria-label="تعديل"
                    className={`rounded-full border border-border hover:bg-secondary ${TAP}`}
                  >
                    <Pencil className="mx-auto size-4" />
                  </button>
                  <button
                    onClick={() => dispatch({ type: "dec", key: l.key })}
                    aria-label="إنقاص"
                    className={`rounded-full border border-border hover:bg-secondary ${TAP}`}
                  >
                    <Minus className="mx-auto size-4" />
                  </button>
                  <span className="w-5 text-center text-sm font-semibold">
                    {l.qty}
                  </span>
                  <button
                    onClick={() => dispatch({ type: "inc", key: l.key })}
                    aria-label="زيادة"
                    className={`rounded-full border border-border hover:bg-secondary ${TAP}`}
                  >
                    <Plus className="mx-auto size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {edit && (
          <div className="space-y-2 rounded-xl border-2 border-primary bg-card p-3">
            <p className="text-sm font-bold">✏️ تعديل الصنف</p>
            <input
              value={edit.name}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              placeholder="اسم الصنف"
              maxLength={80}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="number"
                inputMode="numeric"
                dir="ltr"
                value={edit.price}
                onChange={(e) => setEdit({ ...edit, price: e.target.value })}
                placeholder="السعر"
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="number"
                inputMode="numeric"
                dir="ltr"
                min={1}
                value={edit.qty}
                onChange={(e) => setEdit({ ...edit, qty: e.target.value })}
                placeholder="العدد"
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <input
              value={edit.note}
              onChange={(e) => setEdit({ ...edit, note: e.target.value })}
              placeholder="📝 ملاحظة على هذا الصنف: بدون بصل…"
              maxLength={120}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {editErr && <p className="text-sm text-destructive">{editErr}</p>}
            <p className="text-xs text-muted-foreground">
              تغيير الاسم أو السعر يحفظ صنفاً في المنيو يُطلب لاحقاً.
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={() => void saveEdit()}
                disabled={editBusy}
                className="min-h-11 flex-1 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50"
              >
                {editBusy ? "جارٍ الحفظ…" : "حفظ"}
              </button>
              <button
                onClick={() => setEdit(null)}
                className="min-h-11 rounded-lg border border-border px-4 font-bold hover:bg-secondary"
              >
                إلغاء
              </button>
            </div>
          </div>
        )}

        {/* the only alert allowed to take the whole screen: a bag is being
            closed short and somebody has to ring the customer now */}
        <ShortageAlert />

        {/* who is calling — the loyalty box below is where that call lands */}
        <CallBanner
          onUse={(phone) => void attachCaller(phone)}
          onRepeat={(phone, lines) => {
            // Their previous receipt, dropped into the basket as ordinary lines
            // — every one still editable. A repeat order is a starting point,
            // not a shortcut past the cashier reading it back.
            dispatch({
              type: "load",
              lines: lines
                .filter((l): l is LastLine & { itemId: string } => !!l.itemId)
                .map((l) => ({
                  key: `${l.itemId}|${l.variantId ?? ""}|${l.flavor ?? ""}|`,
                  itemId: l.itemId,
                  name: l.name,
                  variantId: l.variantId,
                  flavor: l.flavor,
                  note: null,
                  unitPrice: l.unitPrice,
                  qty: l.qty,
                })),
            });
            void attachCaller(phone);
          }}
          onDetailsSaved={(name, address) => {
            if (name) setCustName(name);
            if (address) setCustAddress(address);
          }}
        />

        {/* الزبون الملحَق بالطلب — يأتي من المكالمة. بطاقة الولاء وبحثها ومسحها
            أُزيلت بطلب صاحب المحل: لا تُستعمل على هذا الكاونتر. */}
        {customer && (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-secondary/60 p-3 text-sm">
            <div>
              <p className="font-medium">{customer.name_ar ?? "زبون"}</p>
              <p className="text-xs text-muted-foreground">
                الرصيد: {customer.points} نقطة
              </p>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={redeem}
                className="min-h-11 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground"
              >
                استبدال مكافأة
              </button>
              <button
                onClick={() => setCustomer(null)}
                aria-label="إزالة"
                className="min-h-11 rounded-lg border border-border px-3"
              >
                <Trash2 className="mx-auto size-4" />
              </button>
            </div>
          </div>
        )}
        {loyaltyMsg && (
          <p className="text-xs text-muted-foreground">{loyaltyMsg}</p>
        )}

        {/* إضافات: سطر واحد. المبلغ يُكتب كما هو (٥٠٠، ١٠٠٠) — لا أزرار كسور
            ولا مجموع جارٍ؛ كانت تأخذ ربع الشاشة لشيء يُستعمل مرّة في اليوم */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-secondary/60 px-3 py-2">
          <span className="text-sm font-semibold">➕ إضافة</span>
          <input
            inputMode="numeric"
            dir="ltr"
            value={extraPrice ? String(extraPrice) : ""}
            onChange={(e) =>
              setExtraPrice(
                Number(
                  e.target.value
                    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
                    .replace(/[^\d]/g, ""),
                ) || 0,
              )
            }
            onKeyDown={(e) => e.key === "Enter" && addExtra()}
            placeholder="المبلغ"
            className="min-h-10 w-24 rounded-lg border border-input bg-background px-2 text-center text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={addExtra}
            className="min-h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            +
          </button>
          {extras.map((x, i) => (
            <button
              key={i}
              onClick={() => setExtras((xs) => xs.filter((_, j) => j !== i))}
              title="حذف"
              className="flex min-h-10 items-center gap-1 rounded-lg border border-border bg-background px-2 text-sm font-semibold text-primary hover:bg-secondary"
            >
              +{formatIqdLabel(x.price)}
              <Trash2 className="size-3.5" />
            </button>
          ))}
        </div>

        {/* totals */}
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">المجموع</span>
            <span>{formatIqdLabel(subtotal)}</span>
          </div>
          {extraTotal > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">الإضافات</span>
              <span className="text-primary">
                +{formatIqdLabel(extraTotal)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">الخصم</span>
            <div className="flex items-center gap-1">
              {(
                [
                  ["iqd", "د.ع"],
                  ["pct", "٪"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => {
                    setDiscountMode(m);
                    setDiscountPct(0);
                    setDiscountIqd(0);
                  }}
                  className={`min-h-8 w-12 rounded-lg border text-sm font-bold transition ${
                    discountMode === m
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input hover:bg-secondary"
                  }`}
                >
                  {label}
                </button>
              ))}
              {discountMode === "pct" ? (
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={discountPct || ""}
                  onChange={(e) =>
                    setDiscountPct(
                      Math.min(
                        100,
                        Math.max(0, Math.round(Number(e.target.value) || 0)),
                      ),
                    )
                  }
                  className="w-24 rounded-lg border border-input bg-background px-2 py-1 text-left text-sm outline-none focus:ring-2 focus:ring-ring"
                  dir="ltr"
                />
              ) : (
                <input
                  type="number"
                  min={0}
                  value={discountIqd || ""}
                  onChange={(e) =>
                    setDiscountIqd(
                      Math.max(0, Math.round(Number(e.target.value) || 0)),
                    )
                  }
                  className="w-24 rounded-lg border border-input bg-background px-2 py-1 text-left text-sm outline-none focus:ring-2 focus:ring-ring"
                  dir="ltr"
                />
              )}
            </div>
          </div>
          {/* الرقم الذي سيُطبع على الفاتورة، كي لا تكون النسبة وعداً مبهماً */}
          {discountMode === "pct" && discount > 0 && (
            <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
              <span>
                {discountPct}٪ من {formatIqdLabel(discountBase)}
              </span>
              <span className="text-destructive">
                − {formatIqdLabel(discount)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border pt-2 text-base font-bold">
            <span>الإجمالي</span>
            <span>{formatIqdLabel(total)}</span>
          </div>
        </div>

        {/* order note */}
        <input
          value={orderNote}
          onChange={(e) => setOrderNote(e.target.value)}
          placeholder="📝 ملاحظات: بدون مخلل، صوص إضافي، حار…"
          maxLength={300}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />

        {err && <p className="text-sm text-destructive">{err}</p>}

        {/* delivery / dine-in / takeaway. «سفري» = the customer collects: local
            numbering, «سفري» on every slip, and the receipt printed twice — one
            for the hand, one for the bag. */}
        <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-secondary/60 p-1.5">
          <button
            onClick={() => {
              setOrderType("delivery");
              setTableNo("");
              // توصيل = شركة في الغالب: الشعارات تُفتح فوراً هنا لا تحت العنوان
              if (partners.length) setPayMethod("partner");
            }}
            className={`min-h-12 rounded-lg px-2 text-sm font-semibold transition ${orderType === "delivery" ? "bg-primary text-primary-foreground" : "hover:bg-background"}`}
          >
            🛵 توصيل
          </button>
          <button
            onClick={() => {
              setOrderType("dinein");
              if (payMethod === "partner") setPayMethod("cash");
            }}
            className={`min-h-12 rounded-lg px-2 text-sm font-semibold transition ${orderType === "dinein" ? "bg-primary text-primary-foreground" : "hover:bg-background"}`}
          >
            🏠 داخل المطعم
          </button>
          <button
            onClick={() => {
              setOrderType("takeaway");
              setTableNo("");
              if (payMethod === "partner") setPayMethod("cash");
            }}
            className={`min-h-12 rounded-lg px-2 text-sm font-semibold transition ${orderType === "takeaway" ? "bg-primary text-primary-foreground" : "hover:bg-background"}`}
          >
            🛍️ سفري
          </button>
        </div>
        {orderType === "delivery" && partnerBlock}
        {/* داخل المطعم: الاسم يكفي للنداء · سفري: الاسم والهاتف · توصيل: والعنوان */}
        <div className="grid gap-1.5">
          <div
            className={`grid gap-1.5 ${orderType === "dinein" ? "grid-cols-1" : "grid-cols-2"}`}
          >
            <input
              value={custName}
              onChange={(e) => setCustName(e.target.value)}
              placeholder={nameMissing ? "👤 اسم الزبون (مطلوب)" : "👤 اسم الزبون"}
              maxLength={120}
              aria-invalid={nameMissing}
              className={`min-h-11 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring ${
                nameMissing ? "border-destructive ring-1 ring-destructive" : "border-input"
              }`}
            />
            {orderType !== "dinein" && (
              <input
                value={custPhone}
                onChange={(e) => setCustPhone(e.target.value)}
                // on leaving the box the number is folded to 07XXXXXXXXX — braces,
                // spaces and ٠-٩ gone, so the receipt prints one unbroken run —
                // and a real mobile brings back their card, name and last address
                onBlur={() => {
                  const p = cleanPhone(custPhone) ?? "";
                  setCustPhone(p);
                  if (normalizeIraqiPhone(p) && !customer) void attachCaller(p);
                }}
                placeholder="📞 رقم الهاتف"
                inputMode="tel"
                dir="ltr"
                maxLength={20}
                className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            )}
          </div>
          {orderType === "delivery" && (
            <input
              value={custAddress}
              onChange={(e) => setCustAddress(e.target.value)}
              placeholder="📍 العنوان"
              maxLength={300}
              className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          )}
        </div>
        {orderType === "dinein" && (
          <div className="flex flex-wrap gap-1.5">
            {tables.map((n) => (
              <button
                key={n}
                onClick={() => setTableNo(n)}
                className={`${TAP} whitespace-nowrap rounded-lg border px-3 text-sm font-bold transition ${
                  tableNo === n
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-secondary"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        <div
          className={`grid gap-1.5 rounded-xl bg-secondary/60 p-1.5 ${partners.length ? "grid-cols-4" : "grid-cols-3"}`}
        >
          <button
            onClick={() => setPayMethod("cash")}
            className={`min-h-12 rounded-lg px-3 text-sm font-semibold transition ${payMethod === "cash" ? "bg-primary text-primary-foreground" : "hover:bg-background"}`}
          >
            💵 نقدي
          </button>
          <button
            onClick={() => setPayMethod("card")}
            className={`min-h-12 rounded-lg px-3 text-sm font-semibold transition ${payMethod === "card" ? "bg-primary text-primary-foreground" : "hover:bg-background"}`}
          >
            💳 كي كارد
          </button>
          {/* only offered when management has actually set a company up */}
          {partners.length > 0 && (
            <button
              onClick={() => setPayMethod("partner")}
              className={`min-h-12 rounded-lg px-3 text-sm font-semibold transition ${payMethod === "partner" ? "bg-primary text-primary-foreground" : "hover:bg-background"}`}
            >
              🛵 شركة
            </button>
          )}
          <button
            onClick={() => setPayMethod("debt")}
            className={`min-h-12 rounded-lg px-3 text-sm font-semibold transition ${payMethod === "debt" ? "bg-primary text-primary-foreground" : "hover:bg-background"}`}
          >
            📒 دين
          </button>
        </div>

        {payMethod === "debt" && (
          <div className="grid gap-1.5 rounded-xl border border-amber-300 bg-amber-50 p-2 dark:border-amber-700 dark:bg-amber-950/40">
            {/* حقل واحد، ويُترك فارغاً حين يدفع الزبون نفسه — اسمه مكتوب أعلاه */}
            <input
              value={debtorName}
              onChange={(e) => setDebtorName(e.target.value)}
              placeholder={
                custName.trim()
                  ? `👤 على حساب ${custName.trim()} — أو اكتب اسماً آخر`
                  : "👤 على حساب من؟"
              }
              maxLength={120}
              autoFocus={!custName.trim()}
              className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
              لا يدخل الصندوق — يُسجَّل في «الديون» ويُسدَّد من هناك.
            </p>
          </div>
        )}

        {orderType !== "delivery" && partnerBlock}

        {/*
          «+ تقييم كوكل» — لا يظهر إلا مع رقم هاتف: بلا رقمٍ لا سبيل لإرسال شيء.
          والرسالة تخرج بعد ربع ساعة من تسليم الطلب (نصف ساعة للتوصيل)، وتُعرض
          في «رسائل التقييم» ليضغطها الموظّف — أو تُرسَل وحدها إن كان الزبون
          يراسلنا على واتساب أصلاً.
        */}
        {orderType !== "dinein" && custPhone.trim().length >= 10 && (
          <button
            type="button"
            onClick={() => setAskReview((v) => !v)}
            className={
              "flex min-h-11 w-full items-center justify-between rounded-xl border-2 px-3 text-sm font-black transition " +
              (askReview ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")
            }
          >
            <span>⭐ اطلب منه تقييم كوكل</span>
            <span className={"grid size-5 place-items-center rounded-md border-2 " + (askReview ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
              {askReview ? "✓" : ""}
            </span>
          </button>
        )}

        {nameMissing && (
          <p className="rounded-lg border-2 border-destructive bg-destructive/10 px-3 py-2 text-xs font-black text-destructive">
            اكتب اسم الزبون مع الرقم — الاسم صار مطلوباً مع كل رقم.
          </p>
        )}

        <button
          onClick={checkout}
          disabled={
            busy ||
            lines.length === 0 ||
            (payMethod === "partner" && !partnerId) ||
            (payMethod === "debt" && !debtorName.trim() && !custName.trim()) ||
            nameMissing
          }
          className="w-full rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {busy
            ? "جارٍ التنفيذ…"
            : payMethod === "cash"
              ? "دفع نقدي وإصدار الطلب"
              : payMethod === "card"
                ? "دفع كي كارد وإصدار الطلب"
                : payMethod === "debt"
                  ? "تسجيل ديناً وإصدار الطلب"
                  : "تسجيل على الشركة وإصدار الطلب"}
        </button>
      </aside>

      {/* scanner */}

      {/* success */}
      {success && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={() => setSuccess(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-card p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Check className="size-8" />
            </div>
            <h3 className="text-xl font-bold">تم الدفع</h3>
            <p className="mt-1 text-muted-foreground">رقم الطلب</p>
            <p className="my-2 text-4xl font-extrabold text-primary">
              {success.orderNumber}
            </p>
            {success.awarded > 0 && (
              <p className="text-sm text-muted-foreground">
                أُضيفت {success.awarded} نقطة ولاء.
              </p>
            )}
            {success.waLink && (
              <a
                href={success.waLink}
                target="_blank"
                rel="noopener"
                className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] font-black text-white"
              >
                <MessageCircle className="size-5" />
                أرسل رقم الطلب للزبون على واتساب
              </a>
            )}
            {saleNote && (
              <p className="mt-2 rounded-xl border-2 border-primary bg-primary/10 px-3 py-2 text-sm font-black text-primary">
                {saleNote}
              </p>
            )}
            {printWarn && (
              <p className="mt-2 rounded-xl border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive">
                {printWarn}
              </p>
            )}
            <div className="mt-4 flex items-center justify-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground">
                نسخ الزبون
              </span>
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => setCopies(n)}
                  className={`touch-pos size-11 rounded-xl border text-lg font-black transition ${
                    copies === n
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-secondary"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            {reprint && (
              <p className="mt-2 text-sm font-bold text-primary">{reprint}</p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={printCustomerReceipt}
                className="touch-pos col-span-2 flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground hover:opacity-90"
              >
                <Printer className="size-4" />
                طباعة إيصال الزبون
              </button>
              <button
                onClick={() => window.print()}
                className="touch-pos flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-2.5 font-semibold hover:bg-secondary"
              >
                <Printer className="size-4" />
                طباعة المتصفح
              </button>
              <button
                onClick={() => setSuccess(null)}
                className="rounded-xl border border-border px-4 py-2.5 font-semibold hover:bg-secondary"
              >
                طلب جديد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print-only slips, for the «طباعة المتصفح» button and nothing else.
          Checkout prints through the agent alone; the browser never prints on
          its own any more (see the effect above). When a cashier does press the
          button, BOTH slips are rendered — the customer's receipt and the
          assembly ticket the expediter scans — so a shop with no agent wired
          still gets a working scan workflow from one printer. */}
      {receipt && (
        <>
          <Receipt data={receipt} />
          <div
            style={{ pageBreakBefore: "always" }}
            className="hidden print:block"
          />
          <Receipt data={{ ...receipt, kind: "assembly" }} />
        </>
      )}
    </div>
  );
}

function CashierItem({
  item,
  category,
  onAdd,
}: {
  item: MenuItemView;
  category?: string;
  onAdd: (line: Omit<Line, "qty">) => void;
}) {
  const [variantId, setVariantId] = useState<string | null>(
    cheapestVariant(item)?.id ?? null,
  );
  const [flavor, setFlavor] = useState<string | null>(item.flavors[0] ?? null);
  const variant = item.variants.find((v) => v.id === variantId) ?? null;
  const unitPrice = variant?.price ?? item.price;
  const displayName = variant
    ? `${item.name_ar} - ${variant.name_ar}`
    : item.name_ar;

  // The cashier taps fast and the cart is off to the side; without a mark on
  // the button itself there is nothing to say the tap landed — so the same item
  // gets tapped twice, or a missed tap goes unnoticed until the total is wrong.
  const [added, setAdded] = useState(false);
  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(false), 1100);
    return () => clearTimeout(t);
  }, [added]);

  function add() {
    onAdd({
      key: `${item.id}|${variantId ?? ""}|${flavor ?? ""}|`,
      itemId: item.id,
      name: displayName,
      variantId,
      flavor,
      note: null,
      unitPrice,
    });
    setAdded(true);
  }

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-3">
      <button onClick={add} className="text-right">
        <div className="flex items-center gap-2">
          <MenuIcon
            name={item.name_ar}
            category={category}
            className="size-8 shrink-0 text-primary"
          />
          <p className="font-semibold leading-tight">{item.name_ar}</p>
        </div>
        <p className="mt-0.5 text-sm font-bold text-primary">
          {formatIqdLabel(unitPrice)}
        </p>
      </button>
      {item.variants.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {item.variants.map((v) => (
            <button
              key={v.id}
              onClick={() => setVariantId(v.id)}
              className={`min-h-11 rounded-full border px-3.5 text-sm font-semibold transition ${
                v.id === variantId
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-secondary"
              }`}
            >
              {v.name_ar}
            </button>
          ))}
        </div>
      )}
      {item.flavors.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {item.flavors.map((f) => (
            <button
              key={f}
              onClick={() => setFlavor(f)}
              className={`min-h-11 rounded-full border px-3.5 text-sm font-semibold transition ${
                f === flavor
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-secondary"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={add}
        className={`touch-pos mt-2 flex min-h-11 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-sm font-bold transition ${
          added
            ? "bg-success text-success-foreground"
            : "bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
        }`}
      >
        {added ? <Check className="size-4" /> : <Plus className="size-4" />}
        {added ? "أُضيف" : "إضافة"}
      </button>
    </div>
  );
}
