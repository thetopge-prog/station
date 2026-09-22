/**
 * تقييم التجربة بعد التسليم — محرّك نقي كـ order-flow: بلا شبكة ولا قاعدة.
 *
 * أربع خطوات: الأكل، الخدمة، الطلب من القناة (واتساب/تيليغرام)، ثم نصيحة
 * حرّة (أو «-»). كل درجة من ١ إلى ١٠. المتوسط فوق ٨ يعني «طلب يستحق أن
 * يُحفظ» — يعود في «طلباتي السابقة».
 *
 * يعمل في Deno وNode؛ الويبهوك والدالة يرسمان الأزرار بحسب قناتهما.
 */
export type RateStep = "food" | "service" | "ordering" | "advice" | "done";
export type RateState = { flow: "rate"; orderId: string; orderSeq: number; step: RateStep; food?: number; service?: number; ordering?: number; advice?: string | null };
export type RateInput = { kind: "score"; value: number } | { kind: "text"; text: string };
export type RateReply = { text: string; scale: boolean; done?: { score: number; save: boolean; advice: string | null } };

export const SAVE_THRESHOLD = 8;

export function rateStart(orderId: string, orderSeq: number): { state: RateState; reply: RateReply } {
  const state: RateState = { flow: "rate", orderId, orderSeq, step: "food" };
  return { state, reply: { text: `🙏 شكراً لطلبك #${String(orderSeq).padStart(3, "0")} من ستيشن!\nقيّملنا التجربة من ١ لـ١٠ — أول شي *الأكل* 🍔`, scale: true } };
}

const QUESTION: Record<RateStep, string> = {
  food: "*الأكل* 🍔 — من ١ لـ١٠؟",
  service: "*الخدمة* 🙋 — من ١ لـ١٠؟",
  ordering: "*الطلب من هنا* 📱 — شلون كانت سهولة الطلب من ١ لـ١٠؟",
  advice: "*نصيحتك* ✍️ — اكتب أي ملاحظة تحب نتحسّن بيها، أو دز «-» للتخطي.",
  done: "",
};

const NEXT: Record<RateStep, RateStep> = { food: "service", service: "ordering", ordering: "advice", advice: "done", done: "done" };

const normDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

export function rateStep(state: RateState, input: RateInput): { state: RateState; reply: RateReply } {
  if (state.step === "done") return { state, reply: { text: "شكراً 🙏 تقييمك وصل.", scale: false } };

  if (state.step === "advice") {
    const t = input.kind === "text" ? input.text.trim() : String(input.value);
    const advice = !t || t === "-" || t === "لا" ? null : t.slice(0, 300);
    return finish({ ...state, advice, step: "done" });
  }

  // درجة: زرّ، أو رقم مكتوب
  const v = input.kind === "score" ? input.value : Number(normDigits(input.text).match(/\d{1,2}/)?.[0] ?? NaN);
  if (!Number.isInteger(v) || v < 1 || v > 10) {
    return { state, reply: { text: "اختار رقم من ١ لـ١٠ 🙏\n" + QUESTION[state.step], scale: true } };
  }
  const next: RateState = { ...state, [state.step]: v, step: NEXT[state.step] };
  return { state: next, reply: { text: QUESTION[next.step], scale: next.step !== "advice" } };
}

function finish(state: RateState): { state: RateState; reply: RateReply } {
  const score = Math.round((((state.food ?? 0) + (state.service ?? 0) + (state.ordering ?? 0)) / 3) * 100) / 100;
  const save = score > SAVE_THRESHOLD;
  const text = save
    ? `شكراً من القلب 🧡 حفظنالك هذا الطلب — المرّة الجاية تلكاه بـ«🔁 طلباتي السابقة» وتطلبه بكبسة.`
    : `شكراً 🙏 ملاحظتك وصلت للإدارة، ونشتغل عليها.`;
  return { state, reply: { text, scale: false, done: { score, save, advice: state.advice ?? null } } };
}
