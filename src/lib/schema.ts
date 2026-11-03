import { z } from "zod";

export const InvoiceSchema = z.object({
  supplier_name: z.string(),
  supplier_tax_id: z.string().nullable().describe("VAT/tax id as printed, e.g. IT01234567890 or B12345678"),
  invoice_number: z.string().nullable(),
  issue_date: z.string().nullable().describe("ISO date YYYY-MM-DD"),
  currency: z.string().describe("ISO 4217 code, e.g. EUR"),
  lines: z.array(
    z.object({
      description: z.string(),
      quantity: z.number(),
      unit_price: z.number(),
      discount_percent: z.number().nullable().describe("Line discount in percent, null if none"),
      amount: z.number().describe("Line total before tax, after any line discount"),
    }),
  ),
  subtotal: z.number().describe("Sum of the lines, before document discount and tax"),
  discount_amount: z.number().describe("Document-level discount as a positive number, 0 if none"),
  tax_amount: z.number(),
  prices_include_tax: z.boolean().describe("True when the printed prices already include tax (common on receipts)"),
  rounding: z.number().describe("Rounding adjustment as printed (positive or negative), 0 if none"),
  total: z.number().describe("Amount due"),
});

export type Invoice = z.infer<typeof InvoiceSchema>;
