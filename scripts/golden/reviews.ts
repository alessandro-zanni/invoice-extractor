// Corrected documents become golden cases: the reviewer's version is the ground truth.
// They are the owner's documents, so they go to data/external/reviews (gitignored), never the repo.
//   SUPABASE_URL=… SUPABASE_SECRET_KEY=… bun scripts/golden/reviews.ts
import { createClient } from "@supabase/supabase-js";
import { mkdir } from "node:fs/promises";
import type { Database } from "../../src/lib/database.types";
import type { Invoice } from "../../src/lib/schema";
import { FIELDS } from "../../src/lib/score";
import { validateInvoice } from "../../src/lib/validate";

const OUT = "data/external/reviews";
const supabase = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

const { data: docs, error } = await supabase.from("documents").select("id, file_path, correction").eq("status", "corrected");
if (error) throw error;
await mkdir(OUT, { recursive: true });

for (const doc of docs) {
  const id = `rev-${doc.id.slice(0, 8)}`;
  const file = `${id}.${doc.file_path.split(".").pop()}`;
  const { data: blob, error: dl } = await supabase.storage.from("documents").download(doc.file_path);
  if (dl) throw dl;
  await Bun.write(`${OUT}/${file}`, blob);
  const invoice = doc.correction as Invoice;
  // Stable split from the uuid: about a third of the reviews land in test.
  const split = "abcdef".includes(doc.id[0]) ? "test" : "dev";
  // A correction that still fails checks means the document itself doesn't add up: it must go to review.
  const expect_review = validateInvoice(invoice).length > 0;
  await Bun.write(`${OUT}/${id}.json`, JSON.stringify({ id, file, split, expect_review, fields: FIELDS, source: "human review", invoice }, null, 2) + "\n");
  console.log(id, split, expect_review ? "expect review" : "");
}
console.log(`${docs.length} reviewed documents exported`);
