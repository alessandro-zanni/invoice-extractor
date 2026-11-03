import type { Invoice } from "./schema";

export type Issue = { field: string; message: string };

const cents = (n: number) => Math.round(n * 100);
// One cent of rounding per summed term is normal on real invoices.
const close = (a: number, b: number, terms = 1) => Math.abs(cents(a) - cents(b)) <= terms;

// Italian partita IVA: 11 digits, last one is a Luhn-style check digit.
function isItalianVat(digits: string) {
  if (!/^\d{11}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let d = Number(digits[i]);
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[10]);
}

// Spanish NIF: DNI (8 digits + check letter), NIE (X/Y/Z + 7 digits + letter), CIF (letter + 7 digits + control).
function isSpanishNif(id: string) {
  const letters = "TRWAGMYFPDXBNJZSQVHLCKE";
  const dni = /^(\d{8})([A-Z])$/.exec(id);
  if (dni) return letters[Number(dni[1]) % 23] === dni[2];
  const nie = /^([XYZ])(\d{7})([A-Z])$/.exec(id);
  if (nie) return letters[Number("XYZ".indexOf(nie[1]) + nie[2]) % 23] === nie[3];
  return /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(id); // ponytail: CIF format only, add control digit if false positives show up in eval
}

// true/false for Italian and Spanish ids, null for ids we can't check (other countries).
export function validateTaxId(raw: string): boolean | null {
  const id = raw.replace(/[\s.-]/g, "").toUpperCase();
  if (id.startsWith("IT")) return isItalianVat(id.slice(2));
  if (id.startsWith("ES")) return isSpanishNif(id.slice(2));
  if (/^\d{11}$/.test(id)) return isItalianVat(id);
  if (/^(\d{8}|[XYZ]\d{7}|[ABCDEFGHJNPQRSUVW]\d{7})[0-9A-Z]$/.test(id)) return isSpanishNif(id);
  return null;
}

export type ReviewReason = "document_inconsistent" | "uncertain_extraction";

// Why a document that still fails checks after escalation goes to review: if both models fail the
// same checks, the document itself doesn't add up; otherwise the reading is uncertain.
export function reviewReason(first: Issue[], last: Issue[]): ReviewReason | null {
  if (!last.length) return null;
  const fields = (xs: Issue[]) => xs.map((i) => i.field).sort((a, b) => a.localeCompare(b)).join();
  return first !== last && fields(first) === fields(last) ? "document_inconsistent" : "uncertain_extraction";
}

export function validateInvoice(inv: Invoice, today = new Date()): Issue[] {
  const issues: Issue[] = [];

  inv.lines.forEach((l, i) => {
    const expected = l.quantity * l.unit_price * (1 - (l.discount_percent ?? 0) / 100);
    if (!close(expected, l.amount))
      issues.push({ field: `lines.${i}.amount`, message: `${l.quantity} × ${l.unit_price} − ${l.discount_percent ?? 0}% ≠ ${l.amount}` });
  });

  if (inv.lines.length) {
    const sum = inv.lines.reduce((s, l) => s + l.amount, 0);
    if (!close(sum, inv.subtotal, inv.lines.length))
      issues.push({ field: "subtotal", message: `lines sum to ${sum.toFixed(2)}, subtotal is ${inv.subtotal}` });
  }

  const tax = inv.prices_include_tax ? 0 : inv.tax_amount;
  if (!close(inv.subtotal - inv.discount_amount + tax + inv.rounding, inv.total, 2))
    issues.push({ field: "total", message: `${inv.subtotal} − ${inv.discount_amount} + ${tax} + ${inv.rounding} ≠ ${inv.total}` });

  if (inv.supplier_tax_id && validateTaxId(inv.supplier_tax_id) === false)
    issues.push({ field: "supplier_tax_id", message: `invalid tax id ${inv.supplier_tax_id}` });

  if (inv.issue_date) {
    const d = new Date(`${inv.issue_date}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(inv.issue_date))
      issues.push({ field: "issue_date", message: `not an ISO date: ${inv.issue_date}` });
    else if (d > today || d.getUTCFullYear() < 2000)
      issues.push({ field: "issue_date", message: `implausible date ${inv.issue_date}` });
  }

  return issues;
}
