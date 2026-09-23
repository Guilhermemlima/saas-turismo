import { cn } from "@/lib/utils";
import type { QuoteStatus } from "@/server/db/database.types";

const STYLES: Record<QuoteStatus, { label: string; className: string }> = {
  draft: { label: "Em montagem", className: "border-warm/60 text-warm-foreground" },
  ready: { label: "Pronta", className: "border-success/50 text-success" },
  archived: { label: "Arquivada", className: "border-border text-muted-foreground" },
};

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  const style = STYLES[status];
  return (
    <span className={cn("inline-flex h-5 items-center rounded-full border px-2 text-xs font-medium whitespace-nowrap", style.className)}>
      {style.label}
    </span>
  );
}
