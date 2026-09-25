import type { MenuLang } from "./menu-lang";

/**
 * نصوص شاشة الطلب بلغتين.
 *
 * الموقع التعريفي بخمس لغات وأزراره تفتح منيو عربياً صرفاً — فالزائر الذي
 * قرأ «Order now» يصل إلى شاشة لا يقرأ منها حرفاً ويخرج. لغتان لا خمس: من
 * يقرأ التركية أو الإيطالية يطلب بالإنكليزية.
 *
 * والنوع `MenuCopy` مكتوبٌ صراحةً، فالقاموسان ملزمان بالتطابق عند الترجمة لا
 * عند التشغيل: مفتاحٌ نُسي خطأُ بناء، لا فراغٌ على شاشة زبون. وهو نفس ما
 * يفعله `src/lib/site/copy.ts` للصفحة التعريفية.
 */
export type MenuCopy = {
  // الأقسام والتصفّح
  sections: string;
  menu: string;
  todayOffers: string;
  stationPicks: string;
  chefPick: string;
  tryTogether: string;
  total: string;
  free: string;
  included: string;
  mealIncludes: string;
  was: string;
  now: string;

  // البطاقة والسلّة
  add: string;
  addOne: string;
  removeOne: string;
  choose: string;
  close: string;
  cart: string;
  checkout: string;
  sending: string;
  notePlaceholder: string;

  // طريقة الاستلام
  howTitle: string;
  howLead: string;
  delivery: string;
  deliveryHint: string;
  pickup: string;
  pickupHint: string;
  dineIn: string;
  dineInHint: string;
  curbside: string;
  curbsideHint: string;

  // بيانات الزبون
  name: string;
  phoneRequired: string;
  phoneOptional: string;
  addressPlaceholder: string;
  carPlaceholder: string;
  guests: string;
  needPhone: string;
  needAddress: string;

  // الدفع
  cash: string;
  card: string;

  // بعد الإرسال
  sentTitle: string;
  sentDelivery: string;
  sentPickup: string;
  sentCurbside: string;
  sentDineIn: string;
  /** {table} يُستبدل برقم الطاولة */
  sentTable: string;

  // الإغلاق والمهلة
  shopClosed: string;
  shopClosedLead: string;
  whatsappUs: string;
  freeSauce: string;
  offlineCall: string;
  sectionClosed: string;
  closedUntil: string;
  /** {n} = الدقائق المتبقية */
  minutesLeft: string;
  minutesLeftLong: string;
  minutesLeftContact: string;

  // صفحة /order
  orderHome: string;
  orderHomeHint: string;
  orderShop: string;
  orderShopHint: string;
  orderCar: string;
  orderCarHint: string;
};

const ar: MenuCopy = {
  sections: "الأقسام",
  menu: "القائمة",
  todayOffers: "عروض اليوم",
  stationPicks: "مختارات ستيشن",
  chefPick: "اختيار الشيف",
  tryTogether: "جرّبها معاً — اختيارنا لهذا اليوم",
  total: "الإجمالي",
  free: "مجاناً",
  included: "تشمل الوجبة 🎉",
  mealIncludes: "بطاطا مقلية + مشروب غازي",
  was: "كان",
  now: "الآن",

  add: "أضف",
  addOne: "زيادة",
  removeOne: "إنقاص",
  choose: "اختر",
  close: "إغلاق",
  cart: "سلة الطلب",
  checkout: "إتمام الطلب",
  sending: "جارٍ الإرسال…",
  notePlaceholder: "ملاحظة (بدون مخلل، صوص إضافي، حار…)",

  howTitle: "كيف تريد طلبك؟",
  howLead: "اختر طريقة الاستلام",
  delivery: "توصيل",
  deliveryHint: "نوصّله إلى عنوانك",
  pickup: "استلام من المطعم",
  pickupHint: "نجهّزه ونغلّفه بانتظارك",
  dineIn: "الأكل في المطعم",
  dineInHint: "نحجز لك طاولة",
  curbside: "الطلب من السيارة",
  curbsideHint: "نسلّمك إياه دون نزولك",

  name: "الاسم",
  phoneRequired: "رقم الهاتف (مطلوب)",
  phoneOptional: "رقم الهاتف (اختياري — لجمع النقاط)",
  addressPlaceholder: "العنوان بالتفصيل — أقرب نقطة دالة",
  carPlaceholder: "وصف السيارة (كيا بيضاء…)",
  guests: "عدد الأشخاص",
  needPhone: "رقم الهاتف مطلوب",
  needAddress: "العنوان مطلوب للتوصيل",

  cash: "💵 نقدي",
  card: "💳 كي كارد",

  sentTitle: "تم إرسال طلبك",
  sentDelivery: "سنتصل بك لتأكيد العنوان ثم ينطلق الطلب إليك",
  sentPickup: "سنجهّزه خلال ١٥ دقيقة تقريباً — أبرِز الرمز عند الاستلام",
  sentCurbside: "سنراسلك على واتساب عند الجاهزية — اتصل بنا قبل وصولك بدقيقتين",
  sentDineIn: "سيدلّك موظفنا على طاولتك",
  sentTable: "طاولتك رقم {table} — تفضّل بالجلوس وسيصلك طلبك",

  shopClosed: "المطعم مغلق الآن 🌙",
  // الساعات من `hours.ts` لا مكتوبةً هنا — نُصّان للدوام ينحرف أحدهما
  shopClosedLead: "المنيو يفتح تلقائياً مع بداية الدوام.",
  whatsappUs: "راسلنا على واتساب",
  freeSauce: "+ علبة صوص",
  offlineCall: "لا اتصال — اتصل بالمطعم",
  sectionClosed: "هذا القسم متوقف حتى الصباح — يعود الساعة 09:00",
  closedUntil: "متوقف حتى 09:00",
  minutesLeft: "⏳ {n} د",
  // {t} = ساعة الإغلاق من LATE_CUTOFF — لا تُكتب بيد
  minutesLeftLong: "⏳ باقي {n} دقيقة للطلب من هذا القسم — يغلق الساعة {t}",
  minutesLeftContact: "⏳ باقي {n} دقيقة · سيتم التواصل معك في حال أغلق المطبخ لهذا القسم",

  orderHome: "اطلب من البيت هسّة",
  orderHomeHint: "نوصّلك لباب البيت",
  orderShop: "من المطعم",
  orderShopHint: "تستلم من الكاونتر",
  orderCar: "من السيارة",
  orderCarHint: "نطلعلك للسيارة",
};

