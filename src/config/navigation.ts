import {
  BarChart3,
  Bot,
  CalendarDays,
  CheckSquare,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  type LucideIcon,
  MessagesSquare,
  Plane,
  Receipt,
  Settings,
  Ticket,
  Users,
  Workflow,
} from "lucide-react";

import type { Permission } from "@/lib/permissions";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Menu entry is hidden for roles without this permission. */
  permission?: Permission;
  /** Roadmap phase that delivers the module (PROJECT_PLAN.md). Omitted when available. */
  phase?: number;
  description: string;
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAVIGATION: NavGroup[] = [
  {
    label: "Visão geral",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, description: "Indicadores da agência" },
      {
        title: "Atendimentos",
        href: "/inbox",
        icon: MessagesSquare,
        permission: "conversations.read",
        description: "Central de conversas do WhatsApp com IA e humanos",
      },
    ],
  },
  {
    label: "Comercial",
    items: [
      { title: "CRM", href: "/crm", icon: KanbanSquare, permission: "deals.read", description: "Pipeline de oportunidades de viagem" },
      { title: "Solicitações", href: "/requests", icon: Plane, permission: "deals.read", description: "Pedidos de viagem qualificados" },
      { title: "Cotações", href: "/quotes", icon: Receipt, permission: "quotes.write", phase: 16, description: "Montagem de opções de voo, hotel e serviços" },
      { title: "Propostas", href: "/proposals", icon: FileText, permission: "deals.read", phase: 17, description: "Propostas comerciais com link rastreável" },
      { title: "Reservas", href: "/bookings", icon: Ticket, permission: "deals.read", phase: 20, description: "Viagens vendidas, pagamentos e documentos" },
      { title: "Clientes", href: "/customers", icon: Users, permission: "customers.read", description: "Viajantes e histórico" },
    ],
  },
  {
    label: "Operação",
    items: [
      { title: "Agenda", href: "/calendar", icon: CalendarDays, phase: 22, description: "Follow-ups, ligações, viagens e vencimentos" },
      { title: "Tarefas", href: "/tasks", icon: CheckSquare, description: "Tarefas da equipe" },
      { title: "Automações", href: "/automations", icon: Workflow, permission: "automations.manage", phase: 23, description: "Gatilhos, condições e ações" },
      { title: "Agente IA", href: "/agent", icon: Bot, permission: "agent.configure", phase: 13, description: "Configuração do consultor virtual" },
      { title: "Relatórios", href: "/reports", icon: BarChart3, permission: "reports.view", phase: 26, description: "Funil, vendas e performance" },
    ],
  },
  {
    label: "Agência",
    items: [{ title: "Configurações", href: "/settings", icon: Settings, description: "Dados da agência, equipe e integrações" }],
  },
];

export const NAV_ITEMS: NavItem[] = NAVIGATION.flatMap((group) => group.items);

export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}
