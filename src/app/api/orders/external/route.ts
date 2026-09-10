import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { parseExternalOrder, parseTotersScreen, resolveLines, type ScreenItem } from "@/lib/cafe/external-order";
import { partnerSlug, SOURCE_OF_SLUG } from "@/lib/cafe/partners";
import type { Json } from "@/lib/types";

/**
 * POST /api/orders/external — «وصل طلب من توترز/طلباتي».
 *
 * تطبيق المتصل، على جهاز شركة التوصيل، يرسل أحد شكلين:
 *   · إشعار «طلب جديد» كما ظهر: { secret, app, title, text }
 *   · نصّ شاشة تفاصيل الطلب سطراً سطراً: { …, title:"screen", lines:[…], ref, again }
 *
 * الفهم كله هنا لا على الجهاز: حين يغيّر توترز شكل شاشته يُصلَح المحلّل
 * بنشر ويب، لا بتطبيق جديد. الأسماء تُترجم إلى أصنافنا عبر partner_item_aliases
 * (أسعارنا هي المعتمدة في المطبخ والجرد)، والاسم المجهول لا يُخترع:
 *
 *   كل الأصناف معروفة  ← طلب معلّق على /orders بزرّ «قبول — توترز»
 *   وإلا                ← تنبيه برقم الطلب والأسماء المجهولة، لتُربط من /partners
 *
 * والسرّ نفسه والمقارنة نفسها بوقت ثابت.
 */

export const dynamic = "force-dynamic";

