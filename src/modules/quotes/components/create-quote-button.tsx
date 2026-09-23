"use client";

import { Loader2, Receipt } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { createQuoteAction } from "../actions";

export function CreateQuoteButton({ requestId, variant = "default" }: { requestId: string; variant?: "default" | "outline" }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={variant}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await createQuoteAction(requestId);
          if (result?.status === "error") toast.error(result.message);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Receipt />}
      Criar cotação
    </Button>
  );
}
