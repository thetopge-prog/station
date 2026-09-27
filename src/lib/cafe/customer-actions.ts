"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "./auth";
import { toCsv, toVcf } from "./contacts-export";
import { cartSum, localPhone, stepLabel, type BotStateShape, type BotUser } from "./bot-users";

/**
 * سجلّ أرقام الزبائن — للإدارة وحدها.
 *
 * الأرقام كانت في النظام منذ اليوم الأول وتُكتب في كل طلب، ولا أحد يستطيع
 * النظر إليها مجتمعة: لا قائمة، ولا «من أكثرهم طلباً»، ولا طريقة لإخراجها
 * إلى هاتفٍ أو حملة إعلانية. العرض `customer_book` (0099) يجمعها، وهذا
 * الملف بابُها الوحيد.
 *
 * `requireAdmin` لا `requireStaff`: أرقام الزبائن كلّها في صفحة واحدة قابلة
 * للتصدير — وهذا مستوى وصولٍ آخر عن «اقرأ رقم هذا الطلب».
 */

export type CustomerRow = {
  id: string;
  phone: string | null;
  name: string | null;
  /** الاسم مولَّد («عميل ستيشن ٧») لا مكتوبٌ بيد — يُعرَض بعلامة */
  auto_named: boolean;
  points: number;
  orders_count: number;
  total_spent: number;
  first_order: string | null;
  last_order: string | null;
  top_channel: string | null;
  address: string | null;
};

export type CustomerBook = {
  rows: CustomerRow[];
  /** أرقام لا تصلح للاتصال: ناقصة أو تالفة. تُعرَض لتُصحَّح لا لتُحذف */
  broken: CustomerRow[];
};

/** الشكل المحلّي 07XXXXXXXXX — نفس شرط `norm_iq_phone` في القاعدة */
const CALLABLE = /^07\d{9}$/;

export async function listCustomers(): Promise<CustomerBook> {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc
    .from("customer_book")
    .select("id, phone, name, auto_named, points, orders_count, total_spent, first_order, last_order, top_channel, address")
    .order("orders_count", { ascending: false })
    .limit(5000);
  // الصفحة تعرض الخطأ ولا تُظهر قائمة فارغة: «لا زبائن» و«تعذّر الجلب» ليسا سواء
  if (error) throw new Error(`تعذّر جلب سجلّ الزبائن: ${error.message}`);
  const rows = (data ?? []) as CustomerRow[];
  return {
    rows: rows.filter((r) => CALLABLE.test(r.phone ?? "")),
    broken: rows.filter((r) => !CALLABLE.test(r.phone ?? "")),
  };
}

/**
 * يلتقط ما دخل النظام منذ آخر مرّة: أرقام طلبات جديدة، وأسماء كُتبت لاحقاً،
 * واسمٌ تلقائي لمن بقي بلا اسم. تشغيلها مرّتين يعطي النتيجة نفسها.
 */
export async function syncCustomerBook() {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc.rpc("sync_customer_book");
  if (error) return { ok: false as const, error: error.message };
  const r = data?.[0] ?? { added: 0, named: 0, auto_named: 0 };
  revalidatePath("/customers");
  return { ok: true as const, ...r };
}

export type ExportFormat = "vcf" | "csv";

/**
 * يُخرج القائمة نصّاً، والمتصفّح ينزّلها.
 *
 * لا مسار API جديد: البوّابة تبقى واحدة (فعلٌ على الخادم خلف `requireAdmin`)،
 * ومسارٌ عامٌّ يحمل أرقام الزبائن بابٌ آخر يجب حراسته.
 *
 * ويُسجَّل كل تصدير: هذه أرقامُ زبائن تخرج من المحلّ، فمن صدّرها ومتى وكم
 * صفّاً سؤالٌ تجب الإجابة عنه لاحقاً.
 */
export async function exportCustomers(format: ExportFormat, ids?: string[]) {
  const staff = await requireAdmin();
  const { rows } = await listCustomers();
  const pick = ids?.length ? rows.filter((r) => ids.includes(r.id)) : rows;
  const body = format === "vcf" ? toVcf(pick) : toCsv(pick);

  const svc = createSupabaseServiceClient();
  await svc
    .rpc("log_webhook", {
      p_route: "/customers/export",
      p_status: 200,
      p_body: "",
      p_note: `${staff.name} صدّر ${pick.length} رقماً بصيغة ${format}`,
    })
    .then(
      () => undefined,
      () => undefined /* التسجيل لا يمنع التصدير */,
    );

  return { ok: true as const, body, filename: `station-customers-${new Date().toISOString().slice(0, 10)}.${format}` };
}

export type CustomerOrder = {
  id: string;
  order_seq: number;
  created_at: string;
  channel: string;
  total: number;
  items: string;
};

/**
 * طلبات زبونٍ واحد عبر كل الأيام.
 *
 * `/history` يبحث داخل يومٍ واحد — وهو ما يحتاجه الكاشير على الكاونتر. أما
 * «ماذا يطلب هذا الزبون عادةً» فسؤالٌ عبر الشهور، فيُجاب هنا.
 */
