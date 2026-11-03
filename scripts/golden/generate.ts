// Synthetic golden set: invoices generated from known data, so the ground truth is exact by
// construction. Renders each one as a PDF or as a degraded "photo" (JPEG) with headless Chromium.
//   CHROME=/path/to/chrome bun scripts/golden/generate.ts
import { $ } from "bun";
import { mkdir, readdir, rm } from "node:fs/promises";
import type { Invoice } from "../../src/lib/schema";
import { validateInvoice } from "../../src/lib/validate";

const CHROME = process.env.CHROME ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const OUT = "data/golden";
const COUNT = 50;
// From document 31 on: one harder variant each, in rotation. Earlier documents stay identical
// because the variants only draw extra random numbers for themselves.
const VARIANTS = ["multirate", "discount", "twopage", "rot90", "lowres"] as const;
type Variant = (typeof VARIANTS)[number] | null;

// Seeded RNG: the same script always produces the same set.
let seed = 42;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
const round2 = (n: number) => Math.round(n * 100) / 100;

function italianVat() {
  const d = Array.from({ length: 10 }, () => int(0, 9));
  const sum = d.reduce((s, x, i) => s + (i % 2 ? (x * 2 > 9 ? x * 2 - 9 : x * 2) : x), 0);
  return `IT${d.join("")}${(10 - (sum % 10)) % 10}`;
}
function spanishId() {
  if (rand() < 0.5) return `B${String(int(0, 9999999)).padStart(7, "0")}${int(0, 9)}`; // CIF (company)
  const n = int(10000000, 99999999);
  return `${n}${"TRWAGMYFPDXBNJZSQVHLCKE"[n % 23]}`; // DNI (freelancer)
}

const SUPPLIERS = {
  IT: ["Tipografia Bassi Srl", "Studio Grafico Lunetta", "Ferramenta Corsini & C. Snc", "Idraulica Valli Srl", "Consulenze Moretti", "Panificio Rinaldi"],
  ES: ["Imprenta Soler SL", "Reformas Garrido SL", "Talleres Montaner SA", "Laura Peña Fotografía", "Distribuciones Arnau SL", "Café Rambla SL"],
} as const;
const ITEMS = {
  IT: ["Consulenza oraria", "Stampa biglietti da visita", "Manutenzione impianto", "Materiale di consumo", "Trasferta", "Licenza software annuale", "Pannello in legno"],
  ES: ["Hora de consultoría", "Impresión de folletos", "Mantenimiento mensual", "Material de oficina", "Desplazamiento", "Sesión de fotos", "Pintura interior"],
} as const;
const RATES = { IT: [0.22, 0.1, 0.04], ES: [0.21, 0.1] } as const;
const LABELS = {
  IT: { discount: "Sconto %", taxTotal: "Totale IVA", on: "su", title: "FATTURA", number: "Fattura n.", date: "Data", vat: "P.IVA", desc: "Descrizione", qty: "Q.tà", price: "Prezzo unit.", amount: "Importo", subtotal: "Imponibile", tax: "IVA", total: "Totale documento" },
  ES: { discount: "Dto. %", taxTotal: "Total IVA", on: "sobre", title: "FACTURA", number: "Factura nº", date: "Fecha", vat: "NIF", desc: "Concepto", qty: "Cant.", price: "Precio", amount: "Importe", subtotal: "Base imponible", tax: "IVA", total: "Total factura" },
} as const;

// Errors printed on purpose: the right answer is to copy them and send the document to review.
const ERRORS = ["total", "subtotal", "line", "tax_id"] as const;
type ErrorKind = (typeof ERRORS)[number];

