import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UploadForm } from "@/components/upload-form";
import type { Invoice } from "@/lib/schema";
import { createClient } from "@/lib/supabase/server";

// Per-user data behind login: nothing to prerender, render on request.
export const instant = false;

export default async function Home() {
  const supabase = await createClient();
  const { data: docs } = await supabase
    .from("documents")
    .select("id, created_at, status, review_reason, extraction, correction, cost_usd")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Invoice Extractor</h1>
        <form action={signOut}>
          <Button variant="ghost" size="sm" type="submit">Sign out</Button>
        </form>
      </header>
      <UploadForm />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Uploaded</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs?.map((d) => {
              const inv = (d.correction ?? d.extraction) as Invoice | null;
              return (
                <TableRow key={d.id}>
                  <TableCell>
                    <Link href={`/documents/${d.id}`} className="underline underline-offset-4">
                      {new Date(d.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                    </Link>
                  </TableCell>
                  <TableCell>{inv?.supplier_name || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{inv ? `${inv.total.toFixed(2)} ${inv.currency}` : "—"}</TableCell>
                  <TableCell className="flex flex-wrap gap-1">
                    <StatusBadge value={d.status} />
                    {d.status === "needs_review" && <StatusBadge value={d.review_reason} />}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">${Number(d.cost_usd).toFixed(4)}</TableCell>
                </TableRow>
              );
            })}
            {!docs?.length && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">No documents yet. Upload a PDF or a photo of an invoice.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
