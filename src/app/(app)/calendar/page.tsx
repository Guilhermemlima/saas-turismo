import type { Metadata } from "next";

import { ModuleRoadmap } from "@/components/shared/module-roadmap";

export const metadata: Metadata = { title: "Agenda" };

export default function CalendarPage() {
  return (
    <ModuleRoadmap
      href="/calendar"
      features={[
        "Follow-ups, ligações e reuniões",
        "Viagens e vencimentos de propostas",
        "Visões de dia, semana e mês",
      ]}
    />
  );
}
