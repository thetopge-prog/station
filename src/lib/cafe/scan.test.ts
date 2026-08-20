import { describe, it, expect } from "vitest";
import { orderIdFromScan } from "@/components/cafe/use-barcode-scanner";

/**
 * The expediter scans a ticket and the order goes ready with no screen touch.
 * That means a misread has real consequences — the wrong order marked ready, or
 * a customer left waiting — so what counts as a valid scan is worth pinning.
 */
describe("scan → order id", () => {
  const ID = "3f2b1c88-9a4d-4e11-b7c2-0d5e6f7a8b90";

  it("accepts the raw order id the assembly ticket encodes", () => {
    expect(orderIdFromScan(ID)).toBe(ID);
  });

  it("tolerates the whitespace scanners append", () => {
    expect(orderIdFromScan(`  ${ID}\r\n`)).toBe(ID);
  });

  it("normalises case, since QR readers may upper-case hex", () => {
    expect(orderIdFromScan(ID.toUpperCase())).toBe(ID);
  });

  it("pulls the id out of a URL, so a future ticket format still scans", () => {
    expect(orderIdFromScan(`https://station.iq/o/${ID}`)).toBe(ID);
    expect(orderIdFromScan(`https://station.iq/o/${ID}?v=2`)).toBe(ID);
  });

  it("rejects anything that is not an order id", () => {
    // a loyalty card serial, a product barcode, and a stray keypress burst
    expect(orderIdFromScan("a1b2c3d4e5f60718")).toBeNull();
    expect(orderIdFromScan("6221048001234")).toBeNull();
    expect(orderIdFromScan("asdfgh")).toBeNull();
    expect(orderIdFromScan("")).toBeNull();
  });

  it("rejects a TRUNCATED id rather than guessing", () => {
    // a partial burst must fail loudly; silently matching a prefix would mark
    // the wrong order ready
    expect(orderIdFromScan(ID.slice(0, 20))).toBeNull();
  });
});
