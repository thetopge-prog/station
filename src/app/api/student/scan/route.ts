import { NextResponse } from "next/server";

/**
 * قارئ الهوية — يقرأ ولا يحتفظ.
 *
 * تصل الصورة، تُقرأ في الذاكرة، تُستخرج منها ثلاثة حقول نصّية، **ثم تُترك
 * للقمامة في نفس الطلب**. لا تُكتب على قرص، ولا في القاعدة، ولا في سجلّ،
 * ولا تُرسَل إلى أحدٍ غير نموذج القراءة. وهذا ما تقوله الشاشة للطالب، وهذا
 * ما يفعله هذا الملفّ — والاثنان يجب أن يبقيا متطابقين.
 *
 * والقراءة تُرشِّح ولا تحكم: الحقول تذهب إلى طابور مراجعةٍ يقبله إنسان. فخطأ
 * النموذج لا يفتح خصماً، وضعفُ العربية المصوَّرة لا يصير ثغرة.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** حدٌّ على الحجم: صورة بطاقةٍ لا تتجاوز هذا، وما فوقه رفعٌ في غير محلّه */
const MAX_BYTES = 6 * 1024 * 1024;

const PROMPT = `هذه صورة بطاقة طالب جامعي عراقية. استخرج منها:
- name: اسم الطالب كما هو مكتوب
- university: اسم الجامعة
- college: اسم الكلية إن وُجد
- studentNo: رقم الطالب أو الرقم الجامعي

أعد JSON فقط بهذا الشكل، بلا أي نصّ آخر:
{"name":"","university":"","college":"","studentNo":""}
أي حقل لا تجده اتركه نصّاً فارغاً. لا تخمّن.`;

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!key) {
    // بلا مفتاح لا قراءة — والتسجيل يمضي يدوياً بدل أن يتعطّل
    return NextResponse.json({ ok: false, reason: "no-reader" }, { status: 200 });
  }

  let bytes: ArrayBuffer;
  let mime: string;
  try {
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, reason: "no-image" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, reason: "too-big" }, { status: 413 });
    mime = file.type || "image/jpeg";
    bytes = await file.arrayBuffer();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad-request" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: mime, data: Buffer.from(bytes).toString("base64") } },
              ],
            },
          ],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!res.ok) return NextResponse.json({ ok: false, reason: "reader-failed" }, { status: 200 });
    const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = JSON.parse(text) as { name?: string; university?: string; college?: string; studentNo?: string };
    return NextResponse.json({
      ok: true,
      name: (parsed.name ?? "").trim().slice(0, 120),
      university: (parsed.university ?? "").trim().slice(0, 120),
      college: (parsed.college ?? "").trim().slice(0, 120),
      studentNo: (parsed.studentNo ?? "").trim().slice(0, 40),
    });
  } catch {
    return NextResponse.json({ ok: false, reason: "reader-failed" }, { status: 200 });
  }
  // `bytes` تخرج من النطاق هنا ولا نسخة لها في أي مكان
}
