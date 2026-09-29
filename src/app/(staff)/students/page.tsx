import { requireAdmin } from "@/lib/cafe/auth";
import { listStudents, listStudentPricing } from "@/lib/cafe/student-actions";
import { StudentsClient } from "@/components/cafe/StudentsClient";

/**
 * إدارة منيو الطلاب: طابور المراجعة، وأسعار الطلاب على المنيو.
 *
 * `requireAdmin` لا `requireStaff`: هنا تُفتح أسعارٌ أقلّ من العادية وتُقبل
 * هويات — وكلاهما قرار إدارة لا قرار كاشير.
 *
 * ولا `try/catch` حول القراءة: فشل القاعدة يجب أن يصل إلى حدّ الخطأ لا أن
 * يُرسَم «لا بيانات» بلا سببٍ يُعرَف.
 */
export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  await requireAdmin();
  const [students, pricing] = await Promise.all([listStudents(), listStudentPricing()]);
  return <StudentsClient students={students} pricing={pricing} />;
}
