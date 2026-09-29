import { describe, expect, it } from "vitest";
import {
  cleanInstagram,
  idFingerprint,
  normaliseDigits,
  referralKey,
  studentFormError,
  UNIVERSITIES,
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
  const ok = { name: "أحمد علي", university: "جامعة الأنبار", phone: "07801234567" };

  it("المكتمل يمرّ", () => {
    expect(studentFormError(ok)).toBeNull();
  });

  it("ويقبل الرقم بأشكاله", () => {
    expect(studentFormError({ ...ok, phone: "+9647801234567" })).toBeNull();
    expect(studentFormError({ ...ok, phone: "٠٧٨٠١٢٣٤٥٦٧" })).toBeNull();
  });

  it("ويردّ الناقص برسالةٍ تقول ما الناقص", () => {
    expect(studentFormError({ ...ok, name: "أ" })).toBe("اكتب اسمك الكامل");
    expect(studentFormError({ ...ok, university: "" })).toBe("اختر جامعتك");
    expect(studentFormError({ ...ok, phone: "0780" })).toContain("07XXXXXXXXX");
  });
});

describe("قائمة الجامعات", () => {
  it("فيها جامعة الأنبار و«أخرى» لمن ليست جامعته فيها", () => {
    expect(UNIVERSITIES).toContain("جامعة الأنبار");
    expect(UNIVERSITIES[UNIVERSITIES.length - 1]).toBe("أخرى");
    expect(new Set(UNIVERSITIES).size).toBe(UNIVERSITIES.length);
  });
});
