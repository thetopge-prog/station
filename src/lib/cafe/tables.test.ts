import { describe, expect, it } from "vitest";
import { deriveTableStatuses, SEATED_MINUTES, type TableOrderRow } from "./tables";

const NOW = new Date("2026-07-24T12:00:00Z").getTime();
const min = (n: number) => new Date(NOW - n * 60000).toISOString();

function row(p: Partial<TableOrderRow>): TableOrderRow {
  return { order_seq: 1, status: "paid", table_no: "1", paid_at: null, created_at: min(5), subtotal: 5000, ...p };
}

describe("deriveTableStatuses", () => {
  it("pending order marks the table busy", () => {
    const [t1] = deriveTableStatuses([row({ status: "pending", table_no: "1", created_at: min(7) })], NOW, ["1", "2"]);
    expect(t1.state).toBe("pending");
    expect(t1.sinceMin).toBe(7);
  });

  it("paid within the window = seated with a countdown; older = free", () => {
    const res = deriveTableStatuses(
      [row({ table_no: "1", paid_at: min(10) }), row({ table_no: "2", paid_at: min(SEATED_MINUTES + 1) })],
      NOW,
      ["1", "2"],
    );
    expect(res[0].state).toBe("seated");
    expect(res[0].freeInMin).toBe(SEATED_MINUTES - 10);
    expect(res[1].state).toBe("free");
  });

  it("a pending order outranks a newer paid one on the same table", () => {
    const res = deriveTableStatuses(
      [row({ table_no: "3", paid_at: min(2), order_seq: 9 }), row({ status: "pending", table_no: "3", created_at: min(20), order_seq: 8 })],
      NOW,
      ["1", "2", "3"],
    );
    expect(res[2].state).toBe("pending");
    expect(res[2].seq).toBe(8);
  });

  it("carries the guest estimate (item count) onto the busy table", () => {
    const [t1] = deriveTableStatuses([row({ status: "pending", table_no: "1", created_at: min(2), guests: 3 })], NOW, ["1"]);
    expect(t1.guests).toBe(3);
  });

  it("keeps the defined order (incl. named outdoor tables) and appends unknowns", () => {
    const res = deriveTableStatuses([row({ table_no: "15", paid_at: min(1) })], NOW, ["1", "2", "خارجي 1"]);
    expect(res.map((t) => t.table)).toEqual(["1", "2", "خارجي 1", "15"]);
    expect(res[3].state).toBe("seated");
    expect(res[2].state).toBe("free");
  });
});
