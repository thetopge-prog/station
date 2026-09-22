import { describe, expect, it } from "vitest";
import { isRtl, SITE, SITE_LANGS, type SiteCopy } from "./copy";

/**
 * لا نصّ ناقص على صفحة عامة: لو نسيت لغةٌ سطراً لظهر فراغ لزائر لا نعرف أنه زار.
 * الأنواع تمسك المفاتيح، وهذا يمسك القيم الفارغة والقوائم القصيرة.
 */
const leaves = (v: unknown, path = ""): [string, string][] =>
  typeof v === "string"
    ? [[path, v]]
    : Array.isArray(v)
      ? v.flatMap((x, i) => leaves(x, `${path}[${i}]`))
      : v && typeof v === "object"
        ? Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => leaves(x, path ? `${path}.${k}` : k))
        : [];

describe("site copy — five languages, nothing missing", () => {
  const arPaths = leaves(SITE.ar).map(([p]) => p);

  for (const lang of SITE_LANGS) {
    it(`${lang} has every line the Arabic page has, none of them empty`, () => {
      const entries = leaves(SITE[lang]);
      expect(entries.map(([p]) => p)).toEqual(arPaths);
      const empty = entries.filter(([, text]) => text.trim().length < 2).map(([p]) => p);
      expect(empty).toEqual([]);
    });
  }

  it("keeps the card lists the same length across languages", () => {
    const counts = (c: SiteCopy) => [c.about.length, c.tech.length, c.quality.length, c.franchisePoints.length];
    for (const lang of SITE_LANGS) expect(counts(SITE[lang])).toEqual(counts(SITE.ar));
  });

  it("writes Arabic and Kurdish right-to-left, the rest left-to-right", () => {
    expect(SITE_LANGS.filter(isRtl)).toEqual(["ar", "ku"]);
  });
});
