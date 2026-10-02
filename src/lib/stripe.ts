// Browser-side Stripe.js loader for the embedded hold checkout.
import { loadStripe, type Stripe } from "@stripe/stripe-js";

// Declared locally (duplicated with the server utility) so this client
// module has no cross-tree imports.
type StripeEnv = "sandbox" | "live";

const clientToken = import.meta.env["VITE_PAYMENTS_CLIENT_TOKEN"] as string | undefined;

// Derive environment from the token PREFIX, not its mere presence.
// Missing/unknown → throw; never silently route to 'live'.
function paymentsEnvironment(): StripeEnv {
  if (clientToken?.startsWith("pk_test_")) return "sandbox";
  if (clientToken?.startsWith("pk_live_")) return "live";
  throw new Error("Card holds aren't configured for this build. Complete payments setup in Lovable to enable checkout.");
}

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    paymentsEnvironment();
    stripePromise = loadStripe(clientToken as string);
  }
  return stripePromise;
}

export function getStripeEnvironment(): StripeEnv {
  return paymentsEnvironment();
}

export function paymentsInTestMode(): boolean {
  return Boolean(clientToken?.startsWith("pk_test_"));
}
