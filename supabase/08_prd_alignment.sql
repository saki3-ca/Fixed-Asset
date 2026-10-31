-- 08: Align database with PRD v1.0 (three roles, controls, no hard deletes)
-- Safe to re-run.

-- 1. Three roles only: admin, manager, counter (User / Counter)
UPDATE public.profiles SET role = 'manager' WHERE role IN ('team_lead', 'reviewer');
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'manager', 'counter'));

CREATE OR REPLACE FUNCTION public.is_reviewer_or_above()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('manager', 'admin') AND active = true
  );
$$;

-- 2. Users must not change their own role / active flag (privilege escalation)
CREATE OR REPLACE FUNCTION public.trg_protect_profile_privileges()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.active IS DISTINCT FROM OLD.active)
     AND COALESCE(public.get_current_user_role(), '') <> 'admin' THEN
    RAISE EXCEPTION 'Only an admin can change a user''s role or active status';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_profile_privileges ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileges BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_protect_profile_privileges();

-- 3. Users cannot approve their own verification records
CREATE OR REPLACE FUNCTION public.trg_no_self_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NEW.review_status = 'approved'
     AND NEW.review_status IS DISTINCT FROM OLD.review_status THEN
    IF NEW.counter_id = auth.uid() THEN
      RAISE EXCEPTION 'You cannot approve your own verification record';
    END IF;
    IF NOT public.is_reviewer_or_above() THEN
      RAISE EXCEPTION 'Only a manager or admin can approve records';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_no_self_approval ON public.verification;
CREATE TRIGGER trg_no_self_approval BEFORE UPDATE OF review_status ON public.verification
  FOR EACH ROW EXECUTE FUNCTION public.trg_no_self_approval();

-- 4. No hard deletes of audit evidence; audit log is append-only
CREATE OR REPLACE FUNCTION public.trg_block_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Records in % cannot be deleted (audit requirement)', TG_TABLE_NAME;
END $$;
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['verification','photo','found_not_in_far','movement','doc_check','audit_log'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_block_delete ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_block_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trg_block_delete()', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.trg_audit_log_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END $$;
DROP TRIGGER IF EXISTS trg_audit_log_no_update ON public.audit_log;
CREATE TRIGGER trg_audit_log_no_update BEFORE UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_append_only();

-- 5. Closed engagements are locked against ordinary changes to verification records
CREATE OR REPLACE FUNCTION public.trg_engagement_lock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE s TEXT;
BEGIN
  SELECT status INTO s FROM public.engagement WHERE id = NEW.engagement_id;
  IF s IN ('closed', 'locked') AND auth.uid() IS NOT NULL
     AND COALESCE(public.get_current_user_role(), '') <> 'admin' THEN
    RAISE EXCEPTION 'Engagement is % - records are locked', s;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_engagement_lock ON public.verification;
CREATE TRIGGER trg_engagement_lock BEFORE INSERT OR UPDATE ON public.verification
  FOR EACH ROW EXECUTE FUNCTION public.trg_engagement_lock();

-- 6. Photos: only the owner of the verification or a supervisor may read / add
DROP POLICY IF EXISTS "All users read photo" ON public.photo;
DROP POLICY IF EXISTS "Users insert photo" ON public.photo;
CREATE POLICY "Read photo for own or supervisor" ON public.photo FOR SELECT TO authenticated
  USING (public.is_reviewer_or_above() OR EXISTS (
    SELECT 1 FROM public.verification v WHERE v.id = photo.verification_id AND v.counter_id = auth.uid()));
CREATE POLICY "Insert photo for own or supervisor" ON public.photo FOR INSERT TO authenticated
  WITH CHECK (public.is_reviewer_or_above() OR EXISTS (
    SELECT 1 FROM public.verification v WHERE v.id = photo.verification_id AND v.counter_id = auth.uid()));

-- 7. Attribution cannot be forged on inserts
DROP POLICY IF EXISTS "Users insert found not in far" ON public.found_not_in_far;
CREATE POLICY "Users insert found not in far" ON public.found_not_in_far FOR INSERT TO authenticated
  WITH CHECK (logged_by = auth.uid());
DROP POLICY IF EXISTS "Users insert movement" ON public.movement;
CREATE POLICY "Users insert movement" ON public.movement FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- 8. Counter view must never expose financials (keep column list explicit)
GRANT SELECT ON public.asset_counter_view TO authenticated;
