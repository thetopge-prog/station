import type { Button, Reply } from "../../../supabase/functions/telegram-bot/order-flow";
import { BRAND } from "@/lib/brand";

/**
 * ردّ المحرّك → رسالة واتساب.
 *
 * المحرّك واحد لتليغرام وواتساب (order-flow.ts) ولا يعرف أيّهما. الفرق كلّه
 * هنا، وهو فرق حقيقي: تليغرام يقبل شبكة أزرار بلا حدّ تقريباً، وواتساب يقبل
 * إمّا **ثلاثة أزرار** أو **قائمة بعشرة صفوف** لا أكثر. فالأقسام والأصناف
 * تصير قوائم مصفَّحة، والزرّ الذي يعرض العدد وحده (o|noop) يُحذف ويُكتب عدده
 * في النصّ — وإلا أكل صفّاً من عشرة بلا فائدة.
 *
 * صِرف: لا شبكة ولا حالة. الويبهوك يناديها ويرسل ما تُعيده.
 */

export type WaRow = { id: string; title: string; description?: string };
export type WaMessage =
  | { type: "text"; text: { body: string; preview_url: false } }
  | { type: "interactive"; interactive: { type: "button"; body: { text: string }; action: { buttons: { type: "reply"; reply: { id: string; title: string } }[] } } }
  | { type: "interactive"; interactive: { type: "list"; body: { text: string }; action: { button: string; sections: { rows: WaRow[] }[] } } }
  | { type: "interactive"; interactive: { type: "cta_url"; body: { text: string }; footer?: { text: string }; action: { name: "cta_url"; parameters: { display_text: string; url: string } } } };

/**
 * الترحيب: زرّ واحد يفتح المنيو على الويب.
 *
 * الطلب من داخل الدردشة كان ثماني خطوات لصنف واحد (قسم ← صنف ← حجم ← عدد ←
 * سلّة ← توصيل ← عنوان ← تأكيد) على أزرار ثلاثة وقوائم مصفَّحة. المنيو على
 * الويب يفعلها بضغطتين وبالصور، والرقم يُملأ من واتساب نفسه. فالبوت يستقبل
 * ويدلّ — والطلب هناك.
 */
export function renderWelcome(hasSaved = false, name: string | null = null): WaMessage {
  // اسمه إن عرفناه — واتساب يعطينا اسم ملفّه، ومناداته به تفتح المحادثة.
  // ولا يُنادى بلقبٍ اختاره لنفسه: `customerNameFrom` تردّ ما ليس اسماً
  const hail = name ? `هلا ${name}! 🌟` : "هلا بيك!";
  return {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: `🍔 *ستيشن* — ${hail}\nشلون تحب تطلب؟` },
      action: {
        buttons: [
          { type: "reply", reply: { id: "w|link", title: btn("🛵 المنيو بالصور") } },
          { type: "reply", reply: { id: "w|here", title: btn("💬 اطلب هنا") } },
          // الزرّ الثالث لمن قيّم طلباً سابقاً فوق ٨ — واتساب يسمح بثلاثة بالضبط
          ...(hasSaved ? [{ type: "reply" as const, reply: { id: "w|saved", title: btn("🔁 طلباتي") } }] : []),
        ],
      },
    },
  };
}

/** طلباتي السابقة: قائمة بآخر خمسة طلبات محفوظة */
export function renderSavedOrders(orders: { id: string; order_seq: number; label: string }[]): WaMessage {
  const rows: WaRow[] = orders.slice(0, 10).map((o) => ({ id: `w|re|${o.id}`, title: row(`#${String(o.order_seq).padStart(3, "0")} · ${o.label}`), description: cut(o.label, 72) }));
  return {
    type: "interactive",
    interactive: { type: "list", body: { text: "🔁 طلباتك المحفوظة — اختار واحد ويصير بالسلّة:" }, action: { button: "طلباتي", sections: [{ rows }] } },
  };
}

/** زرّ يفتح المنيو على الويب بوضع التوصيل ورقم الزبون مملوءاً */
export function renderMenuLink(menuUrl: string): WaMessage {
  return {
    type: "interactive",
    interactive: {
      type: "cta_url",
      body: { text: "دوس على «افتح المنيو» راح ينقلك إلى المنيو مفصّل، واطلب وتدلّل.. والمحطة تفزعلك 🛵" },
      footer: { text: `الرمادي · ${BRAND.phoneDisplay}` },
      action: { name: "cta_url", parameters: { display_text: btn("🛵 افتح المنيو"), url: menuUrl } },
    },
  };
}

