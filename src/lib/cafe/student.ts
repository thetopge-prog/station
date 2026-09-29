import { createHash } from "node:crypto";

/**
 * منيو الطلاب — الحساب الصافي.
 *
 * بلا شبكة ولا قاعدة ولا React، فيُختبر كما تُختبر `points.ts` و`wall.ts`.
 * وكل ما في هذا الملفّ قرارٌ يُتَّخذ مرّة ويُعاد استعماله في ثلاثة أماكن:
 * صفحة التسجيل، والفعل على الخادم، ولوحة الإدارة.
 */

/**
 * المراحل الدراسية — من الابتدائية إلى الجامعة.
 *
 * البرنامج دعمٌ للطالب لا خصمٌ لطلبة الجامعة وحدهم. وتلميذ الابتدائية طالبٌ
 * كذلك — لكن ليس عنده هاتف ولا هوية، وأهله هم من يطلب له. فالمرحلة تُسأل
 * أولاً، ويتبدّل النموذج كلّه بحسبها.
 */
export const STAGES = [
  { id: "ابتدائية", label: "ابتدائية", hint: "الصفوف ١–٦", minor: true },
  { id: "متوسطة", label: "متوسطة", hint: "الصفوف ١–٣", minor: true },
  { id: "إعدادية", label: "إعدادية", hint: "علمي وأدبي", minor: false },
  { id: "معهد", label: "معهد", hint: "تقني ومهني", minor: false },
  { id: "جامعة", label: "جامعة", hint: "كل الكليات", minor: false },
] as const;

export type Stage = (typeof STAGES)[number]["id"];

export const isStage = (v: string): v is Stage => STAGES.some((s) => s.id === v);

/** هل هذه مرحلةُ طفل؟ فلا تُطلَب هويته ولا هاتفه، ويُسجَّل بهاتف وليّه */
export const isMinorStage = (stage: string): boolean =>
  STAGES.find((s) => s.id === stage)?.minor ?? false;

/** ماذا نسمّي مكان الدراسة في هذه المرحلة — «مدرستك» لا «جامعتك» للتلميذ */
export const schoolLabel = (stage: string): string =>
  stage === "جامعة" ? "الجامعة" : stage === "معهد" ? "المعهد" : "المدرسة";

/** وماذا نسمّي الصفّ — «كليتك» للجامعي و«صفّك» لمن دونه */
export const classLabel = (stage: string): string => (stage === "جامعة" ? "الكلية" : "الصف");

/** كم طالباً يدعو الطالب الواحد. سقفٌ يمنع الدعوة أن تصير تجارة */
export const INVITE_CAP = 10;

/** نقاط الداعي حين يُقبَل من دعاه */
export const REFERRAL_POINTS = 50;

/**
 * بصمة البطاقة — لا رقمها.
 *
 * تمنع البطاقة الواحدة من فتح حسابين، ولا تُلزمنا بالاحتفاظ برقم طالبٍ
 * حقيقي. والمدرسة تدخل البصمة لأن رقم «١٢٣٤» يتكرّر بين مدرستين ولا يدلّ
 * على شخصٍ واحد.
 *
 * والتطبيع قبل البصم: الأرقام العربية تصير إنجليزية، والفراغات تسقط، والحروف
 * تصير صغيرة — فبطاقةٌ قُرئت مرّتين بخطّين مختلفين تعطي البصمة نفسها.
 */
export function idFingerprint(studentNo: string, school: string): string | null {
  const n = normaliseDigits(studentNo).replace(/\s+/g, "").toLowerCase();
  const u = school.trim().replace(/\s+/g, " ").toLowerCase();
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

export type StudentForm = { name: string; school: string; phone: string; stage?: string };

/**
 * ما يجب أن يكتمل قبل «سجّلني». نفس نصّ الرسائل يُستعمل على الشاشة وعلى
 * الخادم — فلا يقول أحدهما شيئاً ويقول الآخر غيره.
 */
export function studentFormError(f: StudentForm): string | null {
  if (f.name.trim().length < 2) return "اكتب الاسم الكامل";
  if (f.stage !== undefined && !isStage(f.stage)) return "اختر المرحلة الدراسية";
  if (f.school.trim().length < 2) return `اكتب اسم ${schoolLabel(f.stage ?? "جامعة")}`;
  const phone = normaliseDigits(f.phone).replace(/\D/g, "");
  const local = phone.replace(/^00964/, "").replace(/^964/, "");
  const norm = local.startsWith("0") ? local : `0${local}`;
  if (!/^07\d{9}$/.test(norm)) return "رقم الهاتف غير صحيح — الشكل: 07XXXXXXXXX";
  return null;
}
