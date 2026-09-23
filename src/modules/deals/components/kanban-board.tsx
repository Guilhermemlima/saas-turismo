"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CalendarRange, EllipsisVertical, Flame, MapPin, Snowflake, Sun, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { moveDealStageAction } from "../actions";
import type { Temperature } from "../scoring";

export type BoardStage = { id: string; name: string; color: string; isWon: boolean; isLost: boolean };

export type BoardCard = {
  id: string;
  stageId: string;
  customerName: string;
  destination: string | null;
  dates: string | null;
  passengers: string | null;
  budget: string | null;
  consultant: string | null;
  lastContact: string | null;
  score: number;
  temperature: Temperature;
  temperatureLabel: string;
  href: string | null;
};

const DOT_CLASSES: Record<string, string> = {
  slate: "bg-slate-400",
  sky: "bg-sky-500",
  cyan: "bg-cyan-500",
  teal: "bg-teal-500",
  emerald: "bg-emerald-500",
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  lime: "bg-lime-500",
  green: "bg-green-500",
  pink: "bg-pink-500",
  rose: "bg-rose-500",
};

const TEMPERATURE_STYLE: Record<Temperature, { icon: typeof Flame; className: string }> = {
  hot: { icon: Flame, className: "bg-rose-500/12 text-rose-700 dark:text-rose-300" },
  warm: { icon: Sun, className: "bg-amber-500/15 text-amber-800 dark:text-amber-300" },
  cold: { icon: Snowflake, className: "bg-sky-500/12 text-sky-700 dark:text-sky-300" },
};

export function KanbanBoard({ stages, initialCards, canMove }: { stages: BoardStage[]; initialCards: BoardCard[]; canMove: boolean }) {
  const [cards, setCards] = useState(initialCards);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const byStage = useMemo(() => {
    const map = new Map<string, BoardCard[]>(stages.map((s) => [s.id, []]));
    for (const card of cards) map.get(card.stageId)?.push(card);
    return map;
  }, [cards, stages]);

  const activeCard = activeId ? cards.find((c) => c.id === activeId) : undefined;

  function move(cardId: string, stageId: string) {
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.stageId === stageId) return;
    const previous = card.stageId;
    setCards((list) => list.map((c) => (c.id === cardId ? { ...c, stageId } : c)));
    startTransition(async () => {
      const result = await moveDealStageAction(cardId, stageId);
      if (result.status === "error") {
        setCards((list) => list.map((c) => (c.id === cardId ? { ...c, stageId: previous } : c)));
        toast.error(result.message ?? "Não foi possível mover.");
      } else if (result.message) {
        toast.success(result.message);
      }
    });
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (event.over) move(String(event.active.id), String(event.over.id));
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
        {stages.map((stage) => (
          <Column key={stage.id} stage={stage} cards={byStage.get(stage.id) ?? []}>
            {(byStage.get(stage.id) ?? []).map((card) => (
              <DraggableCard key={card.id} card={card} stages={stages} canMove={canMove} onMove={move} />
            ))}
          </Column>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>{activeCard ? <CardBody card={activeCard} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({ stage, cards, children }: { stage: BoardStage; cards: BoardCard[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <section
      ref={setNodeRef}
      aria-label={`Etapa ${stage.name}`}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors",
        isOver && "border-primary/50 bg-accent/60",
      )}
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span className={cn("size-2 rounded-full", DOT_CLASSES[stage.color] ?? DOT_CLASSES.slate)} />
        <h2 className="flex-1 truncate text-sm font-medium">{stage.name}</h2>
        <span className="rounded-md bg-background px-1.5 text-xs text-muted-foreground tabular-nums">{cards.length}</span>
      </header>
      <div className="flex max-h-[calc(100svh-15rem)] min-h-24 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {children}
        {cards.length === 0 ? <p className="px-2 py-6 text-center text-xs text-muted-foreground">Arraste negócios para cá</p> : null}
      </div>
    </section>
  );
}

function DraggableCard({
  card,
  stages,
  canMove,
  onMove,
}: {
  card: BoardCard;
  stages: BoardStage[];
  canMove: boolean;
  onMove: (cardId: string, stageId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, disabled: !canMove });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn("touch-manipulation", isDragging && "opacity-40")}>
      <CardBody card={card}>
        {canMove ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Mover negócio"
              className="-mr-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <EllipsisVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Mover para</DropdownMenuLabel>
                {stages
                  .filter((s) => s.id !== card.stageId)
                  .map((s) => (
                    <DropdownMenuItem key={s.id} onClick={() => onMove(card.id, s.id)}>
                      <span className={cn("size-2 rounded-full", DOT_CLASSES[s.color] ?? DOT_CLASSES.slate)} />
                      {s.name}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </CardBody>
    </div>
  );
}

function CardBody({ card, dragging = false, children }: { card: BoardCard; dragging?: boolean; children?: React.ReactNode }) {
  const temp = TEMPERATURE_STYLE[card.temperature];
  const facts = [
    { icon: CalendarRange, value: card.dates },
    { icon: Users, value: card.passengers },
    { icon: Wallet, value: card.budget },
  ].filter((f) => f.value);

  return (
    <article
      className={cn(
        "group rounded-lg border bg-card p-3 text-sm shadow-xs transition-shadow hover:shadow-sm",
        dragging && "rotate-1 cursor-grabbing shadow-lg ring-1 ring-primary/30",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {card.href ? (
            <Link href={card.href} className="block truncate font-medium hover:underline" draggable={false}>
              {card.customerName}
            </Link>
          ) : (
            <p className="truncate font-medium">{card.customerName}</p>
          )}
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" />
            {card.destination ?? "Destino a definir"}
          </p>
        </div>
        {children}
      </div>

      {facts.length ? (
        <ul className="mt-2.5 grid gap-1 text-xs text-muted-foreground">
          {facts.map((f) => (
            <li key={f.value} className="flex items-center gap-1.5 truncate">
              <f.icon className="size-3 shrink-0" />
              {f.value}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span
          className={cn("inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium", temp.className)}
          title={`Lead score ${card.score}/100`}
        >
          <temp.icon className="size-3" />
          {card.temperatureLabel} · {card.score}
        </span>
        <span className="truncate text-[11px] text-muted-foreground">{card.consultant ?? "Sem consultor"}</span>
      </div>
      {card.lastContact ? <p className="mt-1.5 text-[11px] text-muted-foreground">Último contato {card.lastContact}</p> : null}
    </article>
  );
}
