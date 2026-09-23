import { describe, expect, it } from "vitest";
import {
  bezelPx,
  canvasWidth,
  clockAt,
  LOOP_MS,
  loopPhase,
  sceneAt,
  SCENES,
  sceneStarts,
  scenesTotal,
  screenIndex,
  SCREENS,
  sliceOffset,
  WALL_COPY,
  WALL_MENU,
  WALL_NAME,
  WALL_SERVICES,
} from "./wall";

/**
 * الجدار يعمل بلا أحد يراقبه ساعاتٍ طوالاً على أربعة أجهزة. وما يُكسره ليس
 * جمال المشهد بل حسابٌ يزيح شاشةً عن أختها — فالاختبار هنا على الحساب وحده.
 */
describe("screenIndex", () => {
  it("يقبل الشاشات الأربع", () => {
    for (const n of ["1", "2", "3", "4"]) expect(screenIndex(n)).toBe(Number(n));
  });

  it("يرفض ما عداها — الرقم يأتي من المسار وهو مدخل مستخدم", () => {
    for (const bad of ["0", "5", "-1", "1.5", "٢", "", " 1", "1a", undefined]) {
      expect(screenIndex(bad), String(bad)).toBeNull();
    }
  });
});

describe("loopPhase", () => {
  it("يدور داخل الدورة ولا يخرج عنها", () => {
    for (const t of [0, 1, 59_999, LOOP_MS - 1, LOOP_MS, LOOP_MS * 7 + 123]) {
      const p = loopPhase(t);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(LOOP_MS);
    }
  });

  it("يعود إلى الصفر عند رأس الدورة", () => {
    expect(loopPhase(0)).toBe(0);
    expect(loopPhase(LOOP_MS)).toBe(0);
    expect(loopPhase(LOOP_MS * 3)).toBe(0);
  });

  it("شاشتان تُفتحان في اللحظة نفسها تريان الطور نفسه", () => {
    const now = 1_700_000_123_456;
    expect(loopPhase(now)).toBe(loopPhase(now));
  });

  it("لا ينكسر على زمنٍ سالب — ساعةُ جهازٍ مضبوطة خطأً لا تُنتج NaN", () => {
    expect(loopPhase(-1)).toBe(LOOP_MS - 1);
    expect(Number.isFinite(loopPhase(-LOOP_MS * 2 - 5))).toBe(true);
  });
});

describe("sliceOffset", () => {
  it("كل شاشة تُظهر ربعها", () => {
    expect(sliceOffset(1)).toBe("-0vw");
    expect(sliceOffset(2)).toBe("-100vw");
    expect(sliceOffset(3)).toBe("-200vw");
    expect(sliceOffset(4)).toBe("-300vw");
  });

  it("بوحدات المنفذ لا بالبكسل — التلفزيون يقرأ منفذه ٩٦٠ لا ١٩٢٠", () => {
    for (let n = 1; n <= SCREENS; n++) expect(sliceOffset(n)).toMatch(/vw$/);
  });
});

describe("تعويض الحافّة", () => {
  it("بلا تعويض: اللوحة أربع شاشات بالضبط", () => {
    expect(canvasWidth(0)).toBe("400vw");
    expect(canvasWidth()).toBe("400vw");
  });

  it("مع تعويض تتّسع بثلاث فجوات — بين أربع شاشات ثلاثة حدود لا أربعة", () => {
    expect(canvasWidth(24)).toBe("calc(400vw + 72px)");
  });

  it("وكل شاشة تُزاح بعرضها زائد فجوة، فما تحت الإطار لا يُرسَم مرّتين", () => {
    expect(sliceOffset(1, 24)).toBe("calc(-0vw - 0px)");
    expect(sliceOffset(2, 24)).toBe("calc(-100vw - 24px)");
    expect(sliceOffset(4, 24)).toBe("calc(-300vw - 72px)");
  });

  it("الشاشة الأولى لا تُزاح أبداً، بتعويضٍ أو بغيره", () => {
    expect(sliceOffset(1)).toBe("-0vw");
    expect(sliceOffset(1, 40)).toBe("calc(-0vw - 0px)");
  });
});