const en: MenuCopy = {
  sections: "Sections",
  menu: "Menu",
  todayOffers: "Today's offers",
  stationPicks: "Station picks",
  chefPick: "Chef's pick",
  tryTogether: "Try them together — our pick for today",
  total: "Total",
  free: "Free",
  included: "Included in the meal 🎉",
  mealIncludes: "Fries + a soft drink",
  was: "was",
  now: "now",

  add: "Add",
  addOne: "Add one",
  removeOne: "Remove one",
  choose: "Choose",
  close: "Close",
  cart: "Your order",
  checkout: "Place order",
  sending: "Sending…",
  notePlaceholder: "Note (no pickles, extra sauce, spicy…)",

  howTitle: "How would you like it?",
  howLead: "Choose how you'll get your order",
  delivery: "Delivery",
  deliveryHint: "We bring it to your address",
  pickup: "Pick up",
  pickupHint: "Packed and waiting for you",
  dineIn: "Eat in",
  dineInHint: "We'll hold a table",
  curbside: "To your car",
  curbsideHint: "We hand it over without you stepping out",

  name: "Name",
  phoneRequired: "Phone number (required)",
  phoneOptional: "Phone number (optional — to earn points)",
  addressPlaceholder: "Full address — nearest landmark",
  carPlaceholder: "Your car (white Kia…)",
  guests: "How many people",
  needPhone: "Phone number is required",
  needAddress: "An address is required for delivery",

  cash: "💵 Cash",
  card: "💳 Card",

  sentTitle: "Your order is in",
  sentDelivery: "We'll call to confirm the address, then it's on its way",
  sentPickup: "Ready in about 15 minutes — show the code at the counter",
  sentCurbside: "We'll message you on WhatsApp when it's ready — call us two minutes before you arrive",
  sentDineIn: "Our staff will show you to your table",
  sentTable: "Table {table} — take a seat and we'll bring it over",

  shopClosed: "We're closed right now 🌙",
  shopClosedLead: "We take orders from 9:00 in the morning until 03:00 at night. The menu opens by itself when we do.",
  whatsappUs: "Message us on WhatsApp",
  freeSauce: "+ a pot of sauce",
  offlineCall: "No connection — please call the restaurant",
  sectionClosed: "This section is closed until morning — back at 09:00",
  closedUntil: "Closed until 09:00",
  minutesLeft: "⏳ {n} min",
  minutesLeftLong: "⏳ {n} minutes left to order from this section — it closes at {t}",
  minutesLeftContact: "⏳ {n} minutes left · we'll contact you if the kitchen closes this section",

  orderHome: "Order to your door",
  orderHomeHint: "We deliver to your home",
  orderShop: "At the restaurant",
  orderShopHint: "Pick up at the counter",
  orderCar: "From your car",
  orderCarHint: "We bring it out to you",
};

export const MENU_COPY: Record<MenuLang, MenuCopy> = { ar, en };

/** يستبدل `{name}` بما يقابله — أبسط من مكتبة، والقوالب ثلاثة */
export function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}
