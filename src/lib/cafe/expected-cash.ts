/**
 * حساب النقد المتوقَّع في الدرج — وحده في ملفه.
 *
 * `daily-count.ts` ملفّ «use server»، وكل ما يُصدَّر منه يجب أن يكون دالة
 * غير متزامنة. وهذا حسابٌ صافٍ يُختبر بلا قاعدة بيانات، فمكانه هنا.
 */
/**
 * النقد الذي يجب أن يكون في الدرج.
 *
 * `expenses` مجموع كلفة اليوم كلّها، و`expenses_offsite` ما دفعته الإدارة من
 * خارج الدرج — يُحسب في الكلفة والربح، ولا يُطرح من نقدٍ لم يمرّ به أصلاً.
 * فطرحه كان يصنع عجزاً وهمياً بحجم المبلغ في جرد الليلة.
 */
export function expectedCash(x: {
  opening_float: number;
  cash_sales: number;
  expenses: number;
  expenses_offsite: number;
  deposited: number;
}): number {
  return x.opening_float + x.cash_sales - (x.expenses - x.expenses_offsite) - x.deposited;
}
