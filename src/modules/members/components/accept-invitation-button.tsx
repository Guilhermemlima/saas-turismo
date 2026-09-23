"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { acceptInvitationAction } from "../actions";

export function AcceptInvitationButton({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <>
      {error ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInvitationAction(token);
            if (result?.status === "error") setError(result.message);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : null}
        Aceitar convite
      </Button>
    </>
  );
}
