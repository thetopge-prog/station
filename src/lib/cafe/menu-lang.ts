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
