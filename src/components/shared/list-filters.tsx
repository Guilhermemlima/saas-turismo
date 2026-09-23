"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Status tabs + debounced search that keep state in the URL (shareable, server-rendered). */
export function ListFilters<T extends string>({
  q,
  status,
  tabs,
  defaultStatus,
  placeholder,
}: {
  q: string;
  status: T;
  tabs: { value: T; label: string }[];
  defaultStatus: T;
  placeholder: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [term, setTerm] = useState(q);
  const [pending, startTransition] = useTransition();
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (term.trim()) params.set("q", term.trim());
      else params.delete("q");
      params.delete("page");
      startTransition(() => router.replace(`${pathname}?${params.toString()}`));
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [term]);

  const tabHref = (value: T) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (value !== defaultStatus) params.set("status", value);
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <nav className="inline-flex w-fit flex-wrap rounded-lg bg-muted p-0.5 text-sm" aria-label="Filtrar por status">
        {tabs.map((tab) => (
          <Link
            key={tab.value}
            href={tabHref(tab.value)}
            aria-current={status === tab.value ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1 text-muted-foreground transition-colors",
              status === tab.value && "bg-background text-foreground shadow-sm",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className="relative sm:w-80">
        <Search
          className={cn(
            "pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground",
            pending && "animate-pulse",
          )}
        />
        <Input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          maxLength={100}
          className="pl-8"
        />
      </div>
    </div>
  );
}
