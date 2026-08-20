/**
 * One source of truth for everything that says «ستيشن» on screen or on paper.
 *
 * The cafe build had its brand name typed by hand in ~19 files; changing it
 * meant a grep-and-pray. Every user-visible mention now comes from here.
 *
 * The auth email domain and the session cookie key were the last two things
 * still carrying the previous client name. Station runs on its own database
 * with its own accounts, so both now read "station" too — nothing here is
 * shared with any other project.
 */

export const BRAND = {
  /** Arabic name, used everywhere in the UI */
  nameAr: "ستيشن",
  /** the script wordmark on the packaging — render with .station-script */
  nameLatin: "Station",
  /** the Arabic nickname from the ad set («المحطة تفزع لك») */
  nicknameAr: "المحطة",
  taglineAr: "المحطة تفزع لك",
  cityAr: "الرمادي — العراق",
  addressAr: "الرمادي، شارع المستودع، فلكة الفرسان",

  /** as printed on the menu board */
  phoneDisplay: "0783 155 1888",
  /** E.164 without the +, for wa.me links */
  whatsapp: "9647831551888",

  /** brand orange — keep in sync with --primary in globals.css */
  themeColor: "#FF6B00",
} as const;

/** «ستيشن — Station» for titles that want both scripts */
export const BRAND_TITLE = `${BRAND.nameAr} — ${BRAND.nameLatin}`;

/**
 * Build the WhatsApp deep link for a delivery order. The customer taps send —
 * no Meta Business account, no token, no approval, and it works the moment the
 * shop has a phone. The order is already saved in Supabase before this opens,
 * so the kitchen sees it whether or not the message is ever sent.
 */
export function whatsappOrderLink(body: string, phone: string = BRAND.whatsapp): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(body)}`;
}

/**
 * «طلبك جاهز» for a customer waiting in their car.
 *
 * Opened by the expediter, sent with one tap from the shop phone. Deliberately
 * not an automated Cloud API send: that needs a verified Meta Business account
 * and an approved template, and this works today. The wording tells them to
 * call BEFORE arriving so the runner is already walking out with the bag.
 */
export function curbsideReadyLink(input: { phone: string; orderNumber: string; code: string | null }): string {
  const iraqi = normaliseIraqiPhone(input.phone);
  const body = [
    `طلبك جاهز 🍔 — ${BRAND.nameAr}`,
    `رقم الطلب: ${input.orderNumber}`,
    input.code ? `رمزك: ${input.code}` : null,
    "",
    "قبل وصولك بدقيقتين اتصل بنا ويسلّمك موظفنا طلبك مباشرة دون نزولك!",
    BRAND.phoneDisplay,
  ]
    .filter((l) => l !== null)
    .join("\n");
  return whatsappOrderLink(body, iraqi);
}

/**
 * Iraqi mobile → E.164 digits for wa.me.
 *
 * Customers type «07801234567»; wa.me needs «9647801234567». Getting this wrong
 * opens WhatsApp on a number that does not exist, which looks to staff exactly
 * like the customer ignoring them.
 */
export function normaliseIraqiPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("964")) return d;
  if (d.startsWith("0")) return "964" + d.slice(1);
  if (d.length === 10 && d.startsWith("7")) return "964" + d;
  return d;
}
