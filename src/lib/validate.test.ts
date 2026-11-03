import { expect, test } from "bun:test";
import type { Invoice } from "./schema";
import { reviewReason, validateInvoice, validateTaxId } from "./validate";

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
  discount_amount: 0,
  tax_amount: 21.99,
  prices_include_tax: false,
  rounding: 0,
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

test("document discount, rounding and tax-inclusive prices", () => {
  expect(validateInvoice({ ...ok, discount_amount: 9.97, tax_amount: 19.8, total: 109.8 }, today)).toEqual([]);
  expect(validateInvoice({ ...ok, rounding: -0.01, total: 121.95 }, today)).toEqual([]);
  expect(validateInvoice({ ...ok, prices_include_tax: true, tax_amount: 18.03, total: 99.97 }, today)).toEqual([]);
  expect(validateInvoice({ ...ok, prices_include_tax: true, total: 121.96 }, today).map((i) => i.field)).toEqual(["total"]);
});

test("review reason", () => {
  const total = [{ field: "total", message: "a" }];
  expect(reviewReason(total, [])).toBeNull();
  expect(reviewReason(total, [{ field: "total", message: "b" }])).toBe("document_inconsistent");
  expect(reviewReason(total, [{ field: "subtotal", message: "c" }])).toBe("uncertain_extraction");
  expect(reviewReason(total, total)).toBe("uncertain_extraction"); // same attempt: nobody double-checked
});

test("tax ids", () => {
  expect(validateTaxId("IT 00743110157")).toBe(true);
  expect(validateTaxId("12345678Z")).toBe(true); // DNI
  expect(validateTaxId("ES12345678A")).toBe(false);
  expect(validateTaxId("X1234567L")).toBe(true); // NIE
  expect(validateTaxId("B12345678")).toBe(true); // CIF format
  expect(validateTaxId("GST 001234567890")).toBeNull(); // other countries: not checkable, not invalid
  expect(validateTaxId("00743110158")).toBe(false);
});
