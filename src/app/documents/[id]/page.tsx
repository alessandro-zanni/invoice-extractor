import Link from "next/link";
import { notFound } from "next/navigation";
import { saveCorrection } from "@/app/actions";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Invoice } from "@/lib/schema";
import { createClient } from "@/lib/supabase/server";
import type { Issue } from "@/lib/validate";

const EMPTY_LINE = { description: "", quantity: 1, unit_price: 0, discount_percent: null, amount: 0 };

// Per-user data behind login: nothing to prerender, render on request.
export const instant = false;

export default async function DocumentPage({ params }: PageProps<"/documents/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("*").eq("id", id).maybeSingle();
  if (!doc) notFound();

  const { data: signed } = await supabase.storage.from("documents").createSignedUrl(doc.file_path, 3600);
  const inv = (doc.correction ?? doc.extraction) as Invoice | null;
  const issues = doc.issues as Issue[];
  const flagged = new Set(issues.map((i) => i.field));
  const attempts = doc.attempts as { model: string; costUsd: number; ms: number }[];

  // One input per field; red border when a check failed on it.
  const field = (name: keyof Invoice, label: string, value: string | number | null | undefined, type = "text") => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} step="any" defaultValue={value ?? ""} aria-invalid={flagged.has(name)} className={cn(flagged.has(name) && "border-destructive")} />
    </div>
  );

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/" className="text-sm underline underline-offset-4">← All documents</Link>
        <StatusBadge value={doc.status} />
        {doc.status === "needs_review" && <StatusBadge value={doc.review_reason} />}
        <span className="text-sm text-muted-foreground">
          {attempts.map((a) => `${a.model.replace("claude-", "")} ${(a.ms / 1000).toFixed(1)} s`).join(" → ")} · ${Number(doc.cost_usd).toFixed(4)}
        </span>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="min-h-[60svh] overflow-hidden rounded-lg border bg-muted">
          {signed?.signedUrl &&
            (doc.media_type === "application/pdf" ? (
              <iframe src={signed.signedUrl} title="Document" className="h-full min-h-[60svh] w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL from private storage
              <img src={signed.signedUrl} alt="Uploaded document" className="w-full object-contain" />
            ))}
        </section>

        <form action={saveCorrection.bind(null, doc.id)} className="flex flex-col gap-4">
          {issues.length > 0 && (
            <ul className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
              {issues.map((i) => (
                <li key={i.field + i.message}>{i.field}: {i.message}</li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {field("supplier_name", "Supplier", inv?.supplier_name)}
            {field("supplier_tax_id", "Tax id", inv?.supplier_tax_id)}
            {field("invoice_number", "Invoice number", inv?.invoice_number)}
            {field("issue_date", "Issue date", inv?.issue_date, "date")}
            {field("currency", "Currency", inv?.currency)}
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Lines (clear a description to remove a line)</legend>
            <div className="hidden grid-cols-[1fr_5rem_6rem_4rem_6rem] gap-2 text-xs text-muted-foreground sm:grid">
              <span>Description</span><span>Qty</span><span>Unit price</span><span>Disc. %</span><span>Amount</span>
            </div>
            {[...(inv?.lines ?? []), EMPTY_LINE].map((l, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_5rem_6rem_4rem_6rem]">
                <Input name={`lines.${i}.description`} defaultValue={l.description} placeholder="New line" aria-label="Description" className="col-span-2 sm:col-span-1" />
                <Input name={`lines.${i}.quantity`} type="number" step="any" defaultValue={l.quantity} aria-label="Quantity" />
                <Input name={`lines.${i}.unit_price`} type="number" step="any" defaultValue={l.unit_price} aria-label="Unit price" />
                <Input name={`lines.${i}.discount_percent`} type="number" step="any" defaultValue={l.discount_percent ?? ""} aria-label="Discount percent" />
                <Input
                  name={`lines.${i}.amount`}
                  type="number"
                  step="any"
                  defaultValue={l.amount}
                  aria-label="Amount"
                  aria-invalid={flagged.has(`lines.${i}.amount`)}
                  className={cn(flagged.has(`lines.${i}.amount`) && "border-destructive")}
                />
              </div>
            ))}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-3">
            {field("subtotal", "Subtotal", inv?.subtotal, "number")}
            {field("discount_amount", "Document discount", inv?.discount_amount, "number")}
            {field("tax_amount", "Tax", inv?.tax_amount, "number")}
            {field("rounding", "Rounding", inv?.rounding, "number")}
            {field("total", "Total", inv?.total, "number")}
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="prices_include_tax" defaultChecked={inv?.prices_include_tax} className="size-4" />
              Prices include tax
            </label>
          </div>

          <Button type="submit" className="self-start">Save correction</Button>
        </form>
      </div>
    </main>
  );
}
