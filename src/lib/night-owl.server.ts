// Domain logic for Night Owl Sitting. Server-only: runs with the admin client so the
// public booking flow never exposes family details, and every state change is validated
// here (an evening that isn't open can never be booked).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { HOLD_AMOUNT_CENTS } from "@/lib/money";
import {
  centralDateKey,
  centralWallTimeToUtc,
  eveningLabel,
  hoursBetween,
  isWithinHours,
  nightKey,
  weekendKeyFor,
} from "@/lib/time";
import {
  backupOfferDraft,
  cancellationDraft,
  confirmationDraft,
  holdReleasedDraft,
  reminderDraft,
  sendEmail,
} from "@/lib/emails.server";
import {
  createHoldCheckout,
  defaultCardOnFile,
  ensureCustomer,
  getStripeErrorMessage,
  keepHold,
  placeOffSessionHold,
  releaseHold,
  retrieveCheckout,
  stripeConfigured,
} from "@/lib/stripe.server";

export type FamilyRow = Database["public"]["Tables"]["families"]["Row"];
export type EveningRow = Database["public"]["Tables"]["evenings"]["Row"];
export type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];
export type BackupRequestRow = Database["public"]["Tables"]["backup_requests"]["Row"];
export type BackupOfferRow = Database["public"]["Tables"]["backup_offers"]["Row"];
export type BookingSource = Database["public"]["Enums"]["booking_source"];

const CHECKOUT_HOLD_MINUTES = 30;
const OFFER_WINDOW_MINUTES = 30;
const db = supabaseAdmin;

export class NightOwlError extends Error {
  constructor(
    message: string,
    public code:
      | "not_open"
      | "not_found"
      | "expired"
      | "already_used"
      | "no_card"
      | "payments_unavailable"
      | "invalid" = "invalid",
  ) {
    super(message);
  }
}

// ---------- Reads ----------

export type PublicFamily = {
  id: string;
  familyName: string;
  parentFirstName: string;
  kidsSummary: string;
  rateCents: number;
  cardOnFile: boolean;
  cardBrand: string | null;
  cardLast4: string | null;
};

export function toPublicFamily(f: FamilyRow): PublicFamily {
  return {
    id: f.id,
    familyName: f.family_name,
    parentFirstName: f.parent_name.split(" ")[0] ?? f.parent_name,
    kidsSummary: f.kids_summary,
    rateCents: f.default_rate_cents,
    cardOnFile: f.card_on_file,
    cardBrand: f.card_brand,
    cardLast4: f.card_last4,
  };
}

export async function listFamilies(): Promise<FamilyRow[]> {
  const { data, error } = await db.from("families").select("*").order("family_name");
  if (error) throw new Error(error.message);
  return data;
}

export async function getFamily(id: string): Promise<FamilyRow> {
  const { data } = await db.from("families").select("*").eq("id", id).maybeSingle();
  if (!data) throw new NightOwlError("We couldn't find that family.", "not_found");
  return data;
}

export async function getEvening(id: string): Promise<EveningRow> {
  const { data } = await db.from("evenings").select("*").eq("id", id).maybeSingle();
  if (!data) throw new NightOwlError("That evening isn't on Robin's calendar.", "not_found");
  return data;
}

export type EveningView = EveningRow & { bookedFamilyName: string | null };

/** Upcoming evenings (from now, next N days) with housekeeping applied first. */
export async function listUpcomingEvenings(days = 21): Promise<EveningView[]> {
  await housekeeping();
  const from = new Date();
  const to = new Date(from.getTime() + days * 86_400_000);
  const { data, error } = await db
    .from("evenings")
    .select("*")
    .gte("ends_at", from.toISOString())
    .lte("starts_at", to.toISOString())
    .order("starts_at");
  if (error) throw new Error(error.message);
  const ids = data.map((e) => e.id);
  const { data: bookings } = ids.length
    ? await db
        .from("bookings")
        .select("evening_id, status, families(family_name)")
        .in("evening_id", ids)
        .eq("status", "confirmed")
    : { data: [] as { evening_id: string; status: string; families: { family_name: string } | null }[] };
  const byEvening = new Map<string, string>();
  for (const b of bookings ?? []) {
    const fam = (b as { families: { family_name: string } | null }).families;
    if (fam) byEvening.set(b.evening_id, fam.family_name);
  }
  return data.map((e) => ({ ...e, bookedFamilyName: byEvening.get(e.id) ?? null }));
}

