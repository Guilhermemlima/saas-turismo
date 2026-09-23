import type { Metadata } from "next";

import { ModuleRoadmap } from "@/components/shared/module-roadmap";

export const metadata: Metadata = { title: "Cotações" };

export default function QuotesPage() {
  return (
    <ModuleRoadmap
      href="/quotes"
      features={[
        "Várias opções por cotação",
        "Itens de voo, hotel, transfer, passeios, seguro e outros",
        "Cálculo de subtotal, taxas, descontos, margem e comissão",
        "Margem oculta para o cliente",
      ]}
    />
  );
}
