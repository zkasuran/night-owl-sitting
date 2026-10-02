// Robin's private dashboard. Every function requires a signed-in sitter.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { hoursBetween, weekendKeyFor, centralWallTimeToUtc } from "@/lib/time";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];
type Evening = Database["public"]["Tables"]["evenings"]["Row"];
type Family = Database["public"]["Tables"]["families"]["Row"];
type Request = Database["public"]["Tables"]["requests"]["Row"];
type Email = Database["public"]["Tables"]["emails"]["Row"];
type BackupRequest = Database["public"]["Tables"]["backup_requests"]["Row"];
type BackupOffer = Database["public"]["Tables"]["backup_offers"]["Row"];

export type SitterAccess = { role: "sitter" | "none"; email: string | null; claimed: boolean };

/** First signed-in account becomes the sitter. Anyone after that is politely turned away. */
export const claimSitterAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SitterAccess> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = (context.claims as { email?: string }).email ?? null;
    const { data: mine } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (mine?.some((r) => r.role === "sitter")) return { role: "sitter", email, claimed: false };
    const { count } = await supabaseAdmin.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "sitter");
    if ((count ?? 0) > 0) return { role: "none", email, claimed: false };
    const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: context.userId, role: "sitter" });
    if (error) throw new Error(error.message);
    return { role: "sitter", email, claimed: true };
  });

async function assertSitter(supabase: { from: (t: "user_roles") => any }, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!data?.some((r: { role: string }) => r.role === "sitter")) {
    throw new Error("This dashboard belongs to Robin.");
  }
}

export type TimelineSit = {
  booking: Booking;
  evening: Evening;
  family: Family;
  hours: number;
  totalCents: number;
};

