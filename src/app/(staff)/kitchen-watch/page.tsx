import { requireStaff } from "@/lib/cafe/auth";
import { kitchenWatchReport } from "@/lib/cafe/kitchen-watch-actions";
import { KitchenWatchClient } from "@/components/cafe/KitchenWatchClient";

/**
 * «مراقبة المطبخ» — حالة كل قسم أسبوعاً مقابل أسبوع، وسببُ تحرّكه.
 *
 * `requireStaff`: كمّياتٌ ونِسَب ولا دينار فيها، والطبّاخ ورئيس الوردية هم من
 * يقرؤها. وقاعدة المالك أن الكاشير لا يرى الأرباح — ولا يراها هنا.
 */
export const dynamic = "force-dynamic";

export default async function KitchenWatchPage() {
  await requireStaff();
  const data = await kitchenWatchReport();
  return <KitchenWatchClient data={data} />;
}
