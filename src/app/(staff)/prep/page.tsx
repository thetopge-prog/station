import { requireStaff } from "@/lib/cafe/auth";
import { prepBoard } from "@/lib/cafe/prep-forecast-actions";
import { PrepBoardPanel } from "@/components/cafe/PrepBoardPanel";

/**
 * «التجهيز الذكي» — كم يُجهَّز اليوم من كل قسم، وقبل أي ساعة.
 *
 * بابٌ مستقلّ في قائمة الإدارة لا قسمٌ في شاشة الكاشير: طلب المالك نقلها
 * «كي لا يسبب ارتباك للكاشير»، والكاونتر لا يحتمل ما يُضغط بالخطأ.
 *
 * ولا أرقام مال عليها، فيراها الطبّاخ والمجهّز كما يراها المدير.
 */
export const dynamic = "force-dynamic";

export default async function PrepPage() {
  await requireStaff();
  const board = await prepBoard().catch(() => null);
  return <PrepBoardPanel board={board} />;
}