// ---------- Housekeeping (lazy, idempotent) ----------

/** Expire stale checkout holds and backup offers, complete finished sits, roll availability. */
export async function housekeeping(): Promise<void> {
  const nowIso = new Date().toISOString();
  try {
    await expireOffers(nowIso);
    await releaseStaleCheckoutHolds(nowIso);
    await completeFinishedSits(nowIso);
    await db.rpc("ensure_upcoming_evenings", { _weeks: 3 });
  } catch (err) {
    console.error("[night-owl] housekeeping:", err);
  }
}

async function releaseStaleCheckoutHolds(nowIso: string) {
  const { data: stale } = await db
    .from("evenings")
    .select("id")
    .eq("status", "held")
    .lt("held_until", nowIso);
  for (const e of stale ?? []) {
    const { data: pending } = await db
      .from("backup_offers")
      .select("id")
      .eq("evening_id", e.id)
      .eq("status", "pending")
      .limit(1);
    if (pending && pending.length) continue; // handled by expireOffers
    await db
      .from("evenings")
      .update({ status: "open", held_until: null, held_for_family_id: null })
      .eq("id", e.id)
      .eq("status", "held");
  }
}

async function completeFinishedSits(nowIso: string) {
  const { data: done } = await db
    .from("bookings")
    .select("*, evenings!inner(id, ends_at, starts_at)")
    .eq("status", "confirmed")
    .lt("evenings.ends_at", nowIso);
  for (const b of done ?? []) {
    if (b.stripe_payment_intent_id && b.hold_status === "held") {
      await releaseHold(b.stripe_payment_intent_id);
    }
    await db
      .from("bookings")
      .update({ status: "completed", hold_status: b.hold_status === "held" ? "released" : b.hold_status })
      .eq("id", b.id);
    if (b.hold_status === "held") {
      const [family, evening] = await Promise.all([getFamily(b.family_id), getEvening(b.evening_id)]);
      await sendEmail(holdReleasedDraft({ family, evening, booking: b }));
    }
  }
}

// ---------- Booking ----------

export type StartBookingResult =
  | {
      kind: "checkout";
      clientSecret: string;
      sessionId: string;
      eveningId: string;
      familyId: string;
      eveningLabel: string;
      holdUntil: string;
    }
  | { kind: "booked"; bookingId: string };

/**
 * Parent confirmed an evening. Locks the evening, then either places a one-tap hold on the
 * card on file or sends them to Stripe Checkout to add a card while the evening stays held.
 */
