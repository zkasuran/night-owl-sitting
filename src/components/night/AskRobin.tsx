import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Loader2, MessageCircle, Moon, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { askRobin } from "@/lib/night-owl.functions";
import type { InboundReply } from "@/lib/ai.server";
import type { PublicFamily } from "@/lib/night-owl.server";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OwlMark } from "@/components/night/Brand";
import { ErrorNote, HoldNote, Pill, Skeleton } from "@/components/night/Bits";
import { rate } from "@/lib/money";
import { cn } from "@/lib/utils";

export const DEFAULT_INBOUND = "Hey Robin! Any chance you're free this Saturday night? Dinner reservation at 7.";

export function AskRobin({
  channel,
  families,
  initialMessage = "",
  showSenderFields = channel === "inbound",
  className,
  compact = false,
}: {
  channel: "inbound" | "web";
  families?: PublicFamily[];
  initialMessage?: string;
  showSenderFields?: boolean;
  className?: string;
  compact?: boolean;
}) {
  const ask = useServerFn(askRobin);
  const [message, setMessage] = useState(initialMessage);
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [history, setHistory] = useState<{ message: string; reply: InboundReply }[]>([]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await ask({
        data: {
          message,
          senderName: senderName || null,
          senderPhone: senderPhone || null,
          channel,
          familyId,
        },
      });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSuccess: (reply) => {
      setHistory((h) => [...h, { message, reply }]);
      setMessage("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Robin's text-back hiccuped."),
  });

  const canSend = message.trim().length >= 2 && !mutation.isPending;

  return (
    <div className={cn("space-y-5", className)}>
      {/* Thread */}
      {history.length ? (
        <div className="space-y-5">
          {history.map((h, i) => (
            <div key={i} className="space-y-3">
              <Bubble side="parent" name={h.reply.senderName ?? h.reply.family?.parentFirstName ?? "Parent"}>
                {h.message}
              </Bubble>
              <ReplyCard reply={h.reply} />
            </div>
          ))}
        </div>
      ) : null}

      {mutation.isPending ? (
        <div className="space-y-3">
          <Bubble side="parent" name={senderName || "You"}>
            {message}
          </Bubble>
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold-soft text-gold">
              <OwlMark className="h-6 w-6" />
            </span>
            <div className="w-full max-w-xl rounded-2xl rounded-tl-md border border-border bg-card p-4">
              <p className="mb-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" /> Robin's text-back is checking the calendar…
              </p>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="mt-2 h-4 w-2/3" />
              <div className="mt-4 flex gap-2">
                <Skeleton className="h-10 w-40" />
                <Skeleton className="h-10 w-40" />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {mutation.isError && !mutation.isPending ? (
        <ErrorNote
          title="The text-back didn't go through."
          body={mutation.error instanceof Error ? mutation.error.message : "Try again in a moment."}
          action={
            <Button size="sm" variant="soft" onClick={() => mutation.mutate()}>
              Try again
            </Button>
          }
        />
      ) : null}

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) mutation.mutate();
        }}
        className="card-night p-4 sm:p-5"
      >
        {showSenderFields ? (
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="sender-name" className="text-xs text-muted-foreground">
                From
              </Label>
              <Input
                id="sender-name"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="Adaeze Okafor"
                className="mt-1 h-10 rounded-xl border-border bg-background/60"
                autoComplete="name"
              />
            </div>
            <div>
              <Label htmlFor="sender-phone" className="text-xs text-muted-foreground">
                Phone
              </Label>
              <Input
                id="sender-phone"
                value={senderPhone}
                onChange={(e) => setSenderPhone(e.target.value)}
                placeholder="(512) 555-0193"
                inputMode="tel"
                className="mt-1 h-10 rounded-xl border-border bg-background/60"
                autoComplete="tel"
              />
            </div>
          </div>
        ) : null}
        {families && families.length && !showSenderFields ? (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">I'm</span>
            {families.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFamilyId(f.id === familyId ? null : f.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  familyId === f.id
                    ? "border-gold/60 bg-gold-soft text-gold"
                    : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
                )}
              >
                {f.parentFirstName} {f.familyName}
              </button>
            ))}
          </div>
        ) : null}
        <Label htmlFor={`msg-${channel}`} className="sr-only">
          Your message to Robin
        </Label>
        <Textarea
          id={`msg-${channel}`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={compact ? 2 : 3}
          placeholder="Any chance you're free Friday? We'd be out 6 to 10."
          className="min-h-[72px] resize-none rounded-xl border-border bg-background/60 text-base leading-relaxed placeholder:text-muted-foreground/70"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSend) mutation.mutate();
          }}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-gold" />
            Robin's text-back answers from the live calendar, even mid-sit.
          </p>
          <Button type="submit" disabled={!canSend} className="min-w-[8.5rem]">
            {mutation.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            {channel === "inbound" ? "Send text" : "Ask Robin"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Bubble({ side, name, children }: { side: "parent" | "robin"; name: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-end gap-2", side === "parent" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-xl rounded-2xl px-4 py-3 text-[15px] leading-relaxed",
          side === "parent" ? "rounded-br-md bg-secondary text-foreground" : "rounded-bl-md bg-card text-foreground",
        )}
      >
        <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{name}</p>
        <p className="whitespace-pre-wrap">{children}</p>
      </div>
    </div>
  );
}

