/**
 * رقمٌ بلا اسم لم يعد يُقبل.
 *
 * قرار المالك بدأ من رقمٍ في القاعدة: ٢٨٩ طلب كاشير فيه هاتف الزبون ولا اسم
 * معه — أي ٢٨٩ مرّة عرفنا كيف نصل إليه ولم نعرف بمن نناديه، وسجلّه صار
 * «عميل ستيشن78». والاسم مع الرقم يجعل الطلب يرتبط بصاحبه لا بسلسلة أرقام.
 *
 * دالّةٌ صافية في ملفّ يقرؤه المتصفّح والخادم معاً: الشاشة تمنع قبل الضغط،
 * والخادم يمنع لأن الشاشة قد تُلتَفّ عليها. والقاعدتان واحدة لا اثنتان
 * تفترقان.
 *
 * ولا يُطلب الاسم حين لا رقم: بيعُ الكاونتر النقدي السريع — ثلثا طلبات المحلّ —
 * لا هاتف فيه ولا سبب لتعطيله.
 */

/** الرسالة حين يمتنع، و null حين يمرّ */
export function nameWithPhoneError(phone: string | null | undefined, name: string | null | undefined): string | null {
  const hasPhone = (phone ?? "").replace(/\D/g, "").length > 0;
  if (!hasPhone) return null;
  return (name ?? "").trim().length >= 2 ? null : "اكتب اسم الزبون مع الرقم — الاسم صار مطلوباً مع كل رقم.";
}

/** هل تُظهر الشاشة الخانة مطلوبة الآن؟ */
export const needsName = (phone: string | null | undefined, name: string | null | undefined): boolean =>
  nameWithPhoneError(phone, name) !== null;
