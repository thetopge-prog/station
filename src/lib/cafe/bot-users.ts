/**
 * زبائن بوت واتساب — من كلّم البوت، وأين توقّف.
 *
 * الرقم الذي يهمّ المالك ليس «كم طلباً جاء من البوت» وحده، بل **كم محادثةً
 * وقفت قبل الطلب**. والبوت يخزّن حالة كل محادثة في `bot_state` — فيها السلّة
 * والخطوة التي وصلها. فمن وقف عند «العنوان» وسلّته فيها ثلاثون ألفاً هو طلبٌ
 * كاد أن يكون، ويكفي أن يُتَّصل به.
 *
 * والربط بالزبون بالهاتف لا بمعرّف واتساب: `orders.whatsapp_wa_id` لا يُكتب
 * اليوم على طلبات البوت، والهاتف مشتقٌّ من المعرّف نفسه فلا يحتاج عموداً.
 */

/** خطوات محادثة البوت بالعربية — الخطوة وحدها تقول لماذا توقف */
const STEP: Record<string, string> = {
  start: "البداية",
  cats: "يتفرّج على الأقسام",
  items: "يتفرّج على الأصناف",
  item: "يختار الحجم",
  cart: "عند السلّة",
  channel: "يختار التوصيل أو الاستلام",
  phone: "عند طلب الرقم",
  name: "عند طلب الاسم",
  address: "عند طلب العنوان",
  confirm: "عند التأكيد",
};

export type BotCartLine = { name?: string; qty?: number; unitPrice?: number };
export type BotStateShape = { cart?: BotCartLine[]; step?: string; channel?: string };

export type BotUser = {
  waId: string;
  /** 07… إن كان عراقياً، وإلّا `null` ومعه `foreign` */
  phone: string | null;
  foreign: boolean;
  name: string | null;
  lastSeen: string;
  /** أين توقّفت المحادثة — «عند طلب العنوان» */
  step: string;
  cartCount: number;
  cartTotal: number;
  /** طلباتٌ مدفوعة لهذا الرقم في النظام كلّه، لا من البوت وحده */
  orders: number;
};

/** «07…» من معرّف واتساب. غير العراقي يُعاد `null` — والمعرّف يبقى للمراسلة */
export function localPhone(waId: string): string | null {
  const d = waId.replace(/\D/g, "").replace(/^00964/, "").replace(/^964/, "");
  const local = d.startsWith("0") ? d : `0${d}`;
  return /^07\d{9}$/.test(local) ? local : null;
}

export function stepLabel(step: string | undefined): string {
  return STEP[step ?? ""] ?? "—";
}

/** مجموع السلّة المعلّقة — ما كاد أن يُباع */
export function cartSum(cart: BotCartLine[] | undefined): { count: number; total: number } {
  let count = 0;
  let total = 0;
  for (const l of cart ?? []) {
    const qty = Number(l.qty) || 0;
    count += qty;
    total += qty * (Number(l.unitPrice) || 0);
  }
  return { count, total };
}
