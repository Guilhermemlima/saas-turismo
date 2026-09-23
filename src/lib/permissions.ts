import type { AgencyRole } from "@/server/db/database.types";

/**
 * Permission matrix (SECURITY.md §4.2). The server enforces it with requirePermission();
 * RLS policies mirror it in the database. The UI only uses it to hide actions.
 */
export const PERMISSIONS = [
  "agency.manage",
  "settings.manage",
  "members.manage",
  "customers.read",
  "customers.write",
  "customers.archive",
  "conversations.read",
  "deals.read",
  "deals.write",
  "requests.write",
  "tasks.write",
  "quotes.write",
  "quotes.view_margin",
  "payments.write",
  "reports.view",
  "agent.configure",
  "automations.manage",
  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<AgencyRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  manager: PERMISSIONS.filter((p) => p !== "agency.manage"),
  consultant: [
    "customers.read",
    "customers.write",
    "conversations.read",
    "deals.read",
    "deals.write",
    "requests.write",
    "tasks.write",
    "quotes.write",
    "quotes.view_margin",
    "reports.view",
  ],
  attendant: ["customers.read", "customers.write", "conversations.read", "deals.read", "deals.write", "requests.write", "tasks.write"],
  financial: ["customers.read", "deals.read", "tasks.write", "quotes.view_margin", "payments.write", "reports.view"],
};

export const ROLE_LABELS: Record<AgencyRole, string> = {
  owner: "Dono da agência",
  manager: "Gerente",
  consultant: "Consultor de viagens",
  attendant: "Atendente",
  financial: "Financeiro",
};

export const ROLE_DESCRIPTIONS: Record<AgencyRole, string> = {
  owner: "Tudo, incluindo dados da agência e equipe",
  manager: "Operação completa, equipe e configurações",
  consultant: "Atendimento, CRM, solicitações e cotações",
  attendant: "Atendimento e qualificação, sem valores",
  financial: "Reservas, pagamentos e relatórios",
};

export function permissionsFor(role: AgencyRole): ReadonlySet<Permission> {
  return new Set(ROLE_PERMISSIONS[role]);
}

export function roleCan(role: AgencyRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`Permissão necessária: ${permission}`);
    this.name = "ForbiddenError";
  }
}
