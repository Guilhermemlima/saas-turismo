import { CircleDashed } from "lucide-react";

import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NAV_ITEMS } from "@/config/navigation";

/**
 * Honest placeholder for modules scheduled in later phases: shows what the module will do
 * and when, without fake data.
 */
export function ModuleRoadmap({ href, features }: { href: string; features: string[] }) {
  const item = NAV_ITEMS.find((i) => i.href === href);
  if (!item) throw new Error(`Unknown module ${href}`);

  return (
    <PageContainer>
      <PageHeader title={item.title} description={item.description} />
      <Card className="max-w-3xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <item.icon className="size-5" />
            </div>
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                Módulo em desenvolvimento
                {item.phase ? <Badge variant="secondary">Fase {item.phase}</Badge> : null}
              </CardTitle>
              <CardDescription>A estrutura desta área já existe; a funcionalidade entra na fase indicada do roadmap.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CircleDashed className="mt-0.5 size-4 shrink-0 text-primary/70" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
