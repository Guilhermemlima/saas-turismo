import { KanbanSquare, Plus, Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";

import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { formatTripDates } from "@/lib/dates";
import { formatRelative } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { KanbanBoard, type BoardCard } from "@/modules/deals/components/kanban-board";
import { getDefaultPipeline, getTemperatureThresholds, listBoardDeals, listStages } from "@/modules/deals/repository";
import { scoreLead, TEMPERATURE_LABELS, temperatureFor } from "@/modules/deals/scoring";
import { can, requireTenant } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

export const metadata: Metadata = { title: "CRM" };

const querySchema = z.object({
  mine: z.preprocess((v) => v === "1", z.boolean()),
  q: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string().trim().max(100).catch("")),
});

export default async function CrmPage(props: PageProps<"/crm">) {
  const ctx = await requireTenant();
  if (!can(ctx, "deals.read")) redirect("/dashboard");

  const filters = querySchema.parse(await props.searchParams);
  const db = await createSupabaseServerClient();
  const pipeline = await getDefaultPipeline(db, ctx);
  if (!pipeline) {
    return (
      <PageContainer>
        <PageHeader title="CRM" />
        <EmptyState icon={KanbanSquare} title="Pipeline não encontrado" description="Sua agência ainda não tem um pipeline configurado. Fale com o suporte." />
      </PageContainer>
    );
  }

  const [stages, { deals, truncated }, thresholds] = await Promise.all([
    listStages(db, ctx, pipeline.id),
    listBoardDeals(db, ctx, pipeline.id, filters),
    getTemperatureThresholds(db, ctx),
  ]);

  // Cards are prepared on the server: the client only receives display-ready, non-sensitive fields.
  const cards: BoardCard[] = deals.map((deal) => {
    const request = deal.request?.[0] ?? null;
    const score = scoreLead(request).total;
    const temperature = temperatureFor(score, thresholds);
    const total = request ? (request.adults ?? 0) + request.children + request.infants : 0;
    return {
      id: deal.id,
      stageId: deal.stage_id,
      customerName: deal.customer?.full_name ?? deal.title,
      destination: request?.destination ?? null,
      dates: request ? formatTripDates(request.departure_date, request.return_date, request.travel_month) : null,
      passengers: total > 0 ? `${total} passageiro${total === 1 ? "" : "s"}` : null,
      budget: request?.budget_cents != null ? `Orçamento ${formatMoney(request.budget_cents, request.budget_currency)}` : null,
      consultant: deal.assigned?.display_name || deal.assigned?.profile?.full_name || null,
      lastContact: deal.customer?.last_contact_at ? formatRelative(deal.customer.last_contact_at) : null,
      score,
      temperature,
      temperatureLabel: TEMPERATURE_LABELS[temperature],
      href: request ? `/requests/${request.id}` : null,
    };
  });

  const tab = (mine: boolean) => {
    const params = new URLSearchParams();
    if (mine) params.set("mine", "1");
    if (filters.q) params.set("q", filters.q);
    const qs = params.toString();
    return qs ? `/crm?${qs}` : "/crm";
  };

  return (
    <PageContainer className="max-w-none">
      <PageHeader
        title="CRM"
        description={`${pipeline.name} · ${cards.length} negócio${cards.length === 1 ? "" : "s"}`}
        actions={
          <>
            {can(ctx, "settings.manage") ? (
              <Link href="/settings/pipeline" className={buttonVariants({ variant: "outline" })}>
                <Settings2 /> Etapas
              </Link>
            ) : null}
            {can(ctx, "requests.write") ? (
              <Link href="/requests/new" className={buttonVariants()}>
                <Plus /> Nova solicitação
              </Link>
            ) : null}
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav className="inline-flex w-fit rounded-lg bg-muted p-0.5 text-sm" aria-label="Filtrar negócios">
          {[
            { mine: false, label: "Todos" },
            { mine: true, label: "Meus negócios" },
          ].map((t) => (
            <Link
              key={t.label}
              href={tab(t.mine)}
              aria-current={filters.mine === t.mine ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1 text-muted-foreground transition-colors",
                filters.mine === t.mine && "bg-background text-foreground shadow-sm",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <form action="/crm" className="sm:w-80">
          {filters.mine ? <input type="hidden" name="mine" value="1" /> : null}
          <input
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Buscar por destino ou cliente"
            aria-label="Buscar negócios"
            maxLength={100}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </form>
      </div>

      {truncated ? (
        <p className="rounded-lg bg-warm/15 px-3 py-2 text-sm text-warm-foreground">
          Mostrando os 500 negócios mais recentes. Use a busca para encontrar os demais.
        </p>
      ) : null}

      {cards.length === 0 && !filters.q && !filters.mine ? (
        <EmptyState
          icon={KanbanSquare}
          title="Seu pipeline está vazio"
          description="Cada solicitação de viagem vira um negócio aqui. Crie a primeira para começar."
          action={
            can(ctx, "requests.write") ? (
              <Link href="/requests/new" className={buttonVariants({ variant: "outline" })}>
                <Plus /> Nova solicitação
              </Link>
            ) : null
          }
        />
      ) : (
        <KanbanBoard
          key={`${filters.mine}-${filters.q}`}
          stages={stages.map((s) => ({ id: s.id, name: s.name, color: s.color, isWon: s.is_won, isLost: s.is_lost }))}
          initialCards={cards}
          canMove={can(ctx, "deals.write")}
        />
      )}
    </PageContainer>
  );
}
