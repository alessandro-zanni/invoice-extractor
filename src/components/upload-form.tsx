"use client";

import { useActionState } from "react";
import { upload } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function UploadForm() {
  const [error, action, pending] = useActionState(upload, undefined);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required disabled={pending} className="sm:max-w-sm" />
      <Button type="submit" disabled={pending}>
        {pending ? "Extracting…" : "Upload and extract"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
