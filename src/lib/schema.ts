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
  subtotal: z.number().describe("Total before tax"),
  tax_amount: z.number(),
  total: z.number().describe("Total including tax"),
});

export type Invoice = z.infer<typeof InvoiceSchema>;
