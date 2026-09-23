/** Palette allowed for pipeline stages (mirrors the check constraint `^[a-z]{3,12}$` with a closed list). */
export const STAGE_COLORS = [
  "slate",
  "sky",
  "cyan",
  "teal",
  "emerald",
  "green",
  "lime",
  "amber",
  "orange",
  "rose",
  "pink",
  "violet",
  "indigo",
] as const;

export type StageColor = (typeof STAGE_COLORS)[number];

export const STAGE_COLOR_LABELS: Record<StageColor, string> = {
  slate: "Cinza",
  sky: "Céu",
  cyan: "Ciano",
  teal: "Petróleo",
  emerald: "Esmeralda",
  green: "Verde",
  lime: "Lima",
  amber: "Âmbar",
  orange: "Laranja",
  rose: "Rosa",
  pink: "Pink",
  violet: "Violeta",
  indigo: "Índigo",
};
