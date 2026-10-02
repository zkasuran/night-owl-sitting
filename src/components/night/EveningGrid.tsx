import { Link } from "@tanstack/react-router";
import { Lock, Moon } from "lucide-react";
import type { WeekendGroup } from "@/lib/night-owl.functions";
import type { EveningView } from "@/lib/night-owl.server";
import { monthDay, timeRange, weekdayLong } from "@/lib/time";
import { cn } from "@/lib/utils";
import { EmptyState, StatusDot } from "@/components/night/Bits";

export function EveningGrid({
  weekends,
  value,
  onChange,
  disabled = false,
}: {
  weekends: WeekendGroup[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const anyOpen = weekends.some((w) => w.evenings.some((e) => isPickable(e)));
  if (!weekends.length || !anyOpen) {
    return (
      <EmptyState
        icon={<Moon className="h-6 w-6" />}
        title="No evenings open right now"
        body="Robin's next few weekends are spoken for. Join the backup list and you'll get a one-tap link the moment a night frees up."
        action={
          <Link
            to="/backup"
            className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-soft hover:shadow-lamp"
          >
            Join the backup list
          </Link>
        }
      />
    );
  }
  return (
    <div className="space-y-6">
      {weekends.map((w) => (
        <div key={w.key}>
          <div className="mb-2.5 flex items-baseline justify-between">
            <h3 className="font-display text-lg text-foreground">{w.heading}</h3>
            <span className="text-xs text-muted-foreground">
              {w.evenings.filter(isPickable).length} of {w.evenings.length} open
            </span>
          </div>
          <div role="radiogroup" aria-label={w.heading} className="grid grid-cols-2 gap-2.5">
            {w.evenings.map((e) => (
              <EveningCard
                key={e.id}
                evening={e}
                active={e.id === value}
                disabled={disabled}
                weekendKey={w.key}
                onPick={() => onChange(e.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function isPickable(e: EveningView): boolean {
  if (new Date(e.starts_at).getTime() < Date.now()) return false;
  if (e.status === "open") return true;
  if (e.status === "held" && e.held_until && new Date(e.held_until).getTime() < Date.now()) return true;
  return false;
}

function EveningCard({
  evening: e,
  active,
  disabled,
  weekendKey,
  onPick,
}: {
  evening: EveningView;
  active: boolean;
  disabled: boolean;
  weekendKey: string;
  onPick: () => void;
}) {
  const pickable = isPickable(e) && !disabled;
  const past = new Date(e.starts_at).getTime() < Date.now();
  const tone = e.status === "booked" ? "booked" : e.status === "held" && !isPickable(e) ? "held" : "open";
  const label =
    past ? "Passed" : e.status === "booked" ? "Booked" : tone === "held" ? "On hold" : "Open";

  return (
    <div className="relative">
      <button
        type="button"
        role="radio"
        aria-checked={active}
        aria-disabled={!pickable}
        disabled={!pickable}
        onClick={pickable ? onPick : undefined}
        className={cn(
          "flex w-full flex-col items-start rounded-2xl border p-3.5 text-left transition-all duration-200 sm:p-4",
          pickable && !active && "border-border bg-card hover:-translate-y-0.5 hover:border-gold/40 hover:shadow-soft",
          active && "border-gold/70 bg-card shadow-lamp",
          !pickable && "cursor-not-allowed border-border/60 bg-card/40 opacity-70",
        )}
      >
        <span className="flex w-full items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{weekdayLong(e.starts_at)}</span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <StatusDot tone={tone} />
            {label}
          </span>
        </span>
        <span className={cn("mt-1 font-display text-2xl leading-none", pickable ? "text-foreground" : "text-muted-foreground")}>
          {monthDay(e.starts_at)}
        </span>
        <span className="mt-1.5 text-sm text-muted-foreground tabular">{timeRange(e.starts_at, e.ends_at)}</span>
        {e.status === "booked" && e.bookedFamilyName ? (
          <span className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> With the {e.bookedFamilyName}s
          </span>
        ) : null}
      </button>
      {e.status === "booked" && !past ? (
        <Link
          to="/backup"
          search={{ weekend: weekendKey }}
          className="absolute bottom-3 right-3 text-xs font-medium text-gold underline-offset-4 hover:underline"
        >
          Backup list
        </Link>
      ) : null}
    </div>
  );
}
