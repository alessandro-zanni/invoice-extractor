import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { InvoiceSchema, type Invoice } from "./schema";
import { validateInvoice, type Issue } from "./validate";

const client = new Anthropic();

// USD per million tokens (input, output).
const PRICES = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-opus-5-5": [4, 20],
} as const;
export type Model = keyof typeof PRICES;

export type MediaType = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

const PROMPT = `Extract the invoice or receipt data. Copy numbers exactly as printed; do not fix
arithmetic that does not add up. Use null for fields that are not on the document.
One line per printed item: add-ons or modifiers printed under an item are separate lines.`;

export type Attempt = { model: Model; invoice: Invoice | null; issues: Issue[]; costUsd: number; ms: number };

export async function extract(data: string, mediaType: MediaType, model: Model): Promise<Attempt> {
  const doc =
    mediaType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: mediaType, data } } as const)
      : ({ type: "image", source: { type: "base64", media_type: mediaType, data } } as const);

  const start = Date.now();
  const res = await client.beta.messages.parse({
    model,
    max_tokens: 16000,
    output_config: { effort: "low", format: betaZodOutputFormat(InvoiceSchema) },
    // Server-side refusal fallback exists only for Opus.
    ...(model === "claude-opus-5-5" && { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }),
    messages: [{ role: "user", content: [doc, { type: "text", text: PROMPT }] }],
  });

  const [inPrice, outPrice] = PRICES[model];
  const costUsd = (res.usage.input_tokens * inPrice + res.usage.output_tokens * outPrice) / 1e6;
  const invoice = res.stop_reason === "refusal" ? null : res.parsed_output;
  const issues = invoice ? validateInvoice(invoice) : [{ field: "*", message: `no output (${res.stop_reason})` }];
  return { model, invoice, issues, costUsd, ms: Date.now() - start };
}

// Cheap model first; escalate only when deterministic checks fail.
export async function extractRouted(data: string, mediaType: MediaType) {
  const attempts = [await extract(data, mediaType, "claude-haiku-5-5")];
  if (attempts[0].issues.length) attempts.push(await extract(data, mediaType, "claude-opus-5-5"));
  const last = attempts.at(-1)!;
  return {
    status: last.issues.length ? "needs_review" : "ok",
    invoice: last.invoice,
    issues: last.issues,
    attempts: attempts.map(({ model, issues, costUsd, ms }) => ({ model, issues, costUsd, ms })),
    costUsd: attempts.reduce((s, a) => s + a.costUsd, 0),
  };
}
