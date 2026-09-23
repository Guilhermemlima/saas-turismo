import type { Metadata } from "next";

import { ModuleRoadmap } from "@/components/shared/module-roadmap";

export const metadata: Metadata = { title: "Reservas" };

export default function BookingsPage() {
  return (
    <ModuleRoadmap
      href="/bookings"
      features={[
        "Reserva criada a partir da proposta aceita",
        "Pagamentos manuais: pendente, parcial, pago, reembolsado",
        "Localizadores por item",
        "Próximas viagens",
      ]}
    />
  );
}
