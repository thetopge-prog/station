/**
 * قراءة إشعار «طلب جديد» من تطبيق شركة توصيل — بلا شبكة ولا قاعدة.
 *
 * تطبيق توترز على جهازهم يُظهر إشعاراً حين يصل طلب. تطبيق المتصل نفسه على
 * ذلك الجهاز يقرأ الإشعار ويرسله كما هو. هنا يُستخرج منه ما يُستخرج: رقم
 * الطلب، وأسطر الأصناف إن كانت مكتوبة، لا أكثر — إشعارٌ ليس واجهةً برمجية،
 * وما لا يقوله لا يُخترع.
 *
 * صِرف ليُختبر بنصوص إشعارات حقيقية حين تصل؛ الشكل الفعلي لإشعار توترز
 * لم أرَه بعد، فالتحليل متسامح والخطأ يميل إلى «تنبيه بلا أصناف» لا إلى
 * «طلب بأصناف مخترعة».
 */

export type ExternalSource = "toters" | "talabaty" | "other";
export type ParsedLine = { name: string; qty: number };
export type ParsedExternal = { source: ExternalSource; ref: string | null; lines: ParsedLine[]; total: number | null };

const normDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

export function sourceOf(pkg: string): ExternalSource {
  const p = pkg.toLowerCase();
  if (p.includes("toters")) return "toters";
  if (p.includes("talabat")) return "talabaty";
  return "other";
}

/** رقم الطلب — «#890» أو «طلب رقم 890» أو «Order 890». أول رقم من ٢–٧ خانات بعد إشارة. */
export function refOf(text: string): string | null {
  const t = normDigits(text);
  const m = t.match(/(?:#|№|رقم\s*(?:الطلب)?\s*:?|order\s*(?:no\.?|#|number)?\s*:?)\s*(\d{2,7})/i);
  return m ? m[1] : null;
}

/**
 * أسطر الأصناف: «2 × بيتزا» أو «2x بيتزا» أو «بيتزا ×2» أو «بيتزا (2)».
 * سطر بلا عدد يُهمل — أسماء الشوارع والملاحظات تشبه الأصناف.
 */
export function linesOf(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  for (const raw of normDigits(text).split(/\r?\n|·|•|,|،/)) {
    const s = raw.trim();
    if (!s) continue;
    let m = s.match(/^(\d{1,2})\s*[x×*]\s*(.+?)\s*$/i) ?? s.match(/^(.+?)\s*[x×*]\s*(\d{1,2})\s*$/i);
    let qty: number, name: string;
    if (m) {
      if (/^\d/.test(m[1])) { qty = Number(m[1]); name = m[2]; } else { name = m[1]; qty = Number(m[2]); }
    } else if ((m = s.match(/^(.+?)\s*\((\d{1,2})\)\s*$/))) {
      name = m[1]; qty = Number(m[2]);
    } else continue;
    name = name.replace(/\s+/g, " ").replace(/[.:]+$/, "").trim();
    if (!name || qty < 1 || qty > 50) continue;
    // سطر السعر ليس صنفاً: «2 x 5,000» أو «المجموع x1»
    if (/^[\d,.\s]+$/.test(name) || /مجموع|total|إجمالي/i.test(name)) continue;
    out.push({ name, qty });
  }
  return out;
}

export function totalOf(text: string): number | null {
  const t = normDigits(text);
  const m = t.match(/(?:المجموع|الإجمالي|total)\s*:?\s*([\d,.]{3,})/i);
  if (!m) return null;
  const n = Number(m[1].replace(/[,.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseExternalOrder(input: { pkg: string; title?: string | null; text?: string | null }): ParsedExternal {
  const blob = [input.title ?? "", input.text ?? ""].filter(Boolean).join("\n");
  return { source: sourceOf(input.pkg), ref: refOf(blob), lines: linesOf(input.text ?? ""), total: totalOf(blob) };
}