const money = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function makeInvoice(i: number, error: ErrorKind | null, variant: Variant) {
  const country: "IT" | "ES" = i % 2 ? "ES" : "IT";
  const rate = pick(RATES[country]);
  const count = variant === "twopage" ? int(32, 40) : variant === "multirate" ? int(3, 6) : int(1, 6);
  const rows = Array.from({ length: count }, (_, k) => {
    const quantity = pick([1, 1, 1, 2, 3, 5, 10, 0.5, 2.5]);
    const unit_price = round2(int(150, 90000) / 100);
    const description = pick(ITEMS[country]);
    // Alternate rates line by line so a multi-rate invoice always has at least two.
    const lineRate: number = variant === "multirate" ? RATES[country][k % RATES[country].length] : rate;
    const discount = variant === "discount" ? pick([0, 0, 5, 10, 15, 20]) : 0;
    const amount = round2(quantity * unit_price * (1 - discount / 100));
    return { line: { description, quantity, unit_price, discount_percent: discount || null, amount }, rate: lineRate };
  });
  const lines = rows.map((r) => r.line);
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  // Per-rate breakdown, as printed on multi-rate invoices; tax_amount is the printed VAT total.
  const taxRows = [...new Set(rows.map((r) => r.rate))].sort((a, b) => b - a).map((r) => {
    const base = round2(rows.filter((x) => x.rate === r).reduce((s, x) => s + x.line.amount, 0));
    return { rate: r, base, tax: round2(base * r) };
  });
  const tax_amount = taxRows.length > 1 ? round2(taxRows.reduce((s, t) => s + t.tax, 0)) : round2(subtotal * rate);
  const date = new Date(Date.UTC(int(2023, 2026), int(0, 8), int(1, 28)));
  const invoice: Invoice = {
    supplier_name: pick(SUPPLIERS[country]),
    supplier_tax_id: country === "IT" ? italianVat() : spanishId(),
    invoice_number: `${int(1, 999)}/${date.getUTCFullYear()}`,
    issue_date: date.toISOString().slice(0, 10),
    currency: "EUR",
    lines,
    subtotal,
    tax_amount,
    total: round2(subtotal + tax_amount),
  };
  if (error === "total") invoice.total = round2(invoice.total + pick([1, 10, 0.9, -5]));
  if (error === "subtotal") invoice.subtotal = round2(invoice.subtotal + pick([10, 1, -2.5]));
  if (error === "line") lines[0].amount = round2(lines[0].amount + pick([10, 1.5, -1]));
  if (error === "tax_id") {
    const id = invoice.supplier_tax_id!;
    const last = id.at(-1)!;
    invoice.supplier_tax_id = id.slice(0, -1) + (/\d/.test(last) ? (Number(last) + 1) % 10 : last === "A" ? "B" : "A");
  }
  return { country, rate, invoice, taxRows };
}

