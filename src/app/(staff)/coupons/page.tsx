import { requireStaff } from "@/lib/cafe/auth";
import { listCoupons } from "@/lib/cafe/coupon-actions";
import { CouponsClient } from "@/components/cafe/CouponsClient";

/**
 * «الخصومات والكوبونات».
 *
 * يصله الكاشير: هو من ينشئ الكوبون وهو واقف أمام الزبون، ومن حقّه أن يراجع
 * ما أعطاه. **والتصفية في الخادم** (`listCoupons`): غير الإداري يرى ما أنشأه
 * هو وحده — فلا يطّلع على كوبونات زبائن غيره ولا على مجموع ما خُصم.
 */
export const dynamic = "force-dynamic";

export default async function CouponsPage() {
  const staff = await requireStaff();
  const rows = await listCoupons();
  return <CouponsClient rows={rows} isAdmin={staff.isAdmin} />;
}
