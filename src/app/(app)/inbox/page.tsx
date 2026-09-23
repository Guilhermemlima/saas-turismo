import type { Metadata } from "next";

import { ModuleRoadmap } from "@/components/shared/module-roadmap";

export const metadata: Metadata = { title: "Atendimentos" };

export default function InboxPage() {
  return (
    <ModuleRoadmap
      href="/inbox"
      features={[
        "Conversas | Chat | Dados da viagem em três colunas",
        "Modo IA e modo humano com “Assumir atendimento”",
        "Mensagens em tempo real (Supabase Realtime)",
        "Painel do cliente, da viagem e comercial editável",
      ]}
    />
  );
}
