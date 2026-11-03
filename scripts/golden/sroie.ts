// Receipts from SROIE (ICDAR 2019, Malaysian, English; https://huggingface.co/datasets/rajistics/sroie).
// Licensed for research only, so it is downloaded into data/external (gitignored) and never
// committed. Scored on total, issue date and supplier name (the SROIE "company" field).
//   bun scripts/golden/sroie.ts
import { mkdir } from "node:fs/promises";
import type { Invoice } from "../../src/lib/schema";

const OUT = "data/external/sroie";
const COUNT = 30;
const API = "https://datasets-server.huggingface.co/rows?dataset=rajistics/sroie&config=default&split=train";

const tag = (text: string, name: string) => new RegExp(`<s_${name}>(.*?)</s_${name}>`).exec(text)?.[1]?.trim() ?? null;
// SROIE dates are mostly dd/mm/yyyy, sometimes dd-mm-yy: anything else is left unscored.
function isoDate(s: string | null) {
  const m = s && /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(s);
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  // A "month" above 12 means the receipt is mm/dd: swap.
  const [d, mo] = Number(m[2]) > 12 ? [m[2], m[1]] : [m[1], m[2]];
  return `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

await mkdir(OUT, { recursive: true });
const { rows } = await fetch(`${API}&offset=0&length=${COUNT}`).then((r) => r.json());

for (const [i, { row }] of rows.entries()) {
  const total = Number((tag(row.text, "total") ?? "").replace(/[^\d.]/g, ""));
  const company = tag(row.text, "company");
  const date = isoDate(tag(row.text, "date"));
  if (!total) continue;

  const fields = ["total", ...(date ? ["issue_date"] : []), ...(company ? ["supplier_name"] : [])];
  const invoice: Invoice = {
    supplier_name: company ?? "", supplier_tax_id: null, invoice_number: null, issue_date: date, currency: "MYR",
    lines: [], subtotal: 0, tax_amount: 0, total,
  };
  const id = `sroie-${String(i + 1).padStart(3, "0")}`;
  const file = `${id}.jpg`;
  await Bun.write(`${OUT}/${file}`, await fetch(row.image.src).then((r) => r.arrayBuffer()));
  const split = i % 3 === Math.floor(i / 3) % 3 ? "test" : "dev";
  await Bun.write(
    `${OUT}/${id}.json`,
    JSON.stringify({ id, file, split, expect_review: null, fields, source: "SROIE (ICDAR 2019), research use only", invoice }, null, 2) + "\n",
  );
  console.log(id, split, total, date, company);
}
