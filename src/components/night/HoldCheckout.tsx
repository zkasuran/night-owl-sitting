// Embedded Stripe Checkout for the $20 date-night hold. Renders inline (no redirect) in a
// full-screen sheet so the parent never leaves Night Owl. Test mode only.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe";
import { clock } from "@/lib/time";

export interface HoldCheckoutSession {
  clientSecret: string;
  sessionId: string;
  eveningId: string;
  eveningLabel: string;
  holdUntil: string;
}

interface HoldCheckoutProps {
  session: HoldCheckoutSession;
  onClose: () => void;
}

function useCountdown(until: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const remaining = Math.max(0, new Date(until).getTime() - now);
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return { remaining, label: `${minutes}:${String(seconds).padStart(2, "0")}` };
}

export function HoldCheckout({ session, onClose }: HoldCheckoutProps) {
  const { remaining, label } = useCountdown(session.holdUntil);
  const navigate = useNavigate();
  const [completed, setCompleted] = useState(false);
  const stripe = useMemo(() => getStripe(), []);
  const onComplete = useCallback(() => {
    setCompleted(true);
    navigate({ to: "/booking/return", search: { session_id: session.sessionId } });
  }, [navigate, session.sessionId]);
  const options = useMemo(() => ({ clientSecret: session.clientSecret, onComplete }), [session.clientSecret, onComplete]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (remaining === 0 && !completed) onClose();
  }, [remaining, completed, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hold-checkout-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/85 p-0 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <div className="flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-owl sm:max-h-[92vh] sm:rounded-3xl">
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div>
            <p className="font-body text-xs font-medium uppercase tracking-[0.18em] text-primary">Date night hold · $20</p>
            <h2 id="hold-checkout-title" className="mt-1 font-display text-xl text-foreground sm:text-2xl">
              {session.eveningLabel}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Held for you until {clock(session.holdUntil)} ·{" "}
              <span className="tabular-nums text-foreground">{label}</span> left
            </p>
          </div>
          {!completed ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:border-primary hover:text-foreground"
            >
              Not tonight
            </button>
          ) : null}
        </header>

        <div className="min-h-[420px] flex-1 overflow-y-auto bg-[oklch(0.985_0.004_260)] px-2 py-3 sm:px-4">
          <EmbeddedCheckoutProvider stripe={stripe} options={options}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>

        <footer className="border-t border-border px-5 py-3 text-xs text-muted-foreground sm:px-6">
          Test mode. Use card <span className="font-medium text-foreground">4242 4242 4242 4242</span>, any future date, any CVC. The hold is
          released after the sit; it&apos;s only kept if you cancel inside 24 hours.
        </footer>
      </div>
    </div>
  );
}