function secretMatches(given: string | null, expected: string): boolean {
  if (!given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function note(status: number, raw: string, why: string) {
  try {
    const svc = createSupabaseServiceClient();
    await svc.rpc("log_webhook", {
      p_route: "/api/orders/external",
      p_status: status,
      p_body: raw.replace(/("secret"\s*:\s*")[^"]*"/i, '$1***"').slice(0, 4000),
      p_note: why,
    });
  } catch {
    /* التشخيص لا يُفشل ما يشخّصه */
  }
}

type Body = { secret?: string; app?: string; title?: string; text?: string; lines?: unknown; ref?: string; again?: boolean };

export async function POST(req: Request) {
  const expected = process.env.STATION_WEBHOOK_SECRET;
  if (!expected) return NextResponse.json({ ok: false, error: "webhook not configured" }, { status: 503 });

  const raw = await req.text();
  let body: Body = {};
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

  const svc = createSupabaseServiceClient();
  const isScreen = body.title === "screen" && Array.isArray(body.lines);

  // ── ما يُفهم من المدخل ─────────────────────────────────────────────────
  const parsed = parseExternalOrder({ pkg: String(body.app ?? ""), title: body.title ?? null, text: body.text ?? null });
  let ref = parsed.ref;
  let items: ScreenItem[] = parsed.lines.map((l) => ({ name: l.name, qty: l.qty, option: null }));
  let customerName: string | null = null;
  let partnerTotal: number | null = parsed.total;
  let refLong: string | null = null;
  // الشاشة تقول كم صنفاً فيها؛ إن قرأنا أقلّ فالباقي تحت حافة الشاشة
  let declared: number | null = null;
  if (isScreen) {
    const s = parseTotersScreen((body.lines as unknown[]).map((l) => String(l ?? "")));
    ref = s.ref ?? (body.ref ? String(body.ref) : null);
    items = s.items;
    customerName = s.customerName;
    partnerTotal = s.total;
    refLong = s.refLong;
    declared = s.declared;
  }
  // طلب ناقص أسوأ من لا طلب: المطبخ يطبخ نصفه والزبون يشتكي. يُنبَّه ولا يُنشأ.
  const short = declared != null && items.length < declared;
  const source = parsed.source;

  // ── التكرار: نفس المرجع خلال نصف ساعة ─────────────────────────────────
  // إشعار ثم شاشة لنفس الطلب ليسا تكراراً: الشاشة تحمل الأصناف. والشاشة
  // نفسها ثانيةً (again) تُعاد فقط إن لم يُنشأ طلب بعد — المجهّز مرّرها فظهر
  // ما لم يظهر.
  let priorAlertId: string | null = null;
  if (ref) {
    const { data: dup } = await svc
      .from("external_order_alerts")
      .select("id, order_id, title")
      .eq("source", source)
      .eq("ref", ref)
      .gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    const prev = dup?.[0];
    if (prev) {
      if (prev.order_id) {
        await note(200, raw, `مكرّر ${source} #${ref} — الطلب أُنشئ`);
        return NextResponse.json({ ok: true, duplicate: true, ref });
      }
      if (!isScreen) {
        await note(200, raw, `مكرّر ${source} #${ref}`);
        return NextResponse.json({ ok: true, duplicate: true, ref });
      }
      priorAlertId = prev.id; // شاشة بعد إشعار، أو شاشة أكمل: يُحاول الحلّ
    }
  }

  // ── الأصناف: كلها معروفة أو لا طلب ────────────────────────────────────
  let orderId: string | null = null;
  let orderNumber: string | null = null;
  let unknown: string[] = [];
  if (items.length) {
    const [{ data: menu }, { data: aliases }] = await Promise.all([
      svc.from("menu_items").select("id, name_ar").eq("is_active", true),
      source === "other"
        ? Promise.resolve({ data: [] as { alias_key: string; item_id: string; variant_id: string | null; flavor: string | null }[] })
        : svc.from("partner_item_aliases").select("alias_key, item_id, variant_id, flavor").eq("source", source),
    ]);
    const resolved = resolveLines(items, aliases ?? [], menu ?? []);
    unknown = resolved.unknown;
    if (!unknown.length && resolved.lines.length && !short) {
      const src = source === "other" ? "web" : source;
      const noteText = [`${src === "toters" ? "توترز" : src === "talabaty" ? "طلباتي" : src} #${ref ?? "?"}`, refLong, partnerTotal ? `مبلغهم ${partnerTotal.toLocaleString("en-US")}` : null]
        .filter(Boolean)
        .join(" · ");
      const { data, error } = await svc.rpc("place_order", {
        p_channel: "delivery",
        p_lines: resolved.lines as unknown as Json,
        p_customer: null,
        p_table: null,
        p_note: noteText,
        p_phone: null,
        p_address: null,
        p_source: "whatsapp",
        p_customer_name: customerName,
      });
      if (!error && data?.[0]) {
        orderId = data[0].order_id;
        orderNumber = String(data[0].order_seq).padStart(3, "0");
        // الشركة نفسها تُلحق بالطلب سلفاً: الكاشير يضغط «قبول» لا يختار
        const { data: partners } = await svc.from("delivery_partners").select("id, name_ar").eq("is_active", true);
        const partner = (partners ?? []).find((p) => {
          const slug = partnerSlug(p.name_ar);
          return slug && SOURCE_OF_SLUG[slug] === src;
        });
        // place_order تُرجع المصادر المجهولة إلى pos؛ يُكتب بعد الإدراج (كتليغرام)
        await svc
          .from("orders")
          .update({ order_source: src, partner_id: partner?.id ?? null, partner_ref: refLong ?? ref, partner_total: partnerTotal })
          .eq("id", orderId);
      } else if (error) {
        await note(500, raw, `place_order: ${error.message}`);
      }
    }
  }

  // ── التنبيه: يبقى المرجع ظاهراً حتى يُضغط «تمّ»، ومعه ما لم يُعرف ──────
  const alertRow = {
    source,
    ref,
    title: isScreen ? `شاشة${customerName ? ` · ${customerName}` : ""}` : (body.title ?? "").slice(0, 120) || null,
    body: isScreen
      ? [
          short ? `⚠ الشاشة تقول ${declared} أصناف وقُرئ ${items.length} — مرّر شاشة توترز لأسفل ثم افتح الطلب ثانيةً` : null,
          ...items.map((i) => `${i.qty} × ${i.name}${i.option ? ` / ${i.option}` : ""}`),
        ]
          .filter(Boolean)
          .join("\n")
          .slice(0, 1000) || null
      : (body.text ?? "").slice(0, 1000) || null,
    order_id: orderId,
    unknown_items: unknown.length ? unknown : null,
  };
  const { error: aErr } = priorAlertId
    ? await svc.from("external_order_alerts").update(alertRow).eq("id", priorAlertId)
    : await svc.from("external_order_alerts").insert(alertRow);
  if (aErr) {
    await note(500, raw, aErr.message);
    return NextResponse.json({ ok: false, error: aErr.message }, { status: 500 });
  }

  await note(
    200,
    raw,
    orderId
      ? `طلب ${orderNumber} من ${source} #${ref ?? "?"} (${items.length} صنف)`
      : `تنبيه ${source} #${ref ?? "?"} (${items.length} صنف، مجهول: ${unknown.join("، ") || "—"})`,
  );
  return NextResponse.json({ ok: true, ref, order_number: orderNumber, matched: !!orderId, unknown });
}
