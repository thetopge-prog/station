import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { parseExternalOrder } from "@/lib/cafe/external-order";
import type { Json } from "@/lib/types";

/**
 * POST /api/orders/external — «وصل طلب من توترز/طلباتي».
 *
 * تطبيق المتصل، على جهاز شركة التوصيل، يرسل إشعار «طلب جديد» كما ظهر:
 * { secret, app, title, text }. لا واجهة برمجية عند الشركتين؛ الإشعار هو كل
 * ما يُرى، وهذا المسار يأخذ منه ما يُؤخذ:
 *
 *   الأصناف مكتوبة وكلها في المنيو  ← طلب معلّق على /orders بزرّ «قبول»
 *   وإلا                              ← تنبيه برقم الطلب على الشاشة نفسها
 *
 * كل شيء أو لا شيء، كمدخل واتساب: نصف طلب يصل المطبخ أسوأ من تنبيه يقول
 * «افتح التطبيق». والسرّ نفسه والمقارنة نفسها بوقت ثابت.
 */

export const dynamic = "force-dynamic";

function secretMatches(given: string | null, expected: string): boolean {
  if (!given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

async function note(status: number, raw: string, why: string) {
  try {
    const svc = createSupabaseServiceClient();
    await svc.rpc("log_webhook", {
      p_route: "/api/orders/external",
      p_status: status,
      p_body: raw.replace(/("secret"\s*:\s*")[^"]*"/i, '$1***"').slice(0, 600),
      p_note: why,
    });
  } catch {
    /* التشخيص لا يُفشل ما يشخّصه */
  }
}

export async function POST(req: Request) {
  const expected = process.env.STATION_WEBHOOK_SECRET;
  if (!expected) return NextResponse.json({ ok: false, error: "webhook not configured" }, { status: 503 });

  const raw = await req.text();
  let body: { secret?: string; app?: string; title?: string; text?: string } = {};
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const candidates = [req.headers.get("x-station-secret"), body.secret].map((v) => v?.trim()).filter((v): v is string => !!v);
  if (!candidates.length) {
    await note(401, raw, "لم تصل كلمة السر");
    return NextResponse.json({ ok: false, error: "no secret" }, { status: 401 });
  }
  if (!candidates.some((c) => secretMatches(c, expected.trim()))) {
    await note(403, raw, "كلمة السر غير مطابقة");
    return NextResponse.json({ ok: false, error: "bad secret" }, { status: 403 });
  }

  const parsed = parseExternalOrder({ pkg: String(body.app ?? ""), title: body.title ?? null, text: body.text ?? null });
  const svc = createSupabaseServiceClient();

  // الإشعار نفسه مرّتين (أندرويد يُحدّث الإشعار) ⇒ صفّ واحد
  if (parsed.ref) {
    const { data: dup } = await svc
      .from("external_order_alerts")
      .select("id")
      .eq("source", parsed.source)
      .eq("ref", parsed.ref)
      .gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString())
      .limit(1);
    if (dup?.length) {
      await note(200, raw, `مكرّر ${parsed.source} #${parsed.ref}`);
      return NextResponse.json({ ok: true, duplicate: true, ref: parsed.ref });
    }
  }

  // ── الأصناف: كلها في المنيو أو لا طلب ────────────────────────────────
  let orderId: string | null = null;
  let orderNumber: string | null = null;
  if (parsed.lines.length) {
    const { data: menu } = await svc.from("menu_items").select("id, name_ar").eq("is_active", true);
    const byName = new Map((menu ?? []).map((m) => [norm(m.name_ar), m.id]));
    const lines: { item_id: string; variant_id: null; flavor: null; qty: number }[] = [];
    let unknown = 0;
    for (const l of parsed.lines) {
      const id = byName.get(norm(l.name));
      if (!id) { unknown++; continue; }
      lines.push({ item_id: id, variant_id: null, flavor: null, qty: l.qty });
    }
    if (!unknown && lines.length) {
      const src = parsed.source === "other" ? "web" : parsed.source;
      const { data, error } = await svc.rpc("place_order", {
        p_channel: "delivery",
        p_lines: lines as unknown as Json,
        p_customer: null,
        p_table: null,
        p_note: `${parsed.source} #${parsed.ref ?? "?"}` + (body.text ? ` — ${String(body.text).slice(0, 200)}` : ""),
        p_phone: null,
        p_address: null,
        p_source: "whatsapp",
        p_customer_name: null,
      });
      if (!error && data?.[0]) {
        orderId = data[0].order_id;
        orderNumber = String(data[0].order_seq).padStart(3, "0");
        // place_order تُرجع المصادر المجهولة إلى pos؛ يُكتب بعد الإدراج (كتليغرام)
        await svc.from("orders").update({ order_source: src }).eq("id", orderId);
      }
    }
  }

  // ── التنبيه، دائماً: حتى مع طلب مُنشأ، يبقى المرجع ظاهراً حتى يُضغط «تمّ» ──
  const { error: aErr } = await svc.from("external_order_alerts").insert({
    source: parsed.source,
    ref: parsed.ref,
    title: (body.title ?? "").slice(0, 120) || null,
    body: (body.text ?? "").slice(0, 1000) || null,
    order_id: orderId,
  });
  if (aErr) {
    await note(500, raw, aErr.message);
    return NextResponse.json({ ok: false, error: aErr.message }, { status: 500 });
  }

  await note(200, raw, orderId ? `طلب ${orderNumber} من ${parsed.source} #${parsed.ref ?? "?"}` : `تنبيه ${parsed.source} #${parsed.ref ?? "?"} (${parsed.lines.length} سطر، لم يُطابَق)`);
  return NextResponse.json({ ok: true, ref: parsed.ref, order_number: orderNumber, matched: !!orderId });
}
