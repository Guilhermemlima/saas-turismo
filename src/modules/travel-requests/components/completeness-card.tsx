import { CircleCheck, CircleDashed } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { completionPercent, isRequestComplete, travelRequestChecklist, type CompletenessFields } from "../completeness";

export function CompletenessCard({ request }: { request: CompletenessFields }) {
  const items = travelRequestChecklist(request);
  const percent = completionPercent(request);
  const complete = isRequestComplete(request);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          O que falta coletar
          <span className="text-sm font-medium tabular-nums text-muted-foreground">{percent}%</span>
        </CardTitle>
        <CardDescription>
          {complete
            ? "Os dados essenciais estão completos: a solicitação já pode ser cotada."
            : "Complete os itens essenciais para liberar a cotação."}
        </CardDescription>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full transition-all", complete ? "bg-success" : "bg-warm")} style={{ width: `${percent}%` }} />
        </div>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 text-sm">
          {items.map((item) => (
            <li key={item.key} className="flex items-start gap-2">
              {item.done ? (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
              ) : (
                <CircleDashed className={cn("mt-0.5 size-4 shrink-0", item.essential ? "text-warm-foreground" : "text-muted-foreground")} />
              )}
              <span className={cn(item.done && "text-muted-foreground")}>
                {item.label}
                {!item.done && item.essential ? <span className="ml-1.5 text-xs text-warm-foreground">essencial</span> : null}
                {!item.done && item.hint ? <span className="block text-xs text-muted-foreground">{item.hint}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
