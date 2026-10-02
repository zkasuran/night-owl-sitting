import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Loader2, MessageCircle, Moon, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { frontDoorQuery } from "@/lib/queries";
import { confirmEvening } from "@/lib/night-owl.functions";
import { dollars, rate } from "@/lib/money";
import { eveningLabel, hoursBetween } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/night/SiteChrome";
import { FamilyPicker } from "@/components/night/FamilyPicker";
import { EveningGrid, isPickable } from "@/components/night/EveningGrid";
import { AskRobin } from "@/components/night/AskRobin";
import { MeetRobin } from "@/components/night/MeetRobin";
import { HoldNote, SectionTitle } from "@/components/night/Bits";
import { OwlMark } from "@/components/night/Brand";
import { useHoldCheckout } from "@/hooks/useHoldCheckout";
import { cn } from "@/lib/utils";
import doorstep from "@/assets/robin-doorstep.jpg";

const searchSchema = z.object({
  checkout: z.string().optional(),
  evening: z.string().optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: (s) => searchSchema.parse(s),
  loader: ({ context }) => context.queryClient.ensureQueryData(frontDoorQuery),
  head: () => ({
    meta: [
      { title: "Night Owl Sitting Co. — Book Robin for date night" },
      {
        name: "description",
        content:
          "Book Robin for date night. One text, you're covered. Real Friday and Saturday availability in Austin, a $20 hold released after the sit, and a backup list that refills cancelled nights.",
      },
      { property: "og:title", content: "Night Owl Sitting Co. — Book Robin for date night" },
      {
        property: "og:description",
        content: "One sitter, a small circle of Austin families. Pick an open evening, hold it with a card, and go have your night.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FrontDoor,
});

function FrontDoor() {
  const { data } = useSuspenseQuery(frontDoorQuery);
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useServerFn(confirmEvening);

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [eveningId, setEveningId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: frontDoorQuery.queryKey });
  }, [queryClient]);
  const holdCheckout = useHoldCheckout(refresh);

  useEffect(() => {
    if (search.checkout === "cancelled") {
      toast("No hold was placed. The evening is open again.", { description: "Pick it again whenever you're ready." });
      refresh();
      navigate({ to: "/", search: {}, replace: true });
    }
  }, [search.checkout, navigate, refresh]);

  const allEvenings = useMemo(() => data.weekends.flatMap((w) => w.evenings), [data.weekends]);
  const family = data.families.find((f) => f.id === familyId) ?? null;
  const evening = allEvenings.find((e) => e.id === eveningId) ?? null;
  const openCount = allEvenings.filter(isPickable).length;
  const firstOpen = allEvenings.find(isPickable) ?? null;

  useEffect(() => {
    if (eveningId && evening && !isPickable(evening)) setEveningId(null);
  }, [eveningId, evening]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!familyId || !eveningId) throw new Error("Pick your family and an evening first.");
      const res = await confirm({ data: { familyId, eveningId, origin: window.location.origin } });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSuccess: (res) => {
      if (res.kind === "checkout") {
        holdCheckout.open(res);
        return;
      }
      navigate({ to: "/booking/$id", params: { id: res.bookingId }, search: { new: "1" } });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "That didn't go through.");
      refresh();
    },
  });

  const hours = evening ? hoursBetween(evening.starts_at, evening.ends_at) : 5;
  const estimate = family ? Math.round(hours * family.rateCents) : 0;
  const ready = Boolean(family && evening && isPickable(evening));

  return (
    <PageShell className="pt-0">
      {/* Hero */}
      <section className="relative overflow-hidden pb-10 pt-14 sm:pb-16 sm:pt-20">
        <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-gold/20 blur-3xl animate-lamp-pulse" />
        <div className="relative grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="animate-fade-up">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold/25 bg-gold-soft px-3 py-1 text-xs font-medium text-gold">
              <Moon className="h-3.5 w-3.5" /> Austin · Friday &amp; Saturday nights · 6 to 11
            </p>
            <h1 className="max-w-2xl text-[2.6rem] font-medium leading-[1.02] text-foreground sm:text-6xl">
              Book Robin for date night. <span className="gold-text italic">One text, you're covered.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              One sitter, a small circle of repeat families. Robin's real availability is below: pick an open
              evening, hold it with your card on file, and go have your night.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <a href="#book">
                  Pick a night <ArrowRight />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/inbound">
                  <MessageCircle /> Text Robin instead
                </Link>
              </Button>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-gold" /> $20 hold, released after the sit
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-gold" /> Answers even when Robin is mid-sit
              </span>
            </div>
          </div>

          {/* Doorstep photo + live calendar card */}
          <div className="relative mx-auto w-full max-w-sm animate-fade-up pb-28 [animation-delay:120ms] sm:max-w-md lg:mx-0 lg:justify-self-end">
            <figure className="card-night relative overflow-hidden p-0 shadow-lamp">
              <img
                src={doorstep}
                alt="Robin at a front door at dusk, holding a sleepy toddler while a little girl waves goodbye to her parents"
                width={1200}
                height={900}
                fetchPriority="high"
                className="aspect-[4/5] w-full object-cover object-[60%_30%] sm:aspect-[5/6]"
              />
              <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-background/80 to-transparent" />
              <figcaption className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-background/70 px-3 py-1 text-xs font-medium text-gold backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-gold animate-lamp-pulse" /> Friday, 6:02pm · the Alvarezes head out
              </figcaption>
            </figure>
            <div className="card-night absolute inset-x-4 -bottom-0 overflow-hidden p-5 sm:inset-x-6">
              <div aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold/15 blur-2xl" />
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold-soft text-gold ring-1 ring-gold/25 animate-float">
                  <OwlMark className="h-7 w-7" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">Robin's calendar</p>
                  <p className="font-display text-lg leading-tight text-foreground">Live, right now</p>
                </div>
              </div>
              <dl className="mt-4 space-y-2.5 text-sm">
                <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
                  <dt className="text-muted-foreground">Open evenings, next 3 weekends</dt>
                  <dd className="font-display text-2xl text-foreground tabular">{openCount}</dd>
                </div>
                <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
                  <dt className="text-muted-foreground">Soonest open night</dt>
                  <dd className="text-right font-medium text-foreground">
                    {firstOpen ? eveningLabel(firstOpen.starts_at, firstOpen.ends_at) : "Backup list only"}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Families this weekend</dt>
                  <dd className="text-right font-medium text-foreground">
                    {data.weekends[0]?.evenings.filter((e) => e.bookedFamilyName).map((e) => `the ${e.bookedFamilyName}s`).join(", ") ||
                      "Nobody yet"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* Booking */}
      <section id="book" className="scroll-mt-24">
        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-10">
            <div>
              <SectionTitle eyebrow="Step one" title="Who's booking?" />
              <FamilyPicker families={data.families} value={familyId} onChange={setFamilyId} />
            </div>
            <div>
              <SectionTitle
                eyebrow="Step two"
                title="Pick an evening"
                aside={<span>All times Central. Only open nights can be picked.</span>}
              />
              <EveningGrid weekends={data.weekends} value={eveningId} onChange={setEveningId} />
            </div>
          </div>

          {/* Confirm card */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className={cn("card-night p-5 transition-shadow duration-300", ready && "lamp-glow")}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">Step three</p>
              <h2 className="mt-1 text-2xl font-medium text-foreground">Confirm</h2>

              <dl className="mt-4 space-y-2.5 text-sm">
                <Row label="Family" value={family ? `The ${family.familyName}s` : "—"} muted={!family} />
                <Row label="Evening" value={evening ? eveningLabel(evening.starts_at, evening.ends_at) : "—"} muted={!evening} />
                <Row label="Your rate" value={family ? rate(family.rateCents) : "—"} muted={!family} />
                <Row
                  label={`Estimate · ${hours} hrs`}
                  value={family ? dollars(estimate) : "—"}
                  muted={!family}
                  strong
                />
              </dl>

              <HoldNote className="mt-4 w-full" />

              <Button
                size="xl"
                className="mt-4 w-full"
                disabled={!ready || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="animate-spin" /> Placing your hold…
                  </>
                ) : ready ? (
                  <>Confirm &amp; hold my spot</>
                ) : (
                  <>Pick a family and a night</>
                )}
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {family?.cardOnFile
                  ? `Uses the ${family.cardBrand ? cap(family.cardBrand) : "card"} on file · no charge unless you cancel inside 24 hours.`
                  : "You'll add a card on the next screen. Test mode: use 4242 4242 4242 4242."}
              </p>
            </div>
          </aside>
        </div>
      </section>

      {/* Mobile sticky confirm */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 p-3 backdrop-blur-md transition-transform duration-300 lg:hidden",
          ready ? "translate-y-0" : "translate-y-full",
        )}
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {evening ? eveningLabel(evening.starts_at, evening.ends_at) : ""}
            </p>
            <p className="text-xs text-muted-foreground">{family ? `The ${family.familyName}s · ${rate(family.rateCents)}` : ""}</p>
          </div>
          <Button size="lg" disabled={!ready || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <Loader2 className="animate-spin" /> : null}
            Hold my spot
          </Button>
        </div>
      </div>

      {/* Ask Robin */}
      <section className="mt-20">
        <SectionTitle
          eyebrow="Don't see your night?"
          title="Ask Robin. She answers even mid-sit."
          aside={
            <Link to="/inbound" className="inline-flex items-center gap-1 text-gold underline-offset-4 hover:underline">
              See how the text-back works <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
        <AskRobin channel="web" families={data.families} compact />
      </section>

      <MeetRobin />

      {/* How it works */}
      <section className="mt-20 grid gap-4 sm:grid-cols-3">
        {[
          {
            n: "01",
            t: "Pick a real night",
            b: "The calendar is Robin's actual availability. If it says open, it's open.",
          },
          {
            n: "02",
            t: "Hold it with a card",
            b: "A $20 hold keeps your spot. Released after the sit, kept only if you cancel inside 24 hours.",
          },
          {
            n: "03",
            t: "Go have your night",
            b: "Confirmation and a morning-of reminder land in your inbox. If you cancel, the backup list refills the night.",
          },
        ].map((s) => (
          <div key={s.n} className="card-night p-5">
            <p className="font-display text-3xl text-gold/70">{s.n}</p>
            <h3 className="mt-2 font-display text-xl text-foreground">{s.t}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.b}</p>
          </div>
        ))}
      </section>

      {holdCheckout.element}
    </PageShell>
  );
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right", muted ? "text-muted-foreground/60" : "text-foreground", strong && "font-display text-xl tabular")}>
        {value}
      </dd>
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
