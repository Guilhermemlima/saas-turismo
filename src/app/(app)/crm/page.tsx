import type { Metadata } from "next";

import { ModuleRoadmap } from "@/components/shared/module-roadmap";

export const metadata: Metadata = { title: "CRM" };

export default function CrmPage() {
  return (
    <ModuleRoadmap
      href="/crm"
      features={[
        "Kanban com o pipeline de turismo (13 etapas)",
        "Etapas personalizáveis pela agência",
        "Card com destino, datas, passageiros, orçamento e temperatura",
        "Lead score baseado em regras",
      ]}
    />
  );
}
