"use client";

import { Loader2, Plus, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PreferenceCategory } from "@/server/db/database.types";

import { addNoteAction, addPreferenceAction, addTagAction, deleteNoteAction, deletePreferenceAction, removeTagAction } from "../actions";
import { PREFERENCE_CATEGORIES, PREFERENCE_CATEGORY_LABELS, TAG_COLOR_CLASSES } from "../labels";

type Result = { status: string; message?: string };

function useRunner() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<Result>, onSuccess?: () => void) =>
    startTransition(async () => {
      const result = await fn();
      if (result.status === "error") toast.error(result.message);
      else {
        if (result.message) toast.success(result.message);
        onSuccess?.();
      }
    });
  return { pending, run };
}

export function TagChip({ name, color, onRemove, disabled }: { name: string; color: string; onRemove?: () => void; disabled?: boolean }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium", TAG_COLOR_CLASSES[color] ?? TAG_COLOR_CLASSES.slate)}>
      {name}
      {onRemove ? (
        <button type="button" onClick={onRemove} disabled={disabled} aria-label={`Remover tag ${name}`} className="-mr-1 rounded-full p-0.5 hover:bg-black/10">
          <X className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

export function CustomerTags({
  customerId,
  allTags,
  appliedIds,
  canEdit,
}: {
  customerId: string;
  allTags: { id: string; name: string; color: string }[];
  appliedIds: string[];
  canEdit: boolean;
}) {
  const [name, setName] = useState("");
  const { pending, run } = useRunner();
  const applied = allTags.filter((t) => appliedIds.includes(t.id));
  const suggestions = allTags.filter((t) => !appliedIds.includes(t.id));

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1.5">
        {applied.length === 0 ? <span className="text-sm text-muted-foreground">Nenhuma tag.</span> : null}
        {applied.map((t) => (
          <TagChip key={t.id} name={t.name} color={t.color} disabled={pending} onRemove={canEdit ? () => run(() => removeTagAction(customerId, t.id)) : undefined} />
        ))}
      </div>
      {canEdit ? (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) run(() => addTagAction(customerId, name), () => setName(""));
            }}
            className="flex gap-2"
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova tag, ex.: VIP, Lua de mel 2027" maxLength={40} list={`tags-${customerId}`} aria-label="Adicionar tag" />
            <datalist id={`tags-${customerId}`}>
              {suggestions.map((t) => (
                <option key={t.id} value={t.name} />
              ))}
            </datalist>
            <Button type="submit" variant="outline" disabled={pending || !name.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : <Plus />}
              Adicionar
            </Button>
          </form>
          {suggestions.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Usadas na agência:</span>
              {suggestions.slice(0, 12).map((t) => (
                <button key={t.id} type="button" disabled={pending} onClick={() => run(() => addTagAction(customerId, t.name))} className="opacity-70 transition-opacity hover:opacity-100">
                  <TagChip name={t.name} color={t.color} />
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function CustomerPreferences({
  customerId,
  preferences,
  canEdit,
}: {
  customerId: string;
  preferences: { id: string; category: PreferenceCategory; value: string }[];
  canEdit: boolean;
}) {
  const [category, setCategory] = useState<PreferenceCategory>("accommodation");
  const [value, setValue] = useState("");
  const { pending, run } = useRunner();
  const grouped = PREFERENCE_CATEGORIES.map((c) => ({ category: c, items: preferences.filter((p) => p.category === c) })).filter((g) => g.items.length);

  return (
    <div className="grid gap-3">
      {grouped.length === 0 ? <p className="text-sm text-muted-foreground">Nada registrado ainda. Ex.: “Hotel 4 estrelas”, “Prefere voo direto”, “Gosta de praia”.</p> : null}
      {grouped.map((g) => (
        <div key={g.category} className="grid gap-1">
          <span className="text-xs font-medium text-muted-foreground">{PREFERENCE_CATEGORY_LABELS[g.category]}</span>
          <ul className="flex flex-wrap gap-1.5">
            {g.items.map((p) => (
              <li key={p.id} className="inline-flex items-center gap-1 rounded-lg border bg-background px-2 py-1 text-sm">
                {p.value}
                {canEdit ? (
                  <button type="button" disabled={pending} onClick={() => run(() => deletePreferenceAction(customerId, p.id))} aria-label={`Remover ${p.value}`} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                    <X className="size-3" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {canEdit ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) run(() => addPreferenceAction(customerId, category, value), () => setValue(""));
          }}
          className="grid gap-2 sm:grid-cols-[150px_1fr_auto]"
        >
          <NativeSelect value={category} onChange={(e) => setCategory(e.target.value as PreferenceCategory)} aria-label="Categoria">
            {PREFERENCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {PREFERENCE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </NativeSelect>
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ex.: prefere voo direto" maxLength={200} aria-label="Preferência" />
          <Button type="submit" variant="outline" disabled={pending || !value.trim()}>
            <Plus /> Registrar
          </Button>
        </form>
      ) : null}
    </div>
  );
}

export function CustomerNotes({
  customerId,
  notes,
  canEdit,
  currentUserId,
  canModerate,
}: {
  customerId: string;
  notes: { id: string; body: string; authorId: string | null; authorName: string | null; when: string }[];
  canEdit: boolean;
  currentUserId: string;
  canModerate: boolean;
}) {
  const [body, setBody] = useState("");
  const { pending, run } = useRunner();

  return (
    <div className="grid gap-3">
      {canEdit ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) run(() => addNoteAction(customerId, body), () => setBody(""));
          }}
          className="grid gap-2"
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Anote algo importante sobre o cliente (visível só para a equipe)"
            aria-label="Nova nota"
            className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending || !body.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : <Plus />}
              Adicionar nota
            </Button>
          </div>
        </form>
      ) : null}
      {notes.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma nota.</p> : null}
      <ul className="grid gap-2">
        {notes.map((n) => (
          <li key={n.id} className="rounded-lg border bg-background p-3">
            <p className="text-sm break-words whitespace-pre-wrap">{n.body}</p>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {n.authorName ?? "Equipe"} · {n.when}
              </span>
              {canEdit && (n.authorId === currentUserId || canModerate) ? (
                <button type="button" disabled={pending} onClick={() => run(() => deleteNoteAction(customerId, n.id))} aria-label="Apagar nota" className="rounded p-1 hover:bg-muted hover:text-foreground">
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
