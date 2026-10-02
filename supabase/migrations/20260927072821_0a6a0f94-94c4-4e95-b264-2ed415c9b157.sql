-- ===== Enums =====
CREATE TYPE public.evening_status AS ENUM ('open', 'held', 'booked');
CREATE TYPE public.hold_status AS ENUM ('none', 'held', 'released', 'kept');
CREATE TYPE public.booking_status AS ENUM ('confirmed', 'cancelled', 'completed');
CREATE TYPE public.booking_source AS ENUM ('web', 'inbound', 'backup');
CREATE TYPE public.request_channel AS ENUM ('web', 'inbound');
CREATE TYPE public.backup_status AS ENUM ('waiting', 'offered', 'claimed', 'expired', 'withdrawn');
CREATE TYPE public.offer_status AS ENUM ('pending', 'claimed', 'expired', 'declined', 'superseded');
CREATE TYPE public.email_kind AS ENUM ('confirmation', 'reminder', 'backup_offer', 'cancellation', 'refill_confirmed', 'hold_released');
CREATE TYPE public.email_status AS ENUM ('queued', 'sent', 'failed', 'skipped');
CREATE TYPE public.app_role AS ENUM ('sitter');

-- ===== Roles =====
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- ===== Families =====
CREATE TABLE public.families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_name text NOT NULL,
  parent_name text NOT NULL,
  kids_summary text NOT NULL,
  address text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  default_rate_cents integer NOT NULL,
  notes text NOT NULL DEFAULT '',
  is_trusted boolean NOT NULL DEFAULT false,
  stripe_customer_id text,
  card_on_file boolean NOT NULL DEFAULT false,
  card_brand text,
  card_last4 text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.families TO authenticated;
GRANT ALL ON public.families TO service_role;
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sitter can view families"
ON public.families FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'sitter'));

-- ===== Evenings =====
CREATE TABLE public.evenings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status public.evening_status NOT NULL DEFAULT 'open',
  held_until timestamptz,
  held_for_family_id uuid REFERENCES public.families(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (starts_at)
);
CREATE INDEX evenings_starts_at_idx ON public.evenings (starts_at);
GRANT SELECT ON public.evenings TO anon, authenticated;
GRANT ALL ON public.evenings TO service_role;
ALTER TABLE public.evenings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view the evening calendar"
ON public.evenings FOR SELECT TO anon, authenticated
USING (true);

-- ===== Requests =====
CREATE TABLE public.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid REFERENCES public.families(id) ON DELETE SET NULL,
  message text NOT NULL,
  desired_window text NOT NULL DEFAULT '',
  channel public.request_channel NOT NULL DEFAULT 'web',
  sender_name text,
  sender_phone text,
  reply_text text,
  matched_evening_ids uuid[] NOT NULL DEFAULT '{}',
  answered_while_unavailable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.requests TO authenticated;
GRANT ALL ON public.requests TO service_role;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sitter can view requests"
ON public.requests FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'sitter'));

-- ===== Bookings =====
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  evening_id uuid NOT NULL REFERENCES public.evenings(id) ON DELETE CASCADE,
  rate_cents integer NOT NULL,
  hold_status public.hold_status NOT NULL DEFAULT 'none',
  hold_amount_cents integer NOT NULL DEFAULT 2000,
  status public.booking_status NOT NULL DEFAULT 'confirmed',
  source public.booking_source NOT NULL DEFAULT 'web',
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  cancelled_at timestamptz,
  late_cancellation boolean NOT NULL DEFAULT false,
  refill_of_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  confirmation_sent_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookings_evening_idx ON public.bookings (evening_id);
CREATE INDEX bookings_family_idx ON public.bookings (family_id);
GRANT SELECT ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sitter can view bookings"
ON public.bookings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'sitter'));

-- ===== One-tap booking links =====
CREATE TABLE public.booking_links (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  evening_id uuid NOT NULL REFERENCES public.evenings(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.requests(id) ON DELETE SET NULL,
  source public.booking_source NOT NULL DEFAULT 'inbound',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.booking_links TO authenticated;
GRANT ALL ON public.booking_links TO service_role;
ALTER TABLE public.booking_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sitter can view booking links"
ON public.booking_links FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'sitter'));

