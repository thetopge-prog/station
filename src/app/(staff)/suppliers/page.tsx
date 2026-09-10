import { requireAdmin } from "@/lib/cafe/auth";
import { listSuppliers, type Supplier } from "@/lib/cafe/expense-actions";
import { SuppliersClient } from "@/components/cafe/SuppliersClient";

/** شركات المشتريات — دليل الأسماء وأرقام المندوبين، يختار منه المصروف. */
export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  await requireAdmin();
  let suppliers: Supplier[] = [];
  try {
    // المعطَّلة تظهر هنا: الإدارة تعيد تفعيلها، والكاشير لا يراها
    suppliers = await listSuppliers(false);
  } catch {
    /* empty state */
  }
  return <SuppliersClient suppliers={suppliers} />;
}