export async function startBooking(args: {
  familyId: string;
  eveningId: string;
  source: BookingSource;
  origin: string;
  requestId?: string | null | undefined;
  linkToken?: string | null | undefined;
  offerId?: string | null | undefined;
  refillOfBookingId?: string | null | undefined;
}): Promise<StartBookingResult> {
  const [family, evening] = await Promise.all([getFamily(args.familyId), getEvening(args.eveningId)]);
  assertBookable(evening, family.id);

  if (!stripeConfigured()) {
    throw new NightOwlError(
      "Card holds aren't switched on yet, so this night can't be locked in. Text Robin instead.",
      "payments_unavailable",
    );
  }

  const label = eveningLabel(evening.starts_at, evening.ends_at);
  const customerId = await ensureCustomer(family);
  if (customerId !== family.stripe_customer_id) {
    await db.from("families").update({ stripe_customer_id: customerId }).eq("id", family.id);
  }

  // Lock the evening for this family while the hold is placed.
  const heldUntil = new Date(Date.now() + CHECKOUT_HOLD_MINUTES * 60_000).toISOString();
  const { data: locked } = await db
    .from("evenings")
    .update({ status: "held", held_until: heldUntil, held_for_family_id: family.id })
    .eq("id", evening.id)
    .or(`status.eq.open,and(status.eq.held,held_for_family_id.eq.${family.id})`)
    .select("id")
    .maybeSingle();
  if (!locked) throw new NightOwlError("Someone just took that evening. Pick another.", "not_open");

  // Card on file → one-tap hold, no redirect.
  const card = await defaultCardOnFile(customerId);
  if (card) {
    try {
      const intent = await placeOffSessionHold({
        customerId,
        paymentMethodId: card.id,
        familyId: family.id,
        eveningId: evening.id,
        eveningLabel: label,
        source: args.source,
        idempotencyKey: `hold-${family.id}-${evening.id}-${Date.now()}`,
      });
      if (intent.status === "requires_capture" || intent.status === "succeeded") {
        const booking = await finalizeBooking({
          family,
          evening,
          rateCents: family.default_rate_cents,
          source: args.source,
          paymentIntentId: intent.id,
          checkoutSessionId: null,
          origin: args.origin,
          requestId: args.requestId,
          linkToken: args.linkToken,
          offerId: args.offerId,
          refillOfBookingId: args.refillOfBookingId,
          card: card.card ? { brand: card.card.brand, last4: card.card.last4 } : null,
        });
        return { kind: "booked", bookingId: booking.id };
      }
    } catch (err) {
      console.warn("[night-owl] off-session hold failed, falling back to checkout:", err);
    }
  }

  // No usable card → embedded checkout, rendered inside the app; the browser finishes the
  // booking via /booking/return once Stripe reports completion.
  let session;
  try {
    session = await createHoldCheckout({
      customerId,
      familyId: family.id,
      eveningId: evening.id,
      eveningLabel: label,
      rateCents: family.default_rate_cents,
      source: args.source,
      requestId: args.requestId,
      offerId: args.offerId,
      refillOfBookingId: args.refillOfBookingId,
      linkToken: args.linkToken,
    });
  } catch (err) {
    await db
      .from("evenings")
      .update({ status: "open", held_until: null, held_for_family_id: null })
      .eq("id", evening.id)
      .eq("status", "held")
      .eq("held_for_family_id", family.id);
    throw new NightOwlError(`The card hold couldn't be started: ${getStripeErrorMessage(err)}`, "payments_unavailable");
  }
  if (!session.client_secret) throw new Error("Stripe did not return a checkout secret.");
  const holdUntil = new Date(Date.now() + CHECKOUT_HOLD_MINUTES * 60_000).toISOString();
  await db.from("evenings").update({ held_until: holdUntil }).eq("id", evening.id);
  return {
    kind: "checkout",
    clientSecret: session.client_secret,
    sessionId: session.id,
    eveningId: evening.id,
    familyId: family.id,
    eveningLabel: label,
    holdUntil,
  };
}

/** Parent closed the embedded checkout without paying: reopen the evening right away. */
export async function abandonCheckout(sessionId: string, eveningId: string): Promise<void> {
  const { data: existing } = await db
    .from("bookings")
    .select("id")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();
  if (existing) return; // it actually completed
  try {
    const { createStripeClient, HOLD_ENV } = await import("@/lib/stripe.server");
    const session = await createStripeClient(HOLD_ENV).checkout.sessions.retrieve(sessionId);
    if (session.status === "complete") return;
    if (session.status === "open") await createStripeClient(HOLD_ENV).checkout.sessions.expire(sessionId);
  } catch (err) {
    console.warn("[night-owl] could not expire checkout session:", getStripeErrorMessage(err));
  }
  await db
    .from("evenings")
    .update({ status: "open", held_until: null, held_for_family_id: null })
    .eq("id", eveningId)
    .eq("status", "held");
}

function assertBookable(evening: EveningRow, familyId: string) {
  if (new Date(evening.starts_at).getTime() < Date.now()) {
    throw new NightOwlError("That evening has already started.", "not_open");
  }
  if (evening.status === "open") return;
  if (
    evening.status === "held" &&
    evening.held_for_family_id === familyId &&
    (!evening.held_until || new Date(evening.held_until).getTime() > Date.now())
  ) {
    return;
  }
  if (evening.status === "held" && evening.held_until && new Date(evening.held_until).getTime() <= Date.now()) {
    return; // stale hold — housekeeping will clear it; treat as open
  }
  throw new NightOwlError("That evening isn't open anymore.", "not_open");
}

