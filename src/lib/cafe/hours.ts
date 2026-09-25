import { CAFE_TZ } from "./time";

/**
 * أوقات الدوام — في مكانٍ واحد، لأنها كانت في عشرة.
 *
 * كانت الجملة «من ٩ الصبح لـ٣ الفجر» مكتوبةً بيدٍ في رسالة البوت، وصفحة
 * «المطعم مغلق»، وخطأ الطلب، والأسئلة الشائعة بخمس لغات، والبيانات المنظَّمة.
 * فلمّا صار افتتاح الجمعة **١ ظهراً** كذبت كلّها دفعةً واحدة — وكلٌّ منها يكذب
 * على زبونٍ ينتظر على بابٍ مغلق.
 *
 * وهذا الملفّ هو الحقيقة الوحيدة. نقيٌّ بلا شبكة ولا قاعدة، فيُختبَر بلا بيئة.
 *
 * **وهو جدولٌ مُعلَن لا بوّابة**: ما يفتح المطعم فعلاً هو وردية الكاشير
 * (`isShopOpen`) لا الساعة — فالمحل يفتح حين يوجد من يستلم. وهذا الجدول يقول
 * للزبون **متى نتوقّع أن نفتح**، لا أكثر.
 */

/** ساعة الافتتاح لكل يوم — بترقيم JS: 0 الأحد … 5 الجمعة … 6 السبت */
export const OPEN_HOUR: readonly number[] = [9, 9, 9, 9, 9, 13, 9];

/** الإغلاق ٣ فجراً — بعد منتصف الليل، فهو من «يوم» أمس */
export const CLOSE_HOUR = 3;

const DAY_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** «٩ الصبح» · «١ الظهر» · «٣ الفجر» — كما يقولها الناس لا كما تُكتب في جدول */
export function hourAr(h: number): string {
  const n = ["", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩", "١٠", "١١", "١٢"][h % 12 === 0 ? 12 : h % 12];
  if (h < 5) return `${n} الفجر`;
  if (h < 12) return `${n} الصبح`;
  if (h < 16) return `${n} الظهر`;
  if (h < 19) return `${n} العصر`;
  return `${n} الليل`;
}

/** اليوم والدقيقة بتوقيت بغداد — أياً كانت ساعة الجهاز */
export function baghdadNow(now: Date = new Date(), tz: string = CAFE_TZ): { day: number; minutes: number } {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  // منتصف الليل يأتي "24" من بعض البيئات
  const h = Number(get("hour")) % 24;
  return { day, minutes: h * 60 + Number(get("minute")) };
}

/**
 * هل نحن داخل ساعات الدوام المُعلَنة؟
 *
 * الساعات تعبر منتصف الليل، فيومٌ يفتح ٩ ويغلق ٣ فجراً يعني: من ٩:٠٠ إلى
 * ٢٣:٥٩ من يومه، ومن ٠٠:٠٠ إلى ٢:٥٩ من اليوم الذي بعده — وتلك ساعاتُ **أمس**
 * لا ساعاتُ اليوم الجديد.
 */
export function withinHours(now: Date = new Date()): boolean {
  const { day, minutes } = baghdadNow(now);
  if (minutes < CLOSE_HOUR * 60) {
    // ما قبل الثالثة فجراً يتبع دوام أمس، وأمس كان مفتوحاً بالضرورة
    return true;
  }
  return minutes >= OPEN_HOUR[day] * 60;
}

/** متى نفتح بعد هذه اللحظة: اليوم أم باچر، وعلى أي ساعة */
export function nextOpening(now: Date = new Date()): { today: boolean; hour: number; dayName: string } {
  const { day, minutes } = baghdadNow(now);
  if (minutes < OPEN_HOUR[day] * 60) return { today: true, hour: OPEN_HOUR[day], dayName: DAY_AR[day] };
  const next = (day + 1) % 7;
  return { today: false, hour: OPEN_HOUR[next], dayName: DAY_AR[next] };
}

/**
 * ما يُقال للزبون حين لا يستقبل المطعم طلباً.
 *
 * وحالتان لا واحدة: مغلقٌ **خارج** الدوام فيُقال متى نفتح — وهو وعدٌ يُنتظَر؛
 * ومغلقٌ **داخل** الدوام (أُقفل الدرج مبكّراً، أو تأخّر فتحه) فلا يُوعَد بساعةٍ
 * لا نضمنها، بل يُقال الصدق ويُعطى الهاتف.
 *
 * وما دام الإغلاق بعد منتصف الليل فنافذة «خارج الدوام» كلّها تقع قبل افتتاح
 * **اليوم نفسه** — فلا تقول هذه الرسالة «باچر» أبداً. و`nextOpening` تعرفها
 * لأنها دالّةٌ عامّة، ولو قُدِّم إغلاقٌ يوماً لصارت مستعملة.
 */
export function closedText(phone: string, now: Date = new Date()): string {
  if (withinHours(now)) {
    return `المطعم مسدود هسة 🌙 جرّب بعد شوية، وإذا مستعجل اتصل بينا ${phone} 🧡`;
  }
  const n = nextOpening(now);
  const when = n.today ? "اليوم" : `باچر ${n.dayName}`;
  return `المطعم مسدود هسة 🌙 نفتح ${when} الساعة ${hourAr(n.hour)} — دزلنا طلبك بعدها ونكون بخدمتك 🧡`;
}

/** نفس الرسالة لمن كتب طلباً كاملاً — لا يُترك ظانّاً أن طلبه محفوظ */
export function closedOrderText(phone: string, now: Date = new Date()): string {
  if (withinHours(now)) {
    return `طلبك ما ينحفظ هسة 🌙 المطعم مسدود — اتصل بينا ${phone} ونشوفلك حل 🧡`;
  }
  const n = nextOpening(now);
  const when = n.today ? "اليوم" : `باچر ${n.dayName}`;
  return `طلبك ما ينحفظ هسة 🌙 المطعم مسدود — دزه ${when} من ${hourAr(n.hour)} ونجهزه فوراً 🧡`;
}

/**
 * سطر الدوام للعرض الساكن (الموقع، صفحة الإغلاق، الأسئلة الشائعة).
 *
 * يُشتقّ من الجدول لا يُكتب بيد: يوم الجمعة استثناءٌ اليوم، وقد يصير غيره
 * استثناءً غداً — والسطر يتبعه وحده.
 */
export function hoursLine(): string {
  const common = OPEN_HOUR.filter((_, i) => i !== 5);
  const same = common.every((h) => h === common[0]);
  const base = `كل يوم من ${hourAr(common[0])} حتى ${hourAr(CLOSE_HOUR)}`;
  if (!same) return base;
  return OPEN_HOUR[5] === common[0] ? base : `${base}، والجمعة من ${hourAr(OPEN_HOUR[5])}`;
}
