"use client";

import { FlaskConical, Loader2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { startSimulationAction } from "../actions";

/** Opens (or reuses) a test conversation on the simulator channel. Nothing is sent to the customer. */
export function StartSimulationButton({ customerId }: { customerId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await startSimulationAction(customerId);
          if (result?.status === "error") toast.error(result.message);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <FlaskConical />}
      Conversa de teste
    </Button>
  );
}