-- ===== Backup list =====
CREATE TABLE public.backup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  weekend_start date NOT NULL,
  nights text[] NOT NULL DEFAULT '{fri,sat}',
  status public.backup_status NOT NULL DEFAULT 'waiting',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, weekend_start)
);
GRANT SELECT ON public.backup_requests TO authenticated;
GRANT ALL ON public.backup_requests TO service_role;
ALTER TABLE public.backup_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sitter can view backup list"
ON public.backup_requests FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'sitter'));

CREATE TABLE public.backup_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_request_id uuid NOT NULL REFERENCES public.backup_requests(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  evening_id uuid NOT NULL REFERENCES public.evenings(id) ON DELETE CASCADE,
  freed_by_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  claim_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status public.offer_status NOT NULL DEFAULT 'pending',
  offered_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  resolved_at timestamptz,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX backup_offers_evening_idx ON public.backup_offers (evening_id);
GRANT SELECT ON public.backup_offers TO authenticated;
GRANT ALL ON public.backup_offers TO service_role;
ALTER TABLE public.backup_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sitter can view backup offers"
ON public.backup_offers FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'sitter'));

-- ===== Email outbox =====
CREATE TABLE public.emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.email_kind NOT NULL,
  to_email text NOT NULL,
  to_name text NOT NULL,
  subject text NOT NULL,
  text_body text NOT NULL,
  html_body text NOT NULL,
  family_id uuid REFERENCES public.families(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  offer_id uuid REFERENCES public.backup_offers(id) ON DELETE SET NULL,
  status public.email_status NOT NULL DEFAULT 'queued',
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX emails_status_sched_idx ON public.emails (status, scheduled_for);
GRANT SELECT ON public.emails TO authenticated;
GRANT ALL ON public.emails TO service_role;
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sitter can view emails"
ON public.emails FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'sitter'));

-- ===== Helpers =====
-- Robin's standing availability: Friday and Saturday 6:00–11:00pm Central.
CREATE OR REPLACE FUNCTION public.ensure_upcoming_evenings(_weeks integer DEFAULT 3)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  central_today date := (now() AT TIME ZONE 'America/Chicago')::date;
  next_friday date := central_today + (((5 - EXTRACT(DOW FROM central_today)::int) + 7) % 7);
  d date;
  inserted integer := 0;
  i integer;
BEGIN
  FOR i IN 0..(_weeks - 1) LOOP
    d := next_friday + (i * 7);
    INSERT INTO public.evenings (starts_at, ends_at)
    VALUES
      ((d::text || ' 18:00')::timestamp AT TIME ZONE 'America/Chicago', (d::text || ' 23:00')::timestamp AT TIME ZONE 'America/Chicago'),
      (((d + 1)::text || ' 18:00')::timestamp AT TIME ZONE 'America/Chicago', ((d + 1)::text || ' 23:00')::timestamp AT TIME ZONE 'America/Chicago')
    ON CONFLICT (starts_at) DO NOTHING;
    GET DIAGNOSTICS i = ROW_COUNT;
    inserted := inserted + i;
  END LOOP;
  RETURN inserted;
END;
$$;

-- ===== Seed: families =====
INSERT INTO public.families (id, family_name, parent_name, kids_summary, address, phone, email, default_rate_cents, notes, is_trusted, card_on_file, card_brand, card_last4) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Alvarez', 'Marisol Alvarez', 'Two kids, Lucía (7) and Mateo (4)', '2207 Bluebonnet Ln, Austin, TX 78704', '(512) 555-0142', 'marisol.alvarez@example.com', 2200, 'Regular Friday nights. Mateo needs his owl nightlight on. Lucía is allowed one show after dinner.', true, true, 'visa', '4242'),
  ('22222222-2222-4222-8222-222222222222', 'Chen', 'Priya Chen', 'One baby, Juniper (9 months)', '1311 E 6th St, Apt 4B, Austin, TX 78702', '(512) 555-0178', 'priya.chen@example.com', 2500, 'Occasional date nights. Juniper is down by 7:30, bottle in the fridge door. Text photos, Priya loves them.', true, true, 'mastercard', '5556'),
  ('33333333-3333-4333-8333-333333333333', 'Okafor', 'Adaeze Okafor', 'Three kids, Chidi (9), Nneka (6) and Amara (3)', '4602 Shoal Creek Blvd, Austin, TX 78756', '(512) 555-0193', 'adaeze.okafor@example.com', 2800, 'Saturday nights. Amara has a peanut allergy, EpiPen on the fridge. Chidi will negotiate bedtime; 9pm is the line.', true, true, 'amex', '0005');

