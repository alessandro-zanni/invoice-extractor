import type { Invoice } from "./schema";

export const FIELDS = [
  "supplier_name", "supplier_tax_id", "invoice_number", "issue_date", "currency",
  "subtotal", "tax_amount", "total", "lines",
] as const;
export type Field = (typeof FIELDS)[number];

const text = (s: string | null) => (s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
// "IT01234567890" and "01234567890" are the same id; ES ids keep their own leading letter.
const taxId = (s: string | null) => text(s).toUpperCase().replace(/^(IT|ES)(?=[A-Z0-9]{9})/, "");
const cents = (n: number) => Math.round(n * 100);

// Exact field match against ground truth: amounts to the cent, text ignoring case and punctuation.
export function scoreFields(got: Invoice | null, want: Invoice): Record<Field, boolean> {
  const g = got;
  return {
    supplier_name: !!g && text(g.supplier_name) === text(want.supplier_name),
    supplier_tax_id: !!g && taxId(g.supplier_tax_id) === taxId(want.supplier_tax_id),
    invoice_number: !!g && text(g.invoice_number) === text(want.invoice_number),
    issue_date: !!g && g.issue_date === want.issue_date,
    currency: !!g && g.currency.toUpperCase() === want.currency,
    subtotal: !!g && cents(g.subtotal) === cents(want.subtotal),
    tax_amount: !!g && cents(g.tax_amount) === cents(want.tax_amount),
    total: !!g && cents(g.total) === cents(want.total),
    lines:
      !!g &&
      g.lines.length === want.lines.length &&
      g.lines.every((l, i) => cents(l.amount) === cents(want.lines[i].amount)),
  };
}
