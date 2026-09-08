"use server";

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireRole } from "./auth";

/**
 * سجلّ الطلبات للكاشير — يوم واحد، بحث نصّي، بلا كلفة ولا ربح.
 *
 * الكاشير يحتاج أن يجد طلباً بعد دقائق أو بعد أيام: زبون يعود بكيس ناقص، أو
 * يسأل «كم دفعت أمس». كان ذلك للإدارة وحدها في لوحة التحكم. هنا الأعمدة التي
 * تهمّ الكاونتر فقط — الكلفة والربح لا يمرّان من هذا الفعل إطلاقاً.
 */

export type HistoryLine = { name_ar: string; flavor_ar: string | null; qty: number; line_total: number };

export type HistoryOrder = {
  id: string;
  order_seq: number;
  created_at: string;
  channel: string;
  order_source: string;
  status: string;
  prep_status: string;
  payment_method: string | null;
  total: number;
  table_no: string | null;
  note: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  address_note: string | null;
  items: HistoryLine[];
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function listOrdersByDay(day: string, q?: string | null): Promise<HistoryOrder[]> {
  await requireRole("cashier");
  if (!DAY.test(day)) return [];
  const svc = createSupabaseServiceClient();

  const { data: orders } = await svc
    .from("orders")
    .select("id, order_seq, created_at, channel, order_source, status, prep_status, payment_method, subtotal, discount, extra, table_no, note, customer_name, customer_phone, address_note")
    .eq("business_day", day)
    .order("created_at", { ascending: false })
    .limit(400);
  if (!orders?.length) return [];

  // البحث هنا لا في SQL: يوم واحد بضع مئات على الأكثر، والمطابقة الجزئية على
  // الرقم والهاتف والاسم معاً أبسط في الذاكرة من ثلاث جمل ilike.
  const needle = (q ?? "").trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).toLowerCase();
  const hit = needle
    ? orders.filter((o) =>
        String(o.order_seq).padStart(3, "0").includes(needle) ||
        (o.customer_phone ?? "").includes(needle) ||
        (o.customer_name ?? "").toLowerCase().includes(needle))
    : orders;
  if (!hit.length) return [];

  const { data: items } = await svc
    .from("order_items")
    .select("order_id, name_ar, flavor_ar, qty, line_total")
    .in("order_id", hit.map((o) => o.id));
  const byOrder = new Map<string, HistoryLine[]>();
  for (const it of items ?? []) {
    const arr = byOrder.get(it.order_id) ?? [];
    arr.push({ name_ar: it.name_ar, flavor_ar: it.flavor_ar, qty: it.qty, line_total: it.line_total });
    byOrder.set(it.order_id, arr);
  }

  return hit.map((o) => ({
    id: o.id,
    order_seq: o.order_seq,
    created_at: o.created_at,
    channel: o.channel,
    order_source: o.order_source ?? "pos",
    status: o.status,
    prep_status: o.prep_status,
    payment_method: o.payment_method ?? null,
    total: Math.max(0, (o.subtotal ?? 0) - (o.discount ?? 0) + (o.extra ?? 0)),
    table_no: o.table_no ?? null,
    note: o.note ?? null,
    customer_name: o.customer_name ?? null,
    customer_phone: o.customer_phone ?? null,
    address_note: o.address_note ?? null,
    items: byOrder.get(o.id) ?? [],
  }));
}
