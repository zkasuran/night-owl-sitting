// Public server functions for parents. Server modules are loaded inside handlers so
// nothing server-only reaches the browser bundle.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { EveningView, PublicFamily, StartBookingResult, BookingDetail, BookingLinkView, OfferView } from "@/lib/night-owl.server";
import type { InboundReply } from "@/lib/ai.server";
import { weekendHeading, weekendKeyFor } from "@/lib/time";

export type Fail = { ok: false; error: string; code: string };
export type Ok<T> = { ok: true } & T;
export type Result<T> = Ok<T> | Fail;

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const value = await fn();
    return { ok: true, ...(value as object) } as Ok<T>;
  } catch (err) {
    const { NightOwlError } = await import("@/lib/night-owl.server");
    if (err instanceof NightOwlError) return { ok: false, error: err.message, code: err.code };
    console.error(err);
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong.", code: "unknown" };
  }
}

/** Resolve the public origin for links in emails and Stripe return URLs. */
async function resolveOrigin(clientOrigin?: string | null): Promise<string> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { rememberOrigin } = await import("@/lib/night-owl.server");
  let fromRequest = "";
  try {
    const req = getRequest();
    const url = new URL(req.url);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
    const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
    fromRequest = `${proto}://${host}`;
  } catch {
    fromRequest = "";
  }
  let chosen = fromRequest;
  if (clientOrigin) {
    try {
      const u = new URL(clientOrigin);
      const ok =
        (u.protocol === "https:" || u.protocol === "http:") &&
        (u.hostname.endsWith(".lovable.app") ||
          u.hostname.endsWith(".lovableproject.com") ||
          u.hostname === "localhost" ||
          u.hostname === new URL(fromRequest || "http://localhost").hostname);
      if (ok) chosen = u.origin;
    } catch {
      /* ignore bad origin */
    }
  }
  if (!chosen) chosen = "http://localhost:8080";
  rememberOrigin(chosen);
  return chosen;
}

export type WeekendGroup = { key: string; heading: string; evenings: EveningView[] };

export type FrontDoor = {
  families: PublicFamily[];
  weekends: WeekendGroup[];
  paymentsReady: boolean;
  now: string;
};

export const getFrontDoor = createServerFn({ method: "GET" }).handler(async (): Promise<FrontDoor> => {
  const m = await import("@/lib/night-owl.server");
  const { stripeConfigured } = await import("@/lib/stripe.server");
  const [families, evenings] = await Promise.all([m.listFamilies(), m.listUpcomingEvenings(21)]);
  const groups = new Map<string, EveningView[]>();
  for (const e of evenings) {
    const key = weekendKeyFor(e.starts_at);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const weekends: WeekendGroup[] = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, evs]) => ({ key, heading: weekendHeading(key), evenings: evs }));
  return {
    families: families.map(m.toPublicFamily),
    weekends,
    paymentsReady: stripeConfigured(),
    now: new Date().toISOString(),
  };
});

const confirmSchema = z.object({
  familyId: z.string().uuid(),
  eveningId: z.string().uuid(),
  origin: z.string().optional(),
});

export const confirmEvening = createServerFn({ method: "POST" })
  .inputValidator((d) => confirmSchema.parse(d))
  .handler(async ({ data }): Promise<Result<StartBookingResult>> =>
    run(async () => {
      const m = await import("@/lib/night-owl.server");
      const origin = await resolveOrigin(data.origin);
      return m.startBooking({ familyId: data.familyId, eveningId: data.eveningId, source: "web", origin });
    }),
  );

export const finishCheckout = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ sessionId: z.string().min(1), origin: z.string().optional() }).parse(d))
  .handler(async ({ data }): Promise<Result<{ bookingId?: string; failed?: string }>> =>
    run(async () => {
      const m = await import("@/lib/night-owl.server");
      const origin = await resolveOrigin(data.origin);
      return m.completeCheckout(data.sessionId, origin);
    }),
  );

/** Parent closed the embedded checkout: expire the Stripe session and reopen the evening. */
export const abandonCheckout = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ sessionId: z.string().min(1), eveningId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<Result<{ done: true }>> =>
    run(async () => {
      const m = await import("@/lib/night-owl.server");
      await m.abandonCheckout(data.sessionId, data.eveningId);
      return { done: true as const };
    }),
  );

export const getBooking = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<Result<BookingDetail>> =>
    run(async () => {
      const m = await import("@/lib/night-owl.server");
      return m.getBookingDetail(data.bookingId);
    }),
  );

export const cancelBooking = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ bookingId: z.string().uuid(), origin: z.string().optional() }).parse(d))
  .handler(async ({ data }): Promise<Result<{ late: boolean; offeredTo: string | null }>> =>
    run(async () => {
      const m = await import("@/lib/night-owl.server");
      const origin = await resolveOrigin(data.origin);
      return m.cancelBooking(data.bookingId, origin);
    }),
  );

const askSchema = z.object({
  message: z.string().trim().min(2).max(1200),
  senderName: z.string().trim().max(80).optional().nullable(),
  senderPhone: z.string().trim().max(32).optional().nullable(),
  channel: z.enum(["inbound", "web"]).default("inbound"),
  familyId: z.string().uuid().optional().nullable(),
});

export const askRobin = createServerFn({ method: "POST" })
  .inputValidator((d) => askSchema.parse(d))
  .handler(async ({ data }): Promise<Result<InboundReply>> =>
    run(async () => {
      const ai = await import("@/lib/ai.server");
      return ai.answerInbound(data);
    }),
  );

export const getBookingLink = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<Result<BookingLinkView>> =>
    run(async () => {
      const m = await import("@/lib/night-owl.server");
      return m.getBookingLink(data.token);
    }),
  );

export const bookViaLink = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().uuid(), origin: z.string().optional() }).parse(d))
  .handler(async ({ data }): Promise<Result<StartBookingResult>> =>
    run(async () => {
      const m = await import("@/lib/night-owl.server");
      const origin = await resolveOrigin(data.origin);
      return m.bookViaLink(data.token, origin);
    }),
  );

export const getOffer = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<Result<OfferView>> =>
    run(async () => {
      const m = await import("@/lib/night-owl.server");
      return m.getOfferByToken(data.token);
    }),
  );

export const claimOffer = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().uuid(), origin: z.string().optional() }).parse(d))
  .handler(async ({ data }): Promise<Result<StartBookingResult>> =>
    run(async () => {
      const m = await import("@/lib/night-owl.server");
      const origin = await resolveOrigin(data.origin);
      return m.claimOffer(data.token, origin);
    }),
  );

export const declineOffer = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().uuid(), origin: z.string().optional() }).parse(d))
  .handler(async ({ data }): Promise<Result<{ done: true }>> =>
    run(async () => {
      const m = await import("@/lib/night-owl.server");
      await resolveOrigin(data.origin);
      await m.declineOffer(data.token);
      return { done: true as const };
    }),
  );

export const joinBackupList = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        familyId: z.string().uuid(),
        weekendStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        nights: z.array(z.enum(["fri", "sat"])).min(1),
        note: z.string().trim().max(240).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result<{ id: string; weekendStart: string; nights: string[] }>> =>
    run(async () => {
      const m = await import("@/lib/night-owl.server");
      const row = await m.joinBackupList(data);
      return { id: row.id, weekendStart: row.weekend_start, nights: row.nights };
    }),
  );
