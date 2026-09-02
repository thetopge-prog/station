import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const NL = String.fromCharCode(10);

/**
 * الحارس الذي يمنع تكرار العطل.
 *
 * `bg-<رمز>/N` على لون متغيّر يُرسم **معتماً** — لأن المُصغِّر يبتلع color-mix
 * ويُبقي الاحتياطي. وقد كلّف هذا بطاقة «استلام الصندوق»: لوح أحمر كامل بنصّ
 * داكن، صوّرها صاحب المحل.
 *
 * والعطل ليس لوناً بعينه: كتابة `bg-secondary/40` غداً **لا تُصدر صوتاً**،
 * وتُرسم معتمة، ويكتشفها إنسان بعينه بعد شهر. هذا الاختبار هو الصوت.
 */
// حرفيّ لا مبنيّ بالنصّ: RegExp(`\bbg-…`) داخل قالب نصّي يبتلع الهروب فيطابق صفراً
// ويمرّ الاختبار وهو أعمى — وهذا بالضبط ما حدث في أول محاولة.
const css = readFileSync("src/app/globals.css", "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

/** كل زوج (رمز، نسبة) تستعمله الشيفرة فعلاً، ومن أي ملف. */
function usedTints(): Map<string, string[]> {
  // تُبنى في كل نداء: تعبير /g مشترك يحمل lastIndex بين الملفات، فيطابق صفراً
  // ويمرّ الاختبار وهو أعمى — وهذا ما حدث فعلاً في أول محاولتين.
  const re = /bg-(primary|secondary|accent|muted|card|popover|destructive|success|foreground|background|kraft|cocoa)\/(\d+)/g;
  const used = new Map<string, string[]>();
  for (const file of walk("src")) {
    for (const m of readFileSync(file, "utf8").matchAll(re)) {
      const key = `${m[1]}/${m[2]}`;
      used.set(key, [...(used.get(key) ?? []), file]);
    }
  }
  return used;
}

describe("alpha tints on theme tokens", () => {
  const used = usedTints();

  it("finds the backgrounds the app actually uses", () => {
    expect(used.size).toBeGreaterThan(5);
  });

  it("every one of them has a flat tint — none is left to render opaque", () => {
    const missing: string[] = [];
    for (const [key, files] of used) {
      const [token, n] = key.split("/");
      const varName = `--${token}-${n.padStart(2, "0")}`;
      const rule = `.bg-${token}\\/${n}`;
      if (!css.includes(varName) || !css.includes(rule)) {
        missing.push(`bg-${key}  (${files[0]})`);
      }
    }
    expect(missing, `أضف التدرّج في globals.css:\n${missing.join("\n")}`).toEqual([]);
  });

  it("defines each tint for BOTH themes — a light-only tint freezes in the dark", () => {
    for (const [key] of used) {
      const [token, n] = key.split("/");
      const varName = `--${token}-${n.padStart(2, "0")}:`;
      // مرّتان: :root و :root.dark
      expect(css.split(varName).length - 1, varName).toBe(2);
    }
  });

  /**
   * حبر برتقالي على وشاح برتقالي — العطل الذي لا يُحلّ بتفتيح الوشاح.
   *
   * --primary يعطي ٤٫٥٦ على الأبيض **الخالص**، فأيّ وشاح مهما خفّ ينزل به تحت
   * ٤٫٥ لنصّ ١٢ بكسل. قِيس ٣٫٩٥ في عشرين موضعاً. و--primary-ink أغمق منه
   * ويبلغ ٥٫١٠ على أغمق وشاح مستعمَل، والوشاح يبقى برتقالياً كما طلب صاحب
   * المحل.
   */
  it("never puts text-primary on a primary tint — use text-primary-ink", () => {
    const bad: string[] = [];
    for (const file of walk("src")) {
      readFileSync(file, "utf8").split(NL).forEach((line, i) => {
        if (/bg-primary\/\d/.test(line) && /\btext-primary(?![-\w])/.test(line)) bad.push(file + ":" + (i + 1));
      });
    }
    expect(bad, "استعمل text-primary-ink فوق وشاح برتقالي:" + NL + bad.join(NL)).toEqual([]);
  });
});
