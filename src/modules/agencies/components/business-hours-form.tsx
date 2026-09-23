"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { FormField, NativeSelect } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

import { BRAZIL_TIMEZONES, WEEKDAY_LABELS, WEEKDAYS, type BusinessHours } from "../business-hours";
import { updateBusinessHoursAction } from "../settings-actions";

export function BusinessHoursForm({ hours, timezone, readOnly }: { hours: BusinessHours; timezone: string; readOnly: boolean }) {
  const [state, action, pending] = useActionState(updateBusinessHoursAction, initialActionState);
  const [open, setOpen] = useState(() => Object.fromEntries(WEEKDAYS.map((d) => [d, hours[d].open])) as Record<string, boolean>);

  useEffect(() => {
    if (state.status === "success" && state.message) toast.success(state.message);
    if (state.status === "error") toast.error(state.fieldErrors ? Object.values(state.fieldErrors)[0]?.[0] : state.message);
  }, [state]);

  return (
    <form action={action} className="grid gap-5">
      <fieldset disabled={readOnly || pending} className="grid gap-5">
        <FormField id="timezone" label="Fuso horário" className="max-w-md">
          <NativeSelect id="timezone" name="timezone" defaultValue={timezone}>
            {BRAZIL_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>

        <ul className="divide-y rounded-lg border">
          {WEEKDAYS.map((day) => (
            <li key={day} className="grid grid-cols-[110px_1fr] items-center gap-3 p-3 sm:grid-cols-[140px_110px_1fr]">
              <span className="text-sm font-medium">{WEEKDAY_LABELS[day]}</span>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={`${day}_open`}
                  checked={open[day]}
                  onChange={(e) => setOpen((o) => ({ ...o, [day]: e.target.checked }))}
                  className="size-4 accent-primary"
                />
                {open[day] ? "Aberto" : "Fechado"}
              </label>
              <div className={cn("col-span-2 flex items-center gap-2 sm:col-span-1", !open[day] && "opacity-40")}>
                <Input type="time" name={`${day}_start`} defaultValue={hours[day].start} aria-label={`Abertura ${WEEKDAY_LABELS[day]}`} className="w-32" />
                <span className="text-sm text-muted-foreground">até</span>
                <Input type="time" name={`${day}_end`} defaultValue={hours[day].end} aria-label={`Fechamento ${WEEKDAY_LABELS[day]}`} className="w-32" />
              </div>
            </li>
          ))}
        </ul>
      </fieldset>
      {!readOnly ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Salvar horários
          </Button>
        </div>
      ) : null}
    </form>
  );
}
