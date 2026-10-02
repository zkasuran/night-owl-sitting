import { useCallback } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Loader2, Moon } from "lucide-react";
import { toast } from "sonner";
import { bookingLinkQuery } from "@/lib/queries";
import { bookViaLink } from "@/lib/night-owl.functions";
import { dollars, rate } from "@/lib/money";
import { eveningLabel, hoursBetween, monthDayLong } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/night/SiteChrome";
import { EmptyState, HoldNote, Skeleton } from "@/components/night/Bits";
import { OwlMark } from "@/components/night/Brand";
import { useHoldCheckout } from "@/hooks/useHoldCheckout";

export const Route = createFileRoute("/book/$token")({
  head: () => ({
    meta: [
      { title: "One-tap booking — Night Owl Sitting Co." },
      { name: "description", content: "Tap once and Robin is booked for your night, with the $20 hold placed on the card on file." },
      { property: "og:title", content: "One-tap booking — Night Owl Sitting Co." },
      { property: "og:description", content: "Tap once and Robin is booked for your night." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BookLinkPage,
});

function BookLinkPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery(bookingLinkQuery(token));
  const book = useServerFn(bookViaLink);
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["booking-link", token] });
  }, [queryClient, token]);
  const holdCheckout = useHoldCheckout(refresh);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await book({ data: { token, origin: window.location.origin } });
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

  if (query.isPending) {
    return (
      <PageShell>
        <div className="mx-auto max-w-md space-y-4 py-8">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-2xl" />
        </div>
      </PageShell>
    );
  }

  if (query.isError || !query.data.ok) {
    return (
      <PageShell>
        <div className="mx-auto max-w-md py-8">
          <EmptyState
            icon={<Moon className="h-6 w-6" />}
            title="That link isn't valid"
            body={query.data && !query.data.ok ? query.data.error : "It may have been mistyped."}
            action={
              <Button asChild>
                <Link to="/">See what's open</Link>
              </Button>
            }
          />
        </div>
      </PageShell>
    );
  }

  const v = query.data;
  const hours = hoursBetween(v.evening.starts_at, v.evening.ends_at);

  if (v.state === "used" && v.bookingId) {
    return (
      <PageShell>
        <div className="mx-auto max-w-md py-8">
          <EmptyState
            icon={<OwlMark className="h-7 w-7" />}
            title="Already booked"
            body="This link was used. Your booking is safe and sound."
            action={
              <Button asChild>
                <Link to="/booking/$id" params={{ id: v.bookingId }}>
                  See the booking <ArrowRight />
                </Link>
              </Button>
            }
          />
        </div>
      </PageShell>
    );
  }

  if (v.state !== "ready") {
    return (
      <PageShell>
        <div className="mx-auto max-w-md py-8">
          <EmptyState
            icon={<Moon className="h-6 w-6" />}
            title={v.state === "gone" ? "Someone got there first" : "This link has expired"}
            body={
              v.state === "gone"
                ? `${eveningLabel(v.evening.starts_at, v.evening.ends_at)} was just booked by another family. Join the backup list and you'll get first dibs if it frees up.`
                : "Text Robin again and she'll send a fresh one from the live calendar."
            }
            action={
              <div className="flex gap-2">
                <Button asChild>
                  <Link to="/backup" search={{ family: v.family.id }}>
                    Join the backup list
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/inbound">Text Robin</Link>
                </Button>
              </div>
            }
          />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-md py-6 animate-fade-up">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">One tap, {v.family.parentFirstName}</p>
        <h1 className="mt-1 text-3xl font-medium leading-tight text-foreground sm:text-4xl">
          {eveningLabel(v.evening.starts_at, v.evening.ends_at)}
        </h1>
        <p className="mt-1 text-muted-foreground">{monthDayLong(v.evening.starts_at)} · Central time</p>

        <div className="card-night mt-6 p-5">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Family</dt>
              <dd className="font-medium text-foreground">The {v.family.familyName}s</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Your rate</dt>
              <dd className="font-medium text-foreground">{rate(v.family.rateCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Estimate · {hours} hrs</dt>
              <dd className="font-display text-xl text-foreground tabular">{dollars(Math.round(hours * v.family.rateCents))}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Card</dt>
              <dd className="font-medium text-foreground">
                {v.family.cardOnFile ? `${cap(v.family.cardBrand ?? "card")} ·${v.family.cardLast4 ?? ""} on file` : "Add at checkout"}
              </dd>
            </div>
          </dl>
          <HoldNote className="mt-4 w-full" />
          <Button size="xl" className="mt-4 w-full" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? (
              <>
                <Loader2 className="animate-spin" /> Booking…
              </>
            ) : (
              <>Book it &amp; place the hold</>
            )}
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Not you? <Link to="/" className="text-gold underline-offset-4 hover:underline">Start from the calendar</Link>.
          </p>
        </div>
      </div>
      {holdCheckout.element}
    </PageShell>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
