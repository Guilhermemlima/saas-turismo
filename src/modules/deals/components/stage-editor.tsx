"use client";

import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useTransition } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState, type ActionState } from "@/lib/action-state";

import { addStageAction, archiveStageAction, moveStageAction, updateStageAction } from "../pipeline-actions";
import { STAGE_COLOR_LABELS, STAGE_COLORS } from "../stage-colors";

export type EditableStage = { id: string; name: string; color: string; systemKey: string | null; dealCount: number };

function useToast(state: ActionState) {
  useEffect(() => {
    if (state.status === "success" && state.message) toast.success(state.message);
    if (state.status === "error") toast.error(state.fieldErrors ? Object.values(state.fieldErrors)[0]?.[0] : state.message);
  }, [state]);
}

function StageRow({ stage, isFirst, isLast }: { stage: EditableStage; isFirst: boolean; isLast: boolean }) {
  const [state, action, saving] = useActionState(updateStageAction.bind(null, stage.id), initialActionState);
  const [pending, startTransition] = useTransition();
  useToast(state);

  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => {
      const result = await fn();
      if (result.status === "error") toast.error(result.message);
      else if (result.message) toast.success(result.message);
    });

  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-center">
      <form action={action} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        <Input name="name" defaultValue={stage.name} maxLength={60} aria-label="Nome da etapa" className="sm:flex-1" />
        <NativeSelect name="color" defaultValue={stage.color} aria-label="Cor" className="sm:w-36">
          {STAGE_COLORS.map((c) => (
            <option key={c} value={c}>
              {STAGE_COLOR_LABELS[c]}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Salvar
        </Button>
      </form>
      <div className="flex items-center gap-1">
        <span className="mr-2 text-xs text-muted-foreground tabular-nums">{stage.dealCount} negócio{stage.dealCount === 1 ? "" : "s"}</span>
        <Button variant="ghost" size="icon" aria-label="Subir" disabled={isFirst || pending} onClick={() => run(() => moveStageAction(stage.id, "up"))}>
          <ArrowUp />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Descer" disabled={isLast || pending} onClick={() => run(() => moveStageAction(stage.id, "down"))}>
          <ArrowDown />
        </Button>
        {stage.systemKey ? (
          <span className="w-8" title="Etapa padrão: pode ser renomeada, não removida" />
        ) : (
          <Button variant="ghost" size="icon" aria-label="Remover etapa" disabled={pending} onClick={() => run(() => archiveStageAction(stage.id))}>
            <Trash2 />
          </Button>
        )}
      </div>
    </li>
  );
}

export function StageEditor({ pipelineId, stages }: { pipelineId: string; stages: EditableStage[] }) {
  const [state, action, adding] = useActionState(addStageAction.bind(null, pipelineId), initialActionState);
  useToast(state);

  return (
    <div className="grid gap-4">
      <ol className="grid gap-2">
        {stages.map((stage, i) => (
          <StageRow key={stage.id} stage={stage} isFirst={i === 0} isLast={i === stages.length - 1} />
        ))}
      </ol>
      <form action={action} key={state.status === "success" ? state.message : "add"} className="flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-center">
        <Input name="name" placeholder="Nova etapa, ex.: Aguardando documentos" maxLength={60} aria-label="Nome da nova etapa" className="sm:flex-1" />
        <NativeSelect name="color" defaultValue="slate" aria-label="Cor da nova etapa" className="sm:w-36">
          {STAGE_COLORS.map((c) => (
            <option key={c} value={c}>
              {STAGE_COLOR_LABELS[c]}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" disabled={adding}>
          {adding ? <Loader2 className="animate-spin" /> : <Plus />}
          Adicionar
        </Button>
      </form>
    </div>
  );
}