/** Called from the Checkout return URL. Idempotent: re-running returns the same booking. */
export async function completeCheckout(sessionId: string, origin: string): Promise<{ bookingId: string } | { failed: string }> {
  const { data: existing } = await db
    .from("bookings")
    .select("id")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();
  if (existing) return { bookingId: existing.id };

  const session = await retrieveCheckout(sessionId);
  const intent = typeof session.payment_intent === "object" ? session.payment_intent : null;
  const authorized =
    session.status === "complete" && intent && (intent.status === "requires_capture" || intent.status === "succeeded");
  const meta: Record<string, string | undefined> = session.metadata ?? {};
  const metaFamilyId = meta["family_id"];
  const metaEveningId = meta["evening_id"];

  if (!authorized || !intent || !metaFamilyId || !metaEveningId) {
    // Leave the evening open again — nothing was booked.
    if (metaEveningId) {
      await db
        .from("evenings")
        .update({ status: "open", held_until: null, held_for_family_id: null })
        .eq("id", metaEveningId)
        .eq("status", "held");
    }
    return { failed: session.status === "expired" ? "That checkout expired, so the evening is open again." : "The card hold didn't go through, so the evening is still open." };
  }

  const [family, evening] = await Promise.all([getFamily(metaFamilyId), getEvening(metaEveningId)]);
  const pm = typeof intent.payment_method === "object" && intent.payment_method ? intent.payment_method : null;
  if (pm && family.stripe_customer_id) {
    // Remember this card so the next booking is one tap.
    try {
      const { createStripeClient, HOLD_ENV } = await import("@/lib/stripe.server");
      await createStripeClient(HOLD_ENV).customers.update(family.stripe_customer_id, {
        invoice_settings: { default_payment_method: pm.id },
      });
    } catch (err) {
      console.warn("[night-owl] could not set default card:", getStripeErrorMessage(err));
    }
  }
  const booking = await finalizeBooking({
    family,
    evening,
    rateCents: Number(meta["rate_cents"] || family.default_rate_cents),
    source: (meta["source"] as BookingSource) || "web",
    paymentIntentId: intent.id,
    checkoutSessionId: session.id,
    origin,
    requestId: meta["request_id"] || null,
    linkToken: meta["link_token"] || null,
    offerId: meta["offer_id"] || null,
    refillOfBookingId: meta["refill_of_booking_id"] || null,
    card: pm?.card ? { brand: pm.card.brand, last4: pm.card.last4 } : null,
  });
  return { bookingId: booking.id };
}