/** ٨ صفوف + «السابق» + «المزيد» = ١٠، وهو سقف واتساب */
const PAGE = 8;
const cut = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + "…");

/**
 * حدود واتساب على العناوين — تجاوزها يُسقط الرسالة كلّها لا يقصّها.
 *
 * «🛵 اطلب هسة من المنيو» واحدٌ وعشرون حرفاً، فردّ Meta بـ131009 وصمت البوت
 * يوماً كاملاً. فكل عنوان يمرّ من هنا، ولا يُكتب حرفياً في أي نداء.
 */
const BTN_MAX = 20;
const ROW_TITLE_MAX = 24;
const btn = (title: string) => cut(title, BTN_MAX);
const row = (title: string) => cut(title, ROW_TITLE_MAX);

/** نصّ المحرّك HTML؛ واتساب يفهم *عريض* و`ثابت العرض` */
export function toWhatsAppText(html: string): string {
  return html
    .replace(/<b>([\s\S]*?)<\/b>/g, "*$1*")
    .replace(/<code>([\s\S]*?)<\/code>/g, "`$1`")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** أزرار الردّ صفّاً صفّاً → قائمة واحدة، بلا زرّ العدد الأصمّ */
export function flatten(reply: Reply): { buttons: Button[]; qty: string | null } {
  const all = (reply.buttons ?? []).flat();
  const noop = all.find((b) => b.data === "o|noop");
  return { buttons: all.filter((b) => b.data !== "o|noop"), qty: noop?.text ?? null };
}

export function renderMessage(text: string, buttons: Button[], page = 0): WaMessage {
  const body = cut(toWhatsAppText(text), 1000) || "…";

  if (!buttons.length) return { type: "text", text: { body: cut(body, 4000), preview_url: false } };

  // ثلاثة أو أقلّ: أزرار حقيقية تحت الرسالة — أسرع من فتح قائمة
  if (buttons.length <= 3 && page === 0) {
    return {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: { buttons: buttons.map((b) => ({ type: "reply" as const, reply: { id: cut(b.data, 250), title: btn(b.text) } })) },
      },
    };
  }

  const start = page * PAGE;
  const slice = buttons.slice(start, start + PAGE);
  const rows: WaRow[] = slice.map((b) => ({
    id: cut(b.data, 250),
    title: row(b.text),
    // الاسم كاملاً حين يُقصّ العنوان — «كنتاكي 15 قطعة — 34,000» يتجاوز ٢٤ حرفاً
    ...(b.text.length > 24 ? { description: cut(b.text, 72) } : {}),
  }));
  if (page > 0) rows.unshift({ id: `w|page|${page - 1}`, title: "⏮ السابق" });
  if (start + PAGE < buttons.length) rows.push({ id: `w|page|${page + 1}`, title: "المزيد ⏭" });

  return {
    type: "interactive",
    interactive: { type: "list", body: { text: body }, action: { button: "اختر", sections: [{ rows }] } },
  };
}

/** الردّ كاملاً: الرسالة وما يجب أن يُحفظ لتصفيح الصفحات التالية */
export function renderReply(reply: Reply): { message: WaMessage; buttons: Button[]; text: string } {
  const { buttons, qty } = flatten(reply);
  const text = qty ? `${reply.text}\nالعدد: ${qty}` : reply.text;
  return { message: renderMessage(text, buttons, 0), buttons, text };
}

/** سؤال تقييم بقائمة من ١٠ إلى ١ — واتساب يقبل عشرة صفوف بالضبط */
export function renderRateScale(text: string): WaMessage {
  const rows: WaRow[] = Array.from({ length: 10 }, (_, i) => 10 - i).map((n) => ({
    id: `r|${n}`,
    title: row(n === 10 ? "10 — ممتاز 🌟" : n >= 8 ? `${n} — حلو` : n >= 5 ? `${n} — مقبول` : n === 1 ? "1 — سيّئ" : String(n)),
  }));
  return {
    type: "interactive",
    interactive: { type: "list", body: { text: cut(toWhatsAppText(text), 1000) }, action: { button: "اختار الدرجة", sections: [{ rows }] } },
  };
}
