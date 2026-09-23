import { cn } from "@/lib/utils";
import type { TravelRequestStatus } from "@/server/db/database.types";

import { REQUEST_STATUS_LABELS, STAGE_COLOR_CLASSES } from "../labels";

export function StageBadge({ stage }: { stage: { name: string; color: string } | null | undefined }) {
  if (!stage) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap",
        STAGE_COLOR_CLASSES[stage.color] ?? STAGE_COLOR_CLASSES.slate,
      )}
    >
      {stage.name}
    </span>
  );
}

const STATUS_CLASSES: Record<TravelRequestStatus, string> = {
  collecting: "border-warm/60 text-warm-foreground",
  complete: "border-success/50 text-success",
  archived: "border-border text-muted-foreground",
  cancelled: "border-border text-muted-foreground line-through",
};

export function RequestStatusBadge({ status }: { status: TravelRequestStatus }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-full border px-2 text-xs font-medium whitespace-nowrap", STATUS_CLASSES[status])}>
      {REQUEST_STATUS_LABELS[status]}
    </span>
  );
}
