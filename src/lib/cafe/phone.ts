/**
 * Iraqi phone numbers, folded into the one shape the shop stores and prints.
 *
 * They arrive in several forms depending on who typed them and where:
 * +9647701234567, 009647701234567, 07701234567, «{ 0787 699 1800 }» with the
 * cashier's braces, ٠٧٨٧… in Arabic-Indic digits. The database holds the
 * local form, so everything is folded into it — otherwise the same customer
 * is three different people and none of them has an address. And a receipt
 * is drawn right-to-left: digit groups separated by spaces are laid out in
 * reverse order, so «0787 699 1800» prints as «1800 699 0787». One unbroken
 * run of digits has no groups to reverse.
 */

const ARABIC_INDIC = /[٠-٩۰-۹]/g;
const toLatinDigit = (ch: string) => String((ch.charCodeAt(0) - (ch <= "٩" ? 0x0660 : 0x06f0)) % 10);

/** every digit in the string, Latin, nothing else */
export function phoneDigits(raw: string): string {
  return raw.replace(ARABIC_INDIC, toLatinDigit).replace(/\D/g, "");
}

/** local mobile form 07XXXXXXXXX, or null when it is not an Iraqi mobile */
export function normalizeIraqiPhone(raw: string): string | null {
  const digits = phoneDigits(raw);
  if (!digits) return null;
  let local = digits;
  if (local.startsWith("00964")) local = local.slice(5);
  else if (local.startsWith("964")) local = local.slice(3);
  if (!local.startsWith("0")) local = `0${local}`;
  // 07XXXXXXXXX — anything shorter is a withheld or malformed number
  return /^07\d{9}$/.test(local) ? local : null;
}

/**
 * What goes on the order: the normalised mobile when it is one, otherwise
 * whatever digits were typed (a landline, a partial number) — the cashier's
 * information is not thrown away for failing a pattern. Null when empty.
 */
export function cleanPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return normalizeIraqiPhone(raw) ?? (phoneDigits(raw) || null);
}
