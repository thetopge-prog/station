import { requireStaff } from "@/lib/cafe/auth";
import { listReviewDue } from "@/lib/cafe/review-actions";
import { ReviewsClient } from "@/components/cafe/ReviewsClient";

/**
 * «رسائل التقييم» — ما حان وقت إرساله بيد موظّف.
 *
 * صفحةٌ للموظّفين لا للإدارة وحدها: من يقف عند الكاونتر هو من يرسلها بين
 * طلبٍ وطلب. ولا مال عليها ولا أرباح — أسماءٌ وأرقامٌ ونصٌّ جاهز.
 */
export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  // الحارس هنا صراحةً وإن كان في الإجراء أيضاً: اختبارٌ في المستودع يقرأ مصدر
  // كل صفحة موظّفين ويطلب رؤيته، فصفحةٌ تتّكل على غيرها في الحماية لا تمرّ
  await requireStaff();
  const rows = await listReviewDue();
  return <ReviewsClient rows={rows} />;
}