-- ===== Seed: evenings, bookings, backup list, requests =====
DO $$
DECLARE
  central_today date := (now() AT TIME ZONE 'America/Chicago')::date;
  next_friday date := central_today + (((5 - EXTRACT(DOW FROM central_today)::int) + 7) % 7);
  last_friday date := central_today + (((5 - EXTRACT(DOW FROM central_today)::int) + 7) % 7) - 7;
  alvarez uuid := '11111111-1111-4111-8111-111111111111';
  chen uuid := '22222222-2222-4222-8222-222222222222';
  okafor uuid := '33333333-3333-4333-8333-333333333333';
  ev_w1_fri uuid := 'aaaaaaaa-0001-4aaa-8aaa-aaaaaaaaaaaa';
  ev_w1_sat uuid := 'aaaaaaaa-0002-4aaa-8aaa-aaaaaaaaaaaa';
  ev_w2_fri uuid := 'aaaaaaaa-0003-4aaa-8aaa-aaaaaaaaaaaa';
  ev_w2_sat uuid := 'aaaaaaaa-0004-4aaa-8aaa-aaaaaaaaaaaa';
  ev_w3_fri uuid := 'aaaaaaaa-0005-4aaa-8aaa-aaaaaaaaaaaa';
  ev_w3_sat uuid := 'aaaaaaaa-0006-4aaa-8aaa-aaaaaaaaaaaa';
  ev_p_fri uuid := 'aaaaaaaa-0007-4aaa-8aaa-aaaaaaaaaaaa';
  ev_p_sat uuid := 'aaaaaaaa-0008-4aaa-8aaa-aaaaaaaaaaaa';
  bk_w1_fri uuid := 'bbbbbbbb-0001-4bbb-8bbb-bbbbbbbbbbbb';
  bk_w1_sat uuid := 'bbbbbbbb-0002-4bbb-8bbb-bbbbbbbbbbbb';
  bk_w2_sat_cancelled uuid := 'bbbbbbbb-0003-4bbb-8bbb-bbbbbbbbbbbb';
  bk_p_fri uuid := 'bbbbbbbb-0004-4bbb-8bbb-bbbbbbbbbbbb';
  bk_p_sat_cancelled uuid := 'bbbbbbbb-0005-4bbb-8bbb-bbbbbbbbbbbb';
  bk_p_sat_refill uuid := 'bbbbbbbb-0006-4bbb-8bbb-bbbbbbbbbbbb';
  br_alvarez_w2 uuid := 'cccccccc-0001-4ccc-8ccc-cccccccccccc';
  br_chen_past uuid := 'cccccccc-0002-4ccc-8ccc-cccccccccccc';
  br_chen_w3 uuid := 'cccccccc-0003-4ccc-8ccc-cccccccccccc';
  of_alvarez_w2 uuid := 'dddddddd-0001-4ddd-8ddd-dddddddddddd';
  of_chen_past uuid := 'dddddddd-0002-4ddd-8ddd-dddddddddddd';
  ct text := 'America/Chicago';
