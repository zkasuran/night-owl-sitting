import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CalendarClock, Loader2, MapPin, Moon, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { bookingQuery } from "@/lib/queries";
import { cancelBooking } from "@/lib/night-owl.functions";
import { dollars, rate } from "@/lib/money";
import { clock, eveningLabel, monthDayLong, weekdayLong } from "@/lib/time";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageShell } from "@/components/night/SiteChrome";
import { EmptyState, ErrorNote, HoldNote, Pill, Skeleton, SuccessBurst } from "@/components/night/Bits";

export const Route = createFileRoute("/booking/$id")({
  validateSearch: (s) => z.object({ new: z.string().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Your booking — Night Owl Sitting Co." },
      { name: "description", content: "Your date night with Robin: time, address, rate, and the $20 hold that's released after the sit." },
      { property: "og:title", content: "Your booking — Night Owl Sitting Co." },
      { property: "og:description", content: "Everything about your night with Robin in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BookingPage,
});

function BookingPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery(bookingQuery(id));
  const cancel = useServerFn(cancelBooking);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isNew = search.new === "1";

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await cancel({ data: { bookingId: id, origin: window.location.origin } });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["booking", id] });
      queryClient.invalidateQueries({ queryKey: ["front-door"] });
      toast(
        res.late ? "Cancelled. The $20 hold is kept this time." : "Cancelled. Your $20 hold is released.",
        {
          description: res.offeredTo
            ? `Robin's evening was offered to the ${res.offeredTo} family from the backup list.`
            : "The evening is open again on Robin's calendar.",
        },
      );
      setConfirmOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't cancel."),
  });

  if (query.isPending) {
    return (
      <PageShell>
        <div className="mx-auto max-w-xl space-y-4">
          <Skeleton className="mx-auto h-16 w-16 rounded-full" />
          <Skeleton className="mx-auto h-9 w-2/3" />
          <Skeleton className="mx-auto h-5 w-1/2" />
          <div className="card-night mt-6 space-y-3 p-5">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        </div>
      </PageShell>
    );
  }

  if (query.isError || !query.data.ok) {
    return (
      <PageShell>
        <div className="mx-auto max-w-xl">
          <EmptyState
            icon={<Moon className="h-6 w-6" />}
            title="We couldn't find that booking"
            body={query.data && !query.data.ok ? query.data.error : "The link may be old or mistyped."}
            action={
              <Button asChild>
                <Link to="/">Back to Robin's calendar</Link>
              </Button>
            }
          />
        </div>
      </PageShell>
    );
  }

  const d = query.data;
  const { booking, evening, family } = d;
  const status = booking.status;
  const holdTone = booking.hold_status === "held" ? "gold" : booking.hold_status === "kept" ? "danger" : "success";
  const holdLabel =
    booking.hold_status === "held"
      ? "$20 hold in place"
      : booking.hold_status === "kept"
        ? "$20 hold kept"
        : booking.hold_status === "released"
          ? "$20 hold released"
          : "no hold";

  return (
    <PageShell>
      <div className="mx-auto max-w-xl">
        <div className="text-center animate-fade-up">
          {isNew && status === "confirmed" ? <SuccessBurst /> : null}
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
            {status === "confirmed" ? (isNew ? "You're covered" : "Confirmed") : status === "completed" ? "Completed" : "Cancelled"}
          </p>
          <h1 className="mt-1 text-3xl font-medium leading-tight text-foreground sm:text-4xl">
            {status === "confirmed"
              ? `${weekdayLong(evening.starts_at)} is yours, ${family.parentFirstName}.`
              : status === "completed"
                ? `Thanks for ${weekdayLong(evening.starts_at)}, ${family.parentFirstName}.`
                : `This ${weekdayLong(evening.starts_at)} was cancelled.`}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {status === "confirmed"
              ? "Robin has it on the calendar. A confirmation is in your inbox, with a reminder the morning of."
              : status === "completed"
                ? "The sit is done and your hold has been released."
                : booking.late_cancellation
                  ? "It was inside the 24-hour window, so the hold was kept and the night went to the backup list."
                  : "It was more than 24 hours out, so your hold was released and the night went to the backup list."}
          </p>
        </div>

        <div className="card-night mt-8 overflow-hidden animate-fade-up [animation-delay:100ms]">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <p className="font-display text-2xl text-foreground">{eveningLabel(evening.starts_at, evening.ends_at)}</p>
              <p className="text-sm text-muted-foreground">{monthDayLong(evening.starts_at)} · Central time</p>
            </div>
            <Pill tone={holdTone}>{holdLabel}</Pill>
          </div>
          <dl className="grid gap-4 px-5 py-5 sm:grid-cols-2">
            <Item icon={<Moon className="h-4 w-4" />} label="Family" value={`The ${family.familyName}s`} sub={family.kidsSummary} />
            <Item icon={<MapPin className="h-4 w-4" />} label="Address on file" value={d.address} />
            <Item icon={<CalendarClock className="h-4 w-4" />} label="Arrives" value={clock(evening.starts_at)} sub={`Until ${clock(evening.ends_at)} · ${d.hours} hrs`} />
            <Item
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Rate"
              value={rate(booking.rate_cents)}
              sub={`About ${dollars(d.estimateCents)} for the night · paid to Robin after`}
            />
          </dl>
          <div className="border-t border-border px-5 py-4">
            <HoldNote className="w-full" />
          </div>
        </div>

        {status === "confirmed" ? (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between animate-fade-up [animation-delay:180ms]">
            <p className="text-sm text-muted-foreground">
              Plans change? Cancel more than 24 hours out and the hold comes right back.
            </p>
            <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={!d.canCancel}>
              Cancel this sit
            </Button>
          </div>
        ) : (
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild>
              <Link to="/">Book another night</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/backup">Join the backup list</Link>
            </Button>
          </div>
        )}

        {cancelMutation.isError ? (
          <div className="mt-4">
            <ErrorNote title="Couldn't cancel" body={cancelMutation.error instanceof Error ? cancelMutation.error.message : undefined} />
          </div>
        ) : null}

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent className="card-night border-border">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display text-2xl font-medium">
                Cancel {weekdayLong(evening.starts_at)} with Robin?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                {d.lateIfCancelledNow ? (
                  <span className="inline-flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <span>
                      This is inside the 24-hour window, so the <strong className="text-foreground">$20 hold is kept</strong>. Robin's
                      night will be offered to the backup list right away.
                    </span>
                  </span>
                ) : (
                  <span>
                    You're more than 24 hours out, so your <strong className="text-foreground">$20 hold is released</strong> in full.
                    The night goes to the backup list so it can refill itself.
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl border-border">Keep the sit</AlertDialogCancel>
              <AlertDialogAction
                className="rounded-xl bg-destructive/20 text-destructive hover:bg-destructive/30"
                onClick={(e) => {
                  e.preventDefault();
                  cancelMutation.mutate();
                }}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? <Loader2 className="animate-spin" /> : null}
                Yes, cancel
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {isNew ? (
          <p className="mt-8 text-center text-xs text-muted-foreground">
            Bookmark this page. It's your link to see or change the booking.{" "}
            <button className="text-gold underline-offset-4 hover:underline" onClick={() => navigate({ to: "/booking/$id", params: { id }, search: {}, replace: true })}>
              Done
            </button>
          </p>
        ) : null}
      </div>
    </PageShell>
  );
}

function Item({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gold-soft text-gold">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
        <dd className="text-[15px] font-medium text-foreground">{value}</dd>
        {sub ? <dd className="text-xs text-muted-foreground">{sub}</dd> : null}
      </div>
    </div>
  );
}
