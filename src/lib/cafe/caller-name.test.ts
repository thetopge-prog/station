import { describe, expect, it } from "vitest";

/**
 * The generic-label filter, kept honest by a test.
 *
 * The first version used \b after an Arabic alternative. In JavaScript \b is a
 * boundary between [A-Za-z0-9_] and anything else, and Arabic letters are in
 * neither class — so it never matched, the filter silently did nothing, and
 * «مكالمة واردة» went on creating customers nobody could ring back. It read
 * correctly and was wrong, which is exactly the kind of thing a test catches
 * and a careful reading does not.
 */
const GENERIC = /^\s*(مكالمة|اتصال|incoming|outgoing|ongoing|call|calling|dialing|unknown)(\s|$)/i;

describe("generic call labels", () => {
  it("rejects the dialer's own notification titles", () => {
    for (const s of ["مكالمة واردة", "اتصال", "Incoming call", "Ongoing call", "Unknown"]) {
      expect(GENERIC.test(s), s).toBe(true);
    }
  });

  it("keeps real people, including names that merely start alike", () => {
    for (const s of ["احمد", "Ali", "ابو مصطفى", "اتصالات العراق"]) {
      expect(GENERIC.test(s), s).toBe(false);
    }
  });
});