type TaxRow = { rate: number; base: number; tax: number };
function html(country: "IT" | "ES", rate: number, inv: Invoice, photo: boolean, style: number, taxRows: TaxRow[]) {
  const L = LABELS[country];
  const [y, m, d] = inv.issue_date!.split("-");
  const discountCol = inv.lines.some((l) => l.discount_percent);
  const taxHtml =
    taxRows.length > 1
      ? taxRows.map((t) => `<tr><td>${L.tax} ${Math.round(t.rate * 100)}% ${L.on} ${money(t.base)} €</td><td class=n>${money(t.tax)} €</td></tr>`).join("") +
        `<tr><td>${L.taxTotal}</td><td class=n>${money(inv.tax_amount)} €</td></tr>`
      : `<tr><td>${L.tax} ${Math.round(rate * 100)}%</td><td class=n>${money(inv.tax_amount)} €</td></tr>`;
  const border = style === 0 ? "border-bottom:1px solid #999" : "border:1px solid #333";
  const rows = inv.lines
    .map((l) => `<tr><td>${esc(l.description)}</td><td class=n>${money(l.quantity)}</td><td class=n>${money(l.unit_price)} €</td>${discountCol ? `<td class=n>${l.discount_percent ?? ""}</td>` : ""}<td class=n>${money(l.amount)} €</td></tr>`)
    .join("");
  const degrade = photo
    ? `body{transform:rotate(${(rand() * 3 - 1.5).toFixed(2)}deg);filter:blur(${(0.3 + rand() * 0.5).toFixed(2)}px) contrast(.85) brightness(1.05) sepia(.25)}`
    : "";
  return `<!doctype html><meta charset=utf-8><style>
  body{font-family:${style === 2 ? "Georgia,serif" : "Helvetica,Arial,sans-serif"};font-size:13px;margin:48px;color:#111;background:#fff}
  h1{font-size:${style === 1 ? 20 : 26}px;letter-spacing:2px} table{width:100%;border-collapse:collapse;margin:24px 0}
  td,th{padding:6px;${border};text-align:left} .n{text-align:right} .tot td{border:none} .tot{width:45%;margin-left:auto}
  ${degrade}</style>
  <div style="display:flex;justify-content:space-between"><div><b>${esc(inv.supplier_name)}</b><br>Via/Calle ${int(1, 120)}<br>${L.vat}: ${inv.supplier_tax_id}</div>
  <div><h1>${L.title}</h1>${L.number} <b>${inv.invoice_number}</b><br>${L.date}: ${d}/${m}/${y}</div></div>
  <table><tr><th>${L.desc}</th><th class=n>${L.qty}</th><th class=n>${L.price}</th>${discountCol ? `<th class=n>${L.discount}</th>` : ""}<th class=n>${L.amount}</th></tr>${rows}</table>
  <table class=tot><tr><td>${L.subtotal}</td><td class=n>${money(inv.subtotal)} €</td></tr>
  ${taxHtml}
  <tr><td><b>${L.total}</b></td><td class=n><b>${money(inv.total)} €</b></td></tr></table>`;
}

await mkdir(OUT, { recursive: true });
for (const f of await readdir(OUT)) if (f.startsWith("syn-")) await rm(`${OUT}/${f}`); // CORD files stay
const tmp = await $`mktemp -d`.text().then((s) => s.trim());

// 7 documents out of 30 carry a printed error, spread over the set.
const errorAt = new Map([3, 7, 13, 16, 22, 24, 28].map((i, k) => [i, ERRORS[k % ERRORS.length]]));

for (let i = 0; i < COUNT; i++) {
  const id = `syn-${String(i + 1).padStart(3, "0")}`;
  const error = errorAt.get(i) ?? null;
  const variant: Variant = i >= 30 ? VARIANTS[(i - 30) % VARIANTS.length] : null;
  const { country, rate, invoice, taxRows } = makeInvoice(i, error, variant);
  if (validateInvoice(invoice).length === 0 !== (error === null)) throw new Error(`${id}: validation disagrees with error=${error}`);
  const photo = variant ? variant === "rot90" || variant === "lowres" : i % 3 === 1;
  const page = `${tmp}/${id}.html`;
  await Bun.write(page, html(country, rate, invoice, photo, i % 3, taxRows));
  const file = `${id}.${photo ? "jpg" : "pdf"}`;
  if (photo) {
    await $`${CHROME} --headless --disable-gpu --hide-scrollbars --window-size=900,1100 --screenshot=${tmp}/${id}.png file://${page}`.quiet();
    if (variant === "rot90") await $`sips -r 90 ${tmp}/${id}.png`.quiet();
    if (variant === "lowres") await $`sips -Z 520 ${tmp}/${id}.png`.quiet();
    await $`sips -s format jpeg -s formatOptions ${variant === "lowres" ? 35 : 70} ${tmp}/${id}.png --out ${OUT}/${file}`.quiet();
  } else {
    await $`${CHROME} --headless --disable-gpu --no-pdf-header-footer --print-to-pdf=${OUT}/${file} file://${page}`.quiet();
  }
  // One test document per block of three, rotating, so the test split mixes PDFs and photos.
  const split = i % 3 === Math.floor(i / 3) % 3 ? "test" : "dev";
  await Bun.write(`${OUT}/${id}.json`, JSON.stringify({ id, file, split, expect_review: error !== null, error, variant, invoice }, null, 2) + "\n");
  console.log(id, file, split, error ?? variant ?? "");
}
