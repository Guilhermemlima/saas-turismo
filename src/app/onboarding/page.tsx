import { Compass, Lock } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/config/app";
import { cn } from "@/lib/utils";
import { CreateAgencyForm } from "@/modules/agencies/components/create-agency-form";
import { getCurrentUser, getMemberships } from "@/server/auth/tenant";

export const metadata: Metadata = { title: "Configurar agência" };

const STEPS = [
  { title: "Informações da agência", phase: null },
  { title: "Equipe", phase: 4 },
  { title: "Especialidades", phase: 4 },
  { title: "Horários de atendimento", phase: 4 },
  { title: "Agente IA", phase: 13 },
  { title: "Conectar WhatsApp", phase: 15 },
  { title: "Simular atendimento", phase: 14 },
  { title: "Ativar IA", phase: 15 },
];

export default async function OnboardingPage(props: PageProps<"/onboarding">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { new: creatingAnother } = await props.searchParams;
  const memberships = await getMemberships(user.id);
  if (memberships.length > 0 && creatingAnother !== "1") redirect("/dashboard");

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="flex items-center justify-between px-4 py-4 md:px-8">
        <span className="flex items-center gap-2 font-semibold">
          <Compass className="size-5 text-primary" /> {APP_NAME}
        </span>
        <ThemeToggle />
      </header>

      <main className="mx-auto grid w-full max-w-5xl gap-8 px-4 pb-16 md:grid-cols-[240px_1fr] md:px-8">
        <nav aria-label="Etapas do onboarding" className="space-y-1">
          <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Etapa 1 de {STEPS.length}</p>
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-primary" style={{ width: `${100 / STEPS.length}%` }} />
          </div>
          {STEPS.map((step, index) => (
            <div
              key={step.title}
              className={cn(
                "flex items-center gap-3 rounded-lg px-2 py-2 text-sm",
                index === 0 ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                  index === 0 && "border-primary bg-primary text-primary-foreground",
                )}
              >
                {step.phase ? <Lock className="size-3" /> : index + 1}
              </span>
              <span className="flex-1">{step.title}</span>
              {step.phase ? (
                <Badge variant="outline" className="text-[10px]">
                  F{step.phase}
                </Badge>
              ) : null}
            </div>
          ))}
        </nav>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Vamos configurar sua agência</CardTitle>
            <CardDescription>
              Comece pelos dados principais. As demais etapas são liberadas conforme os módulos ficam disponíveis — você
              pode completá-las depois em Configurações.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateAgencyForm />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