BEGIN
  -- Upcoming three weekends
  INSERT INTO public.evenings (id, starts_at, ends_at, status) VALUES
    (ev_w1_fri, ((next_friday)::text || ' 18:00')::timestamp AT TIME ZONE ct, ((next_friday)::text || ' 23:00')::timestamp AT TIME ZONE ct, 'booked'),
    (ev_w1_sat, ((next_friday + 1)::text || ' 18:00')::timestamp AT TIME ZONE ct, ((next_friday + 1)::text || ' 23:00')::timestamp AT TIME ZONE ct, 'booked'),
    (ev_w2_fri, ((next_friday + 7)::text || ' 18:00')::timestamp AT TIME ZONE ct, ((next_friday + 7)::text || ' 23:00')::timestamp AT TIME ZONE ct, 'open'),
    (ev_w2_sat, ((next_friday + 8)::text || ' 18:00')::timestamp AT TIME ZONE ct, ((next_friday + 8)::text || ' 23:00')::timestamp AT TIME ZONE ct, 'open'),
    (ev_w3_fri, ((next_friday + 14)::text || ' 18:00')::timestamp AT TIME ZONE ct, ((next_friday + 14)::text || ' 23:00')::timestamp AT TIME ZONE ct, 'open'),
    (ev_w3_sat, ((next_friday + 15)::text || ' 18:00')::timestamp AT TIME ZONE ct, ((next_friday + 15)::text || ' 23:00')::timestamp AT TIME ZONE ct, 'open');

  -- Last weekend (history for earnings and the impact meter)
  INSERT INTO public.evenings (id, starts_at, ends_at, status) VALUES
    (ev_p_fri, ((last_friday)::text || ' 18:00')::timestamp AT TIME ZONE ct, ((last_friday)::text || ' 23:00')::timestamp AT TIME ZONE ct, 'booked'),
    (ev_p_sat, ((last_friday + 1)::text || ' 18:00')::timestamp AT TIME ZONE ct, ((last_friday + 1)::text || ' 23:00')::timestamp AT TIME ZONE ct, 'booked');

  -- Confirmed sits this coming weekend
  INSERT INTO public.bookings (id, family_id, evening_id, rate_cents, hold_status, status, source, stripe_payment_intent_id, confirmation_sent_at, created_at) VALUES
    (bk_w1_fri, alvarez, ev_w1_fri, 2200, 'held', 'confirmed', 'web', 'pi_demo_alvarez_w1', now() - interval '5 days', now() - interval '5 days'),
    (bk_w1_sat, okafor, ev_w1_sat, 2800, 'held', 'confirmed', 'inbound', 'pi_demo_okafor_w1', now() - interval '3 days', now() - interval '3 days');

  -- Chen booked the second Saturday, then cancelled a few hours ago (outside 24h, hold released)
  INSERT INTO public.bookings (id, family_id, evening_id, rate_cents, hold_status, status, source, stripe_payment_intent_id, confirmation_sent_at, cancelled_at, late_cancellation, created_at) VALUES
    (bk_w2_sat_cancelled, chen, ev_w2_sat, 2500, 'released', 'cancelled', 'web', 'pi_demo_chen_w2', now() - interval '6 days', now() - interval '2 hours', false, now() - interval '6 days');

  -- Last weekend: Alvarez completed Friday; Okafor cancelled Saturday late (hold kept), Chen covered it from the backup list
  INSERT INTO public.bookings (id, family_id, evening_id, rate_cents, hold_status, status, source, stripe_payment_intent_id, confirmation_sent_at, reminder_sent_at, created_at) VALUES
    (bk_p_fri, alvarez, ev_p_fri, 2200, 'released', 'completed', 'web', 'pi_demo_alvarez_past', now() - interval '12 days', ((last_friday)::text || ' 08:00')::timestamp AT TIME ZONE ct, now() - interval '12 days');
  INSERT INTO public.bookings (id, family_id, evening_id, rate_cents, hold_status, status, source, stripe_payment_intent_id, confirmation_sent_at, cancelled_at, late_cancellation, created_at) VALUES
    (bk_p_sat_cancelled, okafor, ev_p_sat, 2800, 'kept', 'cancelled', 'web', 'pi_demo_okafor_past', now() - interval '10 days', ((last_friday + 1)::text || ' 11:40')::timestamp AT TIME ZONE ct, true, now() - interval '10 days');
  INSERT INTO public.bookings (id, family_id, evening_id, rate_cents, hold_status, status, source, refill_of_booking_id, stripe_payment_intent_id, confirmation_sent_at, reminder_sent_at, created_at) VALUES
    (bk_p_sat_refill, chen, ev_p_sat, 2500, 'released', 'completed', 'backup', bk_p_sat_cancelled, 'pi_demo_chen_refill', ((last_friday + 1)::text || ' 12:05')::timestamp AT TIME ZONE ct, ((last_friday + 1)::text || ' 12:05')::timestamp AT TIME ZONE ct, ((last_friday + 1)::text || ' 12:02')::timestamp AT TIME ZONE ct);

  -- Backup list
  INSERT INTO public.backup_requests (id, family_id, weekend_start, nights, status, note, created_at) VALUES
    (br_alvarez_w2, alvarez, next_friday + 7, '{fri,sat}', 'offered', 'Anniversary weekend, either night works.', now() - interval '4 days'),
    (br_chen_past, chen, last_friday, '{sat}', 'claimed', 'Would love a Saturday if one opens.', now() - interval '9 days'),
    (br_chen_w3, chen, next_friday + 14, '{fri,sat}', 'waiting', 'Kevin''s birthday is that Friday.', now() - interval '1 day');

  -- Pending 30-minute offer for the freed second Saturday, and the claimed offer from last weekend
  INSERT INTO public.backup_offers (id, backup_request_id, family_id, evening_id, freed_by_booking_id, status, offered_at, expires_at) VALUES
    (of_alvarez_w2, br_alvarez_w2, alvarez, ev_w2_sat, bk_w2_sat_cancelled, 'pending', now() - interval '2 hours', now() + interval '30 minutes');
  INSERT INTO public.backup_offers (id, backup_request_id, family_id, evening_id, freed_by_booking_id, status, offered_at, expires_at, resolved_at, booking_id) VALUES
    (of_chen_past, br_chen_past, chen, ev_p_sat, bk_p_sat_cancelled, 'claimed', ((last_friday + 1)::text || ' 11:41')::timestamp AT TIME ZONE ct, ((last_friday + 1)::text || ' 12:11')::timestamp AT TIME ZONE ct, ((last_friday + 1)::text || ' 12:02')::timestamp AT TIME ZONE ct, bk_p_sat_refill);

  -- Requests answered while Robin was mid-sit or in class
  INSERT INTO public.requests (family_id, message, desired_window, channel, sender_name, sender_phone, reply_text, matched_evening_ids, answered_while_unavailable, created_at) VALUES
    (okafor, 'Hi Robin, it''s Adaeze. Are you free this Saturday? Tobe got us Uchi at 7:30.', 'Saturday evening', 'inbound', 'Adaeze Okafor', '(512) 555-0193', 'Hi Adaeze! Yes, Saturday 6–11pm is open. Tap to book and I''ll see the kids at 6. Tell Chidi 9pm is still the line.', ARRAY[ev_w1_sat], true, now() - interval '3 days'),
    (chen, 'hey!! any chance you could do a friday in the next couple weeks? no rush', 'a Friday soon', 'inbound', 'Priya Chen', '(512) 555-0178', 'Hi Priya! Two Fridays open: the 2nd week and the 3rd week, both 6–11pm. Tap either to lock it in. Give Juniper a squeeze from me.', ARRAY[ev_w2_fri, ev_w3_fri], true, now() - interval '2 days'),
    (alvarez, 'Robin! Diego surprised me with tickets for next Saturday. Any way you could take the kids?', 'next Saturday', 'inbound', 'Marisol Alvarez', '(512) 555-0142', 'Marisol, that''s the best. Next Saturday was just booked, but the Friday before is open, and I''ve put you first on the backup list for Saturday. If it frees up you''ll get a one-tap link.', ARRAY[ev_w2_fri], true, now() - interval '4 days'),
    (NULL, 'Hi, this is Dana, the Alvarezes'' neighbor. Do you take new families? Looking for a Friday in October.', 'a Friday in October', 'inbound', 'Dana Whitfield', '(512) 555-0161', 'Hi Dana! I sit for a small set of repeat families, but Marisol vouching goes a long way. Fridays on the 2nd and 3rd weekends are open, 6–11pm. Tap one and I''ll text you a quick intake before the night.', ARRAY[ev_w2_fri, ev_w3_fri], true, now() - interval '20 hours'),
    (okafor, 'Running 15 late tonight, sorry!', 'tonight', 'inbound', 'Adaeze Okafor', '(512) 555-0193', 'No problem at all, Adaeze. I''ll be at the door at 6 either way.', '{}', false, ((last_friday + 1)::text || ' 17:12')::timestamp AT TIME ZONE ct);

  -- Email history for the seeded bookings
  INSERT INTO public.emails (kind, to_email, to_name, subject, text_body, html_body, family_id, booking_id, status, scheduled_for, sent_at, created_at) VALUES
    ('confirmation', 'marisol.alvarez@example.com', 'Marisol Alvarez', 'You''re covered for Friday, Marisol', 'Night Owl Sitting — Alvarez family. Robin is booked for Friday 6:00–11:00pm Central at 2207 Bluebonnet Ln. $22/hr. Your $20 hold is released after the sit; it''s only kept if you cancel inside 24 hours.', '<p>Night Owl Sitting — Alvarez family. Robin is booked for Friday 6:00–11:00pm Central at 2207 Bluebonnet Ln. $22/hr. Your $20 hold is released after the sit; it''s only kept if you cancel inside 24 hours.</p>', alvarez, bk_w1_fri, 'sent', now() - interval '5 days', now() - interval '5 days', now() - interval '5 days'),
    ('confirmation', 'adaeze.okafor@example.com', 'Adaeze Okafor', 'You''re covered for Saturday, Adaeze', 'Night Owl Sitting — Okafor family. Robin is booked for Saturday 6:00–11:00pm Central at 4602 Shoal Creek Blvd. $28/hr. Your $20 hold is released after the sit; it''s only kept if you cancel inside 24 hours.', '<p>Night Owl Sitting — Okafor family. Robin is booked for Saturday 6:00–11:00pm Central at 4602 Shoal Creek Blvd. $28/hr. Your $20 hold is released after the sit; it''s only kept if you cancel inside 24 hours.</p>', okafor, bk_w1_sat, 'sent', now() - interval '3 days', now() - interval '3 days', now() - interval '3 days'),
    ('cancellation', 'priya.chen@example.com', 'Priya Chen', 'Your Saturday is cancelled, hold released', 'Night Owl Sitting — Chen family. Your Saturday sit is cancelled. Since it was more than 24 hours out, your $20 hold has been released. Hope to see Juniper soon.', '<p>Night Owl Sitting — Chen family. Your Saturday sit is cancelled. Since it was more than 24 hours out, your $20 hold has been released. Hope to see Juniper soon.</p>', chen, bk_w2_sat_cancelled, 'sent', now() - interval '2 hours', now() - interval '2 hours', now() - interval '2 hours');
  INSERT INTO public.emails (kind, to_email, to_name, subject, text_body, html_body, family_id, booking_id, offer_id, status, scheduled_for, sent_at, created_at) VALUES
    ('backup_offer', 'marisol.alvarez@example.com', 'Marisol Alvarez', 'A Saturday just opened up — want it?', 'Night Owl Sitting — Marisol, the Saturday you asked about just freed up. It''s yours for the next 30 minutes: tap the claim link and Robin is booked at your usual $22/hr. After that it goes to the next family.', '<p>Night Owl Sitting — Marisol, the Saturday you asked about just freed up. It''s yours for the next 30 minutes: tap the claim link and Robin is booked at your usual $22/hr. After that it goes to the next family.</p>', alvarez, NULL, of_alvarez_w2, 'sent', now() - interval '2 hours', now() - interval '2 hours', now() - interval '2 hours');
END $$;

-- Keep standing availability rolling forward for any weekends not covered by the seed
SELECT public.ensure_upcoming_evenings(3);