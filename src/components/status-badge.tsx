import { Badge } from "@/components/ui/badge";

const LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ok: { label: "OK", variant: "secondary" },
  needs_review: { label: "Needs review", variant: "destructive" },
  corrected: { label: "Corrected", variant: "outline" },
  document_inconsistent: { label: "Document doesn't add up", variant: "outline" },
  uncertain_extraction: { label: "Uncertain reading", variant: "outline" },
};

export function StatusBadge({ value }: { value: string | null }) {
  if (!value) return null;
  const { label, variant } = LABELS[value] ?? { label: value, variant: "outline" };
  return <Badge variant={variant}>{label}</Badge>;
}
