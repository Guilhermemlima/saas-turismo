import type { Metadata } from "next";

import { ModuleRoadmap } from "@/components/shared/module-roadmap";

export const metadata: Metadata = { title: "Automações" };

export default function AutomationsPage() {
  return (
    <ModuleRoadmap
      href="/automations"
      features={[
        "Gatilho → condição → ação",
        "Follow-up automático de propostas",
        "Pré-viagem e pós-venda",
        "Histórico de execuções",
      ]}
    />
  );
}
