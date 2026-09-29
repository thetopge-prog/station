import { describe, expect, it } from "vitest";
import {
  cleanInstagram,
  idFingerprint,
  normaliseDigits,
  referralKey,
  studentFormError,
  isMinorStage,
  schoolLabel,
  STAGES,
} from "./student";

describe("بصمة البطاقة", () => {
  it("نفس البطاقة تعطي نفس البصمة مهما اختلف الشكل", () => {
    const a = idFingerprint("١٢٣٤٥٦", "جامعة الأنبار");
    const b = idFingerprint(" 123456 ", "جامعة  الأنبار ");
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  /** رقم «١٢٣٤» يتكرّر بين جامعتين ولا يدلّ على شخصٍ واحد */
  it("والجامعة تدخلها — فرقمان متشابهان في جامعتين ليسا طالباً واحداً", () => {
    expect(idFingerprint("123456", "جامعة الأنبار")).not.toBe(idFingerprint("123456", "جامعة الفلوجة"));
  });

  it("وقراءةٌ فاشلة لا تُبصَم — رقمٌ من حرفين ليس بطاقة", () => {
    expect(idFingerprint("12", "جامعة الأنبار")).toBeNull();
    expect(idFingerprint("123456", "")).toBeNull();
    expect(idFingerprint("", "جامعة الأنبار")).toBeNull();
  });

  it("ولا تحمل الرقم نفسه — البصمة لا تُفكّ", () => {
    expect(idFingerprint("123456", "جامعة الأنبار")).not.toContain("123456");
  });
});

describe("تطبيع الأرقام", () => {
  it("العربية والفارسية تصيران إنجليزية", () => {
    expect(normaliseDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(normaliseDigits("۰۱۲۳")).toBe("0123");
    expect(normaliseDigits("abc 12")).toBe("abc 12");
  });
});

describe("مفتاح نقاط الدعوة", () => {
  /** المفتاح الثابت هو ما يمنع منح النقاط مرّتين لو قُبل الطالب ثم رُفض ثم قُبل */
  it("ثابتٌ لنفس الزوج", () => {
    expect(referralKey("a", "b")).toBe(referralKey("a", "b"));
    expect(referralKey("a", "b")).not.toBe(referralKey("b", "a"));
  });
});

describe("معرّف إنستغرام", () => {
  it("يُنظَّف من @ ومن الرابط", () => {
    expect(cleanInstagram("@ahmed_99")).toBe("ahmed_99");
    expect(cleanInstagram("https://instagram.com/ahmed_99/")).toBe("ahmed_99");
    expect(cleanInstagram("instagram.com/ahmed_99?igshid=x")).toBe("ahmed_99");
  });

  it("والفارغ أو التالف يصير null لا نصّاً فارغاً", () => {
    expect(cleanInstagram("")).toBeNull();
    expect(cleanInstagram(null)).toBeNull();
    expect(cleanInstagram("a")).toBeNull();
    expect(cleanInstagram("اسم عربي")).toBeNull();
  });
});

describe("نموذج التسجيل", () => {
  const ok = { name: "أحمد علي", school: "جامعة الأنبار", phone: "07801234567" };

  it("المكتمل يمرّ", () => {
    expect(studentFormError(ok)).toBeNull();
  });

  it("ويقبل الرقم بأشكاله", () => {
    expect(studentFormError({ ...ok, phone: "+9647801234567" })).toBeNull();
    expect(studentFormError({ ...ok, phone: "٠٧٨٠١٢٣٤٥٦٧" })).toBeNull();
  });

  it("ويردّ الناقص برسالةٍ تقول ما الناقص", () => {
    expect(studentFormError({ ...ok, name: "أ" })).toBe("اكتب الاسم الكامل");
    expect(studentFormError({ ...ok, school: "" })).toContain("اكتب اسم");
    expect(studentFormError({ ...ok, phone: "0780" })).toContain("07XXXXXXXXX");
  });
});

/** البرنامج دعمٌ للطالب لا خصمٌ لطلبة الجامعة وحدهم */
describe("المراحل الدراسية", () => {
  it("تبدأ من الابتدائية وتنتهي بالجامعة، بلا تكرار", () => {
    expect(STAGES.map((s) => s.id)).toEqual(["ابتدائية", "متوسطة", "إعدادية", "معهد", "جامعة"]);
    expect(new Set(STAGES.map((s) => s.id)).size).toBe(STAGES.length);
  });

  /** التلميذ ليس عنده هاتف ولا هوية — وأهله هم من يطلب له */
  it("والابتدائية والمتوسطة مرحلتا أطفال", () => {
    expect(isMinorStage("ابتدائية")).toBe(true);
    expect(isMinorStage("متوسطة")).toBe(true);
    expect(isMinorStage("إعدادية")).toBe(false);
    expect(isMinorStage("جامعة")).toBe(false);
    expect(isMinorStage("لا شيء")).toBe(false);
  });

  it("ويُنادى مكان الدراسة باسمه في كل مرحلة", () => {
    expect(schoolLabel("جامعة")).toBe("الجامعة");
    expect(schoolLabel("معهد")).toBe("المعهد");
    expect(schoolLabel("ابتدائية")).toBe("المدرسة");
  });

  it("والنموذج يرفض مرحلةً لا وجود لها", () => {
    expect(studentFormError({ name: "أحمد علي", school: "مدرسة", phone: "07801234567", stage: "روضة" }))
      .toBe("اختر المرحلة الدراسية");
  });
});
