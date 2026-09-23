/**
 * Contracts for external integrations. Only interfaces live here for now: concrete adapters are
 * added in their roadmap phases. Code depends on these contracts, never on a vendor SDK directly,
 * so the AI model/provider (still undecided) or any travel API can be swapped without touching
 * the domain modules.
 */

export class IntegrationNotConfiguredError extends Error {
  constructor(readonly integration: IntegrationKey) {
    super(`Integração "${integration}" não está configurada.`);
    this.name = "IntegrationNotConfiguredError";
  }
}

export type IntegrationKey = "ai" | "whatsapp" | "flights" | "hotels" | "payments" | "calendar" | "email";

// --- AI (Phase 11+). Model-agnostic: the provider/model is chosen by configuration. ----------
export type AIMessage = { role: "user" | "assistant"; content: string };

export type AIToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema of the tool input; inputs are always re-validated with Zod before execution. */
  inputSchema: Record<string, unknown>;
};

export type AIGenerateRequest = {
  system: string;
  messages: AIMessage[];
  tools?: AIToolDefinition[];
  maxOutputTokens: number;
};

export type AIGenerateResult = {
  text: string;
  toolCalls: { id: string; name: string; input: unknown }[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "refusal" | "other";
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  model: string;
  latencyMs: number;
};

export interface AIProvider {
  readonly name: string;
  generate(request: AIGenerateRequest): Promise<AIGenerateResult>;
}

// --- Messaging channels (Phase 15: WhatsApp Cloud API; future: Instagram, Messenger). -----
export type OutboundMessage =
  | { kind: "text"; to: string; body: string }
  | { kind: "template"; to: string; template: string; language: string; variables: string[] }
  | { kind: "document"; to: string; url: string; filename: string; caption?: string };

export interface ChannelAdapter {
  readonly type: "whatsapp" | "simulator";
  send(message: OutboundMessage): Promise<{ externalMessageId: string }>;
}

// --- Travel suppliers (future). Official APIs only — no scraping. ------------------------------
export type FlightSearch = { origin: string; destination: string; departureDate: string; returnDate?: string; adults: number; childrenAges: number[] };
export type HotelSearch = { destination: string; checkIn: string; checkOut: string; rooms: number; adults: number; childrenAges: number[] };

export interface FlightProvider {
  search(query: FlightSearch): Promise<unknown[]>;
}

export interface HotelProvider {
  search(query: HotelSearch): Promise<unknown[]>;
}

// --- Payments (future; manual records first). -----------------------------------------------
export interface PaymentGateway {
  createCharge(input: { bookingId: string; amountCents: number; currency: string }): Promise<{ chargeId: string; checkoutUrl: string }>;
}
