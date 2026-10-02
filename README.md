# Night Owl Sitting Co. 🦉

A booking site for **Robin**, a solo babysitter in Austin who works Friday and Saturday evenings (6–11pm) for three regular families. Parents book an open evening with a refundable **$20 card hold**. If someone cancels, the next family on the backup list automatically gets a 30-minute offer. Robin sees everything on a private dashboard.

**Live app:** https://build-ship-share.lovable.app

> Payments run in **Stripe test mode only**. Real cards are never charged.

---

## Judge quick start (about 5 minutes)

### Demo login (Robin's dashboard)

| | |
|---|---|
| Page | https://build-ship-share.lovable.app/tonight |
| Email | `robin@nightowlsitting.demo` |
| Password | `lamp-in-the-window` |

Or just click **"Use the demo account"** on that page. One click signs you in.

### Test card (for booking)

| Card number | Expiry | CVC | ZIP |
|---|---|---|---|
| `4242 4242 4242 4242` | any future date (e.g. 12/34) | any 3 digits | any 5 digits |

### Walkthrough

1. **Home page:** open the live app. Pick a family (Alvarez, Okafor or Chen) and an open evening on Robin's calendar. Closed evenings can't be picked.
2. **Book with a hold:** the card form opens right on the page. Enter the test card. You'll see a confirmation like *"Saturday is yours, Priya"*. The $20 is only held, never charged.
3. **Booking page:** from the confirmation, open the booking and try **Cancel**. The evening reopens and the first waiting backup family gets a 30-minute offer by email.
4. **Backup list** (`/backup`): join the waitlist for a full weekend.
5. **Text Robin** (`/inbound`): send a message like *"Is Robin free Saturday?"*. An AI reply answers using the real calendar.
6. **Robin's dashboard** (`/tonight`): sign in with the demo login above. You'll see this weekend's sits, the impact meter (requests answered, nights filled, cancellations covered, earnings protected), the email outbox, and the **Run housekeeping** button.

---

## Features

- Public calendar of Friday and Saturday evenings. Booking a closed evening is blocked on the server.
- $20 refundable card hold (Stripe Embedded Checkout, test mode, manual capture).
- Confirmation email and a morning-of reminder, queued in an outbox you can see on the dashboard.
- Cancellation with automatic, time-limited backup offers.
- AI text-back assistant (Lovable AI) that answers questions about availability.
- Sitter dashboard with an impact meter computed from real records.
- Daily housekeeping job (expires stale holds and offers, rolls evenings forward) plus a Stripe webhook as a safety net.
- All times are stored in UTC and shown in Austin time (America/Chicago).

## Tech stack

- **TanStack Start** (React 19, Vite 7, server functions), deployed to an edge runtime
- **Tailwind CSS v4**, shadcn/ui, Fraunces and Inter fonts
- **Lovable Cloud** (Postgres, auth, row-level security, pg_cron)
- **Stripe** (sandbox) through the Lovable connector gateway
- **Lovable AI Gateway** for the text-back assistant

## Project layout

```text
src/
  routes/                 pages: index, book.$token, booking.$id, booking.return,
                          backup, claim.$token, inbound, tonight
  routes/api/public/      payments/webhook (Stripe), hooks/daily (cron)
  lib/night-owl.server.ts all booking / cancel / backup / hold rules
  lib/*.functions.ts      server functions called by the pages
  lib/stripe.server.ts    Stripe client (test mode)
  components/night/       UI pieces (calendar, hold checkout, Meet Robin)
supabase/migrations/      database schema, security policies, demo data
AGENTS.md                 architecture rules
```

## Run locally

```sh
bun install      # or npm install
bun run dev      # http://localhost:8080
```

Backend config (database URL and keys) is managed by Lovable Cloud. A local copy needs a `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Server features also need `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY` and the Stripe connector key.

## Known limits

- Emails are queued and visible on the dashboard. Actual sending starts once a verified sender domain is added.
- Test mode only, by design.
