import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pageSize,
  total,
  hrefForPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefForPage: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const control = (target: number, disabled: boolean, label: string, icon: React.ReactNode) =>
    disabled ? (
      <span aria-disabled className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
        {icon}
        {label}
      </span>
    ) : (
      <Link href={hrefForPage(target)} className={buttonVariants({ variant: "outline", size: "sm" })}>
        {icon}
        {label}
      </Link>
    );

  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span className="tabular-nums">
        {from}–{to} de {total}
      </span>
      <div className="flex gap-2">
        {control(page - 1, page <= 1, "Anterior", <ChevronLeft />)}
        {control(page + 1, page >= pages, "Próxima", <ChevronRight />)}
      </div>
    </div>
  );
}
