import { useCallback } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BellRing, Loader2, Moon, Timer } from "lucide-react";
import { toast } from "sonner";
import { offerQuery } from "@/lib/queries";
import { claimOffer, declineOffer } from "@/lib/night-owl.functions";
import { dollars, rate } from "@/lib/money";
import { clock, eveningLabel, hoursBetween, monthDayLong } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/night/SiteChrome";
import { EmptyState, HoldNote, Pill, Skeleton } from "@/components/night/Bits";
import { useHoldCheckout } from "@/hooks/useHoldCheckout";

export const Route = createFileRoute("/claim/$token")({
  head: () => ({
    meta: [
      { title: "A night just opened up — Night Owl Sitting Co." },
      { name: "description", content: "You're first on Robin's backup list. Claim the freed evening within 30 minutes and you're booked." },
      { property: "og:title", content: "A night just opened up — Night Owl Sitting Co." },
      { property: "og:description", content: "Claim the freed evening within 30 minutes and Robin is yours." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClaimPage,
});

function ClaimPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery(offerQuery(token));
  const claim = useServerFn(claimOffer);
  const decline = useServerFn(declineOffer);
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["offer", token] });
  }, [queryClient, token]);
  const holdCheckout = useHoldCheckout(refresh);

  const claimMutation = useMutation({
    mutationFn: async () => {
      const res = await claim({ data: { token, origin: window.location.origin } });
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
      toast.error(err instanceof Error ? err.message : "Couldn't claim the night.");
      refresh();
    },
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      const res = await decline({ data: { token, origin: window.location.origin } });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast("Passed along. The next family gets the offer.");
      queryClient.invalidateQueries({ queryKey: ["offer", token] });
    },
  });

  if (query.isPending) {
    return (
      <PageShell>
        <div className="mx-auto max-w-md space-y-4 py-8">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-44 w-full rounded-2xl" />
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
            title="That claim link isn't valid"
            body={query.data && !query.data.ok ? query.data.error : undefined}
            action={
              <Button asChild>
                <Link to="/">See Robin's calendar</Link>
              </Button>
            }
          />
        </div>
      </PageShell>
    );
  }

  const v = query.data;
  const hours = hoursBetween(v.evening.starts_at, v.evening.ends_at);

  if (v.state === "claimed") {
    return (
      <PageShell>
        <div className="mx-auto max-w-md py-8">
          <EmptyState
            icon={<BellRing className="h-6 w-6" />}
            title="You claimed it"
            body={`${eveningLabel(v.evening.starts_at, v.evening.ends_at)} is booked with Robin.`}
            action={
              v.offer.booking_id ? (
                <Button asChild>
                  <Link to="/booking/$id" params={{ id: v.offer.booking_id }}>
                    See the booking <ArrowRight />
                  </Link>
                </Button>
              ) : null
            }
          />
        </div>
      </PageShell>
    );
  }

  if (v.state !== "pending") {
    return (
      <PageShell>
        <div className="mx-auto max-w-md py-8">
          <EmptyState
            icon={<Timer className="h-6 w-6" />}
            title={v.state === "declined" ? "You passed on this one" : "This offer moved on"}
            body="The 30-minute window closed, so the night was offered to the next family on the list. You're still on the backup list for future openings."
            action={
              <div className="flex gap-2">
                <Button asChild>
                  <Link to="/">See what's open</Link>
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
        <div className="flex items-center gap-2">
          <Pill tone="gold">
            <Timer className="h-3 w-3" /> {v.minutesLeft} min left
          </Pill>
          <Pill tone="muted">Backup list · first in line</Pill>
        </div>
        <h1 className="mt-3 text-3xl font-medium leading-tight text-foreground sm:text-4xl">
          {v.family.parentFirstName}, {eveningLabel(v.evening.starts_at, v.evening.ends_at).split(" · ")[0]} just freed up.
        </h1>
        <p className="mt-2 text-muted-foreground">
          {monthDayLong(v.evening.starts_at)}, {clock(v.evening.starts_at)}–{clock(v.evening.ends_at)} Central. It's held for you until{" "}
          {clock(v.offer.expires_at)}; after that it goes to the next family.
        </p>

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
          </dl>
          <HoldNote className="mt-4 w-full" />
          <Button size="xl" className="mt-4 w-full" disabled={claimMutation.isPending} onClick={() => claimMutation.mutate()}>
            {claimMutation.isPending ? (
              <>
                <Loader2 className="animate-spin" /> Claiming…
              </>
            ) : (
              <>Claim this night</>
            )}
          </Button>
          <Button
            variant="ghost"
            className="mt-2 w-full"
            disabled={declineMutation.isPending}
            onClick={() => declineMutation.mutate()}
          >
            No thanks, pass it to the next family
          </Button>
        </div>
      </div>
      {holdCheckout.element}
    </PageShell>
  );
}
