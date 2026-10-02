# Night Owl Sitting Co. — roadmap

## Ready
- [ ] Upload the source to GitHub (user re-asked Oct 2) — Git sync must be linked by the project owner; agent to use the GitHub API connector as a fallback if the user connects it
- [ ] Outbound email delivery: connect a verified sender domain so queued confirmations/reminders/backup offers actually send (currently logged in the outbox, visible on /tonight)
- [ ] Sitter-side controls on /tonight: open/close an evening, mark a sit paid, edit a family's rate
- [ ] Parent "my bookings" lookup by email (magic link) so a family can find a confirmation page they lost
- [ ] Impact meter sparkline over the last 8 weeks

## Done
- [x] 1. Foundation: design system, Cloud schema + seed families, public parent page (/)
- [x] 2. Card-on-file hold ($20, Stripe test mode) — in-page embedded checkout, one-tap for families with a card, webhook keeps hold state honest
- [x] 3. Confirmation email + morning-of reminder queued in the outbox; daily 8am Central job scheduled
- [x] 4. Inbound AI text-back (/inbound) via Lovable AI, one-tap booking links
- [x] 5. Cancellation + backup list auto-refill (30-minute claim holds)
- [x] 6. Sitter dashboard /tonight behind Cloud auth, impact meter
- [x] 7. Visual polish: empty/loading/error states, micro-interactions, mobile
- [x] 8. Realistic demo seed across next three weekends
- [x] 9. Photos of Robin with the kids: doorstep hero, Meet Robin section
- [x] Publish + set public visibility