async function finalizeBooking(args: {
  family: FamilyRow;
  evening: EveningRow;
  rateCents: number;
  source: BookingSource;
  paymentIntentId: string;
  checkoutSessionId: string | null;
  origin: string;
  requestId?: string | null | undefined;
  linkToken?: string | null | undefined;
  offerId?: string | null | undefined;
  refillOfBookingId?: string | null | undefined;
  card?: { brand: string; last4: string } | null | undefined;
}): Promise<BookingRow> {
  const { family, evening } = args;

  // Flip the evening to booked — only from open, or from a hold that belongs to this family.
  const { data: booked } = await db
    .from("evenings")
    .update({ status: "booked", held_until: null, held_for_family_id: null })
    .eq("id", evening.id)
    .or(`status.eq.open,and(status.eq.held,held_for_family_id.eq.${family.id})`)
    .select("id")
    .maybeSingle();
  if (!booked) {
    // Two completions can race (return page + webhook, or a double mount). If the winner was
    // this same hold, hand back its booking instead of releasing a hold that is in use.
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: twin } = await db
        .from("bookings")
        .select("*")
        .eq("stripe_payment_intent_id", args.paymentIntentId)
        .maybeSingle();
      if (twin) return twin as BookingRow;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    await releaseHold(args.paymentIntentId);
    throw new NightOwlError("That evening was taken while the hold was placed. Your card was not charged.", "not_open");
  }

  const { data: booking, error } = await db
    .from("bookings")
    .insert({
      family_id: family.id,
      evening_id: evening.id,
      rate_cents: args.rateCents,
      hold_status: "held",
      hold_amount_cents: HOLD_AMOUNT_CENTS,
      status: "confirmed",
      source: args.source,
      stripe_payment_intent_id: args.paymentIntentId,
      stripe_checkout_session_id: args.checkoutSessionId,
      refill_of_booking_id: args.refillOfBookingId || null,
      confirmation_sent_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await db
    .from("families")
    .update({
      card_on_file: true,
      card_brand: args.card?.brand ?? family.card_brand,
      card_last4: args.card?.last4 ?? family.card_last4,
    })
    .eq("id", family.id);

  if (args.linkToken) {
    await db
      .from("booking_links")
      .update({ used_at: new Date().toISOString(), booking_id: booking.id })
      .eq("token", args.linkToken);
  }
  if (args.offerId) {
    const { data: offer } = await db
      .from("backup_offers")
      .update({ status: "claimed", resolved_at: new Date().toISOString(), booking_id: booking.id })
      .eq("id", args.offerId)
      .select("backup_request_id")
      .maybeSingle();
    if (offer) {
      await db.from("backup_requests").update({ status: "claimed" }).eq("id", offer.backup_request_id);
    }
  }

  const manageUrl = new URL(`/booking/${booking.id}`, args.origin).toString();
  await sendEmail(confirmationDraft({ family, evening, booking, manageUrl, refill: args.source === "backup" }));
  const reminderAt = centralWallTimeToUtc(centralDateKey(evening.starts_at), "08:00");
  if (reminderAt.getTime() > Date.now()) {
    await sendEmail(reminderDraft({ family, evening, booking, manageUrl, scheduledFor: reminderAt }));
  }
  return booking;
}

// ---------- Cancellation & backup refill ----------

export async function cancelBooking(bookingId: string, origin: string): Promise<{ late: boolean; offeredTo: string | null }> {
  const { data: booking } = await db.from("bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!booking) throw new NightOwlError("We couldn't find that booking.", "not_found");
  if (booking.status !== "confirmed") throw new NightOwlError("That booking is already closed.", "already_used");

  const [family, evening] = await Promise.all([getFamily(booking.family_id), getEvening(booking.evening_id)]);
  const late = isWithinHours(evening.starts_at, 24);

  if (booking.stripe_payment_intent_id && booking.hold_status === "held") {
    if (late) await keepHold(booking.stripe_payment_intent_id);
    else await releaseHold(booking.stripe_payment_intent_id);
  }

  await db
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      late_cancellation: late,
      hold_status: booking.hold_status === "held" ? (late ? "kept" : "released") : booking.hold_status,
    })
    .eq("id", booking.id);
  await db
    .from("evenings")
    .update({ status: "open", held_until: null, held_for_family_id: null })
    .eq("id", evening.id);

  await sendEmail(cancellationDraft({ family, evening, booking, late }));

  const offered = await offerToBackupList(evening.id, booking.id, origin);
  return { late, offeredTo: offered };
}

