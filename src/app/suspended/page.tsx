import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOutAction } from "@/modules/auth/actions";
import { getTenantContext } from "@/server/auth/tenant";

export const metadata: Metadata = { title: "Acesso suspenso" };

export default async function SuspendedPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");
  if (ctx.agencyStatus !== "suspended" && ctx.agencyStatus !== "cancelled") redirect("/dashboard");

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <ShieldAlert className="mx-auto mb-2 size-8 text-destructive" />
          <CardTitle>Acesso da {ctx.agencyName} suspenso</CardTitle>
          <CardDescription>
            O acesso desta agência está {ctx.agencyStatus === "cancelled" ? "cancelado" : "temporariamente suspenso"}. Entre
            em contato com o suporte da plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signOutAction}>
            <Button variant="outline" type="submit">
              Sair
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
