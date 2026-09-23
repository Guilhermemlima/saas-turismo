/** Onboarding steps (briefing §7). Steps 5–8 unlock with the AI and WhatsApp phases. */
export const ONBOARDING_STEPS = [
  { step: 1, title: "Informações da agência", href: "/settings/agency", phase: null },
  { step: 2, title: "Equipe", href: "/settings/team", phase: null },
  { step: 3, title: "Especialidades", href: "/settings/agency", phase: null },
  { step: 4, title: "Horários de atendimento", href: "/settings/hours", phase: null },
  { step: 5, title: "Agente IA", href: "/agent", phase: 13 },
  { step: 6, title: "Conectar WhatsApp", href: "/settings", phase: 15 },
  { step: 7, title: "Simular atendimento", href: "/agent", phase: 14 },
  { step: 8, title: "Ativar IA", href: "/agent", phase: 15 },
] as const;

export const AVAILABLE_STEPS = ONBOARDING_STEPS.filter((s) => s.phase === null);

export function onboardingProgress(completed: readonly number[]) {
  const done = new Set(completed);
  const steps = ONBOARDING_STEPS.map((s) => ({ ...s, done: done.has(s.step) }));
  const available = steps.filter((s) => s.phase === null);
  return {
    steps,
    completedAvailable: available.filter((s) => s.done).length,
    totalAvailable: available.length,
    allAvailableDone: available.every((s) => s.done),
  };
}