export type Dashboard = {
  impact: {
    requestsAnswered: number;
    nightsFilled: number;
    lateCancellationsCovered: number;
    earningsProtectedCents: number;
  };
  weekend: { key: string; sits: TimelineSit[] };
  upcoming: TimelineSit[];
  weekEarningsCents: number;
  weekHours: number;
  weekLabel: string;
  backup: { request: BackupRequest; family: Family; offer: BackupOffer | null; evening: Evening | null }[];
  refills: { offer: BackupOffer; family: Family; evening: Evening; freedByFamily: Family | null }[];
  requests: (Request & { family: Family | null })[];
  emails: Email[];
  families: Family[];
  cancelled: TimelineSit[];
  now: string;
};

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Dashboard> => {
    await assertSitter(context.supabase, context.userId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { housekeeping } = await import("@/lib/night-owl.server");
    await housekeeping();

    const [fam, ev, bk, rq, em, br, bo] = await Promise.all([
      db.from("families").select("*").order("family_name"),
      db.from("evenings").select("*").order("starts_at"),
      db.from("bookings").select("*").order("created_at", { ascending: false }),
      db.from("requests").select("*").order("created_at", { ascending: false }).limit(12),
      db.from("emails").select("*").order("created_at", { ascending: false }).limit(20),
      db.from("backup_requests").select("*").order("created_at"),
      db.from("backup_offers").select("*").order("offered_at", { ascending: false }),
    ]);
    const families = fam.data ?? [];
    const evenings = ev.data ?? [];
    const bookings = bk.data ?? [];
    const famById = new Map(families.map((f) => [f.id, f]));
    const evById = new Map(evenings.map((e) => [e.id, e]));

    const sit = (b: Booking): TimelineSit | null => {
      const evening = evById.get(b.evening_id);
      const family = famById.get(b.family_id);
      if (!evening || !family) return null;
      const hours = hoursBetween(evening.starts_at, evening.ends_at);
      return { booking: b, evening, family, hours, totalCents: Math.round(hours * b.rate_cents) };
    };

    const live = bookings.filter((b) => b.status === "confirmed" || b.status === "completed");
    const refillBookings = live.filter((b) => b.source === "backup" && b.refill_of_booking_id);
    const keptHolds = bookings.filter((b) => b.hold_status === "kept");
    const earningsProtectedCents =
      refillBookings.reduce((sum, b) => sum + (sit(b)?.totalCents ?? 0), 0) +
      keptHolds.reduce((sum, b) => sum + b.hold_amount_cents, 0);
    const requestsAnswered = (rq.data ?? []).length
      ? (await db.from("requests").select("id", { count: "exact", head: true }).eq("answered_while_unavailable", true)).count ?? 0
      : 0;

    const now = new Date();
    const weekendKey = weekendKeyFor(now);
    const weekendStart = centralWallTimeToUtc(weekendKey, "00:00");
    const weekendEnd = new Date(weekendStart.getTime() + 3 * 86_400_000);
    const weekendSits = live
      .map(sit)
      .filter((s): s is TimelineSit => Boolean(s))
      .filter((s) => {
        const t = new Date(s.evening.starts_at).getTime();
        return t >= weekendStart.getTime() && t < weekendEnd.getTime();
      })
      .sort((a, b) => a.evening.starts_at.localeCompare(b.evening.starts_at));

    const upcoming = live
      .map(sit)
      .filter((s): s is TimelineSit => Boolean(s))
      .filter((s) => new Date(s.evening.ends_at).getTime() >= now.getTime())
      .sort((a, b) => a.evening.starts_at.localeCompare(b.evening.starts_at));

    // "The week" = Monday through Sunday, Central, containing today.
    const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(now);
    const todayUtc = centralWallTimeToUtc(todayKey, "00:00");
    const jsDow = new Date(todayKey + "T12:00:00Z").getUTCDay(); // 0 Sun..6 Sat
    const mondayOffset = (jsDow + 6) % 7;
    const weekStart = new Date(todayUtc.getTime() - mondayOffset * 86_400_000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
    const weekSits = live
      .map(sit)
      .filter((s): s is TimelineSit => Boolean(s))
      .filter((s) => {
        const t = new Date(s.evening.starts_at).getTime();
        return t >= weekStart.getTime() && t < weekEnd.getTime();
      });
    const weekEarningsCents = weekSits.reduce((sum, s) => sum + s.totalCents, 0);
    const weekHours = weekSits.reduce((sum, s) => sum + s.hours, 0);
    const weekLabel = `${new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" }).format(weekStart)} – ${new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" }).format(new Date(weekEnd.getTime() - 1))}`;

    const offers = bo.data ?? [];
    const backup = (br.data ?? [])
      .filter((r) => new Date(centralWallTimeToUtc(r.weekend_start, "23:59")).getTime() + 2 * 86_400_000 >= now.getTime())
      .map((r) => {
        const offer = offers.find((o) => o.backup_request_id === r.id && (o.status === "pending" || o.status === "claimed")) ?? null;
        return {
          request: r,
          family: famById.get(r.family_id)!,
          offer,
          evening: offer ? evById.get(offer.evening_id) ?? null : null,
        };
      })
      .filter((x) => Boolean(x.family));

    const refills = offers
      .slice(0, 6)
      .map((o) => {
        const freed = o.freed_by_booking_id ? bookings.find((b) => b.id === o.freed_by_booking_id) : null;
        return {
          offer: o,
          family: famById.get(o.family_id)!,
          evening: evById.get(o.evening_id)!,
          freedByFamily: freed ? famById.get(freed.family_id) ?? null : null,
        };
      })
      .filter((x) => x.family && x.evening);

    const cancelled = bookings
      .filter((b) => b.status === "cancelled")
      .slice(0, 5)
      .map(sit)
      .filter((s): s is TimelineSit => Boolean(s));

    return {
      impact: {
        requestsAnswered,
        nightsFilled: live.length,
        lateCancellationsCovered: refillBookings.length,
        earningsProtectedCents,
      },
      weekend: { key: weekendKey, sits: weekendSits },
      upcoming,
      weekEarningsCents,
      weekHours,
      weekLabel,
      backup,
      refills,
      requests: (rq.data ?? []).map((r) => ({ ...r, family: r.family_id ? famById.get(r.family_id) ?? null : null })),
      emails: em.data ?? [],
      families,
      cancelled,
      now: now.toISOString(),
    };
  });

export const sitterCancelBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ bookingId: z.string().uuid(), origin: z.string().optional() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertSitter(context.supabase, context.userId);
    const m = await import("@/lib/night-owl.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    let origin = data.origin ?? "";
    try {
      const req = getRequest();
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
      const proto = req.headers.get("x-forwarded-proto") ?? "https";
      if (!origin && host) origin = `${proto}://${host}`;
    } catch {
      /* noop */
    }
    m.rememberOrigin(origin);
    return m.cancelBooking(data.bookingId, origin || "http://localhost:8080");
  });

export const sitterRunHousekeeping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSitter(context.supabase, context.userId);
    const m = await import("@/lib/night-owl.server");
    const { dispatchDueEmails } = await import("@/lib/emails.server");
    await m.housekeeping();
    return dispatchDueEmails();
  });

/** Public: makes sure the shared demo sitter account exists (confirmed) so judges can sign in in one tap. */
export const ensureDemoSitter = createServerFn({ method: "POST" }).handler(async (): Promise<{ ok: true }> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const email = "robin@nightowlsitting.demo";
  const { error } = await supabaseAdmin.auth.admin.createUser({ email, password: "lamp-in-the-window", email_confirm: true });
  if (error && !/already|registered|exists/i.test(error.message)) throw new Error(error.message);
  return { ok: true };
});
