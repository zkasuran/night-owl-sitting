import { Link } from "@tanstack/react-router";
import { Check, CreditCard } from "lucide-react";
import type { PublicFamily } from "@/lib/night-owl.server";
import { rate } from "@/lib/money";
import { cn } from "@/lib/utils";

export function FamilyPicker({
  families,
  value,
  onChange,
  showNewLink = true,
}: {
  families: PublicFamily[];
  value: string | null;
  onChange: (id: string) => void;
  showNewLink?: boolean;
}) {
  return (
    <div>
      <div role="radiogroup" aria-label="Your family" className="grid gap-2.5 sm:grid-cols-3">
        {families.map((f) => {
          const active = f.id === value;
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(f.id)}
              className={cn(
                "group relative flex flex-col items-start rounded-2xl border bg-card p-4 text-left transition-all duration-200",
                active
                  ? "border-gold/60 shadow-lamp"
                  : "border-border hover:border-muted-foreground/40 hover:bg-card/80",
              )}
            >
              <span
                className={cn(
                  "absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full border transition-all",
                  active ? "border-gold bg-primary text-primary-foreground" : "border-border text-transparent",
                )}
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
              <span className="font-display text-xl text-foreground">The {f.familyName}s</span>
              <span className="mt-0.5 text-sm text-muted-foreground">{f.kidsSummary}</span>
              <span className="mt-3 flex items-center gap-2 text-sm">
                <span className="rounded-lg bg-gold-soft px-2 py-0.5 font-semibold text-gold tabular">{rate(f.rateCents)}</span>
                {f.cardOnFile ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <CreditCard className="h-3.5 w-3.5" />
                    {f.cardBrand ? `${cap(f.cardBrand)} ·${f.cardLast4}` : "card on file"}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">add a card at checkout</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {showNewLink ? (
        <p className="mt-3 text-sm text-muted-foreground">
          New to Robin?{" "}
          <Link to="/inbound" className="text-gold underline-offset-4 hover:underline">
            Send a text
          </Link>{" "}
          and she'll get back to you with what's open.
        </p>
      ) : null}
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
