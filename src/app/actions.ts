"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { processUpload } from "@/lib/documents";
import type { Invoice } from "@/lib/schema";
import { createClient } from "@/lib/supabase/server";
import { validateInvoice } from "@/lib/validate";

export async function upload(_: string | undefined, form: FormData) {
  const result = await processUpload(form.get("file"));
  if ("error" in result) return result.error;
  redirect(`/documents/${result.id}`);
}

// Only text fields: a File sent under a text field's name must not become "[object File]".
const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};
const num = (form: FormData, key: string) => Number(text(form, key).replace(",", ".")) || 0;
const orNull = (s: string) => s || null;

// The reviewer's version is the ground truth; checks are re-run only to show what still doesn't add up.
export async function saveCorrection(id: string, form: FormData) {
  const lines = [];
  for (let i = 0; form.has(`lines.${i}.description`); i++) {
    const description = text(form, `lines.${i}.description`);
    if (!description) continue; // an emptied description removes the line
    lines.push({
      description,
      quantity: num(form, `lines.${i}.quantity`),
      unit_price: num(form, `lines.${i}.unit_price`),
      discount_percent: text(form, `lines.${i}.discount_percent`) ? num(form, `lines.${i}.discount_percent`) : null,
      amount: num(form, `lines.${i}.amount`),
    });
  }
  const correction: Invoice = {
    supplier_name: text(form, "supplier_name"),
    supplier_tax_id: orNull(text(form, "supplier_tax_id")),
    invoice_number: orNull(text(form, "invoice_number")),
    issue_date: orNull(text(form, "issue_date")),
    currency: text(form, "currency").toUpperCase(),
    lines,
    subtotal: num(form, "subtotal"),
    discount_amount: num(form, "discount_amount"),
    tax_amount: num(form, "tax_amount"),
    prices_include_tax: form.get("prices_include_tax") === "on",
    rounding: num(form, "rounding"),
    total: num(form, "total"),
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("documents")
    .update({ correction, issues: validateInvoice(correction), status: "corrected", corrected_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/documents/${id}`);
  revalidatePath("/");
}
