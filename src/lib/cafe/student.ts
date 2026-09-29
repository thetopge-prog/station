import { createHash } from "node:crypto";

/**
 * منيو الطلاب — الحساب الصافي.
 *
 * بلا شبكة ولا قاعدة ولا React، فيُختبر كما تُختبر `points.ts` و`wall.ts`.
 * وكل ما في هذا الملفّ قرارٌ يُتَّخذ مرّة ويُعاد استعماله في ثلاثة أماكن:
 * صفحة التسجيل، والفعل على الخادم، ولوحة الإدارة.
 */

/** جامعات الأنبار وما حولها — تُعرض قائمةً فلا يكتبها الطالب بيده */
export const UNIVERSITIES = [
  "جامعة الأنبار",
  "الجامعة التقنية الوسطى — الأنبار",
  "كلية المعارف الجامعة",
  "كلية الرافدين الجامعة",
  "جامعة الفلوجة",
  "المعهد التقني — الرمادي",
  "أخرى",
] as const;

/** كم طالباً يدعو الطالب الواحد. سقفٌ يمنع الدعوة أن تصير تجارة */
export const INVITE_CAP = 10;

/** نقاط الداعي حين يُقبَل من دعاه */
export const REFERRAL_POINTS = 50;

/**
 * بصمة البطاقة — لا رقمها.
 *
 * تمنع البطاقة الواحدة من فتح حسابين، ولا تُلزمنا بالاحتفاظ برقم طالبٍ
 * حقيقي. والجامعة تدخل البصمة لأن رقم «١٢٣٤» يتكرّر بين جامعتين ولا يدلّ
 * على شخصٍ واحد.
 *
 * والتطبيع قبل البصم: الأرقام العربية تصير إنجليزية، والفراغات تسقط، والحروف
 * تصير صغيرة — فبطاقةٌ قُرئت مرّتين بخطّين مختلفين تعطي البصمة نفسها.
 */
export function idFingerprint(studentNo: string, university: string): string | null {
  const n = normaliseDigits(studentNo).replace(/\s+/g, "").toLowerCase();
  const u = university.trim().replace(/\s+/g, " ").toLowerCase();
  // رقمٌ أقصر من ثلاثة ليس رقم بطاقة — هو قراءةٌ فاشلة، ولا تُبصَم
  if (n.length < 3 || !u) return null;
  return createHash("sha256").update(`${n}|${u}`).digest("hex");
}

/** ٠١٢٣ → 0123 — الكاميرا تقرأ الأرقام كما طُبعت على البطاقة */
export function normaliseDigits(s: string): string {
  return (s ?? "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

/**
 * مفتاح نقاط الدعوة — **ثابت، لا عشوائي**.
 *
 * `loyalty_events` عليه فهرس فريد جزئي على `idempotency_key`، و`adjust_points`
 * يبتلع التصادم (`on conflict do nothing`). فالمفتاح الثابت هو ما يجعل منح
 * النقاط يقع مرّةً واحدة مهما أُعيد النداء — ومفتاحٌ عشوائي يمنحها كل مرّة،
 * وهي الثغرة التي يعيش عليها من يقبل طالباً ثم يرفضه ثم يقبله.
 */
export const referralKey = (referrer: string, invitee: string): string =>
  `referral:${referrer}:${invitee}`;

/** «@ahmed» و«ahmed» و«instagram.com/ahmed» كلّها معرّفٌ واحد */
export function cleanInstagram(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const handle = s
    // والبروتوكول اختياري: الطالب يلصق «instagram.com/ahmed» بلا https غالباً
    .replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/^@+/, "")
    .trim();
  return /^[A-Za-z0-9._]{2,30}$/.test(handle) ? handle : null;
}

export type StudentForm = { name: string; university: string; phone: string };

/**
 * ما يجب أن يكتمل قبل «سجّلني». نفس نصّ الرسائل يُستعمل على الشاشة وعلى
 * الخادم — فلا يقول أحدهما شيئاً ويقول الآخر غيره.
 */
export function studentFormError(f: StudentForm): string | null {
  if (f.name.trim().length < 2) return "اكتب اسمك الكامل";
  if (!f.university.trim()) return "اختر جامعتك";
  const phone = normaliseDigits(f.phone).replace(/\D/g, "");
  const local = phone.replace(/^00964/, "").replace(/^964/, "");
  const norm = local.startsWith("0") ? local : `0${local}`;
  if (!/^07\d{9}$/.test(norm)) return "رقم الهاتف غير صحيح — الشكل: 07XXXXXXXXX";
  return null;
}
