import { expect, test } from "bun:test";
import type { Invoice } from "./schema";
import { scoreFields } from "./score";

const want: Invoice = {
  supplier_name: "Ferramenta Corsini & C. Snc",
  supplier_tax_id: "IT00743110157",
  invoice_number: "42/2026",
  issue_date: "2026-10-01",
  currency: "EUR",
  lines: [{ description: "Viti", quantity: 2, unit_price: 1.5, amount: 3 }],
  subtotal: 3,
  tax_amount: 0.66,
  total: 3.66,
};

test("normalizes text and tax id prefix", () => {
  const got = { ...want, supplier_name: "FERRAMENTA CORSINI & C SNC", supplier_tax_id: "00743110157", invoice_number: "42 / 2026" };
  expect(Object.values(scoreFields(got, want)).every(Boolean)).toBe(true);
});

test("amounts must match to the cent", () => {
  const s = scoreFields({ ...want, total: 3.67, lines: [{ ...want.lines[0], amount: 3.01 }] }, want);
  expect(s.total).toBe(false);
  expect(s.lines).toBe(false);
  expect(s.subtotal).toBe(true);
});

test("no output scores nothing", () => {
  expect(Object.values(scoreFields(null, want)).some(Boolean)).toBe(false);
});