describe("نصوص الجدار", () => {
  it("التكوين يُقرأ «المحطة تفزعلك»", () => {
    expect(WALL_NAME).toBe("المحطة تفزعلك");
  });

  it("لا نصّ فارغ", () => {
    for (const [k, v] of Object.entries(WALL_COPY)) expect(v.trim(), k).not.toBe("");
  });

  it("الكلمة المميَّزة جزءٌ من سطرها فعلاً", () => {
    expect(WALL_COPY.freshTop).toContain(WALL_COPY.freshAccentTop);
    expect(WALL_COPY.freshBottom).toContain(WALL_COPY.freshAccentBottom);
  });

  it("أقسام المنيو وطرق الطلب مكتوبة لا فارغة", () => {
    expect(WALL_MENU.length).toBeGreaterThan(3);
    for (const c of WALL_MENU) expect(c.trim()).not.toBe("");
    expect(WALL_SERVICES).toHaveLength(SCREENS);
    for (const s of WALL_SERVICES) {
      expect(s.title.trim()).not.toBe("");
      expect(s.hint.trim()).not.toBe("");
    }
  });
});

describe("bezelPx", () => {
  it("بلا معامل لا تعويض", () => {
    expect(bezelPx(undefined)).toBe(0);
    expect(bezelPx("")).toBe(0);
    expect(bezelPx("0")).toBe(0);
  });

  it("يقرأ الرقم ويقرّبه", () => {
    expect(bezelPx("24")).toBe(24);
    expect(bezelPx("23.6")).toBe(24);
    expect(bezelPx(["18"])).toBe(18);
  });

  it("يتجاهل ما ليس رقماً بدل أن يكسر التخطيط", () => {
    for (const bad of ["abc", "-5", "NaN", "Infinity"]) expect(bezelPx(bad), bad).toBe(0);
  });

  it("يسقف الرقم — حافّة بعرض ٩٩٩ بكسل خطأُ كتابةٍ لا قياس", () => {
    expect(bezelPx("999")).toBe(200);
  });
});

describe("clockAt", () => {
  it("بلا ?t= تُستعمل اللحظة الحالية", () => {
    expect(clockAt(undefined, 555)).toBe(555);
    expect(clockAt("abc", 555)).toBe(555);
    expect(clockAt("-3", 555)).toBe(555);
  });

  it("مع ?t= تُجمَّد اللوحة — وعليه يقوم برهان الاتّصال البصري", () => {
    expect(clockAt("42000", 555)).toBe(42000);
    expect(clockAt("0", 555)).toBe(0);
  });
});

describe("جدول المشاهد", () => {
  it("مجموع المُدَد يساوي الدورة بالضبط — ثانيةٌ زائدة تُفسد العودة", () => {
    expect(scenesTotal()).toBe(LOOP_MS);
  });

  it("لا مشهد بلا مدّة ولا باسمٍ مكرّر", () => {
    const ids = SCENES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SCENES) {
      expect(s.ms, s.id).toBeGreaterThan(0);
      expect(s.title.trim(), s.id).not.toBe("");
    }
  });

  it("البدايات تُشتقّ متتابعة من الصفر", () => {
    const starts = sceneStarts();
    expect(starts[SCENES[0].id]).toBe(0);
    expect(starts[SCENES[1].id]).toBe(SCENES[0].ms);
    expect(starts[SCENES[2].id]).toBe(SCENES[0].ms + SCENES[1].ms);
  });

  it("sceneAt يعطي المشهد الصحيح على حدوده", () => {
    const starts = sceneStarts();
    expect(sceneAt(0).id).toBe(SCENES[0].id);
    expect(sceneAt(SCENES[0].ms - 1).id).toBe(SCENES[0].id);
    expect(sceneAt(SCENES[0].ms).id).toBe(SCENES[1].id);
    expect(sceneAt(starts.burger).id).toBe("burger");
    expect(sceneAt(LOOP_MS - 1).id).toBe(SCENES[SCENES.length - 1].id);
  });
});
