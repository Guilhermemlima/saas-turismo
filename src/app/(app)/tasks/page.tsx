import type { Metadata } from "next";

import { ModuleRoadmap } from "@/components/shared/module-roadmap";

export const metadata: Metadata = { title: "Tarefas" };

export default function TasksPage() {
  return (
    <ModuleRoadmap
      href="/tasks"
      features={[
        "Preparar cotação, enviar proposta, confirmar pagamento…",
        "Tarefas por consultor, atrasadas e da equipe",
        "Criadas por automações e pela IA",
      ]}
    />
  );
}
