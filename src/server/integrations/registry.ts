import "server-only";

import {
  IntegrationNotConfiguredError,
  type AIProvider,
  type ChannelAdapter,
  type IntegrationKey,
} from "./types";

export type IntegrationStatus = {
  key: IntegrationKey;
  label: string;
  description: string;
  configured: boolean;
  phase: number | null;
};

/**
 * Single place that reports which integrations exist. Status is derived from real
 * configuration only — nothing is reported as connected until an adapter is implemented
 * and its credentials are present.
 */
export function getIntegrationStatuses(): IntegrationStatus[] {
  return [
    { key: "ai", label: "Inteligência artificial", description: "Agente de atendimento e extração de dados da viagem.", configured: false, phase: 11 },
    { key: "whatsapp", label: "WhatsApp Cloud API", description: "Mensagens oficiais da Meta para atendimento.", configured: false, phase: 15 },
    { key: "flights", label: "Voos", description: "Busca de tarifas por API oficial de fornecedor.", configured: false, phase: null },
    { key: "hotels", label: "Hotéis", description: "Busca de hospedagem por API oficial de fornecedor.", configured: false, phase: null },
    { key: "payments", label: "Pagamentos", description: "Gateway de cobrança (pagamentos manuais primeiro).", configured: false, phase: null },
    { key: "calendar", label: "Google Calendar", description: "Sincronização da agenda da equipe.", configured: false, phase: null },
  ];
}

export function getAIProvider(): AIProvider {
  throw new IntegrationNotConfiguredError("ai");
}

export function getWhatsAppAdapter(): ChannelAdapter {
  throw new IntegrationNotConfiguredError("whatsapp");
}
