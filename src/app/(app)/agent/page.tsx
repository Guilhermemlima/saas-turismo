import type { Metadata } from "next";

import { ModuleRoadmap } from "@/components/shared/module-roadmap";

export const metadata: Metadata = { title: "Agente IA" };

export default function AgentPage() {
  return (
    <ModuleRoadmap
      href="/agent"
      features={[
        "Nome, identidade, tom e mensagem inicial",
        "Regras, políticas, FAQ e formas de pagamento",
        "Base de conhecimento da agência",
        "Simulador de atendimento antes de ativar",
      ]}
    />
  );
}
