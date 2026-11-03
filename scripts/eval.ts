// Runs one extraction strategy over the golden set and scores it against ground truth.
//   bun scripts/eval.ts --strategy haiku|opus|routed [--split dev|test|all] [--source syn|cord|fat|sroie] [--limit N]
import { readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { extract, extractRouted, type MediaType } from "../src/lib/extract";
import type { Invoice } from "../src/lib/schema";
import { FIELDS, scoreFields, type Field } from "../src/lib/score";

const { values: args } = parseArgs({
  options: { strategy: { type: "string", default: "routed" }, split: { type: "string", default: "dev" }, source: { type: "string" }, limit: { type: "string" } },
});
const strategy = args.strategy!;
if (!["haiku", "opus", "routed"].includes(strategy)) throw new Error(`unknown strategy ${strategy}`);

// data/external holds research-only sets (SROIE) that are downloaded, never committed.
const DIRS = ["data/golden", ...(existsSync("data/external") ? (await readdir("data/external")).map((d) => `data/external/${d}`) : [])];
// `fields`: which fields this case scores (default all); `expect_review: null` = not scored.
type Case = { dir: string; id: string; file: string; split: string; expect_review: boolean | null; fields?: Field[]; invoice: Invoice };
const cases: Case[] = [];
for (const dir of DIRS) for (const f of (await readdir(dir)).filter((f) => f.endsWith(".json")).sort()) {
  const c: Case = { ...(await Bun.file(`${dir}/${f}`).json()), dir };
  if ((args.split === "all" || c.split === args.split) && (!args.source || c.id.startsWith(args.source))) cases.push(c);
}
const selected = args.limit ? cases.slice(0, Number(args.limit)) : cases;

const MEDIA: Record<string, MediaType> = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png" };

async function runCase(c: Case) {
  const data = Buffer.from(await Bun.file(`${c.dir}/${c.file}`).arrayBuffer()).toString("base64");
  const media = MEDIA[c.file.split(".").pop()!];
  const start = Date.now();
  let invoice: Invoice | null, issues, costUsd, models: string[];
  if (strategy === "routed") {
    const r = await extractRouted(data, media);
    ({ invoice, issues, costUsd } = r);
    models = r.attempts.map((a) => a.model);
  } else {
    const a = await extract(data, media, strategy === "haiku" ? "claude-haiku-5-5" : "claude-opus-5-5");
    ({ invoice, issues, costUsd } = a);
    models = [a.model];
  }
  const flagged = issues.length > 0;
  return { id: c.id, scored: c.fields ?? [...FIELDS], expect_review: c.expect_review, flagged, models, costUsd, ms: Date.now() - start, issues, fields: scoreFields(invoice, c.invoice), invoice };
}

// Small worker pool: a few documents in flight, well under the rate limits.
type Result = Awaited<ReturnType<typeof runCase>> | { id: string; error: string };
const results: Result[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < selected.length) {
      const c = selected[next++];
      try {
        results.push(await runCase(c));
      } catch (e) {
        results.push({ id: c.id, error: String(e) });
      }
      process.stderr.write(".");
    }
  }),
);
process.stderr.write("\n");

const ok = results.filter((r) => !("error" in r)) as Awaited<ReturnType<typeof runCase>>[];
const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");
const clean = ok.filter((r) => r.expect_review === false);
const dirty = ok.filter((r) => r.expect_review === true);
const fieldPct = (f: Field) => {
  const xs = ok.filter((r) => r.scored.includes(f));
  return xs.length ? `${pct(xs.filter((r) => r.fields[f]).length, xs.length)} (${xs.length})` : "n/a";
};
const ms = ok.map((r) => r.ms).sort((a, b) => a - b);
const summary = {
  strategy, split: args.split, docs: selected.length, errors: results.length - ok.length,
  field_accuracy: Object.fromEntries(FIELDS.map((f) => [f, fieldPct(f)])),
  docs_all_fields_right: pct(ok.filter((r) => r.scored.every((f) => r.fields[f])).length, ok.length),
  printed_errors_caught: `${dirty.filter((r) => r.flagged).length}/${dirty.length}`,
  clean_docs_flagged: `${clean.filter((r) => r.flagged).length}/${clean.length}`,
  escalated_to_opus: strategy === "routed" ? pct(ok.filter((r) => r.models.length > 1).length, ok.length) : undefined,
  cost_usd_total: +ok.reduce((s, r) => s + r.costUsd, 0).toFixed(4),
  cost_usd_per_doc: +(ok.reduce((s, r) => s + r.costUsd, 0) / (ok.length || 1)).toFixed(5),
  latency_ms_p50: ms[Math.floor(ms.length / 2)],
  latency_ms_p95: ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))],
};
console.log(JSON.stringify(summary, null, 2));
for (const r of results) if ("error" in r) console.error(r.id, r.error);

await mkdir("eval/runs", { recursive: true });
const out = `eval/runs/${new Date().toISOString().replace(/[:.]/g, "-")}-${strategy}-${args.split}.json`;
await Bun.write(out, JSON.stringify({ summary, results: results.sort((a, b) => a.id.localeCompare(b.id)) }, null, 2) + "\n");
console.error(`saved ${out}`);
