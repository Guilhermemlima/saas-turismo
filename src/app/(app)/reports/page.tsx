import type { Metadata } from "next";

import { ModuleRoadmap } from "@/components/shared/module-roadmap";

export const metadata: Metadata = { title: "Relatórios" };

export default function ReportsPage() {
  return (
    <ModuleRoadmap
      href="/reports"
      features={[
        "Funil de leads a vendas",
        "Conversão, ticket médio e destinos",
        "Performance por consultor",
        "IA × atendimento humano",
      ]}
    />
  );
}
