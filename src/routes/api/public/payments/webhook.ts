// Stripe webhook: keeps hold state honest even when the browser never finished the flow.
// Security comes from the Stripe signature on every request; this route is intentionally public.
import { createFileRoute } from "@tanstack/react-router";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

async function handleEvent(event: { type: string; data: { object: any } }, env: StripeEnv) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin;
  const obj = event.data.object;

  switch (event.type) {
    case "checkout.session.completed": {
      // The parent paid but may have closed the tab before /booking/return ran.
      if (env !== "sandbox") return;
      const { completeCheckout, rememberedOrigin } = await import("@/lib/night-owl.server");
      await completeCheckout(obj.id, rememberedOrigin());
      return;
    }
    case "checkout.session.expired": {
      const eveningId = obj.metadata?.evening_id;
      if (!eveningId) return;
      const { data: booked } = await db.from("bookings").select("id").eq("stripe_checkout_session_id", obj.id).maybeSingle();
      if (booked) return;
      await db
        .from("evenings")
        .update({ status: "open", held_until: null, held_for_family_id: null })
        .eq("id", eveningId)
        .eq("status", "held");
      return;
    }
    case "payment_intent.canceled": {
      await db
        .from("bookings")
        .update({ hold_status: "released" })
        .eq("stripe_payment_intent_id", obj.id)
        .eq("hold_status", "held");
      return;
    }
    case "payment_intent.succeeded": {
      // A captured hold means it was kept (late cancellation).
      if (obj.capture_method === "manual") {
        await db
          .from("bookings")
          .update({ hold_status: "kept" })
          .eq("stripe_payment_intent_id", obj.id)
          .eq("hold_status", "held");
      }
      return;
    }
    default:
      console.log("[stripe webhook] unhandled:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("Webhook received with invalid or missing env query parameter:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        const env: StripeEnv = rawEnv;
        try {
          const event = await verifyWebhook(request, env);
          await handleEvent(event, env);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
