import type { Metadata } from "next";

import { ModuleRoadmap } from "@/components/shared/module-roadmap";

export const metadata: Metadata = { title: "Solicitações" };

export default function RequestsPage() {
  return (
    <ModuleRoadmap
      href="/requests"
      features={[
        "Destino, datas, passageiros e serviços desejados",
        "Viajantes nominais por solicitação",
        "Checklist automático do que falta coletar",
        "Origem dos dados (IA ou humano) auditável",
      ]}
    />
  );
}
