import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { MessageCircle, Moon, PhoneOff, Sparkles } from "lucide-react";
import { frontDoorQuery } from "@/lib/queries";
import { PageShell } from "@/components/night/SiteChrome";
import { AskRobin, DEFAULT_INBOUND } from "@/components/night/AskRobin";
import { SectionTitle } from "@/components/night/Bits";
import { OwlMark } from "@/components/night/Brand";

export const Route = createFileRoute("/inbound")({
  loader: ({ context }) => context.queryClient.ensureQueryData(frontDoorQuery),
  head: () => ({
    meta: [
      { title: "Inbound — Robin's text-back · Night Owl Sitting Co." },
      {
        name: "description",
        content:
          "Text Robin while she's mid-sit. The text-back reads your message, checks the real calendar, and replies in Robin's voice with one-tap booking links.",
      },
      { property: "og:title", content: "Inbound — Robin's text-back" },
      { property: "og:description", content: "Last-minute ask? Robin's text-back answers from the live calendar with one-tap booking links." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InboundPage,
});

function InboundPage() {
  const { data } = useSuspenseQuery(frontDoorQuery);
  return (
    <PageShell>
      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="card-night relative overflow-hidden p-5">
            <div aria-hidden className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gold/15 blur-2xl" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">Inbound</p>
            <h1 className="mt-1 text-3xl font-medium leading-tight text-foreground">The last-minute ask</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Robin is often mid-sit or in class and can't answer. Her text-back reads the message, recognises the
              family, works out the night they want, and replies from the real calendar.
            </p>
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-background/50 p-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold-soft text-gold">
                <PhoneOff className="h-5 w-5" />
              </span>
              <div className="text-sm">
                <p className="font-medium text-foreground">Robin's phone is face down</p>
                <p className="text-xs text-muted-foreground">Auto-reply is on. Every answer is live availability.</p>
              </div>
            </div>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              [MessageCircle, "Recognises the family by name or number"],
              [Moon, "Only offers evenings that are actually open"],
              [Sparkles, "Each option is a one-tap link that books and places the $20 hold"],
            ].map(([Icon, text]) => {
              const I = Icon as typeof MessageCircle;
              return (
                <li key={text as string} className="flex items-start gap-2.5">
                  <I className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  <span>{text as string}</span>
                </li>
              );
            })}
          </ul>
        </aside>

        <div>
          <SectionTitle
            eyebrow="Simulate a text"
            title={
              <span className="inline-flex items-center gap-2">
                <OwlMark className="h-7 w-7 text-gold" /> Text Robin
              </span>
            }
            aside={<span>Try it as a known family, or as a new number.</span>}
          />
          <AskRobin channel="inbound" families={data.families} initialMessage={DEFAULT_INBOUND} showSenderFields />
          <div className="mt-6 rounded-2xl border border-border/70 bg-card/40 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Things to try</p>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              <li>“It's Priya. Could you do a Friday in the next couple weeks?”</li>
              <li>“Marisol here, Diego got tickets for next Saturday, any chance?”</li>
              <li>“Hi, I'm Dana, the Alvarezes' neighbor. Do you take new families?”</li>
              <li>“Adaeze, are you around this Saturday? Reservation at 7:30.”</li>
            </ul>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
