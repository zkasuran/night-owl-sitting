import { useEffect, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { finishCheckout } from "@/lib/night-owl.functions";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/night/SiteChrome";
import { ErrorNote } from "@/components/night/Bits";
import { OwlMark } from "@/components/night/Brand";

export const Route = createFileRoute("/booking/return")({
  validateSearch: (s) => z.object({ session_id: z.string().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Placing your hold — Night Owl Sitting Co." },
      { name: "description", content: "Finishing your date night booking with Robin." },
      { property: "og:title", content: "Placing your hold — Night Owl Sitting Co." },
      { property: "og:description", content: "Finishing your date night booking with Robin." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReturnPage,
});

// One completion per checkout session per page lifetime, even if the route remounts.
const inFlight = new Set<string>();

function ReturnPage() {
  const { session_id } = Route.useSearch();
  const navigate = useNavigate();
  const finish = useServerFn(finishCheckout);
  const started = useRef(false);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!session_id) throw new Error("Missing checkout reference.");
      const res = await finish({ data: { sessionId: session_id, origin: window.location.origin } });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSuccess: (res) => {
      if (res.bookingId) {
        navigate({ to: "/booking/$id", params: { id: res.bookingId }, search: { new: "1" }, replace: true });
      }
    },
    onSettled: () => {
      if (session_id) inFlight.delete(session_id);
    },
  });

  const { mutate } = mutation;
  useEffect(() => {
    if (!session_id || started.current || inFlight.has(session_id)) return;
    started.current = true;
    inFlight.add(session_id);
    mutate();
  }, [session_id, mutate]);

  const failed = mutation.data?.ok && mutation.data.failed ? mutation.data.failed : null;

  return (
    <PageShell>
      <div className="mx-auto max-w-md py-12 text-center">
        {!failed && !mutation.isError ? (
          <div className="animate-fade-up">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gold-soft text-gold ring-1 ring-gold/25 animate-lamp-pulse">
              <OwlMark className="h-10 w-10" />
            </span>
            <h1 className="mt-6 text-3xl font-medium text-foreground">Placing your hold…</h1>
            <p className="mt-2 inline-flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-gold" /> Locking in the night with Robin.
            </p>
          </div>
        ) : (
          <div className="animate-fade-up">
            <ErrorNote
              title="The evening is still open."
              body={failed ?? (mutation.error instanceof Error ? mutation.error.message : "The hold didn't go through.")}
              action={
                <div className="flex gap-2">
                  <Button asChild>
                    <Link to="/">Try again</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/inbound">Text Robin</Link>
                  </Button>
                </div>
              }
            />
          </div>
        )}
      </div>
    </PageShell>
  );
}
