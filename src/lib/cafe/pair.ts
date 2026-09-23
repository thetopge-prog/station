/**
 * اقتران هاتف الموظّف بشاشة التجهيز — حين يموت القارئ.
 *
 * القارئ جهازٌ واحد لا بديل له: إن نفد شحنه في ذروة الليل عاد الموظّف إلى
 * الضغط بالفأرة على كل طلب. فالهاتف يصير قارئاً.
 *
 * والهاتف **كاميرا غبيّة لا أكثر**: لا يسجّل دخولاً، ولا ينادي الخادم، ولا
 * يعرف شيئاً عن الطلبات. يقرأ الرمز ويبثّه إلى الشاشة، والشاشةُ — وهي مسجّلة
 * الدخول فعلاً — تنادي `onScan` نفسها التي ينادِيها القارئ السلكي. فمسارُ
 * التأكيد واحد، ولا يفترق مدخلان في السلوك، ويبقى ختم «من أكّد التجهيز»
 * على اسم من يقف أمام الشاشة.
 *
 * والبديل كان: جدول رموز مؤقّتة، و`requireStaffOrToken` لا وجود لها، وخسارة
 * ذلك الختم — ثمنٌ كبير لكاميرا.
 *
 * هذا الملف هو المنطق الصافي وحده: لا React ولا Supabase، فيُختبر كجدول.
 */

/** ما يمرّ في القناة. `scan` وحده يحمل عملاً؛ الباقي مصافحة. */
export type PairEvent = "hello" | "welcome" | "scan" | "ack" | "bye";

export type PairMessage =
  | { kind: "hello" }
  | { kind: "welcome"; screen: string }
  | { kind: "scan"; code: string; at: number }
  | { kind: "ack"; ok: boolean; text: string }
  | { kind: "bye"; reason: "closed" | "taken" };

/**
 * معرّف الاقتران — عشوائيٌّ يُولَّد في المتصفّح ولا يُخزَّن في مكان.
 *
 * لا يُولَّد على الخادم: الصفحة تُبنى مرّة وتُخدَّم مراراً، فمعرّفٌ من مكوّن
 * خادم قد يعيش في ذاكرة وسيطة ويصل هاتفين في ليلتين. وهو يموت مع إغلاق
 * اللسان، فلا شيء يبقى بعده.
 */
export function newPairId(): string {
  // randomUUID يحتاج سياقاً آمناً (HTTPS)، وهو شرط الكاميرا أصلاً — والبديل
  // موجود لبيئة الاختبار ولمتصفّح قديم على شبكة المحل
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** اسم القناة. بادئةٌ صريحة كي لا يصطدم بقنوات `postgres_changes` القائمة */
export const pairChannel = (id: string): string => `pair:${id}`;

/** الرابط الذي يحمله الرمز — الأصل يأتي من المتصفّح فيتبع الدومين الحالي */
export const pairUrl = (origin: string, id: string): string => `${origin.replace(/\/$/, "")}/scan/${id}`;

/** معرّف صالح شكلاً — يُفحص قبل الاشتراك، فلا نفتح قناةً باسمٍ من مسارٍ ملعوب به */
export const isPairId = (id: string | null | undefined): boolean => /^[0-9a-f-]{16,64}$/i.test(id ?? "");

/**
 * قراءةٌ تُبثّ أم تُهمَل؟
 *
 * التذكرة تبقى في مجال الكاميرا ثانيتين بعد قراءتها، والمكتبة تقرأ خمس عشرة
 * مرّة في الثانية — فبلا كبحٍ يصل الشاشةَ ثلاثون نداءً عن طلبٍ واحد. الكبح
 * على **الرمز نفسه** لا على الزمن وحده، فتذكرتان متتاليتان تمرّان فوراً.
 */
export const REPEAT_MS = 3000;

export function shouldSend(code: string, last: { code: string; at: number } | null, now: number): boolean {
  if (!code.trim()) return false;
  if (!last) return true;
  if (last.code !== code) return true;
  return now - last.at >= REPEAT_MS;
}

/**
 * هل هذه الرسالة من الطرف الآخر ومفهومة؟
 *
 * القناة عامّة (مفتاح anon)، فكل ما يصل منها بيانات لا أوامر: يُفحص شكلها
 * قبل أن يُبنى عليها عمل. وأقصى ما يفعله دخيلٌ صوّر الرمز أن يعلّم طلباً
 * «جاهز» قبل أوانه — لا مال ولا بيانات زبائن — ويراه من يقف أمام الشاشة
 * لحظتَها.
 */
export function parseMessage(raw: unknown): PairMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  switch (m.kind) {
    case "hello":
      return { kind: "hello" };
    case "welcome":
      return typeof m.screen === "string" ? { kind: "welcome", screen: m.screen.slice(0, 40) } : null;
    case "scan": {
      const code = typeof m.code === "string" ? m.code.trim().slice(0, 200) : "";
      return code ? { kind: "scan", code, at: typeof m.at === "number" ? m.at : Date.now() } : null;
    }
    case "ack":
      return typeof m.text === "string" ? { kind: "ack", ok: m.ok === true, text: m.text.slice(0, 120) } : null;
    case "bye":
      return { kind: "bye", reason: m.reason === "taken" ? "taken" : "closed" };
    default:
      return null;
  }
}

/**
 * لماذا لا تفتح الكاميرا؟
 *
 * `getUserMedia` يرفض خارج HTTPS رفضاً صامتاً يشبه عطل الكاميرا تماماً —
 * وأجهزة المحل التي ما زالت على عنوان الهَب المحلّي ستقع فيه. فيُقال السبب
 * بدل «تعذّر تشغيل الكاميرا» المبهمة.
 */
export function cameraBlockedReason(protocol: string, hostname: string): string | null {
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  if (protocol === "https:" || local) return null;
  return "الكاميرا لا تعمل إلا على رابط آمن (https). افتح شاشة التجهيز على stationiraq.com ثم أعد قراءة الرمز.";
}
