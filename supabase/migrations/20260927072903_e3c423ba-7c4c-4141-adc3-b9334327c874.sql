CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
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
REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

DROP POLICY "Sitter can view families" ON public.families;
CREATE POLICY "Sitter can view families" ON public.families FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'sitter'));
DROP POLICY "Sitter can view requests" ON public.requests;
CREATE POLICY "Sitter can view requests" ON public.requests FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'sitter'));
DROP POLICY "Sitter can view bookings" ON public.bookings;
CREATE POLICY "Sitter can view bookings" ON public.bookings FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'sitter'));
DROP POLICY "Sitter can view booking links" ON public.booking_links;
CREATE POLICY "Sitter can view booking links" ON public.booking_links FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'sitter'));
DROP POLICY "Sitter can view backup list" ON public.backup_requests;
CREATE POLICY "Sitter can view backup list" ON public.backup_requests FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'sitter'));
DROP POLICY "Sitter can view backup offers" ON public.backup_offers;
CREATE POLICY "Sitter can view backup offers" ON public.backup_offers FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'sitter'));
DROP POLICY "Sitter can view emails" ON public.emails;
CREATE POLICY "Sitter can view emails" ON public.emails FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'sitter'));

DROP FUNCTION public.has_role(uuid, public.app_role);

REVOKE EXECUTE ON FUNCTION public.ensure_upcoming_evenings(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_upcoming_evenings(integer) TO service_role;