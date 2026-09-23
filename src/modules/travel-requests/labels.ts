import type {
  BudgetScope,
  DateFlexibility,
  MealPlan,
  StageKey,
  TravelRequestStatus,
  TripScope,
  TripType,
} from "@/server/db/database.types";

export const TRIP_TYPES = [
  "leisure",
  "family",
  "couple",
  "honeymoon",
  "solo",
  "corporate",
  "cruise",
  "disney",
  "exchange",
  "excursion",
  "package",
  "custom",
] as const satisfies readonly TripType[];

export const TRIP_TYPE_LABELS: Record<TripType, string> = {
  leisure: "Lazer",
  family: "Família",
  couple: "Casal",
  honeymoon: "Lua de mel",
  solo: "Solo",
  corporate: "Corporativa",
  cruise: "Cruzeiro",
  disney: "Disney",
  exchange: "Intercâmbio",
  excursion: "Excursão",
  package: "Pacote",
  custom: "Personalizada",
};

export const TRIP_SCOPES = ["national", "international"] as const satisfies readonly TripScope[];
export const TRIP_SCOPE_LABELS: Record<TripScope, string> = { national: "Nacional", international: "Internacional" };

export const DATE_FLEXIBILITIES = ["exact", "flexible_days", "month_only", "undecided"] as const satisfies readonly DateFlexibility[];
export const DATE_FLEXIBILITY_LABELS: Record<DateFlexibility, string> = {
  exact: "Datas definidas",
  flexible_days: "Datas flexíveis (alguns dias)",
  month_only: "Só o mês",
  undecided: "Ainda não sabe",
};

export const MEAL_PLANS = ["room_only", "breakfast", "half_board", "full_board", "all_inclusive"] as const satisfies readonly MealPlan[];
export const MEAL_PLAN_LABELS: Record<MealPlan, string> = {
  room_only: "Sem refeições",
  breakfast: "Café da manhã",
  half_board: "Meia pensão",
  full_board: "Pensão completa",
  all_inclusive: "All inclusive",
};

export const BUDGET_SCOPES = ["total", "per_person"] as const satisfies readonly BudgetScope[];
export const BUDGET_SCOPE_LABELS: Record<BudgetScope, string> = { total: "total", per_person: "por pessoa" };

export const REQUEST_STATUS_LABELS: Record<TravelRequestStatus, string> = {
  collecting: "Em qualificação",
  complete: "Completa",
  archived: "Arquivada",
  cancelled: "Cancelada",
};

export const SERVICES = [
  { key: "needs_flights", label: "Aéreo" },
  { key: "needs_hotel", label: "Hospedagem" },
  { key: "needs_transfer", label: "Transfer" },
  { key: "needs_insurance", label: "Seguro viagem" },
  { key: "needs_tours", label: "Passeios" },
] as const;

export type ServiceKey = (typeof SERVICES)[number]["key"];

/** Stage colors are stored as names; classes are listed statically so Tailwind can see them. */
export const STAGE_COLOR_CLASSES: Record<string, string> = {
  slate: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
  sky: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  cyan: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300",
  teal: "bg-teal-500/12 text-teal-700 dark:text-teal-300",
  emerald: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  indigo: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300",
  violet: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  amber: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  orange: "bg-orange-500/12 text-orange-700 dark:text-orange-300",
  lime: "bg-lime-500/15 text-lime-800 dark:text-lime-300",
  green: "bg-green-500/12 text-green-700 dark:text-green-300",
  pink: "bg-pink-500/12 text-pink-700 dark:text-pink-300",
  rose: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
};

/** Stages from which completing the request advances the deal automatically. */
export const PRE_QUALIFICATION_STAGES: readonly StageKey[] = ["new_contact", "qualifying"];