/** Offer a freed evening to the first matching family on the backup list. Returns family name or null. */
export async function offerToBackupList(eveningId: string, freedByBookingId: string | null, origin: string): Promise<string | null> {
  const evening = await getEvening(eveningId);
  if (evening.status !== "open" || new Date(evening.starts_at).getTime() < Date.now()) return null;

  const weekend = weekendKeyFor(evening.starts_at);
  const night = nightKey(evening.starts_at);
  const excluded = new Set<string>();
  if (freedByBookingId) {
    const { data: freed } = await db.from("bookings").select("family_id").eq("id", freedByBookingId).maybeSingle();
    if (freed) excluded.add(freed.family_id);
  }
  const { data: priorOffers } = await db.from("backup_offers").select("family_id").eq("evening_id", eveningId);
  for (const o of priorOffers ?? []) excluded.add(o.family_id);

  const { data: candidates } = await db
    .from("backup_requests")
    .select("*")
    .eq("weekend_start", weekend)
    .eq("status", "waiting")
    .contains("nights", [night])
    .order("created_at");
  const next = (candidates ?? []).find((c) => !excluded.has(c.family_id));
  if (!next) return null;

  const expiresAt = new Date(Date.now() + OFFER_WINDOW_MINUTES * 60_000);
  const { data: offer, error } = await db
    .from("backup_offers")
    .insert({
      backup_request_id: next.id,
      family_id: next.family_id,
      evening_id: eveningId,
      freed_by_booking_id: freedByBookingId,
      status: "pending",
      expires_at: expiresAt.toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await db.from("backup_requests").update({ status: "offered" }).eq("id", next.id);
  await db
    .from("evenings")
    .update({ status: "held", held_until: expiresAt.toISOString(), held_for_family_id: next.family_id })
    .eq("id", eveningId)
    .eq("status", "open");

  const family = await getFamily(next.family_id);
  const claimUrl = new URL(`/claim/${offer.claim_token}`, origin).toString();
  await sendEmail(backupOfferDraft({ family, evening, claimUrl, expiresAt, offerId: offer.id }));
  return family.family_name;
}

async function expireOffers(nowIso: string) {
  const { data: expired } = await db
    .from("backup_offers")
    .select("*")
    .eq("status", "pending")
    .lt("expires_at", nowIso);
  for (const offer of expired ?? []) {
    await db
      .from("backup_offers")
      .update({ status: "expired", resolved_at: nowIso })
      .eq("id", offer.id)
      .eq("status", "pending");
    await db.from("backup_requests").update({ status: "waiting" }).eq("id", offer.backup_request_id);
    await db
      .from("evenings")
      .update({ status: "open", held_until: null, held_for_family_id: null })
      .eq("id", offer.evening_id)
      .eq("status", "held");
    // Robin does nothing: the next family gets the offer automatically.
    await offerToBackupList(offer.evening_id, offer.freed_by_booking_id, offerOrigin());
  }
}

let cachedOrigin = "";
export function rememberOrigin(origin: string) {
  if (origin) cachedOrigin = origin;
}
/** Best-known public origin for links in emails when no request is in flight (webhooks, cron). */
export function rememberedOrigin(): string {
  return cachedOrigin || process.env["APP_ORIGIN"] || "https://project--b5928d3a-b2e7-4d8e-bce7-9c3b83a5d2b1.lovable.app";
}
function offerOrigin(): string {
  return rememberedOrigin();
}

export type OfferView = {
  offer: BackupOfferRow;
  family: PublicFamily;
  evening: EveningRow;
  state: "pending" | "claimed" | "expired" | "declined" | "superseded";
  minutesLeft: number;
};

export async function getOfferByToken(token: string): Promise<OfferView> {
  await housekeeping();
  const { data: offer } = await db.from("backup_offers").select("*").eq("claim_token", token).maybeSingle();
  if (!offer) throw new NightOwlError("That claim link isn't valid.", "not_found");
  const [family, evening] = await Promise.all([getFamily(offer.family_id), getEvening(offer.evening_id)]);
  const minutesLeft = Math.max(0, Math.round((new Date(offer.expires_at).getTime() - Date.now()) / 60_000));
  return { offer, family: toPublicFamily(family), evening, state: offer.status, minutesLeft };
}

export async function claimOffer(token: string, origin: string): Promise<StartBookingResult> {
  const view = await getOfferByToken(token);
  if (view.state !== "pending") {
    throw new NightOwlError(
      view.state === "claimed" ? "You already claimed this night." : "This offer has passed to the next family.",
      view.state === "claimed" ? "already_used" : "expired",
    );
  }
  return startBooking({
    familyId: view.family.id,
    eveningId: view.evening.id,
    source: "backup",
    origin,
    offerId: view.offer.id,
    refillOfBookingId: view.offer.freed_by_booking_id,
  });
}

export async function declineOffer(token: string): Promise<void> {
  const view = await getOfferByToken(token);
  if (view.state !== "pending") return;
  await db
    .from("backup_offers")
    .update({ status: "declined", resolved_at: new Date().toISOString() })
    .eq("id", view.offer.id);
  await db.from("backup_requests").update({ status: "waiting" }).eq("id", view.offer.backup_request_id);
  await db
    .from("evenings")
    .update({ status: "open", held_until: null, held_for_family_id: null })
    .eq("id", view.evening.id)
    .eq("status", "held");
  await offerToBackupList(view.evening.id, view.offer.freed_by_booking_id, offerOrigin());
}

// ---------- Backup list ----------

export async function joinBackupList(args: {
  familyId: string;
  weekendStart: string;
  nights: string[];
  note?: string | undefined;
}): Promise<BackupRequestRow> {
  const family = await getFamily(args.familyId);
  const nights = args.nights.filter((n) => n === "fri" || n === "sat");
  if (!nights.length) throw new NightOwlError("Pick at least one night.", "invalid");
  const { data, error } = await db
    .from("backup_requests")
    .upsert(
      {
        family_id: family.id,
        weekend_start: args.weekendStart,
        nights,
        note: args.note?.trim() ?? "",
        status: "waiting",
      },
      { onConflict: "family_id,weekend_start" },
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ---------- One-tap booking links ----------

export async function createBookingLinks(args: {
  familyId: string;
  eveningIds: string[];
  requestId: string | null;
  source: BookingSource;
}): Promise<{ token: string; eveningId: string }[]> {
  if (!args.eveningIds.length) return [];
  const { data, error } = await db
    .from("booking_links")
    .insert(
      args.eveningIds.map((eveningId) => ({
        family_id: args.familyId,
        evening_id: eveningId,
        request_id: args.requestId,
        source: args.source,
      })),
    )
    .select("token, evening_id");
  if (error) throw new Error(error.message);
  return data.map((d) => ({ token: d.token, eveningId: d.evening_id }));
}

export type BookingLinkView = {
  token: string;
  family: PublicFamily;
  evening: EveningRow;
  state: "ready" | "used" | "expired" | "gone";
  bookingId: string | null;
};

export async function getBookingLink(token: string): Promise<BookingLinkView> {
  await housekeeping();
  const { data: link } = await db.from("booking_links").select("*").eq("token", token).maybeSingle();
  if (!link) throw new NightOwlError("That booking link isn't valid.", "not_found");
  const [family, evening] = await Promise.all([getFamily(link.family_id), getEvening(link.evening_id)]);
  let state: BookingLinkView["state"] = "ready";
  if (link.used_at) state = "used";
  else if (new Date(link.expires_at).getTime() < Date.now()) state = "expired";
  else if (evening.status === "booked" || new Date(evening.starts_at).getTime() < Date.now()) state = "gone";
  return { token, family: toPublicFamily(family), evening, state, bookingId: link.booking_id };
}

export async function bookViaLink(token: string, origin: string): Promise<StartBookingResult> {
  const view = await getBookingLink(token);
  if (view.state === "used" && view.bookingId) return { kind: "booked", bookingId: view.bookingId };
  if (view.state !== "ready") {
    throw new NightOwlError(
      view.state === "gone" ? "That evening was just booked by another family." : "That link has expired.",
      view.state === "gone" ? "not_open" : "expired",
    );
  }
  const { data: link } = await db.from("booking_links").select("request_id").eq("token", token).single();
  return startBooking({
    familyId: view.family.id,
    eveningId: view.evening.id,
    source: "inbound",
    origin,
    requestId: link?.request_id ?? null,
    linkToken: token,
  });
}

// ---------- Booking detail (parent-facing) ----------

export type BookingDetail = {
  booking: BookingRow;
  family: PublicFamily;
  address: string;
  evening: EveningRow;
  hours: number;
  estimateCents: number;
  canCancel: boolean;
  lateIfCancelledNow: boolean;
};

export async function getBookingDetail(bookingId: string): Promise<BookingDetail> {
  await housekeeping();
  const { data: booking } = await db.from("bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!booking) throw new NightOwlError("We couldn't find that booking.", "not_found");
  const [family, evening] = await Promise.all([getFamily(booking.family_id), getEvening(booking.evening_id)]);
  const hours = hoursBetween(evening.starts_at, evening.ends_at);
  return {
    booking,
    family: toPublicFamily(family),
    address: family.address,
    evening,
    hours,
    estimateCents: Math.round(hours * booking.rate_cents),
    canCancel: booking.status === "confirmed" && new Date(evening.starts_at).getTime() > Date.now(),
    lateIfCancelledNow: isWithinHours(evening.starts_at, 24),
  };
}

// ---------- Weekend helpers for the UI ----------

export function upcomingWeekendKeys(count = 3): string[] {
  const keys: string[] = [];
  let cursor = new Date();
  for (let i = 0; i < count; i++) {
    const key = weekendKeyFor(cursor);
    keys.push(key);
    cursor = new Date(centralWallTimeToUtc(key, "12:00").getTime() + 7 * 86_400_000);
  }
  return keys;
}
