-- Fix: engagement had RLS enabled but no policies, so every write was denied.
-- Safe to re-run. Run once in the Supabase SQL Editor.

DROP POLICY IF EXISTS "All users read engagement" ON public.engagement;
CREATE POLICY "All users read engagement" ON public.engagement
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Only admin writes engagement" ON public.engagement;
CREATE POLICY "Only admin writes engagement" ON public.engagement
  FOR ALL TO authenticated
  USING (public.get_current_user_role() = 'admin')
  WITH CHECK (public.get_current_user_role() = 'admin');

-- Same gap on doc_check (read-only policy existed, no write policy)
DROP POLICY IF EXISTS "Users write doc check" ON public.doc_check;
CREATE POLICY "Users write doc check" ON public.doc_check
  FOR ALL TO authenticated
  USING (public.is_reviewer_or_above() OR checked_by = auth.uid())
  WITH CHECK (public.is_reviewer_or_above() OR checked_by = auth.uid());

-- Updates on movement / found_not_in_far were also never allowed
DROP POLICY IF EXISTS "Users update movement" ON public.movement;
CREATE POLICY "Users update movement" ON public.movement
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_reviewer_or_above());

DROP POLICY IF EXISTS "Users update found not in far" ON public.found_not_in_far;
CREATE POLICY "Users update found not in far" ON public.found_not_in_far
  FOR UPDATE TO authenticated
  USING (logged_by = auth.uid() OR public.is_reviewer_or_above());
