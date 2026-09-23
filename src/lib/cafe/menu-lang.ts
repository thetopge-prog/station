/**
 * لغة المنيو.
 *
 * لغتان لا خمس: الموقع التعريفي بخمس لغات، لكن الزائر التركي أو الإيطالي
 * يطلب بالإنكليزية — وهي اللغة الثانية التي يقرؤها فعلاً. فكل ما ليس عربياً
 * يفتح المنيو إنكليزياً.
 *
 * ملفٌّ وحده بلا `next/headers` ولا قاعدة بيانات: يستورده مكوّن العميل
 * ومكوّن الخادم معاً، وقد كسر البناءَ مرّةً حشوُ دالّة كهذه في وحدة خادم.
 */
export type MenuLang = "ar" | "en";

export const menuLangOf = (lang: string): MenuLang => (lang === "ar" ? "ar" : "en");

/**
 * الاسم بلغة الصفحة، والعربي احتياطاً.
 *
 * صنفٌ يُضاف غداً بلا ترجمة يظهر باسمه العربي — والاسم العربي على شاشة
 * إنكليزية أوضح من فراغ، والزبون يرى صورته على أي حال.
 */
export function pickName(row: { name_ar: string; name_en?: string | null }, lang: MenuLang): string {
  if (lang === "ar") return row.name_ar;
  return row.name_en?.trim() || row.name_ar;
}

/** والوصف كذلك — وغيابه بالعربية والإنكليزية معاً يعني لا وصف */
export function pickText(ar: string | null, en: string | null | undefined, lang: MenuLang): string | null {
  if (lang === "ar") return ar;
  return en?.trim() || ar;
}

/**
 * البحث عن صنف بالاسم.
 *
 * شاشة الكاشير لم يكن فيها بحثٌ قطّ: مئة وخمسة عشر صنفاً تُدرك بالتنقّل بين
 * الأقسام، وتسعةٌ وتسعون طلباً في اليوم تُضرب في كل نقرة زائدة.
 *
 * والمطابقة تتسامح مع ما يكتبه موظّفٌ مستعجل: التشكيل يُطرح، والألف بأشكالها
 * والتاء المربوطة والياء تُوحَّد — فمن كتب «شاورما» يجد «شاورمة»، ومن كتب
 * «ايس» يجد «آيس».
 */
const AR_FOLD: [RegExp, string][] = [
  [/[\u064B-\u0652\u0640]/g, ""], // تشكيل وتطويل
  [/[أإآٱ]/g, "ا"],
  [/ى/g, "ي"],
  [/ة/g, "ه"],
  [/[ؤئ]/g, "ء"],
];

export function foldArabic(s: string): string {
  let out = s.toLowerCase();
  for (const [re, to] of AR_FOLD) out = out.replace(re, to);
  return out.replace(/\s+/g, " ").trim();
}

export function searchMenu<T extends { name_ar: string; name_en?: string | null }>(
  categories: { name_ar: string; items: T[] }[],
  query: string,
): T[] {
  const q = foldArabic(query);
  if (q.length < 1) return [];
  const hits: T[] = [];
  for (const c of categories) {
    for (const it of c.items) {
      const hay = `${foldArabic(it.name_ar)} ${foldArabic(it.name_en ?? "")} ${foldArabic(c.name_ar)}`;
      if (hay.includes(q)) hits.push(it);
    }
  }
  return hits;
}
