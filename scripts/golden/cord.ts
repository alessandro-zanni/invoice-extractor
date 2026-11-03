// Real receipts from CORD v2 (Indonesian, IDR; CC BY 4.0, https://huggingface.co/datasets/naver-clova-ix/cord-v2).
// Its labels don't map onto our subtotal/tax fields (tax is often included in the total, service
// and discounts have no field here), so only `total` and `lines` are scored, and there is no
// expected review decision.
//   bun scripts/golden/cord.ts
import type { Invoice } from "../../src/lib/schema";

const OUT = "data/golden";
const COUNT = 30;
const API = "https://datasets-server.huggingface.co/rows?dataset=naver-clova-ix/cord-v2&config=default&split=test";

// "60.000", "17500", "-5,000" → IDR integers (no cents on these receipts).
const idr = (s: unknown) => {
  const str = String(s ?? "");
  const n = Number(str.replace(/[^\d]/g, ""));
  return str.trim().startsWith("-") ? -n : n;
};

type Item = { nm?: string; cnt?: string; price?: string; itemsubtotal?: string; sub?: Item | Item[] };
const { rows } = await fetch(`${API}&offset=0&length=${COUNT}`).then((r) => r.json());

for (const [i, { row }] of rows.entries()) {
  const gt = JSON.parse(row.ground_truth).gt_parse;
  // Add-ons printed under an item (`sub`) are line items of their own, as the prompt asks.
  const items: Item[] = [gt.menu ?? []].flat().flatMap((m: Item) => [m, ...[m.sub ?? []].flat()]);
  const total = idr(gt.total?.total_price);
  if (!total) continue; // a few receipts have no labelled total: nothing to score
  const lines = items.map((m) => {
    const amount = idr(m.price ?? m.itemsubtotal);
    const quantity = idr(m.cnt) || 1;
    return { description: m.nm ?? "", quantity, unit_price: amount / quantity, discount_percent: null, amount };
  });
  const invoice: Invoice = {
    supplier_name: "", supplier_tax_id: null, invoice_number: null, issue_date: null, currency: "IDR",
    lines, subtotal: idr(gt.sub_total?.subtotal_price), tax_amount: idr(gt.sub_total?.tax_price), total,
  };
  const id = `cord-${String(i + 1).padStart(3, "0")}`;
  const file = `${id}.jpg`;
  await Bun.write(`${OUT}/${file}`, await fetch(row.image.src).then((r) => r.arrayBuffer()));
  const split = i % 3 === Math.floor(i / 3) % 3 ? "test" : "dev";
  await Bun.write(
    `${OUT}/${id}.json`,
    JSON.stringify({ id, file, split, expect_review: null, fields: ["total", "lines"], source: "CORD v2 test split, CC BY 4.0", invoice }, null, 2) + "\n",
  );
  console.log(id, split, total, lines.length);
}
