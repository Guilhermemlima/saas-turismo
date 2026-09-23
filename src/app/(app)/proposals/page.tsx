import type { Metadata } from "next";

import { ModuleRoadmap } from "@/components/shared/module-roadmap";

export const metadata: Metadata = { title: "Propostas" };

export default function ProposalsPage() {
  return (
    <ModuleRoadmap
      href="/proposals"
      features={[
        "Proposta visual com a marca da agência",
        "Link público seguro /proposal/[token]",
        "Rastreamento de visualizações",
        "PDF pronto para WhatsApp",
      ]}
    />
  );
}
