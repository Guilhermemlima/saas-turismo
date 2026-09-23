"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { setTravelRequestArchivedAction } from "../actions";

export function ArchiveRequestButton({ requestId, archived }: { requestId: string; archived: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setTravelRequestArchivedAction(requestId, !archived);
          if (result.status === "success") toast.success(result.message);
          else toast.error(result.message ?? "Não foi possível concluir.");
        })
      }
    >
      {archived ? <ArchiveRestore /> : <Archive />}
      {archived ? "Reabrir" : "Arquivar"}
    </Button>
  );
}
