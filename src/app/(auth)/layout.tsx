import { Compass } from "lucide-react";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { APP_NAME, APP_TAGLINE } from "@/config/app";

const HIGHLIGHTS = [
  "Atendimento no WhatsApp que qualifica o viajante",
  "CRM com o pipeline real de uma agência",
  "Cotações, propostas e follow-ups no mesmo lugar",
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-24 size-[28rem] rounded-full bg-[radial-gradient(circle,var(--warm)_0%,transparent_65%)] opacity-35"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[repeating-linear-gradient(115deg,transparent_0_22px,color-mix(in_oklch,var(--primary-foreground)_7%,transparent)_22px_23px)]"
        />
        <div className="relative flex items-center gap-2.5 text-lg font-semibold">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary-foreground/12 ring-1 ring-primary-foreground/20">
            <Compass className="size-5" />
          </span>
          {APP_NAME}
        </div>
        <div className="relative max-w-md space-y-6">
          <h2 className="text-4xl leading-tight font-semibold">Mais viagens vendidas, menos trabalho operacional.</h2>
          <ul className="space-y-3 text-primary-foreground/80">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="size-1.5 rounded-full bg-warm" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-primary-foreground/60">{APP_TAGLINE}</p>
      </aside>

      <main className="flex flex-col">
        <div className="flex items-center justify-between p-4 lg:justify-end">
          <span className="flex items-center gap-2 font-semibold lg:hidden">
            <Compass className="size-5 text-primary" /> {APP_NAME}
          </span>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-16">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </main>
    </div>
  );
}
