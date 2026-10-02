import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Daily job (8am Central): send morning-of reminders that are due, expire stale offers,
// complete finished sits and release their holds, and roll standing availability forward.
// Accepts either the managed cron bearer secret or the project's publishable key (used by
// the database scheduler). Everything it does is idempotent, so a stray call is harmless.
async function authorize(request: Request): Promise<Response | null> {
  const apikey = request.headers.get("apikey");
  const publishable = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (apikey && publishable && apikey === publishable) return null;
  return authenticateCronRequest(request);
}

export const Route = createFileRoute("/api/public/hooks/daily")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authorize(request);
        if (denied) return denied;
        const { housekeeping } = await import("@/lib/night-owl.server");
        const { dispatchDueEmails } = await import("@/lib/emails.server");
        await housekeeping();
        const emails = await dispatchDueEmails();
        return Response.json({ ok: true, emails, at: new Date().toISOString() });
      },
    },
  },
});
