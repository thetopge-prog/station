import { cookies } from "next/headers";

/**
 * «الجهاز يتذكّر صاحبه» — بديلُ البحث برقم الهاتف.
 *
 * طلبت الإدارة أن تظهر بيانات الزبون في صفحة الطلب بدل أن يكتبها كل مرّة.
 * والطريق المباشر — «اكتب رقمك فتظهر بياناتك» — يفتح باباً خطيراً: أرقام
 * الموبايل العراقية متتابعة، فمن يجرّبها آلياً **يحصد أسماء الزبائن وعناوين
 * بيوتهم**. ولا يوجد في النظام أي حدٍّ على المحاولات.
 *
 * فالبيانات تُحفظ في متصفّح صاحبها وحده: الخادم لا يُسأل عن شيء، فلا يُحصَد
 * منه شيء. ومن طلب من جهازٍ جديد يكتبها مرّةً واحدة.
 *
 * و`httpOnly` لأنها بيانات شخصية: سكربتٌ خبيث على الصفحة لا يقرؤها أيضاً.
 */

const KEY = "st-me";
const YEAR = 60 * 60 * 24 * 365;

export type RememberedCustomer = { name?: string; phone?: string; address?: string };

/** يُنادى بعد طلبٍ ناجح — من فعلٍ خادميّ وحده (الكعكات لا تُكتب في الرندر) */
export async function rememberCustomer(me: RememberedCustomer): Promise<void> {
  const keep: RememberedCustomer = {};
  if (me.name?.trim()) keep.name = me.name.trim().slice(0, 60);
  if (me.phone?.trim()) keep.phone = me.phone.trim().slice(0, 20);
  if (me.address?.trim()) keep.address = me.address.trim().slice(0, 200);
  if (!Object.keys(keep).length) return;
  try {
    const jar = await cookies();
    jar.set(KEY, JSON.stringify(keep), {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: YEAR,
    });
  } catch {
    // كعكة لا تُكتب لا تُفشل طلباً — الزبون يكتب بياناته، لا أكثر
  }
}

/** تُقرأ في الصفحة الخادميّة وتُمرَّر للواجهة قِيَماً ابتدائية */
export async function recallCustomer(): Promise<RememberedCustomer> {
  try {
    const raw = (await cookies()).get(KEY)?.value;
    if (!raw) return {};
    const v = JSON.parse(raw) as RememberedCustomer;
    return {
      name: typeof v.name === "string" ? v.name : undefined,
      phone: typeof v.phone === "string" ? v.phone : undefined,
      address: typeof v.address === "string" ? v.address : undefined,
    };
  } catch {
    return {};
  }
}
