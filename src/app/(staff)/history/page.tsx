import { requireRole } from "@/lib/cafe/auth";
import { listOrdersByDay } from "@/lib/cafe/history-actions";
import { HistoryClient } from "@/components/cafe/HistoryClient";

/**
 * /history — سجلّ الطلبات للكاشير.
 *
 * يوم واحد في كل مرّة (اليوم افتراضاً) وبحث نصّي؛ يُرسَم خادمياً بطلبات اليوم
 * فيفتح ممتلئاً، ثم البحث وتغيير اليوم من العميل.
 */
export const dynamic = "force-dynamic";

const baghdadToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());

export default async function HistoryPage() {
  await requireRole("cashier");
  const today = baghdadToday();
  const orders = await listOrdersByDay(today).catch(() => []);
  return <HistoryClient initialDay={today} initialOrders={orders} />;
}
