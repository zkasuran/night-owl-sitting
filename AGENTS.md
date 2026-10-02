<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Architecture rules

- All booking, cancellation, backup-offer and hold logic lives in `src/lib/night-owl.server.ts` and is exposed only through `createServerFn` wrappers in `src/lib/night-owl.functions.ts`; components never touch the admin client. Why: one place owns the "never book a closed evening" invariant.
- Stripe is reached only through `createStripeClient()` in `src/lib/stripe.server.ts` (connector gateway); holds are always created in the sandbox environment regardless of build mode. Why: the product is test-mode only by requirement.
- Card holds use Stripe Embedded Checkout rendered in-page (`HoldCheckout` + `useHoldCheckout`), never a redirect to Stripe; completion goes through `/booking/return` → `completeCheckout`, which is idempotent per session and resolves races by returning the existing booking for the same payment intent. Why: a duplicate completion must never release a hold that is in use.
- `/api/public/payments/webhook` is the only Stripe webhook route; it verifies the signature and only reconciles state (expired sessions, released/captured holds). Why: the return page is the primary path, the webhook is the safety net.
- Housekeeping (stale holds, finished sits, expired offers, rolling evenings forward) runs lazily on public reads and once a day via a `pg_cron` job (`night-owl-daily`) that POSTs to `/api/public/hooks/daily` with the publishable key as `apikey`. Why: no separate scheduler to operate; every step is idempotent.
- Emails are queued in the `emails` table and dispatched by `dispatchDueEmails`; sending is a no-op until a verified sender domain exists. Why: the outbox is visible on /tonight even before delivery is wired.
- Photos are generated once into `src/assets/` and imported as ES modules; keep the same sitter (dark hair in a bun, dark knit sweater) across any new image. Why: one recognisable Robin.
