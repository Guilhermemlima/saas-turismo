import type { PreferenceCategory } from "@/server/db/database.types";

export const PREFERENCE_CATEGORIES = [
  "accommodation",
  "flight",
  "food",
  "travel_style",
  "destination",
  "budget",
  "accessibility",
  "other",
] as const satisfies readonly PreferenceCategory[];

export const PREFERENCE_CATEGORY_LABELS: Record<PreferenceCategory, string> = {
  accommodation: "Hospedagem",
  flight: "Voos",
  food: "Alimentação",
  travel_style: "Estilo de viagem",
  destination: "Destinos",
  budget: "Orçamento",
  accessibility: "Acessibilidade",
  other: "Outros",
};

/** Tag chip colors (static class names so Tailwind keeps them). */
export const TAG_COLOR_CLASSES: Record<string, string> = {
  slate: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
  sky: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  cyan: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300",
  teal: "bg-teal-500/12 text-teal-700 dark:text-teal-300",
  emerald: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  green: "bg-green-500/12 text-green-700 dark:text-green-300",
  lime: "bg-lime-500/15 text-lime-800 dark:text-lime-300",
  amber: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  orange: "bg-orange-500/12 text-orange-700 dark:text-orange-300",
  rose: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  pink: "bg-pink-500/12 text-pink-700 dark:text-pink-300",
  violet: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  indigo: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300",
};
