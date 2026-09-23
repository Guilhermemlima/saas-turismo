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
  "requests.write",
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
    "requests.write",
    "quotes.write",
    "reports.view",
  ],
  attendant: ["customers.read", "customers.write", "conversations.read", "deals.read", "requests.write"],
  financial: ["customers.read", "deals.read", "quotes.view_margin", "payments.write", "reports.view"],
};

export const ROLE_LABELS: Record<AgencyRole, string> = {
  owner: "Dono da agência",
  manager: "Gerente",
  consultant: "Consultor de viagens",
  attendant: "Atendente",
  financial: "Financeiro",
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
