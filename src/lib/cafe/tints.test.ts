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
   * برتقالي العلامة يبقى، والحبر وحده يغمق.
   *
   * #ff6b00 لون التغليف، ولا يُعايَر — قالها صاحب المحل بعد أن غمّقتُه. وهو
   * سطحٌ ممتاز وحبرٌ رديء: ٢٫٨٦ على الأبيض. فالقاعدة الواحدة أدناه تغمّق النصّ
   * وحده وتترك كل سطح برتقالياً. حذفتُها مرّةً وغمّقتُ العلامة بدلها؛ هذا
   * الاختبار يمنع تكرار ذلك.
   */
  it("keeps brand orange and darkens only the ink", () => {
    expect(css, "القاعدة التي تُبقي #ff6b00 سطحاً وتغمّق النصّ").toMatch(
      /\.text-primary\s*\{\s*color:\s*var\(--primary-ink\)/,
    );
    expect(css.split("--primary-ink:").length - 1, "--primary-ink في :root و .dark").toBe(2);
  });

  /**
   * قيمة تدرّج ليست لوناً — العطل الذي لا يراه فحص التباين.
   *
   * كتب مولّدي `--success-10: dark;` في الكتلة الليلية. و`dark` ليس لوناً، فـ
   * `background-color: var(--success-10)` باطلة و`bg-success/10` **بلا خلفية**
   * ليلاً. ولم يره الفحص لأن الخلفية الغائبة تُصعِّد القياس إلى خلفية الأب،
   * فيمرّ النصّ. أعمى عن الغائب بحكم تصميمه.
   */
  it("every tint value is an actual colour", () => {
    const bad = [...css.matchAll(/(--[a-z-]+-\d{2,3}):\s*([^;]+);/g)]
      .filter((m) => !/^#[0-9a-f]{3,8}$/i.test(m[2].trim()))
      .map((m) => m[1] + ": " + m[2].trim());
    expect(bad, "قيمة تدرّج ليست لوناً:" + NL + bad.join(NL)).toEqual([]);
  });
});
