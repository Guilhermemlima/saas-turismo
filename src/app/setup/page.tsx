import { Database } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/config/app";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Configuração inicial" };

const STEPS = [
  "Crie um projeto em supabase.com/dashboard (região South America — São Paulo).",
  "Em Project Settings → API Keys, copie a Project URL e a chave anon/publishable.",
  "Copie .env.example para .env.local e preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  "Aplique as migrations: npx supabase link --project-ref <ref> e npx supabase db push.",
  "Reinicie o servidor (npm run dev).",
];

export default function SetupPage() {
  if (isSupabaseConfigured()) redirect("/login");

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Database className="size-5" />
          </div>
          <CardTitle>Conecte o Supabase para usar o {APP_NAME}</CardTitle>
          <CardDescription>
            O banco de dados ainda não está configurado neste ambiente. Nenhum dado é simulado: a aplicação só funciona
            com um projeto Supabase real.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid list-decimal gap-2 pl-5 text-sm text-muted-foreground">
            {STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-muted-foreground">Detalhes em ENVIRONMENT.md.</p>
        </CardContent>
      </Card>
    </main>
  );
}
