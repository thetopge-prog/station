import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** المودرن أصبح المنيو الأساسي على /menu — نحافظ على الروابط القديمة المُشارَكة. */
export default async function ModernMenuRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
  }
  const q = qs.toString();
  redirect(q ? `/menu?${q}` : "/menu");
}