export function ReplyCard({ reply, className }: { reply: InboundReply; className?: string }) {
  const fits = reply.options.filter((o) => o.kind === "fit");
  const nearest = reply.options.filter((o) => o.kind === "nearest");
  return (
    <div className={cn("flex items-start gap-3 animate-fade-up", className)}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold-soft text-gold ring-1 ring-gold/25">
        <OwlMark className="h-6 w-6" />
      </span>
      <div className="w-full max-w-xl rounded-2xl rounded-tl-md border border-gold/25 bg-card p-4 shadow-card">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Robin</span>
          <Pill tone="gold">
            <Moon className="h-3 w-3" /> auto-reply · {reply.robinStatus}
          </Pill>
          {reply.family ? (
            <Pill tone="muted">
              {reply.family.familyName} family · {rate(reply.family.rateCents)}
            </Pill>
          ) : (
            <Pill tone="muted">new number</Pill>
          )}
        </div>
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{reply.reply}</p>

        {reply.options.length ? (
          <div className="mt-4 space-y-2">
            {fits.length ? (
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tap a night to book it</p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {fits.map((o) => (
                <OptionLink key={o.eveningId} token={o.token} label={o.label} primary />
              ))}
            </div>
            {nearest.length ? (
              <div className="pt-1">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Nearest open night</p>
                {nearest.map((o) => (
                  <OptionLink key={o.eveningId} token={o.token} label={o.label} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {reply.offerBackup ? (
          <div className="mt-4 rounded-xl border border-border bg-background/50 p-3">
            <p className="text-sm text-foreground">Want first dibs if that night frees up?</p>
            <Link
              to="/backup"
              search={{ weekend: reply.backupWeekend ?? undefined, family: reply.family?.id }}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-gold underline-offset-4 hover:underline"
            >
              Join the backup list <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : null}

        {!reply.family && reply.options.length ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Robin sends one-tap links to families she knows. Add your name and number above and she'll set you up.
          </p>
        ) : null}

        {reply.options.some((o) => o.token) ? <HoldNote compact className="mt-4" /> : null}
      </div>
    </div>
  );
}

function OptionLink({ token, label, primary = false }: { token: string; label: string; primary?: boolean }) {
  if (!token) {
    return (
      <span className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm text-muted-foreground">
        <MessageCircle className="h-4 w-4" /> {label}
      </span>
    );
  }
  return (
    <Link
      to="/book/$token"
      params={{ token }}
      className={cn(
        "inline-flex h-11 items-center justify-between gap-3 rounded-xl px-4 text-sm font-medium transition-all",
        primary
          ? "bg-primary text-primary-foreground shadow-soft hover:shadow-lamp"
          : "border border-gold/40 bg-gold-soft text-gold hover:bg-gold/20",
      )}
    >
      <span>{label}</span>
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}
