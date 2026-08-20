import type { Fulfilment } from "./order-actions";

/**
 * The four ways to receive an order, as plain data.
 *
 * Lives here rather than in FulfilmentPicker.tsx because that file is a client
 * component: Next replaces a client module with a reference proxy when a
 * server component imports it, so a VALUE imported across that boundary is not
 * the value — `MODES.some(...)` on the server throws "is not a function". The
 * type survives (types are erased); the array does not.
 *
 * Same reason src/lib/cafe/roles.ts exists. The picker still owns the labels
 * and the icons, which are genuinely client concerns.
 */

export type FulfilmentMode = "delivery" | "pickup" | "dinein" | "curbside";

export const FULFILMENT_MODES = ["delivery", "pickup", "dinein", "curbside"] as const;

/** dine-in rides the existing `qr` channel — it IS a QR-menu order, just one
 *  where the customer told us they are staying rather than the sticker doing it */
export const CHANNEL_OF: Record<FulfilmentMode, Fulfilment> = {
  delivery: "delivery",
  pickup: "pickup",
  dinein: "qr",
  curbside: "curbside",
};

/**
 * Read a mode off a URL. Null for anything unrecognised.
 *
 * ?mode= arrives from a link anyone can edit, and an unknown value would put
 * the basket in a state with no matching channel — so this is a gate, not a cast.
 */
export function toFulfilmentMode(raw: string | undefined | null): FulfilmentMode | null {
  return FULFILMENT_MODES.includes(raw as FulfilmentMode) ? (raw as FulfilmentMode) : null;
}
