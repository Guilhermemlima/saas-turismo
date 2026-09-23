"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/shared/form-field";

import { assignConversationAction } from "../actions";

export function AssignSelect({ conversationId, value, members }: { conversationId: string; value: string | null; members: { id: string; name: string }[] }) {
  const [pending, startTransition] = useTransition();
  return (
    <NativeSelect
      key={value ?? "none"}
      defaultValue={value ?? ""}
      disabled={pending}
      aria-label="Responsável pela conversa"
      onChange={(e) =>
        startTransition(async () => {
          const result = await assignConversationAction(conversationId, e.target.value || null);
          if (result.status === "error") toast.error(result.message);
          else toast.success(result.message);
        })
      }
    >
      <option value="">Sem responsável</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </NativeSelect>
  );
}
