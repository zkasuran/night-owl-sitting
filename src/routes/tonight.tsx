import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { Session } from "@supabase/supabase-js";
import {
  BellRing,
  CalendarDays,
  Clock,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ensureDemoSitter, claimSitterAccess, getDashboard, sitterCancelBooking, sitterRunHousekeeping, type Dashboard, type TimelineSit } from "@/lib/sitter.functions";
import { dollars, rate } from "@/lib/money";
import { clock, dateTime, eveningShort, relativeTime, timeRange, weekdayLong, weekendHeading, weekendSpan } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageShell } from "@/components/night/SiteChrome";
import { EmptyState, ErrorNote, Pill, SectionTitle, Skeleton } from "@/components/night/Bits";
import { OwlMark } from "@/components/night/Brand";
import { cn } from "@/lib/utils";

export const DEMO_SITTER = { email: "robin@nightowlsitting.demo", password: "lamp-in-the-window" };

export const Route = createFileRoute("/tonight")({
  head: () => ({
    meta: [
      { title: "Tonight — Robin's dashboard · Night Owl Sitting Co." },
      { name: "description", content: "Robin's private view: this weekend's sits, the week's earnings, and the impact meter." },
      { property: "og:title", content: "Tonight — Robin's dashboard" },
      { property: "og:description", content: "This weekend's sits, the week's earnings, and the nights the app filled on its own." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TonightPage,
});

function TonightPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <PageShell>
        <div className="mx-auto max-w-md space-y-4 py-10">
          <Skeleton className="mx-auto h-12 w-12 rounded-2xl" />
          <Skeleton className="mx-auto h-8 w-2/3" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </PageShell>
    );
  }
  if (!session) return <LoginCard />;
  return <SitterDashboard session={session} />;
}

// ---------- Login ----------

function LoginCard() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"none" | "form" | "demo">("none");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("form");
    setError(null);
    setNotice(null);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/tonight` },
      });
      if (error) setError(error.message);
      else if (!data.session) setNotice("Check your inbox for a confirmation link, then come back here.");
    }
    setBusy("none");
  }

  async function demo() {
    setBusy("demo");
    setError(null);
    try { await ensureDemoSitter(); } catch { /* sign-in below reports any real problem */ }
    const { error } = await supabase.auth.signInWithPassword(DEMO_SITTER);
    if (error) setError(error.message);
    setBusy("none");
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-md py-8 animate-fade-up">
        <div className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gold-soft text-gold ring-1 ring-gold/25">
            <OwlMark className="h-9 w-9" />
          </span>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">Robin's door</p>
          <h1 className="mt-1 text-3xl font-medium text-foreground">Tonight</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The private view: this weekend's sits, the week's earnings, and the nights the app filled on its own.
          </p>
        </div>

        <div className="card-night mt-6 p-5">
          <Button size="lg" className="w-full" onClick={demo} disabled={busy !== "none"}>
            {busy === "demo" ? <Loader2 className="animate-spin" /> : <Moon />}
            Sign in as Robin (demo)
          </Button>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or use your own login <span className="h-px flex-1 bg-border" />
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label htmlFor="email" className="text-xs text-muted-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 h-11 rounded-xl border-border bg-background/60"
                autoComplete="email"
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-xs text-muted-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 h-11 rounded-xl border-border bg-background/60"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {notice ? <p className="text-sm text-success">{notice}</p> : null}
            <Button type="submit" variant="outline" size="lg" className="w-full" disabled={busy !== "none"}>
              {busy === "form" ? <Loader2 className="animate-spin" /> : null}
              {mode === "signin" ? "Sign in" : "Create the sitter account"}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            {mode === "signin" ? "First time here?" : "Already set up?"}{" "}
            <button type="button" className="text-gold underline-offset-4 hover:underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
              {mode === "signin" ? "Create the sitter account" : "Sign in"}
            </button>
          </p>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Parents don't need an account.{" "}
          <Link to="/" className="text-gold underline-offset-4 hover:underline">
            Back to the calendar
          </Link>
        </p>
      </div>
    </PageShell>
  );
}

// ---------- Dashboard ----------

function SitterDashboard({ session }: { session: Session }) {
  const queryClient = useQueryClient();
  const claim = useServerFn(claimSitterAccess);
  const fetchDashboard = useServerFn(getDashboard);
  const cancelFn = useServerFn(sitterCancelBooking);
  const housekeepingFn = useServerFn(sitterRunHousekeeping);

  const access = useQuery({
    queryKey: ["sitter-access", session.user.id],
    queryFn: () => claim(),
    staleTime: Infinity,
  });

  const dash = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchDashboard(),
    enabled: access.data?.role === "sitter",
    refetchInterval: 30_000,
  });

  const cancel = useMutation({
    mutationFn: (bookingId: string) => cancelFn({ data: { bookingId, origin: window.location.origin } }),
    onSuccess: (res) => {
      toast(res.late ? "Cancelled. Hold kept (inside 24h)." : "Cancelled. Hold released.", {
        description: res.offeredTo ? `Offered to the ${res.offeredTo} family from the backup list.` : "Nobody on the backup list matched, so the night is simply open.",
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["front-door"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't cancel."),
  });

  const sweep = useMutation({
    mutationFn: () => housekeepingFn(),
    onSuccess: (res) => {
      toast(`Housekeeping done. ${res.attempted} email${res.attempted === 1 ? "" : "s"} due, ${res.sent} sent.`);
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  if (access.isPending) {
    return (
      <PageShell>
        <DashboardSkeleton />
      </PageShell>
    );
  }
  if (access.isError) {
    return (
      <PageShell>
        <div className="mx-auto max-w-md py-8">
          <ErrorNote title="Couldn't open the dashboard" body={access.error instanceof Error ? access.error.message : undefined} action={<SignOut />} />
        </div>
      </PageShell>
    );
  }
  if (access.data.role !== "sitter") {
    return (
      <PageShell>
        <div className="mx-auto max-w-md py-8">
          <EmptyState
            icon={<OwlMark className="h-7 w-7" />}
            title="This dashboard belongs to Robin"
            body={`You're signed in as ${access.data.email ?? "someone else"}. Parents book from the front door; only the sitter account can see tonight's view.`}
            action={
              <div className="flex gap-2">
                <Button asChild>
                  <Link to="/">Front door</Link>
                </Button>
                <SignOut />
              </div>
            }
          />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">Robin's dashboard</p>
          <h1 className="mt-1 text-4xl font-medium leading-none text-foreground">Tonight</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {dash.data ? `${weekendHeading(dash.data.weekend.key)} · ${weekendSpan(dash.data.weekend.key)}` : "Loading the weekend…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => sweep.mutate()} disabled={sweep.isPending}>
            <RefreshCw className={cn("h-4 w-4", sweep.isPending && "animate-spin")} /> Run housekeeping
          </Button>
          <SignOut />
        </div>
      </div>

      {dash.isPending ? <DashboardSkeleton /> : null}
      {dash.isError ? (
        <ErrorNote
          title="The dashboard didn't load"
          body={dash.error instanceof Error ? dash.error.message : undefined}
          action={
            <Button size="sm" variant="soft" onClick={() => dash.refetch()}>
              Try again
            </Button>
          }
        />
      ) : null}
      {dash.data ? <DashboardBody d={dash.data} onCancel={(id) => cancel.mutate(id)} cancelling={cancel.isPending ? cancel.variables : null} /> : null}
    </PageShell>
  );
}

function SignOut() {
  return (
    <Button variant="outline" size="sm" onClick={() => supabase.auth.signOut()}>
      <LogOut className="h-4 w-4" /> Sign out
    </Button>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}

function DashboardBody({ d, onCancel, cancelling }: { d: Dashboard; onCancel: (id: string) => void; cancelling: string | null | undefined }) {
  return (
    <div className="space-y-10">
      {/* Impact meter */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gold" />
          <h2 className="font-display text-lg text-foreground">Impact meter</h2>
          <span className="text-xs text-muted-foreground">· computed from real records</span>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric icon={<MessageCircle className="h-4 w-4" />} value={String(d.impact.requestsAnswered)} label="Requests answered while Robin was unavailable" />
          <Metric icon={<Moon className="h-4 w-4" />} value={String(d.impact.nightsFilled)} label="Nights filled" />
          <Metric icon={<BellRing className="h-4 w-4" />} value={String(d.impact.lateCancellationsCovered)} label="Late cancellations covered by a backup family" />
          <Metric icon={<ShieldCheck className="h-4 w-4" />} value={dollars(d.impact.earningsProtectedCents)} label="Earnings protected" highlight />
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* Weekend timeline */}
        <section>
          <SectionTitle eyebrow={weekendHeading(d.weekend.key)} title="This weekend's sits" aside={<span>{weekendSpan(d.weekend.key)}</span>} />
          {d.weekend.sits.length ? (
            <ol className="relative space-y-4 border-l border-border pl-6">
              {d.weekend.sits.map((s) => (
                <TimelineItem key={s.booking.id} sit={s} onCancel={onCancel} cancelling={cancelling === s.booking.id} />
              ))}
            </ol>
          ) : (
            <EmptyState
              icon={<CalendarDays className="h-6 w-6" />}
              title="No sits this weekend"
              body="Nothing booked yet. The calendar is open to families and the text-back is answering; you'll see sits appear here as they land."
            />
          )}

          {d.upcoming.filter((s) => !d.weekend.sits.some((w) => w.booking.id === s.booking.id)).length ? (
            <div className="mt-8">
              <h3 className="mb-3 font-display text-lg text-foreground">Further out</h3>
              <div className="space-y-2">
                {d.upcoming
                  .filter((s) => !d.weekend.sits.some((w) => w.booking.id === s.booking.id))
                  .map((s) => (
                    <div key={s.booking.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">
                          {eveningShort(s.evening.starts_at)} · {timeRange(s.evening.starts_at, s.evening.ends_at)} · the {s.family.family_name}s
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {s.family.address} · {rate(s.booking.rate_cents)} · {dollars(s.totalCents)}
                          {s.booking.source === "backup" ? " · filled from backup list" : ""}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" disabled={cancelling === s.booking.id} onClick={() => onCancel(s.booking.id)}>
                        {cancelling === s.booking.id ? <Loader2 className="animate-spin" /> : null} Cancel
                      </Button>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
        </section>

        {/* Right rail */}
        <aside className="space-y-6">
          <div className="card-night p-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Wallet className="h-4 w-4 text-gold" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">This week's earnings</p>
            </div>
            <p className="mt-2 font-display text-4xl text-foreground tabular">{dollars(d.weekEarningsCents)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {d.weekHours} hrs · {d.weekLabel}
            </p>
          </div>

          <div className="card-night p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BellRing className="h-4 w-4 text-gold" />
                <h3 className="font-display text-lg text-foreground">Backup list</h3>
              </div>
              <span className="text-xs text-muted-foreground">{d.backup.length} waiting</span>
            </div>
            {d.backup.length ? (
              <ul className="space-y-2.5">
                {d.backup.map((b) => (
                  <li key={b.request.id} className="rounded-xl border border-border bg-background/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-foreground">The {b.family.family_name}s</p>
                      <Pill tone={b.request.status === "offered" ? "gold" : b.request.status === "claimed" ? "success" : "muted"}>{b.request.status}</Pill>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {weekendSpan(b.request.weekend_start)} · {b.request.nights.map((n) => (n === "fri" ? "Fri" : "Sat")).join(" / ")}
                    </p>
                    {b.request.note ? <p className="mt-1 text-xs italic text-muted-foreground">“{b.request.note}”</p> : null}
                    {b.offer && b.evening && b.offer.status === "pending" ? (
                      <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-gold">
                        <Clock className="h-3 w-3" /> Offered {eveningShort(b.evening.starts_at)} · expires {clock(b.offer.expires_at)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState className="py-6" title="Backup list is empty" body="When a family wants a booked weekend, they'll appear here and get first dibs on cancellations." />
            )}
          </div>
        </aside>
      </div>

      {/* Refill activity + texts */}
      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <SectionTitle eyebrow="The night refills itself" title="Cancellations & refills" />
          {d.refills.length || d.cancelled.length ? (
            <ul className="space-y-2.5">
              {d.refills.map((r) => (
                <li key={r.offer.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-foreground">
                      {eveningShort(r.evening.starts_at)} → offered to the {r.family.family_name}s
                    </p>
                    <Pill tone={r.offer.status === "claimed" ? "success" : r.offer.status === "pending" ? "gold" : "muted"}>{r.offer.status}</Pill>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.freedByFamily ? `Freed by the ${r.freedByFamily.family_name}s · ` : ""}
                    offered {relativeTime(r.offer.offered_at)}
                    {r.offer.status === "pending" ? ` · claim window closes ${clock(r.offer.expires_at)}` : ""}
                    {r.offer.status === "claimed" && r.offer.resolved_at ? ` · claimed ${relativeTime(r.offer.resolved_at)}` : ""}
                  </p>
                </li>
              ))}
              {d.cancelled.map((c) => (
                <li key={c.booking.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed border-border px-4 py-3 text-sm">
                  <span className="text-muted-foreground">
                    The {c.family.family_name}s cancelled {eveningShort(c.evening.starts_at)}
                    {c.booking.cancelled_at ? ` · ${relativeTime(c.booking.cancelled_at)}` : ""}
                  </span>
                  <Pill tone={c.booking.late_cancellation ? "danger" : "muted"}>
                    {c.booking.late_cancellation ? "late · $20 kept" : "hold released"}
                  </Pill>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No cancellations" body="When a family cancels, the freed night is offered down the backup list automatically and shows up here." />
          )}
        </section>

        <section>
          <SectionTitle eyebrow="Text-back" title="Recent texts" aside={<Link to="/inbound" className="text-gold underline-offset-4 hover:underline">Open inbound</Link>} />
          {d.requests.length ? (
            <ul className="space-y-2.5">
              {d.requests.slice(0, 6).map((r) => (
                <li key={r.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {r.family ? `${r.family.parent_name} · the ${r.family.family_name}s` : r.sender_name || "Unknown number"}
                    </p>
                    <span className="text-xs text-muted-foreground">{relativeTime(r.created_at)}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">“{r.message}”</p>
                  {r.reply_text ? (
                    <p className="mt-2 rounded-xl bg-gold-soft px-3 py-2 text-sm text-foreground">
                      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-gold">Robin</span>
                      {r.reply_text}
                    </p>
                  ) : null}
                  {r.answered_while_unavailable ? (
                    <p className="mt-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">answered while unavailable · {r.channel}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No texts yet" body="Messages parents send while you're busy will land here with the reply the text-back gave them." />
          )}
        </section>
      </div>

      {/* Outbox */}
      <section>
        <SectionTitle
          eyebrow="Email"
          title="Outbox"
          aside={
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Confirmations, reminders, offers
            </span>
          }
        />
        {d.emails.length ? (
          <div className="overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-card text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">To</th>
                  <th className="px-4 py-2.5 font-semibold">Subject</th>
                  <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Kind</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {d.emails.map((e) => (
                  <tr key={e.id} className="border-t border-border/70">
                    <td className="px-4 py-2.5 text-foreground">{e.to_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{e.subject}</td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">{e.kind.replace("_", " ")}</td>
                    <td className="px-4 py-2.5">
                      <Pill tone={e.status === "sent" ? "success" : e.status === "failed" ? "danger" : "gold"}>
                        {e.status === "queued"
                          ? new Date(e.scheduled_for).getTime() > Date.now()
                            ? `scheduled ${dateTime(e.scheduled_for)}`
                            : "queued · awaiting sender domain"
                          : e.status}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Nothing sent yet" body="Every confirmation, reminder and backup offer the app writes shows up here." />
        )}
      </section>
    </div>
  );
}

function Metric({ icon, value, label, highlight = false }: { icon: React.ReactNode; value: string; label: string; highlight?: boolean }) {
  return (
    <div className={cn("card-night relative overflow-hidden p-4 sm:p-5", highlight && "lamp-glow")}>
      {highlight ? <div aria-hidden className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gold/15 blur-2xl" /> : null}
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold-soft text-gold">{icon}</span>
      <p className="mt-3 font-display text-3xl leading-none text-foreground tabular sm:text-4xl">{value}</p>
      <p className="mt-2 text-xs leading-snug text-muted-foreground">{label}</p>
    </div>
  );
}

function TimelineItem({ sit, onCancel, cancelling }: { sit: TimelineSit; onCancel: (id: string) => void; cancelling: boolean }) {
  const s = sit;
  const inProgress = new Date(s.evening.starts_at).getTime() <= Date.now() && new Date(s.evening.ends_at).getTime() >= Date.now();
  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-[31px] top-5 grid h-4 w-4 place-items-center rounded-full border-2 border-background",
          inProgress ? "bg-gold shadow-[0_0_0_4px] shadow-gold/25 animate-lamp-pulse" : "bg-gold/70",
        )}
      />
      <div className="card-night p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {weekdayLong(s.evening.starts_at)} · {timeRange(s.evening.starts_at, s.evening.ends_at)}
            </p>
            <p className="mt-1 font-display text-2xl text-foreground">The {s.family.family_name}s</p>
            <p className="text-sm text-muted-foreground">{s.family.kids_summary}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl text-foreground tabular">{dollars(s.totalCents)}</p>
            <p className="text-xs text-muted-foreground">
              {rate(s.booking.rate_cents)} · {s.hours} hrs
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-gold" /> {s.family.address}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-gold" /> ${s.booking.hold_amount_cents / 100} hold {s.booking.hold_status}
          </span>
          {s.booking.source === "backup" ? <Pill tone="success">filled from backup list</Pill> : null}
          {s.booking.source === "inbound" ? <Pill tone="muted">booked by text-back</Pill> : null}
          {inProgress ? <Pill tone="gold">happening now</Pill> : null}
        </div>
        {s.family.notes ? <p className="mt-3 rounded-xl bg-background/50 px-3 py-2 text-sm text-muted-foreground">{s.family.notes}</p> : null}
        {s.booking.status === "confirmed" ? (
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="ghost" disabled={cancelling} onClick={() => onCancel(s.booking.id)}>
              {cancelling ? <Loader2 className="animate-spin" /> : null} Cancel &amp; refill from backup list
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}
