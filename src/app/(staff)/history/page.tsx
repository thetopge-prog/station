import { requireRole } from "@/lib/cafe/auth";
import { businessDay } from "@/lib/cafe/time";
import { listOrdersByDay } from "@/lib/cafe/history-actions";
import { HistoryClient } from "@/components/cafe/HistoryClient";

/**
 * /history — سجلّ الطلبات للكاشير.
 *
 * يوم واحد في كل مرّة (اليوم افتراضاً) وبحث نصّي؛ يُرسَم خادمياً بطلبات اليوم
 * فيفتح ممتلئاً، ثم البحث وتغيير اليوم من العميل.
 */
export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const staff = await requireRole("cashier");
  // يوم العمل (يُقطع 04:00) لا تاريخ التقويم — طلبات الواحدة فجراً في سجلّ أمس
  const today = businessDay();
  const orders = await listOrdersByDay(today).catch(() => []);
  return <HistoryClient initialDay={today} initialOrders={orders} isAdmin={staff.isAdmin} />;
}
