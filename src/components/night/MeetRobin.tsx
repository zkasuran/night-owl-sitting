import { BookOpen, Clock, MessageCircle, Users } from "lucide-react";
import storytime from "@/assets/robin-storytime.jpg";
import blocks from "@/assets/robin-blocks.jpg";
import { SectionTitle } from "@/components/night/Bits";

const facts = [
  {
    icon: Clock,
    title: "Fridays and Saturdays, 6 to 11",
    body: "Date-night hours, every weekend. In class the rest of the week, which is why the texting is handled for her.",
  },
  {
    icon: Users,
    title: "A small circle of repeat families",
    body: "The Alvarezes, the Chens, the Okafors. Kids who know her, parents who don't have to re-explain bedtime.",
  },
  {
    icon: BookOpen,
    title: "Books, blocks, bedtime on time",
    body: "Pajamas on, one more story, lights out at the hour you wrote down. You get a text when they're asleep.",
  },
  {
    icon: MessageCircle,
    title: "Answers even mid-sit",
    body: "Ask about a night and you get a real answer from her calendar in seconds, plus a one-tap link to hold it.",
  },
];

export function MeetRobin() {
  return (
    <section className="mt-20" aria-labelledby="meet-robin">
      <SectionTitle eyebrow="Who's at your door" title="Meet Robin." />
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="relative">
          <div className="grid grid-cols-[1.35fr_1fr] gap-3 sm:gap-4">
            <figure className="card-night overflow-hidden p-0">
              <img
                src={storytime}
                alt="Robin on the living room rug at night, reading a picture book to two laughing kids in pajamas"
                width={1413}
                height={1060}
                loading="lazy"
                className="aspect-[4/5] h-full w-full object-cover"
              />
            </figure>
            <div className="flex flex-col gap-3 sm:gap-4">
              <figure className="card-night overflow-hidden p-0">
                <img
                  src={blocks}
                  alt="Robin kneeling on the floor, helping a toddler stack a tower of wooden blocks"
                  width={1200}
                  height={900}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
              </figure>
              <figcaption className="card-night flex flex-1 flex-col justify-center p-4">
                <p className="font-display text-3xl leading-none text-gold">6–11pm</p>
                <p className="mt-1.5 text-sm leading-snug text-muted-foreground">
                  Lights out on time, a text when they're asleep, and the house how you left it.
                </p>
              </figcaption>
            </div>
          </div>
        </div>

        <div>
          <p className="max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
            One sitter, not a marketplace. Robin has been the Friday-night fixture for the same few Austin families
            long enough that the kids ask for her by name.
          </p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {facts.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold-soft text-gold ring-1 ring-gold/20">
                  <f.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-medium text-foreground">{f.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
