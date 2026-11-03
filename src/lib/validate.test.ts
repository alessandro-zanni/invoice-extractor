import { expect, test } from "bun:test";
import type { Invoice } from "./schema";
import { validateInvoice, validateTaxId } from "./validate";

const ok: Invoice = {
  supplier_name: "Acme Srl",
  supplier_tax_id: "IT00743110157",
  invoice_number: "42",
  issue_date: "2026-10-01",
  currency: "EUR",
  lines: [
    { description: "Widget", quantity: 3, unit_price: 9.99, discount_percent: null, amount: 29.97 },
    { description: "Setup", quantity: 1, unit_price: 70, discount_percent: null, amount: 70 },
  ],
  subtotal: 99.97,
  tax_amount: 21.99,
  total: 121.96,
};
const today = new Date("2026-10-29");

test("valid invoice has no issues", () => {
  expect(validateInvoice(ok, today)).toEqual([]);
});

test("catches wrong sums, tax id and date", () => {
  const bad = { ...ok, subtotal: 100.97, supplier_tax_id: "IT00743110158", issue_date: "2027-01-01" };
  expect(validateInvoice(bad, today).map((i) => i.field).sort()).toEqual(
    ["issue_date", "subtotal", "supplier_tax_id", "total"],
  );
});

test("catches line math", () => {
  const bad = { ...ok, lines: [{ ...ok.lines[0], amount: 30.97 }, ok.lines[1]] };
  expect(validateInvoice(bad, today).map((i) => i.field)).toContain("lines.0.amount");
});

test("line discounts", () => {
  const disc = { ...ok, lines: [{ ...ok.lines[0], discount_percent: 10, amount: 26.97 }, ok.lines[1]], subtotal: 96.97, tax_amount: 21.33, total: 118.3 };
  expect(validateInvoice(disc, today)).toEqual([]);
  expect(validateInvoice({ ...disc, lines: [{ ...disc.lines[0], discount_percent: null }, ok.lines[1]] }, today).map((i) => i.field)).toEqual(["lines.0.amount"]);
});

test("tax ids", () => {
  expect(validateTaxId("IT 00743110157")).toBe(true);
  expect(validateTaxId("12345678Z")).toBe(true); // DNI
  expect(validateTaxId("ES12345678A")).toBe(false);
  expect(validateTaxId("X1234567L")).toBe(true); // NIE
  expect(validateTaxId("B12345678")).toBe(true); // CIF format
  expect(validateTaxId("GST 001234567890")).toBe(null); // other countries: not checkable, not invalid
  expect(validateTaxId("00743110158")).toBe(false);
});
