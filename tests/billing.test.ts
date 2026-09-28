import { describe, expect, it } from "vitest";
import {
  computeTotals,
  formatDocumentNumber,
  formatMoney,
  isOverdue,
  monthRange,
  outstandingCents,
  paidCents,
  parseLineItems,
  paymentCompletes,
} from "../src/lib/billing";

describe("computeTotals", () => {
  it("sums line items and applies GST", () => {
    const lines = [
      { description: "4 monthly articles", quantity: 1, unitPriceCents: 160_000 },
      { description: "extra article", quantity: 2, unitPriceCents: 35_000 },
    ];
    const t = computeTotals(lines, 1000);
    expect(t.subtotalCents).toBe(230_000);
    expect(t.taxCents).toBe(23_000);
    expect(t.totalCents).toBe(253_000);
  });

  it("rounds tax half-up on odd subtotals", () => {
    const t = computeTotals([{ description: "x", quantity: 1, unitPriceCents: 999 }], 1000);
    expect(t.taxCents).toBe(100); // 99.9 -> 100
    expect(t.totalCents).toBe(1099);
  });

  it("supports zero tax (not GST registered)", () => {
    const t = computeTotals([{ description: "x", quantity: 3, unitPriceCents: 10_000 }], 0);
    expect(t.taxCents).toBe(0);
    expect(t.totalCents).toBe(30_000);
  });
});

describe("parseLineItems", () => {
  it("accepts valid lines and fills default quantity", () => {
    const items = parseLineItems([{ description: "a", unitPriceCents: 100 }]);
    expect(items).toEqual([{ description: "a", quantity: 1, unitPriceCents: 100 }]);
  });

  it("rejects malformed input", () => {
    expect(parseLineItems("nope")).toEqual([]);
    expect(parseLineItems([{ description: "", unitPriceCents: 100 }])).toEqual([]);
    expect(parseLineItems([{ description: "a", unitPriceCents: -5 }])).toEqual([]);
  });
});

describe("formatting", () => {
  it("formats money", () => {
    expect(formatMoney(253_000)).toBe("$2,530.00");
    expect(formatMoney(1099)).toBe("$10.99");
    expect(formatMoney(-500)).toBe("-$5.00");
  });

  it("formats document numbers", () => {
    expect(formatDocumentNumber("Q", 1)).toBe("Q-0001");
    expect(formatDocumentNumber("INV", 1234)).toBe("INV-1234");
  });
});

describe("payment state", () => {
  const base = {
    totalCents: 100_000,
    status: "SENT",
    dueDate: new Date("2026-01-01"),
    paidAt: null,
    voidedAt: null,
    payments: [{ amountCents: 40_000 }],
  };

  it("computes paid and outstanding", () => {
    expect(paidCents(base)).toBe(40_000);
    expect(outstandingCents(base)).toBe(60_000);
    expect(outstandingCents({ ...base, payments: [{ amountCents: 150_000 }] })).toBe(0);
  });

  it("paymentCompletes checks coverage", () => {
    expect(paymentCompletes(base, 50_000)).toBe(false);
    expect(paymentCompletes(base, 60_000)).toBe(true);
    expect(paymentCompletes(base, 70_000)).toBe(true);
  });

  it("isOverdue only for sent, unpaid, past-due invoices", () => {
    const now = new Date("2026-02-01");
    expect(isOverdue(base, now)).toBe(true);
    expect(isOverdue({ ...base, dueDate: new Date("2026-03-01") }, now)).toBe(false);
    expect(isOverdue({ ...base, payments: [{ amountCents: 100_000 }] }, now)).toBe(false);
    expect(isOverdue({ ...base, status: "DRAFT" }, now)).toBe(false);
    expect(isOverdue({ ...base, status: "VOID" }, now)).toBe(false);
    expect(isOverdue({ ...base, dueDate: null }, now)).toBe(false);
  });
});

describe("monthRange", () => {
  it("brackets the whole month", () => {
    const { periodStart, periodEnd } = monthRange(new Date(2026, 9, 15)); // 15 Oct 2026
    expect(periodStart.getFullYear()).toBe(2026);
    expect(periodStart.getMonth()).toBe(9);
    expect(periodStart.getDate()).toBe(1);
    expect(periodEnd.getMonth()).toBe(9);
    expect(periodEnd.getDate()).toBe(31);
    expect(periodEnd.getHours()).toBe(23);
  });

  it("handles December", () => {
    const { periodEnd } = monthRange(new Date(2026, 11, 3));
    expect(periodEnd.getDate()).toBe(31);
  });
});
