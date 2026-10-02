// Shared Stripe utility (Lovable built-in payments). All Stripe traffic is routed through
// the connector gateway, which attaches the real secret key — the env vars here are
// opaque gateway connection identifiers, never raw Stripe secrets.
//
// Night Owl uses Stripe for one thing: the "date night hold". A $20 manual-capture
// PaymentIntent is authorized when a parent books, cancelled (released) after the sit,
// and captured (kept) only when they cancel inside 24 hours. Test mode only.
import Stripe from "stripe";
import { HOLD_AMOUNT_CENTS } from "@/lib/money";

const getEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

export type StripeEnv = "sandbox" | "live";

const GATEWAY_STRIPE_BASE = "https://connector-gateway.lovable.dev/stripe";

export function getConnectionApiKey(env: StripeEnv): string {
  return env === "sandbox" ? getEnv("STRIPE_SANDBOX_API_KEY") : getEnv("STRIPE_LIVE_API_KEY");
}

// Routes api.stripe.com requests through the connector gateway.
// Only api.stripe.com is proxied (not files.stripe.com or connect.stripe.com).
export function createStripeClient(env: StripeEnv): Stripe {
  const connectionApiKey = getConnectionApiKey(env);
  const lovableApiKey = getEnv("LOVABLE_API_KEY");

  return new Stripe(connectionApiKey, {
    // Pin the wire API version explicitly so request/response shapes (e.g.
    // period fields on subscription items, Checkout Session ui_mode enum)
    // don't silently change if a future SDK bump lands a new default or
    // if the installed `stripe` package resolves to a different major.
    // The surrounding knowledge files assume dahlia semantics.
    apiVersion: "2026-03-25.dahlia",
    httpClient: Stripe.createFetchHttpClient((input, init) => {
      const stripeUrl = input instanceof Request ? input.url : input.toString();
      const gatewayUrl = stripeUrl.replace("https://api.stripe.com", GATEWAY_STRIPE_BASE);
      return fetch(gatewayUrl, {
        ...init,
        headers: {
          ...Object.fromEntries(
            new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).entries(),
          ),
          "X-Connection-Api-Key": connectionApiKey,
          "Lovable-API-Key": lovableApiKey,
        },
      });
    }),
  });
}

export function getStripeErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const stripeError = error as {
      message?: string;
      type?: string;
      code?: string;
      decline_code?: string;
      param?: string;
      requestId?: string;
      raw?: {
        message?: string;
        type?: string;
        code?: string;
        decline_code?: string;
        param?: string;
        requestId?: string;
      };
    };

    const message = stripeError.raw?.message ?? stripeError.message;
    if (message) {
      const details = [
        stripeError.raw?.type ?? stripeError.type,
        stripeError.raw?.code ?? stripeError.code,
        stripeError.raw?.decline_code ?? stripeError.decline_code,
        stripeError.raw?.param ?? stripeError.param,
        stripeError.raw?.requestId ?? stripeError.requestId,
      ].filter(Boolean);
      return details.length ? `${message} (${details.join(", ")})` : message;
    }
  }

  return "Stripe request failed";
}

export async function verifyWebhook(req: Request, env: StripeEnv): Promise<{ type: string; data: { object: any } }> {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  const secret = env === "sandbox" ? getEnv("PAYMENTS_SANDBOX_WEBHOOK_SECRET") : getEnv("PAYMENTS_LIVE_WEBHOOK_SECRET");

  if (!signature || !body) {
    throw new Error("Missing signature or body");
  }

  // Parse signature header — collect all v1 values (multiple during secret rotation)
  let timestamp: string | undefined;
  const v1Signatures: string[] = [];
  for (const part of signature.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = value;
    if (key === "v1" && value) v1Signatures.push(value);
  }

  if (!timestamp || v1Signatures.length === 0) {
    throw new Error("Invalid signature format");
  }

  // Check timestamp freshness (5 minute tolerance)
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) {
    throw new Error("Webhook timestamp too old");
  }

  // Compute expected signature: HMAC-SHA256(secret, "timestamp.body")
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  const expected = Buffer.from(new Uint8Array(signed)).toString("hex");

  if (!v1Signatures.includes(expected)) {
    throw new Error("Invalid webhook signature");
  }

  return JSON.parse(body);
}

// ---------------------------------------------------------------------------
// Night Owl hold helpers. Always the test environment: Robin's holds never go live.
// ---------------------------------------------------------------------------

export const HOLD_ENV: StripeEnv = "sandbox";

export function stripeConfigured(): boolean {
  return Boolean(process.env["STRIPE_SANDBOX_API_KEY"] && process.env["LOVABLE_API_KEY"]);
}

function holds(): Stripe {
  return createStripeClient(HOLD_ENV);
}

export async function ensureCustomer(family: {
  id: string;
  parent_name: string;
  email: string;
  phone: string;
  family_name: string;
  stripe_customer_id: string | null;
}): Promise<string> {
  const stripe = holds();
  if (family.stripe_customer_id) {
    try {
      const existing = await stripe.customers.retrieve(family.stripe_customer_id);
      if (!("deleted" in existing && existing.deleted)) return existing.id;
    } catch {
      /* fall through and recreate */
    }
  }
  // Stripe Search isn't available on every account region, so match by email + metadata instead.
  const byEmail = await stripe.customers.list({ email: family.email, limit: 20 });
  const matched = byEmail.data.find((c) => c.metadata?.["family_id"] === family.id) ?? byEmail.data[0];
  if (matched) {
    if (matched.metadata?.["family_id"] !== family.id) {
      await stripe.customers.update(matched.id, { metadata: { ...matched.metadata, family_id: family.id, app: "night-owl-sitting" } });
    }
    return matched.id;
  }
  const customer = await stripe.customers.create(
    {
      name: `${family.parent_name} (${family.family_name} family)`,
      email: family.email,
      phone: family.phone,
      metadata: { family_id: family.id, app: "night-owl-sitting" },
    },
    { idempotencyKey: `customer-${family.id}` },
  );
  return customer.id;
}

