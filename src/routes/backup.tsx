import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { frontDoorQuery } from "@/lib/queries";
import { joinBackupList } from "@/lib/night-owl.functions";
import { upcomingWeekendKeys, weekendHeading, weekendSpan } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PageShell } from "@/components/night/SiteChrome";
import { FamilyPicker } from "@/components/night/FamilyPicker";
import { HoldNote, SectionTitle, SuccessBurst } from "@/components/night/Bits";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  weekend: z.string().optional(),
  family: z.string().optional(),
});

export const Route = createFileRoute("/backup")({
  validateSearch: (s) => searchSchema.parse(s),
  loader: ({ context }) => context.queryClient.ensureQueryData(frontDoorQuery),
  head: () => ({
    meta: [
      { title: "Backup list — Night Owl Sitting Co." },
      {
        name: "description",
        content: "Want a weekend that's already booked? Join Robin's backup list and get a one-tap claim link the moment a night frees up.",
      },
      { property: "og:title", content: "Backup list — Night Owl Sitting Co." },
      { property: "og:description", content: "A cancelled night refills itself. Join the backup list for the weekend you want." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BackupPage,
});

function BackupPage() {
  const { data } = useSuspenseQuery(frontDoorQuery);
  const search = Route.useSearch();
  const join = useServerFn(joinBackupList);
  const weekends = upcomingWeekendKeys(3);

  const [familyId, setFamilyId] = useState<string | null>(search.family ?? null);
  const [weekend, setWeekend] = useState<string>(
    search.weekend && weekends.includes(search.weekend) ? search.weekend : (weekends[0] ?? ""),
  );
  const [nights, setNights] = useState<("fri" | "sat")[]>(["fri", "sat"]);
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!familyId) throw new Error("Pick your family first.");
      const res = await join({ data: { familyId, weekendStart: weekend, nights, note } });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't add you to the list."),
  });

  const family = data.families.find((f) => f.id === familyId);

  if (mutation.isSuccess) {
    return (
      <PageShell>
        <div className="mx-auto max-w-lg py-10 text-center animate-fade-up">
          <SuccessBurst />
          <h1 className="mt-6 text-3xl font-medium text-foreground">You're on the list, {family?.parentFirstName}.</h1>
          <p className="mt-3 text-muted-foreground">
            Weekend of {weekendSpan(mutation.data.weekendStart)} · {nights.map((n) => (n === "fri" ? "Friday" : "Saturday")).join(" or ")}.
            If a night frees up, you'll get an email with a one-tap claim link, held just for you for 30 minutes.
          </p>
          <HoldNote className="mt-5" />
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild variant="outline">
              <Link to="/">Back to the calendar</Link>
            </Button>
            <Button asChild variant="soft">
              <Link to="/inbound">Text Robin</Link>
            </Button>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl">
        <SectionTitle
          eyebrow="Backup list"
          title={
            <span className="inline-flex items-center gap-2">
              <BellRing className="h-6 w-6 text-gold" /> A cancelled night refills itself
            </span>
          }
        />
        <p className="-mt-2 mb-6 text-sm leading-relaxed text-muted-foreground">
          If the weekend you want is booked, put your family on the backup list. When a night frees up it's offered
          to the first matching family with a one-tap claim link, held for 30 minutes. Robin doesn't lift a finger.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-7"
        >
          <div>
            <p className="mb-2.5 text-sm font-medium text-foreground">Your family</p>
            <FamilyPicker families={data.families} value={familyId} onChange={setFamilyId} />
          </div>

          <div>
            <p className="mb-2.5 text-sm font-medium text-foreground">Which weekend?</p>
            <div role="radiogroup" className="grid gap-2.5 sm:grid-cols-3">
              {weekends.map((k) => {
                const active = weekend === k;
                const group = data.weekends.find((w) => w.key === k);
                const open = group?.evenings.filter((e) => e.status === "open").length ?? 0;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setWeekend(k)}
                    className={cn(
                      "rounded-2xl border bg-card p-4 text-left transition-all",
                      active ? "border-gold/60 shadow-lamp" : "border-border hover:border-muted-foreground/40",
                    )}
                  >
                    <p className="font-display text-lg text-foreground">{weekendHeading(k)}</p>
                    <p className="text-sm text-muted-foreground">{weekendSpan(k)}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {open === 0 ? "Fully booked" : `${open} night${open === 1 ? "" : "s"} still open`}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2.5 text-sm font-medium text-foreground">Which nights work?</p>
            <div className="flex gap-2.5">
              {(["fri", "sat"] as const).map((n) => {
                const on = nights.includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setNights((cur) => (on ? cur.filter((x) => x !== n) : [...cur, n]))}
                    className={cn(
                      "inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-all",
                      on ? "border-gold/60 bg-gold-soft text-gold" : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className={cn("grid h-5 w-5 place-items-center rounded-md border", on ? "border-gold bg-primary text-primary-foreground" : "border-border")}>
                      {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                    </span>
                    {n === "fri" ? "Friday" : "Saturday"}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label htmlFor="note" className="text-sm font-medium text-foreground">
              Anything Robin should know? <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={240}
              placeholder="Anniversary weekend, either night works."
              className="mt-2 resize-none rounded-xl border-border bg-card"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <HoldNote compact />
            <Button type="submit" size="lg" disabled={!familyId || !nights.length || mutation.isPending}>
              {mutation.isPending ? <Loader2 className="animate-spin" /> : <BellRing />}
              Put us on the list
            </Button>
          </div>
        </form>
      </div>
    </PageShell>
  );
}