export async function listCustomerOrders(phone: string, limit = 25): Promise<CustomerOrder[]> {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { data: orders } = await svc
    .from("orders")
    .select("id, order_seq, created_at, channel, subtotal, discount, extra")
    .eq("customer_phone", phone)
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!orders?.length) return [];

  const { data: lines } = await svc
    .from("order_items")
    .select("order_id, name_ar, qty")
    .in(
      "order_id",
      orders.map((o) => o.id),
    );
  const byOrder = new Map<string, string[]>();
  for (const l of lines ?? []) {
    const list = byOrder.get(l.order_id) ?? [];
    list.push(l.qty > 1 ? `${l.name_ar} ×${l.qty}` : l.name_ar);
    byOrder.set(l.order_id, list);
  }
  return orders.map((o) => ({
    id: o.id,
    order_seq: o.order_seq,
    created_at: o.created_at,
    channel: o.channel,
    total: o.subtotal - o.discount + o.extra,
    items: (byOrder.get(o.id) ?? []).join(" · "),
  }));
}

/** تصحيح رقمٍ كُتب خطأً، أو تسمية زبون بيد بدل الاسم التلقائي */
export async function updateCustomer(id: string, patch: { name?: string; phone?: string }) {
  await requireAdmin();
  const name = patch.name?.trim();
  const phone = patch.phone?.replace(/\D/g, "");
  if (phone !== undefined && phone !== "" && !CALLABLE.test(phone)) {
    return { ok: false as const, error: "الرقم غير صالح — الشكل: 07XXXXXXXXX" };
  }
  const svc = createSupabaseServiceClient();
  const { error } = await svc
    .from("customers")
    .update({
      ...(name !== undefined ? { name_ar: name || null } : {}),
      ...(phone !== undefined ? { phone: phone || null } : {}),
      // اسمٌ لمسته يدٌ لم يعد تلقائياً. والمحو كذلك يُفرغ التسلسل، وإلا بقي
      // الصفّ بلا اسم إلى الأبد لأن المزامنة تتخطّى من له تسلسل
      ...(name !== undefined ? { auto_seq: null } : {}),
    })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/customers");
  return { ok: true as const };
}

/**
 * زبائن البوت — من كلّم واتساب، وأين توقّف.
 *
 * ثلاثة استعلامات لا واحدٌ لكل زبون: الحالات، ثم الأسماء، ثم عدد الطلبات —
 * نفس نمط `flushWaiting`. والمحادثات اليوم بالعشرات، فلا حاجة إلى صفحات.
 */
export async function listBotUsers(): Promise<BotUser[]> {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { data: rows, error } = await svc
    .from("bot_state")
    .select("chat_id, state, updated_at")
    .like("chat_id", "wa:%")
    .order("updated_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(`تعذّر جلب محادثات البوت: ${error.message}`);

  // مفتاحان لكل محادثة: `wa:<id>` فيه السلّة، و`wa:<id>:ui` أثرُ الأزرار. يُدمَجان
  // في صفٍّ واحد — وإلّا ظهر الزبون مرّتين، مرّةً بسلّة ومرّةً فارغاً
  const byId = new Map<string, { st: BotStateShape | null; last: string }>();
  for (const r of rows ?? []) {
    const ui = r.chat_id.endsWith(":ui");
    const waId = r.chat_id.slice(3, ui ? -3 : undefined);
    const prev = byId.get(waId);
    const st = ui ? null : (r.state as BotStateShape | null);
    byId.set(waId, {
      st: st ?? prev?.st ?? null,
      last: prev && prev.last > r.updated_at ? prev.last : r.updated_at,
    });
  }

  const phones = [...byId.keys()].map(localPhone).filter((p): p is string => !!p);
  const nameOf = new Map<string, string>();
  const ordersOf = new Map<string, number>();
  if (phones.length) {
    const [{ data: cs }, { data: os }] = await Promise.all([
      svc.from("customers").select("phone, name_ar").in("phone", phones),
      svc.from("orders").select("customer_phone").eq("status", "paid").in("customer_phone", phones),
    ]);
    for (const c of cs ?? []) if (c.phone && c.name_ar) nameOf.set(c.phone, c.name_ar);
    for (const o of os ?? []) {
      const p = o.customer_phone;
      if (p) ordersOf.set(p, (ordersOf.get(p) ?? 0) + 1);
    }
  }

  return [...byId.entries()]
    .map(([waId, v]) => {
      const phone = localPhone(waId);
      const { count, total } = cartSum(v.st?.cart);
      return {
        waId,
        phone,
        foreign: !phone,
        name: phone ? (nameOf.get(phone) ?? null) : null,
        lastSeen: v.last,
        step: stepLabel(v.st?.step),
        cartCount: count,
        cartTotal: total,
        orders: phone ? (ordersOf.get(phone) ?? 0) : 0,
      };
    })
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}
