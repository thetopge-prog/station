/**
 * Comparing a secret without leaking how nearly you guessed it.
 *
 * This loop existed twice already — once in the WhatsApp intake and once in the
 * caller-ID route — and the delivery API would have made three copies of a
 * security primitive. Lifted here before that happened.
 *
 * Length is compared first and does leak: an attacker learns the size of the
 * secret, which for a 48-character random hex string is not a secret worth
 * keeping. The VALUE does not leak, which is the part that matters.
 */
export function secretMatches(given: string | null | undefined, expected: string): boolean {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
