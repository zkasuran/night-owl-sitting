// Opens the embedded $20 hold checkout in-page and reopens the evening if the parent bails.
import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { abandonCheckout } from "@/lib/night-owl.functions";
import { HoldCheckout, type HoldCheckoutSession } from "@/components/night/HoldCheckout";

export function useHoldCheckout(onAbandon?: () => void) {
  const [session, setSession] = useState<HoldCheckoutSession | null>(null);
  const abandon = useServerFn(abandonCheckout);

  const open = useCallback((next: HoldCheckoutSession) => setSession(next), []);

  const close = useCallback(() => {
    if (session) {
      abandon({ data: { sessionId: session.sessionId, eveningId: session.eveningId } }).catch(() => {
        /* housekeeping clears stale holds within a few minutes anyway */
      });
      toast("No hold was placed. The evening is open again.", { description: "Pick it again whenever you're ready." });
    }
    setSession(null);
    onAbandon?.();
  }, [session, abandon, onAbandon]);

  const element = session ? <HoldCheckout session={session} onClose={close} /> : null;

  return { open, close, element, isOpen: session !== null };
}
