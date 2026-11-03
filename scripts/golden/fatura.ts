// Invoices from FATURA (CC BY 4.0, https://huggingface.co/datasets/mathieu1256/FATURA2-invoices):
// 50 layouts, English. Labels are token-level NER with no line items, so only total, currency,
// issue date and invoice number are scored. Tag ids inferred from the data: 1 TOTAL, 3 DATE,
// 12 INVOICE NUMBER.
//   bun scripts/golden/fatura.ts
import type { Invoice } from "../../src/lib/schema";

const OUT = "data/golden";
const COUNT = 30;
const API = "https://datasets-server.huggingface.co/rows?dataset=mathieu1256/FATURA2-invoices&config=default&split=test";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Tokens of one tag, with the field label ("TOTAL", "Invoice Date", "INVOICE #") dropped.
function tagged(row: { tokens: string[]; ner_tags: number[] }, tag: number, labels: RegExp) {
  const words = row.tokens.filter((_, i) => row.ner_tags[i] === tag);
  while (words.length && labels.test(words[0])) words.shift();
  return words;
}

function isoDate(s: string) {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s);
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  return m && month >= 0 ? `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

const { rows } = await fetch(`${API}&offset=0&length=${COUNT}`).then((r) => r.json());

for (const [i, { row }] of rows.entries()) {
  const totalWords = tagged(row, 1, /^(total|amount|due|:)$/i);
  const total = Number((totalWords.find((w) => /\d/.test(w)) ?? "").replace(/[^\d.]/g, ""));
  const currency = totalWords.find((w) => /^[A-Z]{3}$/.test(w)) ?? null;
  const date = isoDate(tagged(row, 3, /^(invoice|date|:)$/i).join(" "));
  const number = tagged(row, 12, /^(invoice|number|no\.?|id|#|:|invoice#)$/i).join(" ") || null;
  if (!total) continue;

  const fields = ["total", ...(currency ? ["currency"] : []), ...(date ? ["issue_date"] : []), ...(number ? ["invoice_number"] : [])];
  const invoice: Invoice = {
    supplier_name: "", supplier_tax_id: null, invoice_number: number, issue_date: date, currency: currency ?? "",
    lines: [], subtotal: 0, tax_amount: 0, total,
  };
  const id = `fat-${String(i + 1).padStart(3, "0")}`;
  const file = `${id}.jpg`;
  await Bun.write(`${OUT}/${file}`, await fetch(row.image.src).then((r) => r.arrayBuffer()));
  const split = i % 3 === Math.floor(i / 3) % 3 ? "test" : "dev";
  await Bun.write(
    `${OUT}/${id}.json`,
    JSON.stringify({ id, file, split, expect_review: null, fields, source: "FATURA (FATURA2-invoices test split), CC BY 4.0", invoice }, null, 2) + "\n",
  );
  console.log(id, split, total, currency, date, number);
}