export async function defaultCardOnFile(customerId: string): Promise<Stripe.PaymentMethod | null> {
  const stripe = holds();
  const customer = await stripe.customers.retrieve(customerId);
  const preferred =
    !("deleted" in customer && customer.deleted) && customer.invoice_settings?.default_payment_method
      ? typeof customer.invoice_settings.default_payment_method === "string"
        ? customer.invoice_settings.default_payment_method
        : customer.invoice_settings.default_payment_method.id
      : null;
  if (preferred) {
    try {
      return await stripe.paymentMethods.retrieve(preferred);
    } catch {
      /* fall back to listing */
    }
  }
  const list = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
  return list.data[0] ?? null;
}

/** Embedded Checkout that authorizes the $20 hold and saves the card for one-tap next time. */
export async function createHoldCheckout(args: {
  customerId: string;
  familyId: string;
  eveningId: string;
  eveningLabel: string;
  rateCents: number;
  source: string;
  requestId?: string | null | undefined;
  offerId?: string | null | undefined;
  refillOfBookingId?: string | null | undefined;
  linkToken?: string | null | undefined;
}): Promise<Stripe.Checkout.Session> {
  const stripe = holds();
  return stripe.checkout.sessions.create({
    mode: "payment",
    ui_mode: "embedded_page",
    // The app navigates itself on completion (onComplete) so the flow never leaves the page.
    redirect_on_completion: "never",
    customer: args.customerId,
    customer_update: { name: "auto", address: "auto" },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: HOLD_AMOUNT_CENTS,
          product_data: {
            name: "Date night hold — released after the sit",
            description: `${args.eveningLabel} Central · keeps your spot with Robin`,
          },
        },
      },
    ],
    payment_intent_data: {
      capture_method: "manual",
      setup_future_usage: "off_session",
      description: `Night Owl hold · ${args.eveningLabel}`,
      metadata: { family_id: args.familyId, evening_id: args.eveningId, source: args.source },
    },
    payment_method_types: ["card"],
    submit_type: "book",
    custom_text: {
      submit: { message: "$20 hold, released after the sit, keeps your spot." },
    },
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    metadata: {
      family_id: args.familyId,
      evening_id: args.eveningId,
      rate_cents: String(args.rateCents),
      source: args.source,
      request_id: args.requestId ?? "",
      offer_id: args.offerId ?? "",
      refill_of_booking_id: args.refillOfBookingId ?? "",
      link_token: args.linkToken ?? "",
    },
  });
}

export async function retrieveCheckout(sessionId: string): Promise<Stripe.Checkout.Session> {
  return holds().checkout.sessions.retrieve(sessionId, { expand: ["payment_intent", "payment_intent.payment_method"] });
}

/** One-tap hold for a family whose card is already on file. */
export async function placeOffSessionHold(args: {
  customerId: string;
  paymentMethodId: string;
  familyId: string;
  eveningId: string;
  eveningLabel: string;
  source: string;
  idempotencyKey: string;
}): Promise<Stripe.PaymentIntent> {
  return holds().paymentIntents.create(
    {
      amount: HOLD_AMOUNT_CENTS,
      currency: "usd",
      customer: args.customerId,
      payment_method: args.paymentMethodId,
      off_session: true,
      confirm: true,
      capture_method: "manual",
      description: `Night Owl hold · ${args.eveningLabel}`,
      metadata: { family_id: args.familyId, evening_id: args.eveningId, source: args.source },
    },
    { idempotencyKey: args.idempotencyKey },
  );
}

/** Release the hold (after the sit or an early cancellation). Safe to call twice. */
export async function releaseHold(paymentIntentId: string): Promise<void> {
  if (!paymentIntentId.startsWith("pi_") || paymentIntentId.startsWith("pi_demo")) return;
  try {
    await holds().paymentIntents.cancel(paymentIntentId, { cancellation_reason: "requested_by_customer" });
  } catch (err) {
    // Already cancelled or captured — nothing left to release.
    console.warn(`[stripe] release skipped for ${paymentIntentId}: ${getStripeErrorMessage(err)}`);
  }
}

/** Keep the hold (late cancellation inside 24 hours). */
export async function keepHold(paymentIntentId: string): Promise<void> {
  if (!paymentIntentId.startsWith("pi_") || paymentIntentId.startsWith("pi_demo")) return;
  try {
    await holds().paymentIntents.capture(paymentIntentId, { amount_to_capture: HOLD_AMOUNT_CENTS });
  } catch (err) {
    console.warn(`[stripe] capture failed for ${paymentIntentId}: ${getStripeErrorMessage(err)}`);
  }
}

/** Test-mode helper: attach a Stripe test card to a customer so one-tap holds work in the demo. */
export async function attachTestCard(customerId: string, testPaymentMethod = "pm_card_visa"): Promise<Stripe.PaymentMethod> {
  const stripe = holds();
  const pm = await stripe.paymentMethods.attach(testPaymentMethod, { customer: customerId });
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pm.id } });
  return pm;
}
