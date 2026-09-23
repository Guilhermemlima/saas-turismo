"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type Subscription = { table: "messages" | "conversations" | "notifications"; filter: string };

/**
 * Re-renders the current route when matching rows change. Server components stay the source of
 * truth; Realtime (which honours RLS) only signals that something changed.
 */
export function RealtimeRefresh({ channel, subscriptions }: { channel: string; subscriptions: Subscription[] }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const key = JSON.stringify(subscriptions);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const parsed: Subscription[] = JSON.parse(key);
    let realtime = supabase.channel(channel);
    for (const s of parsed) {
      realtime = realtime.on("postgres_changes", { event: "*", schema: "public", table: s.table, filter: s.filter }, () => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => router.refresh(), 250);
      });
    }
    realtime.subscribe();
    return () => {
      clearTimeout(timer.current);
      void supabase.removeChannel(realtime);
    };
  }, [channel, key, router]);

  return null;
}
