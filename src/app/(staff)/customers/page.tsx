import { requireAdmin } from "@/lib/cafe/auth";
import { listBotUsers, listCustomers, type CustomerBook } from "@/lib/cafe/customer-actions";
import type { BotUser } from "@/lib/cafe/bot-users";
import { isDemoServer } from "@/lib/cafe/demo";
import { CustomersClient } from "@/components/cafe/CustomersClient";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  if (!isDemoServer()) await requireAdmin();
  let book: CustomerBook = { rows: [], broken: [] };
  let bots: BotUser[] = [];
  let failed: string | null = null;
  try {
    if (!isDemoServer()) {
      book = await listCustomers();
      // محادثات البوت رفاهية بجانب السجلّ: فشلُها لا يُسقط الصفحة
      bots = await listBotUsers().catch(() => []);
    }
  } catch (e) {
    // «لا زبائن» و«تعذّر الجلب» ليسا سواء — وقائمة فارغة كاذبة أسوأ من رسالة
    failed = e instanceof Error ? e.message : "تعذّر جلب السجلّ";
  }
  return <CustomersClient book={book} bots={bots} failed={failed} />;
}
