import type { Button, Reply } from "../../../supabase/functions/telegram-bot/order-flow";

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
  | { type: "interactive"; interactive: { type: "list"; body: { text: string }; action: { button: string; sections: { rows: WaRow[] }[] } } };

/** ٨ صفوف + «السابق» + «المزيد» = ١٠، وهو سقف واتساب */
const PAGE = 8;
const cut = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + "…");

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
        action: { buttons: buttons.map((b) => ({ type: "reply" as const, reply: { id: cut(b.data, 250), title: cut(b.text, 20) } })) },
      },
    };
  }

  const start = page * PAGE;
  const slice = buttons.slice(start, start + PAGE);
  const rows: WaRow[] = slice.map((b) => ({
    id: cut(b.data, 250),
    title: cut(b.text, 24),
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
