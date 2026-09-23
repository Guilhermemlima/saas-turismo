import { ExternalLink, Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { formatTripDates } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { scoreLead, TEMPERATURE_LABELS, temperatureFor, type TemperatureThresholds } from "@/modules/deals/scoring";
import { RequestStatusBadge, StageBadge } from "@/modules/travel-requests/components/badges";
import { SERVICES } from "@/modules/travel-requests/labels";
import type { TravelRequestWithRelations } from "@/modules/travel-requests/repository";

import type { ConversationDetail } from "../repository";
import { AssignSelect } from "./assign-select";

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-2 border-b p-4 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium break-words">{value ?? "—"}</span>
    </div>
  );
}

export function CustomerPanel({
  conversation,
  request,
  thresholds,
  members,
  canWriteRequests,
}: {
  conversation: ConversationDetail;
  request: TravelRequestWithRelations | null;
  thresholds: TemperatureThresholds;
  members: { id: string; name: string }[];
  canWriteRequests: boolean;
}) {
  const customer = conversation.customer;
  const score = scoreLead(request).total;
  const temperature = temperatureFor(score, thresholds);
  const passengers = request ? (request.adults ?? 0) + request.children + request.infants : 0;
  const services = request ? SERVICES.filter((s) => request[s.key]).map((s) => s.label) : [];

  return (
    <div className="min-h-0 overflow-y-auto">
      <Section
        title="Cliente"
        action={
          customer ? (
            <Link href={`/customers/${customer.id}`} className="text-xs text-primary hover:underline">
              Perfil <ExternalLink className="inline size-3" />
            </Link>
          ) : null
        }
      >
        <Row label="Nome" value={customer?.full_name} />
        <Row label="Telefone" value={formatPhone(customer?.phone_e164) || null} />
        <Row label="E-mail" value={customer?.email} />
        <Row label="Cidade" value={customer?.city ? `${customer.city}${customer.state ? ` · ${customer.state}` : ""}` : null} />
      </Section>

      <Section
        title="Viagem"
        action={
          request ? (
            <Link href={`/requests/${request.id}`} className="text-xs text-primary hover:underline">
              Abrir <ExternalLink className="inline size-3" />
            </Link>
          ) : null
        }
      >
        {request ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              <RequestStatusBadge status={request.status} />
            </div>
            <Row label="Origem" value={request.origin_city} />
            <Row label="Destino" value={request.destination} />
            <Row label="Datas" value={formatTripDates(request.departure_date, request.return_date, request.travel_month)} />
            <Row
              label="Passageiros"
              value={passengers ? `${passengers}${request.children_ages.length ? ` (crianças: ${request.children_ages.join(", ")})` : ""}` : null}
            />
            <Row label="Orçamento" value={request.budget_cents !== null ? formatMoney(request.budget_cents, request.budget_currency) : null} />
            <Row label="Hotel" value={request.hotel_category ? `${request.hotel_category} estrelas` : request.needs_hotel ? "Sim" : null} />
            <Row label="Serviços" value={services.length ? services.join(", ") : null} />
          </>
        ) : (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">Nenhuma solicitação aberta para este cliente.</p>
            {canWriteRequests && customer ? (
              <Link href={`/requests/new?customer=${customer.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Plus /> Criar solicitação
              </Link>
            ) : null}
          </div>
        )}
      </Section>

      <Section title="Comercial">
        <Row label="Etapa" value={request?.deal?.stage ? <StageBadge stage={request.deal.stage} /> : null} />
        <Row label="Lead score" value={request ? `${score}/100 · ${TEMPERATURE_LABELS[temperature]}` : null} />
        <div className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">Responsável pela conversa</span>
          <AssignSelect conversationId={conversation.id} value={conversation.assigned_member_id} members={members} />
        </div>
        <Row label="Próximo follow-up" value={<span className="font-normal text-muted-foreground">Fase 19</span>} />
      </Section>
    </div>
  );
}
