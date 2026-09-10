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

export const normDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

/**
 * طيّ عربي للمطابقة — نفس القواعد حرفاً بحرف في fold_ar (0073) كي يتّفق
 * ما يُكتب من التطبيق مع ما تبذره القاعدة: أرقام لاتينية، لا تشكيل ولا تطويل،
 * الهمزات ألفاً، التاء المربوطة هاءً، الألف المقصورة والهمزة على نبرة ياءً.
 */
export function foldArabic(s: string): string {
  return normDigits(s)
    .replace(/[ًٌٍَُِّْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىئ]/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// ── شاشة طلب توترز، كما يقرؤها تطبيق SUNMI ──────────────────────────────
//
// الشاشة كما صُوّرت: «الطلب #٩٠٨» · «٥١٣١٣-٧٩٩٠٨» · «Maztotrz H» · «هوية …»
// · «عنصران» · قسم · «١x» · «وجبة كنتاكي» · «٩,٧٥٠ د.ع. / ٣ قطع» · «٩,٧٥٠ د.ع.»
// الخيار بعد «/» هو ما يغيّر الصنف عندنا (٣ قطع ≠ ٨ قطع)، فيُحمل مع الاسم.

export type ScreenItem = { name: string; qty: number; option: string | null };
export type ParsedScreen = { ref: string | null; refLong: string | null; customerName: string | null; items: ScreenItem[]; total: number | null; declared: number | null };

/**
 * كم صنفاً تقول الشاشة إنها تحمل: «عنصران»، «٣ عناصر»…
 *
 * خدمة إمكانية الوصول تقرأ ما هو معروض فقط، وأندرويد يعيد تدوير الصفوف خارج
 * الرؤية. فطلب من صنفين تُقرأ منه واحدة إن كان الثاني تحت حافة الشاشة، ويُصنع
 * طلب ناقص يطبخه المطبخ ناقصاً. هذا السطر هو الشاهد الوحيد على النقص.
 */
export function declaredCount(rawLines: string[]): number | null {
  for (const raw of rawLines) {
    const l = normDigits(String(raw ?? "")).replace(/\s+/g, " ").trim();
    if (/^عنصر(?:ان|ين)$/.test(l)) return 2;
    if (/^عنصر$/.test(l)) return 1;
    const m = l.match(/^(\d{1,2})\s*(?:عناصر|عنصرًا|عنصراً|عنصرا|عنصر)$/);
    if (m) return Number(m[1]);
  }
  return null;
}

const QTY_LINE = /^(?:(\d{1,2})\s*[x×]|[x×]\s*(\d{1,2}))$/i;
const PRICE_LINE = /^([\d,.]+)\s*د\.?\s*ع\.?(?:\s*\/\s*(.+))?$/;
const NOISE = /^(?:تم|جديد|تحضير|جاهز|هوية|اليوم|لديك|الطلب جاهز|بإنتظار|بانتظار|نمنحك|عنصر|عنصران|\d+\s*عناصر)/;

export function parseTotersScreen(rawLines: string[]): ParsedScreen {
  const lines = rawLines.map((l) => normDigits(String(l ?? "")).replace(/\s+/g, " ").trim()).filter(Boolean);
  let ref: string | null = null;
  let refLong: string | null = null;
  let customerName: string | null = null;
  const items: ScreenItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!ref) {
      const m = l.match(/الطلب\s*#\s*(\d{2,7})/);
      if (m) { ref = m[1]; continue; }
    }
    if (!refLong && /^\d{3,}-\d{3,}$/.test(l)) {
      refLong = l;
      // الاسم هو السطر التالي الذي ليس ضجيجاً ولا رقماً
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const c = lines[j];
        if (/^\d/.test(c) || NOISE.test(c) || /^[x×]/i.test(c)) continue;
        customerName = c.slice(0, 120);
        break;
      }
      continue;
    }
    const q = l.match(QTY_LINE);
    if (!q) continue;
    const qty = Number(q[1] ?? q[2]);
    const name = lines[i + 1];
    if (!name || qty < 1 || qty > 50 || PRICE_LINE.test(name) || NOISE.test(name)) continue;
    let option: string | null = null;
    for (let j = i + 2; j < Math.min(i + 5, lines.length); j++) {
      const pm = lines[j].match(PRICE_LINE);
      if (pm) {
        const opt = (pm[2] ?? "").trim();
        if (opt && !/^عنصر$/.test(opt)) option = opt;
        break;
      }
    }
    items.push({ name: name.slice(0, 120), qty, option });
    i += 1;
  }

  // مجموع الشاشة إن كُتب صراحة؛ أسعار الأسطر ليست مجموعاً
  let total: number | null = null;
  const tm = lines.find((l) => /(?:المجموع|الإجمالي|الاجمالي|total)/i.test(l));
  if (tm) {
    const n = Number((tm.match(/([\d,.]{3,})/)?.[1] ?? "").replace(/[,.]/g, ""));
    if (Number.isFinite(n) && n > 0) total = n;
  }
  return { ref, refLong, customerName, items, total, declared: declaredCount(rawLines) };
}

export type AliasRow = { alias_key: string; item_id: string; variant_id: string | null; flavor: string | null };
export type ResolvedLine = { item_id: string; variant_id: string | null; flavor: string | null; qty: number };

/**
 * كل اسم من الشاشة إلى صنفنا: أولاً «الاسم / الخيار» في الأسماء البديلة، ثم
 * الاسم وحده، ثم اسم منيونا نفسه. ما لم يُعرف يعود بالاسم كما ظهر — للتنبيه
 * وللربط من /partners، لا يُخترع.
 */
export function resolveLines(items: ScreenItem[], aliases: AliasRow[], menu: { id: string; name_ar: string }[]): { lines: ResolvedLine[]; unknown: string[] } {
  const byKey = new Map(aliases.map((a) => [a.alias_key, a]));
  const byMenu = new Map(menu.map((m) => [foldArabic(m.name_ar), m.id]));
  const lines: ResolvedLine[] = [];
  const unknown: string[] = [];
  for (const it of items) {
    const full = it.option ? `${it.name} / ${it.option}` : it.name;
    const a = byKey.get(foldArabic(full)) ?? byKey.get(foldArabic(it.name));
    if (a) { lines.push({ item_id: a.item_id, variant_id: a.variant_id, flavor: a.flavor, qty: it.qty }); continue; }
    const id = byMenu.get(foldArabic(it.name));
    if (id) { lines.push({ item_id: id, variant_id: null, flavor: null, qty: it.qty }); continue; }
    unknown.push(full);
  }
  return { lines, unknown };
}

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
