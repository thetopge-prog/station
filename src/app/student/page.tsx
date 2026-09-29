import { redirect } from "next/navigation";

/** `/student` وحدها ليست صفحة — هي بابٌ إلى التسجيل */
export const dynamic = "force-dynamic";

export default function StudentIndexPage() {
  redirect("/student/join");
}
