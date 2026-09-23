import "server-only";

import { FlaskConical, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";

import { RealtimeRefresh } from "@/components/shared/realtime-refresh";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getTemperatureThresholds } from "@/modules/deals/repository";
import { listActiveMembers } from "@/modules/members/repository";
import { listCustomerTravelRequests } from "@/modules/travel-requests/repository";
import { can, requireTenant } from "@/server/auth/tenant";
import { createSupabaseServerClient } from "@/server/db/server-client";

import { ChatPanel, type ChatMessage } from "./components/chat-panel";
import { ConversationList } from "./components/conversation-list";
import { CustomerPanel } from "./components/customer-panel";
import { getConversation, listConversations, listMessages, type InboxFilter } from "./repository";

const querySchema = z.object({
  filter: z.enum(["all", "mine", "unread"]).catch("all"),
  q: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string().trim().max(100).catch("")),
});

export async function InboxView({ conversationId, searchParams }: { conversationId?: string; searchParams: Record<string, unknown> }) {
  const ctx = await requireTenant();
  if (!can(ctx, "conversations.read")) redirect("/dashboard");

  const { filter, q } = querySchema.parse(searchParams);
  const db = await createSupabaseServerClient();
  const validId = conversationId && z.uuid().safeParse(conversationId).success ? conversationId : undefined;

  const [conversations, conversation, messages, settings] = await Promise.all([
    listConversations(db, ctx, { filter: filter as InboxFilter, q }),
    validId ? getConversation(db, ctx, validId) : Promise.resolve(null),
    validId ? listMessages(db, ctx, validId) : Promise.resolve([]),
    db.from("agency_settings").select("timezone").eq("agency_id", ctx.agencyId).maybeSingle(),
  ]);
  if (conversationId && !conversation) redirect("/inbox");

  const timeZone = settings.data?.timezone ?? "America/Sao_Paulo";
  const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone });
  const dayFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", timeZone });

  const dayLabels = messages.map((m) => dayFmt.format(new Date(m.created_at)));
  const chatMessages: ChatMessage[] = messages.map((m, i) => {
    const date = new Date(m.created_at);
    const dayLabel = dayLabels[i];
    const showDay = i === 0 || dayLabel !== dayLabels[i - 1];
    return {
      id: m.id,
      direction: m.direction,
      sender: m.sender,
      body: m.body,
      status: m.status,
      time: timeFmt.format(date),
      dayLabel,
      showDay,
      authorName: m.author?.full_name ?? null,
    };
  });

  const [requests, members, thresholds] = conversation?.customer
    ? await Promise.all([
        can(ctx, "deals.read") ? listCustomerTravelRequests(db, ctx, conversation.customer.id) : Promise.resolve([]),
        listActiveMembers(db, ctx),
        getTemperatureThresholds(db, ctx),
      ])
    : [[], [], undefined];
  const openRequest = requests.find((r) => r.status === "collecting" || r.status === "complete") ?? null;

  const qs = new URLSearchParams();
  if (filter !== "all") qs.set("filter", filter);
  if (q) qs.set("q", q);
  const listHref = `/inbox${qs.toString() ? `?${qs}` : ""}`;

  return (
    <div className="grid h-[calc(100svh-3.5rem)] min-h-0 grid-cols-1 lg:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_320px]">
      <RealtimeRefresh
        channel={`inbox-${ctx.agencyId}-${validId ?? "list"}`}
        subscriptions={[
          { table: "conversations", filter: `agency_id=eq.${ctx.agencyId}` },
          ...(validId ? [{ table: "messages" as const, filter: `conversation_id=eq.${validId}` }] : []),
        ]}
      />

      <aside className={cn("min-h-0 border-r", conversation ? "hidden lg:block" : "block")}>
        <ConversationList items={conversations} selectedId={validId} filter={filter as InboxFilter} q={q} />
      </aside>

      {conversation ? (
        <>
          <section className="min-h-0">
            <ChatPanel
              key={conversation.id}
              conversationId={conversation.id}
              customerName={conversation.customer?.full_name ?? "Cliente"}
              channelLabel={conversation.channel?.type === "whatsapp" ? "WhatsApp" : (conversation.channel?.display_name ?? "Canal")}
              isSimulation={conversation.is_simulation}
              mode={conversation.mode}
              closed={conversation.status === "closed"}
              unread={conversation.unread_count}
              messages={chatMessages}
              backHref={listHref}
            />
          </section>
          <aside className="hidden min-h-0 border-l xl:block">
            <CustomerPanel
              conversation={conversation}
              request={openRequest}
              thresholds={thresholds ?? { warm: 31, hot: 61 }}
              members={members}
              canWriteRequests={can(ctx, "requests.write")}
            />
          </aside>
        </>
      ) : (
        <section className="hidden min-h-0 flex-col items-center justify-center gap-3 p-8 text-center lg:flex">
          <div className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <MessagesSquare className="size-6" />
          </div>
          <div className="max-w-sm space-y-1">
            <h2 className="font-medium">Selecione uma conversa</h2>
            <p className="text-sm text-muted-foreground">
              As conversas do WhatsApp chegam aqui quando o número for conectado (fase 15). Até lá, abra um cliente e use
              “Conversa de teste” para simular um atendimento.
            </p>
          </div>
          <Link href="/customers" className={buttonVariants({ variant: "outline" })}>
            <FlaskConical /> Escolher cliente para simular
          </Link>
        </section>
      )}
    </div>
  );
}
