"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import { setCustomerArchivedAction } from "../actions";

export function ArchiveCustomerButton({ customerId, archived }: { customerId: string; archived: boolean }) {
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      const result = await setCustomerArchivedAction(customerId, !archived);
      if (result.status === "success") toast.success(result.message);
      else toast.error(result.message ?? "Não foi possível concluir.");
    });

  if (archived) {
    return (
      <Button variant="outline" onClick={run} disabled={pending}>
        <ArchiveRestore /> Restaurar
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" disabled={pending} />}>
        <Archive /> Arquivar
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Arquivar este cliente?</AlertDialogTitle>
          <AlertDialogDescription>
            Ele sai da lista de ativos, mas o histórico é mantido e você pode restaurá-lo a qualquer momento. A exclusão
            definitiva de dados pessoais é feita pelo fluxo de privacidade (LGPD).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={run}>Arquivar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
