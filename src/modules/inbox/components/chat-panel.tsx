"use client";

import { ArrowLeft, Bot, Check, CheckCheck, Clock, FlaskConical, Hand, Loader2, Lock, SendHorizontal, TriangleAlert, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ConversationMode, MessageSender, MessageStatus } from "@/server/db/database.types";

import { markConversationReadAction, sendMessageAction, setConversationClosedAction, setConversationModeAction } from "../actions";

export type ChatMessage = {
  id: string;
  direction: "inbound" | "outbound";
  sender: MessageSender;
  body: string | null;
  status: MessageStatus;
  time: string;
  dayLabel: string;
  /** First message of its day: the server precomputes it so render stays pure. */
  showDay: boolean;
  authorName: string | null;
};

type Props = {
  conversationId: string;
  customerName: string;
  channelLabel: string;
  isSimulation: boolean;
  mode: ConversationMode;
  closed: boolean;
  unread: number;
  messages: ChatMessage[];
  backHref: string;
};

const STATUS_ICON: Partial<Record<MessageStatus, { icon: typeof Check; label: string }>> = {
  queued: { icon: Clock, label: "Na fila de envio" },
  sending: { icon: Clock, label: "Enviando" },
  sent: { icon: Check, label: "Enviada" },
  delivered: { icon: CheckCheck, label: "Entregue" },
  read: { icon: CheckCheck, label: "Lida" },
  failed: { icon: TriangleAlert, label: "Falhou" },
};

const SENDER_LABEL: Record<MessageSender, string> = { customer: "Cliente", ai: "Agente IA", human: "Consultor", system: "Sistema" };

export function ChatPanel(props: Props) {
  const { conversationId, messages } = props;
  const [text, setText] = useState("");
  const [asCustomer, setAsCustomer] = useState(props.isSimulation && messages.length === 0);
  const [sending, startSend] = useTransition();
  const [busy, startBusy] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages.length]);

  useEffect(() => {
    if (props.unread > 0) void markConversationReadAction(conversationId);
  }, [conversationId, props.unread]);

  function send() {
    const value = text.trim();
    if (!value) return;
    startSend(async () => {
      const result = await sendMessageAction(conversationId, value, asCustomer);
      if (result.status === "error") toast.error(result.message);
      else setText("");
    });
  }

  function run(fn: () => Promise<{ status: string; message?: string }>) {
    startBusy(async () => {
      const result = await fn();
      if (result.status === "error") toast.error(result.message);
      else if (result.message) toast.success(result.message);
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b px-3 py-2.5">
        <Link href={props.backHref} className="rounded-md p-1 text-muted-foreground hover:bg-muted lg:hidden" aria-label="Voltar para conversas">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{props.customerName}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {props.isSimulation ? <FlaskConical className="size-3 text-warm-foreground" /> : null}
            {props.channelLabel} · {props.mode === "ai" ? "atendido pela IA" : "atendimento humano"}
          </p>
        </div>
        {props.mode === "ai" ? (
          <Button size="sm" disabled={busy} onClick={() => run(() => setConversationModeAction(conversationId, "human"))}>
            <Hand /> Assumir atendimento
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger render={<span tabIndex={0} />}>
              <Button size="sm" variant="outline" disabled>
                <Bot /> Devolver para IA
              </Button>
            </TooltipTrigger>
            <TooltipContent>O agente de IA chega na fase 13.</TooltipContent>
          </Tooltip>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => setConversationClosedAction(conversationId, !props.closed))}>
          {props.closed ? "Reabrir" : "Encerrar"}
        </Button>
      </header>

      {props.isSimulation ? (
        <p className="flex items-center gap-2 border-b bg-warm/10 px-3 py-1.5 text-xs text-warm-foreground">
          <FlaskConical className="size-3.5 shrink-0" />
          Conversa de teste: nada é enviado ao cliente. Use “Simular cliente” para escrever como se fosse ele.
        </p>
      ) : null}

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto bg-muted/30 px-3 py-4 md:px-6">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
        ) : (
          <ol className="grid gap-2">
            {messages.map((m) => {
              const outbound = m.direction === "outbound";
              const status = outbound ? STATUS_ICON[m.status] : undefined;
              return (
                <li key={m.id} className="grid gap-2">
                  {m.showDay ? (
                    <span className="mx-auto rounded-full bg-background px-2.5 py-0.5 text-[11px] text-muted-foreground shadow-xs">{m.dayLabel}</span>
                  ) : null}
                  <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-xs md:max-w-[70%]",
                        outbound ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-card",
                        m.sender === "system" && "bg-muted text-muted-foreground",
                      )}
                    >
                      {outbound ? (
                        <p className="mb-0.5 flex items-center gap-1 text-[11px] opacity-75">
                          {m.sender === "ai" ? <Bot className="size-3" /> : <UserRound className="size-3" />}
                          {m.authorName ?? SENDER_LABEL[m.sender]}
                        </p>
                      ) : null}
                      <p className="break-words whitespace-pre-wrap">{m.body}</p>
                      <p className={cn("mt-1 flex items-center justify-end gap-1 text-[10px]", outbound ? "opacity-75" : "text-muted-foreground")}>
                        {m.time}
                        {status ? <status.icon className="size-3" aria-label={status.label} /> : null}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <footer className="border-t p-3">
        {props.closed ? (
          <p className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
            <Lock className="size-4" /> Conversa encerrada. Reabra para responder.
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="grid gap-2"
          >
            {props.isSimulation ? (
              <div className="inline-flex w-fit rounded-lg bg-muted p-0.5 text-xs">
                {[
                  { value: false, label: "Responder como consultor" },
                  { value: true, label: "Simular cliente" },
                ].map((o) => (
                  <button
                    key={String(o.value)}
                    type="button"
                    onClick={() => setAsCustomer(o.value)}
                    className={cn("rounded-md px-2.5 py-1 text-muted-foreground transition-colors", asCustomer === o.value && "bg-background text-foreground shadow-sm")}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={2}
                maxLength={4096}
                placeholder={asCustomer ? "Escreva como se fosse o cliente…" : "Escreva sua resposta… (Enter envia, Shift+Enter quebra linha)"}
                aria-label="Mensagem"
                className={cn(
                  "min-h-10 flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
                  asCustomer && "border-warm/60",
                )}
              />
              <Button type="submit" size="icon-lg" disabled={sending || !text.trim()} aria-label="Enviar">
                {sending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
              </Button>
            </div>
          </form>
        )}
      </footer>
    </div>
  );
}
