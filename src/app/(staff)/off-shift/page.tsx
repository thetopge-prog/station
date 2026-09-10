import Link from "next/link";

/**
 * «خارج الدوام» — الوجه المقروء لمنع الوردية.
 *
 * كان المنع يُرمى استثناءً من مكوّن خادم، فيرى الكاشير على شاشة اللمس
 * «This page couldn't load. A server error occurred» — لا يفهمها، ولا تقول
 * له متى يعود، ولا تُميّز بين منعٍ مقصود وعطبٍ في النظام. والفرق بينهما هو
 * كل شيء: الأول يُراجَع فيه المدير، والثاني يُتّصل فيه بالمطوّر.
 */
export const dynamic = "force-dynamic";

export default async function OffShiftPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  return (
    <div className="mx-auto max-w-md p-6 text-center">
      <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-6 dark:border-amber-600 dark:bg-amber-950/40">
        <p className="mb-2 text-4xl">🕒</p>
        <h1 className="mb-3 text-xl font-black">خارج وقت الدوام</h1>
        <p className="text-sm font-bold leading-7 text-amber-900 dark:text-amber-200">
          {m || "لست داخل وردية عملك الآن."}
        </p>
      </div>
      <Link href="/sign-in" className="mt-5 inline-block rounded-xl bg-primary px-5 py-3 font-black text-primary-foreground">
        تسجيل الخروج والدخول بحساب آخر
      </Link>
    </div>
  );
}
