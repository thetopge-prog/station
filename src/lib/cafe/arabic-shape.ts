/**
 * Arabic shaping for thermal printers.
 *
 * A browser does this for free; an ESC/POS printer does not. Send it the raw
 * string "برجر" and it prints ب ر ج ر — four disconnected letterforms, which an
 * Arabic reader has to decode rather than read. The fix is to do the job the
 * text engine would have done: pick each letter's contextual form (isolated /
 * initial / medial / final) from the Unicode Arabic Presentation Forms block,
 * then reverse the run because the printer lays bytes out left-to-right.
 *
 * Pure and table-driven, so it unit-tests without a printer attached.
 */

/** [isolated, final, initial, medial]; null ⇒ this letter has no such form. */
type Forms = [number, number, number | null, number | null];

// Letters in the second group (ا د ذ ر ز و + the hamza/ta-marbuta family) never
// connect to the letter AFTER them, so they have no initial/medial form.
const FORMS: Record<string, Forms> = {
  "ء": [0xfe80, 0xfe80, null, null], // ء
  "آ": [0xfe81, 0xfe82, null, null], // آ
  "أ": [0xfe83, 0xfe84, null, null], // أ
  "ؤ": [0xfe85, 0xfe86, null, null], // ؤ
  "إ": [0xfe87, 0xfe88, null, null], // إ
  "ئ": [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c], // ئ
  "ا": [0xfe8d, 0xfe8e, null, null], // ا
  "ب": [0xfe8f, 0xfe90, 0xfe91, 0xfe92], // ب
  "ة": [0xfe93, 0xfe94, null, null], // ة
  "ت": [0xfe95, 0xfe96, 0xfe97, 0xfe98], // ت
  "ث": [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c], // ث
  "ج": [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0], // ج
  "ح": [0xfea1, 0xfea2, 0xfea3, 0xfea4], // ح
  "خ": [0xfea5, 0xfea6, 0xfea7, 0xfea8], // خ
  "د": [0xfea9, 0xfeaa, null, null], // د
  "ذ": [0xfeab, 0xfeac, null, null], // ذ
  "ر": [0xfead, 0xfeae, null, null], // ر
  "ز": [0xfeaf, 0xfeb0, null, null], // ز
  "س": [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4], // س
  "ش": [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8], // ش
  "ص": [0xfeb9, 0xfeba, 0xfebb, 0xfebc], // ص
  "ض": [0xfebd, 0xfebe, 0xfebf, 0xfec0], // ض
  "ط": [0xfec1, 0xfec2, 0xfec3, 0xfec4], // ط
  "ظ": [0xfec5, 0xfec6, 0xfec7, 0xfec8], // ظ
  "ع": [0xfec9, 0xfeca, 0xfecb, 0xfecc], // ع
  "غ": [0xfecd, 0xfece, 0xfecf, 0xfed0], // غ
  "ـ": [0x0640, 0x0640, 0x0640, 0x0640], // ـ tatweel
  "ف": [0xfed1, 0xfed2, 0xfed3, 0xfed4], // ف
  "ق": [0xfed5, 0xfed6, 0xfed7, 0xfed8], // ق
  "ك": [0xfed9, 0xfeda, 0xfedb, 0xfedc], // ك
  "ل": [0xfedd, 0xfede, 0xfedf, 0xfee0], // ل
  "م": [0xfee1, 0xfee2, 0xfee3, 0xfee4], // م
  "ن": [0xfee5, 0xfee6, 0xfee7, 0xfee8], // ن
  "ه": [0xfee9, 0xfeea, 0xfeeb, 0xfeec], // ه
  "و": [0xfeed, 0xfeee, null, null], // و
  "ى": [0xfeef, 0xfef0, null, null], // ى
  "ي": [0xfef1, 0xfef2, 0xfef3, 0xfef4], // ي
  // Farsi/Urdu letters that show up in Iraqi menu spellings («ساندويچ»)
  "پ": [0xfb56, 0xfb57, 0xfb58, 0xfb59], // پ
  "چ": [0xfb7a, 0xfb7b, 0xfb7c, 0xfb7d], // چ
  "ڤ": [0xfb6a, 0xfb6b, 0xfb6c, 0xfb6d], // ڤ
  "گ": [0xfb92, 0xfb93, 0xfb94, 0xfb95], // گ
};

/** لا-ligatures: ل followed by one of these is a single glyph, not two. */
const LAM_ALEF: Record<string, [number, number]> = {
  "آ": [0xfef5, 0xfef6], // لآ
  "أ": [0xfef7, 0xfef8], // لأ
  "إ": [0xfef9, 0xfefa], // لإ
  "ا": [0xfefb, 0xfefc], // لا
};

/** Combining marks (َ ً ّ …) — invisible for joining purposes. */
const isMark = (c: string) => c >= "ً" && c <= "ْ";

const canStart = (c: string) => FORMS[c]?.[2] != null;
const isArabic = (c: string) => c in FORMS || isMark(c);

/**
 * Convert a string to printer-ready presentation forms, RTL runs reversed.
 * Latin/digit runs are left untouched and keep their left-to-right order — so
 * "برجر 2x 7,750" comes out with the Arabic shaped and reversed and the numbers
 * still readable.
 */
export function shapeArabic(input: string): string {
  const out: string[] = [];
  let run: string[] = [];

  const flush = () => {
    if (run.length) {
      out.push(run.reverse().join(""));
      run = [];
    }
  };

  const chars = [...input];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];

    if (!isArabic(c)) {
      flush();
      out.push(c);
      continue;
    }
    if (isMark(c)) continue; // thermal printers cannot stack diacritics

    // previous visible Arabic letter, skipping marks
    let p = i - 1;
    while (p >= 0 && isMark(chars[p])) p--;
    const prev = p >= 0 ? chars[p] : "";
    // next visible Arabic letter
    let n = i + 1;
    while (n < chars.length && isMark(chars[n])) n++;
    const next = n < chars.length ? chars[n] : "";

    // لا and friends collapse two letters into one glyph
    if (c === "ل" && LAM_ALEF[next]) {
      const joinsBack = prev in FORMS && canStart(prev);
      run.push(String.fromCodePoint(LAM_ALEF[next][joinsBack ? 1 : 0]));
      i = n; // consume the alef
      continue;
    }

    const f = FORMS[c];
    const joinsBack = prev in FORMS && canStart(prev); // a letter precedes AND can connect forward
    const joinsFwd = next in FORMS && f[2] != null; // a letter follows AND this one can connect forward

    let form: number;
    if (joinsBack && joinsFwd) form = f[3] ?? f[1];
    else if (joinsBack) form = f[1];
    else if (joinsFwd) form = f[2] ?? f[0];
    else form = f[0];

    run.push(String.fromCodePoint(form));
  }
  flush();
  return out.join("");
}

/** True if the string contains any Arabic letter — used to pick alignment. */
export function hasArabic(s: string): boolean {
  return [...s].some((c) => c in FORMS);
}
