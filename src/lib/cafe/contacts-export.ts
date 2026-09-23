/**
 * تصدير أرقام الزبائن إلى ملفّ يفتحه الهاتف أو أداة الإعلان.
 *
 * الغاية إعادة الاستهداف: قائمةٌ في النظام لا تصل إلى واتساب ولا إلى حملة
 * إعلانية هي قائمةٌ لا تُستعمل. صيغتان لأن المستهلكين اثنان — دفتر جهات
 * الاتصال في الهاتف يبتلع vCard، وأدوات الإعلان تطلب CSV.
 *
 * دوالٌّ صافية بلا قاعدة بيانات ولا متصفّح: هي المكان الذي تُخطئ فيه
 * الفاصلةُ في اسم، أو رقمٌ بلا صيغة دولية، فتُختبر هنا لا على جهاز أحد.
 */

export type ContactRow = { name: string | null; phone: string | null };

/**
 * رقم عراقي بالصيغة الدولية.
 *
 * دفتر الهاتف يخزّن ما يُعطى له حرفياً: «07801234567» محفوظاً على جهازٍ خارج
 * العراق لا يتّصل بأحد. و«+964…» يعمل في كل مكان، وواتساب يقبله كما هو.
 */
export function e164(phone: string | null): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  if (/^07\d{9}$/.test(d)) return `+964${d.slice(1)}`;
  if (/^9647\d{9}$/.test(d)) return `+${d}`;
  return null;
}

/** ملف جهات اتصال — يُفتح على أندرويد وآيفون بلا وسيط */
export function toVcf(rows: ContactRow[]): string {
  const out: string[] = [];
  for (const r of rows) {
    const tel = e164(r.phone);
    // بلا رقم صالح لا معنى لجهة اتصال — ولا نُدخل رقماً مكسوراً في دفتر أحد
    if (!tel) continue;
    const name = (r.name ?? "").trim() || tel;
    out.push(
      "BEGIN:VCARD",
      "VERSION:3.0",
      // FN وحده يكفي القارئات الحديثة، وN موجود لما هو أقدم منها
      `FN:${vcfEscape(name)}`,
      `N:${vcfEscape(name)};;;;`,
      `TEL;TYPE=CELL:${tel}`,
      "END:VCARD",
    );
  }
  // CRLF لا LF: معيار vCard يفرضه، وبعض الهواتف ترفض الملف بدونه
  return out.length ? out.join("\r\n") + "\r\n" : "";
}

/** الفاصلة والفاصلة المنقوطة والشرطة المائلة تحمل معنًى في vCard */
const vcfEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/[;,]/g, (m) => `\\${m}`).replace(/\r?\n/g, "\\n");

export type CsvRow = ContactRow & {
  orders_count?: number;
  total_spent?: number;
  last_order?: string | null;
};

/**
 * جدول للأدوات الإعلانية.
 *
 * وبادئة BOM: إكسل على ويندوز يقرأ CSV بترميز النظام لا UTF-8، فتتحوّل
 * الأسماء العربية إلى رموز — والمالك يفتحه بإكسل لا بمحرّر نصوص.
 */
export function toCsv(rows: CsvRow[]): string {
  const head = ["الاسم", "الهاتف", "الهاتف الدولي", "عدد الطلبات", "مجموع الإنفاق", "آخر طلب"];
  const body = rows.map((r) =>
    [
      r.name ?? "",
      r.phone ?? "",
      e164(r.phone) ?? "",
      String(r.orders_count ?? 0),
      String(r.total_spent ?? 0),
      (r.last_order ?? "").slice(0, 10),
    ]
      .map(csvCell)
      .join(","),
  );
  return "﻿" + [head.map(csvCell).join(","), ...body].join("\r\n") + "\r\n";
}

/**
 * خلية CSV.
 *
 * الاقتباس حين تحوي الخلية فاصلة أو اقتباساً أو سطراً جديداً — واسمٌ مثل
 * «أبو علي، الكراج» بلا اقتباس يصير عمودين ويزيح الجدول كلّه.
 */
const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
