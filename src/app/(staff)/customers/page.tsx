import { requireAdmin } from "@/lib/cafe/auth";
import { listCustomers, type CustomerBook } from "@/lib/cafe/customer-actions";
import { isDemoServer } from "@/lib/cafe/demo";
import { CustomersClient } from "@/components/cafe/CustomersClient";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  if (!isDemoServer()) await requireAdmin();
  let book: CustomerBook = { rows: [], broken: [] };
  let failed: string | null = null;
  try {
    if (!isDemoServer()) book = await listCustomers();
  } catch (e) {
    // «لا زبائن» و«تعذّر الجلب» ليسا سواء — وقائمة فارغة كاذبة أسوأ من رسالة
    failed = e instanceof Error ? e.message : "تعذّر جلب السجلّ";
  }
  return <CustomersClient book={book} failed={failed} />;
}
