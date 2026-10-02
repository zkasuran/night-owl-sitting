import type { ReactNode } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { HOLD_COPY } from "@/lib/money";

export function SectionTitle({
  eyebrow,
  title,
  aside,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-end justify-between gap-3", className)}>
      <div>
        {eyebrow ? (
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">{eyebrow}</p>
        ) : null}
        <h2 className="text-2xl font-medium leading-tight text-foreground sm:text-[1.7rem]">{title}</h2>
      </div>
      {aside ? <div className="text-sm text-muted-foreground">{aside}</div> : null}
    </div>
  );
}

export function HoldNote({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <p
      className={cn(
        "inline-flex items-start gap-2 rounded-xl border border-gold/20 bg-gold-soft px-3 py-2 text-sm text-foreground",
        compact && "px-2.5 py-1.5 text-xs",
        className,
      )}
    >
      <ShieldCheck className={cn("mt-0.5 h-4 w-4 shrink-0 text-gold", compact && "h-3.5 w-3.5")} />
      <span>{HOLD_COPY}</span>
    </p>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gold-soft text-gold">{icon}</div> : null}
      <h3 className="font-display text-xl text-foreground">{title}</h3>
      {body ? <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-5 py-4">
      <p className="font-medium text-foreground">{title}</p>
      {body ? <p className="mt-1 text-sm text-muted-foreground">{body}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton-night", className)} aria-hidden="true" />;
}

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "gold" | "success" | "danger" | "muted";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
        tone === "neutral" && "bg-secondary text-foreground",
        tone === "muted" && "bg-secondary text-muted-foreground",
        tone === "gold" && "bg-gold-soft text-gold ring-1 ring-gold/25",
        tone === "success" && "bg-success/15 text-success ring-1 ring-success/25",
        tone === "danger" && "bg-destructive/15 text-destructive ring-1 ring-destructive/25",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SuccessBurst({ className }: { className?: string }) {
  return (
    <div className={cn("relative mx-auto grid h-16 w-16 place-items-center", className)}>
      <span className="absolute inset-0 rounded-full bg-gold/20 animate-ring-out" />
      <span className="grid h-16 w-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-lamp animate-check-pop">
        <Check className="h-8 w-8" strokeWidth={2.5} />
      </span>
    </div>
  );
}

export function StatusDot({ tone }: { tone: "open" | "held" | "booked" }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        tone === "open" && "bg-success shadow-[0_0_0_3px] shadow-success/20",
        tone === "held" && "bg-gold shadow-[0_0_0_3px] shadow-gold/20",
        tone === "booked" && "bg-muted-foreground/60",
      )}
    />
  );
}
