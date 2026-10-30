-- ====================================================================
-- ACNABIN FA Count: logic + security fixes (run AFTER COMPLETE_SETUP.sql and 05_fix_engagement_rls.sql)
-- Safe to re-run. Paste into the Supabase SQL Editor and run once.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Verification: unique key the app saves against + review columns
-- --------------------------------------------------------------------
ALTER TABLE public.verification
  ADD COLUMN IF NOT EXISTS review_comment TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_explanation TEXT;

-- One record per tag per room (group assets can be counted in several rooms and are summed)
ALTER TABLE public.verification DROP CONSTRAINT IF EXISTS verification_tag_location_key;
ALTER TABLE public.verification ADD CONSTRAINT verification_tag_location_key UNIQUE (tag_no, location_id);

ALTER TABLE public.found_not_in_far ADD COLUMN IF NOT EXISTS remarks TEXT;

-- --------------------------------------------------------------------
-- 2. Privilege-escalation fixes
-- --------------------------------------------------------------------
-- 2a. Active users only: a deactivated user has no role
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND active = true;
$$;

CREATE OR REPLACE FUNCTION public.is_reviewer_or_above()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND active = true
      AND role IN ('team_lead', 'reviewer', 'manager', 'admin')
  );
$$;

-- 2b. New sign-ups are always counters. Roles are set only by the admin invite API (service key).
--     (Previously the role was read from user-supplied sign-up metadata, so anyone could sign up as admin.)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'counter',
    true
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

-- 2c. A user may edit their own name, but never their role / active flag / email
CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (NEW.role IS DISTINCT FROM OLD.role
          OR NEW.active IS DISTINCT FROM OLD.active
          OR NEW.email IS DISTINCT FROM OLD.email)
     AND COALESCE(public.get_current_user_role(), '') <> 'admin' THEN
    RAISE EXCEPTION 'Only an admin can change role, active status or email';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_update ON public.profiles;
CREATE TRIGGER trg_guard_profile_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_update();

-- 2d. The counter view was readable by the anonymous role (view runs with owner rights)
REVOKE ALL ON public.asset_counter_view FROM anon, PUBLIC;
GRANT SELECT ON public.asset_counter_view TO authenticated;

-- --------------------------------------------------------------------
-- 3. Verification result: group assets are summed across rooms (FR-12)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_auto_set_verification_result()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_far_qty NUMERIC(10,2) := 1;
  v_other_qty NUMERIC(10,2) := 0;
BEGIN
  SELECT COALESCE(far_qty, 1) INTO v_far_qty FROM public.asset WHERE tag_no = NEW.tag_no;

  SELECT COALESCE(SUM(physical_qty), 0) INTO v_other_qty
  FROM public.verification v
  WHERE v.tag_no = NEW.tag_no AND v.found = 'Yes' AND v.id IS DISTINCT FROM NEW.id;

  NEW.result := public.calculate_verification_result(
    NEW.found,
    CASE WHEN NEW.found = 'Yes' THEN v_other_qty + NEW.physical_qty ELSE NEW.physical_qty END,
    v_far_qty, NEW.condition, NEW.tag_status
  );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- When a second room is counted, the first room's result must be recalculated too
CREATE OR REPLACE FUNCTION public.trg_resync_sibling_results()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_far_qty NUMERIC(10,2) := 1;
  v_total NUMERIC(10,2) := 0;
BEGIN
  SELECT COALESCE(far_qty, 1) INTO v_far_qty FROM public.asset WHERE tag_no = NEW.tag_no;
  SELECT COALESCE(SUM(physical_qty), 0) INTO v_total
  FROM public.verification v WHERE v.tag_no = NEW.tag_no AND v.found = 'Yes';

  UPDATE public.verification v
  SET result = public.calculate_verification_result(
        v.found, CASE WHEN v.found = 'Yes' THEN v_total ELSE v.physical_qty END,
        v_far_qty, v.condition, v.tag_status)
  WHERE v.tag_no = NEW.tag_no
    AND v.id <> NEW.id
    AND v.result IS DISTINCT FROM public.calculate_verification_result(
        v.found, CASE WHEN v.found = 'Yes' THEN v_total ELSE v.physical_qty END,
        v_far_qty, v.condition, v.tag_status);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_verification_resync ON public.verification;
CREATE TRIGGER trg_verification_resync
  AFTER INSERT OR UPDATE OF found, physical_qty ON public.verification
  FOR EACH ROW EXECUTE FUNCTION public.trg_resync_sibling_results();

-- --------------------------------------------------------------------
-- 4. Write guards: locked rooms / engagements, review rights, active users
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_verification_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_active BOOLEAN;
  v_loc_status TEXT;
  v_eng_status TEXT;
  v_is_reviewer BOOLEAN;
BEGIN
  -- Internal result recalculation only touches result/updated_at
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'result' - 'updated_at') = (to_jsonb(OLD) - 'result' - 'updated_at') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- service key / internal

  SELECT active INTO v_active FROM public.profiles WHERE id = auth.uid();
  IF COALESCE(v_active, false) = false THEN
    RAISE EXCEPTION 'Your account is deactivated';
  END IF;

  IF NEW.engagement_id IS NULL THEN
    SELECT engagement_id INTO NEW.engagement_id FROM public.asset WHERE tag_no = NEW.tag_no;
  END IF;

  SELECT status INTO v_eng_status FROM public.engagement WHERE id = NEW.engagement_id;
  IF v_eng_status IN ('locked', 'closed') THEN
    RAISE EXCEPTION 'The engagement is % and can no longer be changed', v_eng_status;
  END IF;

  IF NEW.location_id IS NOT NULL THEN
    SELECT status INTO v_loc_status FROM public.location WHERE id = NEW.location_id;
    IF v_loc_status = 'signed_off' THEN
      RAISE EXCEPTION 'This location is signed off. Ask a Team Lead to reopen it.';
    END IF;
  END IF;

  v_is_reviewer := public.is_reviewer_or_above();

  IF TG_OP = 'UPDATE' THEN
    IF (NEW.review_status IS DISTINCT FROM OLD.review_status
        OR NEW.review_comment IS DISTINCT FROM OLD.review_comment
        OR NEW.client_explanation IS DISTINCT FROM OLD.client_explanation) THEN
      IF NOT v_is_reviewer THEN
        RAISE EXCEPTION 'Only a reviewer or above can approve, send back or comment on records';
      END IF;
      IF NEW.review_status IS DISTINCT FROM OLD.review_status THEN
        NEW.reviewed_by := auth.uid();
        NEW.reviewed_at := now();
      END IF;
    ELSIF OLD.review_status = 'sent_back' THEN
      -- Counter fixed a record that was sent back: it goes back into the review queue
      NEW.review_status := 'pending';
    ELSIF OLD.review_status = 'approved' AND NOT v_is_reviewer THEN
      RAISE EXCEPTION 'This record is approved. Ask a reviewer to send it back before editing.';
    END IF;
  ELSE
    NEW.review_status := 'pending';
    NEW.review_comment := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_00_guard_verification ON public.verification;
CREATE TRIGGER trg_00_guard_verification
  BEFORE INSERT OR UPDATE ON public.verification
  FOR EACH ROW EXECUTE FUNCTION public.guard_verification_write();

-- Found-not-in-FAR / movement / doc_check: fill engagement_id, block after lock
CREATE OR REPLACE FUNCTION public.guard_engagement_open()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status TEXT;
BEGIN
  IF NEW.engagement_id IS NULL THEN
    SELECT id INTO NEW.engagement_id FROM public.engagement ORDER BY created_at LIMIT 1;
  END IF;
  IF auth.uid() IS NOT NULL THEN
    SELECT status INTO v_status FROM public.engagement WHERE id = NEW.engagement_id;
    IF v_status IN ('locked', 'closed') THEN
      RAISE EXCEPTION 'The engagement is % and can no longer be changed', v_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_found_not_in_far ON public.found_not_in_far;
CREATE TRIGGER trg_guard_found_not_in_far BEFORE INSERT OR UPDATE ON public.found_not_in_far
  FOR EACH ROW EXECUTE FUNCTION public.guard_engagement_open();
DROP TRIGGER IF EXISTS trg_guard_movement ON public.movement;
CREATE TRIGGER trg_guard_movement BEFORE INSERT OR UPDATE ON public.movement
  FOR EACH ROW EXECUTE FUNCTION public.guard_engagement_open();
DROP TRIGGER IF EXISTS trg_guard_doc_check ON public.doc_check;
CREATE TRIGGER trg_guard_doc_check BEFORE INSERT OR UPDATE ON public.doc_check
  FOR EACH ROW EXECUTE FUNCTION public.guard_engagement_open();

-- --------------------------------------------------------------------
-- 5. RPCs the app calls
-- --------------------------------------------------------------------
-- 5a. Where was this tag already verified? (counters can't read other counters' rows under RLS)
CREATE OR REPLACE FUNCTION public.lookup_tag_status(p_tag TEXT)
RETURNS TABLE (
  verification_id UUID, location_id UUID, building TEXT, floor TEXT, room TEXT,
  counter_name TEXT, verified_at TIMESTAMPTZ, physical_qty NUMERIC, found TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.id, v.location_id, l.building, l.floor, l.room, p.full_name, v.created_at, v.physical_qty, v.found
  FROM public.verification v
  LEFT JOIN public.location l ON l.id = v.location_id
  LEFT JOIN public.profiles p ON p.id = v.counter_id
  WHERE v.tag_no = p_tag AND auth.uid() IS NOT NULL
  ORDER BY v.created_at;
$$;

-- 5b. Duplicate-tag flag: recorded in the audit log, never overwrites the original record
CREATE OR REPLACE FUNCTION public.flag_duplicate_tag(p_tag TEXT, p_room TEXT, p_note TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  INSERT INTO public.audit_log (entity, record_id, field, old_value, new_value, reason, changed_by)
  VALUES ('verification', p_tag, 'duplicate_tag_flag', NULL, 'flagged',
          COALESCE(NULLIF(p_note, ''), 'Duplicate tag reported') || ' (room: ' || COALESCE(p_room, '-') || ')',
          auth.uid());
END;
$$;

-- 5c. Close a location with client sign-off (FR-19). Counter assigned to the room, Team Lead or Admin.
CREATE OR REPLACE FUNCTION public.close_location(
  p_location UUID, p_areas TEXT, p_reason TEXT,
  p_rep_name TEXT, p_rep_designation TEXT, p_signature TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role TEXT; v_loc public.location%ROWTYPE;
BEGIN
  v_role := public.get_current_user_role();
  IF v_role IS NULL THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT * INTO v_loc FROM public.location WHERE id = p_location;
  IF NOT FOUND THEN RAISE EXCEPTION 'Location not found'; END IF;
  IF v_loc.status = 'signed_off' THEN RAISE EXCEPTION 'This location is already signed off'; END IF;
  IF NOT (v_role IN ('admin', 'team_lead')
          OR (v_role = 'counter' AND (v_loc.assigned_counter = auth.uid() OR v_loc.assigned_counter IS NULL))) THEN
    RAISE EXCEPTION 'You are not assigned to this location';
  END IF;
  IF COALESCE(trim(p_rep_name), '') = '' OR COALESCE(p_signature, '') = '' THEN
    RAISE EXCEPTION 'Client representative name and signature are required';
  END IF;
  IF COALESCE(trim(p_areas), '') <> '' AND COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Give a reason for the areas not accessed';
  END IF;

  UPDATE public.location SET
    status = 'signed_off',
    areas_not_accessed = NULLIF(trim(p_areas), ''),
    unaccessed_reason = NULLIF(trim(p_reason), ''),
    client_rep_name = trim(p_rep_name),
    client_rep_designation = NULLIF(trim(p_rep_designation), ''),
    client_signature = p_signature,
    signed_off_at = now(),
    updated_at = now()
  WHERE id = p_location;

  INSERT INTO public.audit_log (entity, record_id, field, old_value, new_value, reason, changed_by)
  VALUES ('location', p_location::text, 'status', v_loc.status, 'signed_off', 'Location closed and signed off by client', auth.uid());
END;
$$;

-- 5d. Reopen a signed-off location (Team Lead / Admin, reason required)
CREATE OR REPLACE FUNCTION public.reopen_location(p_location UUID, p_reason TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(public.get_current_user_role(), '') NOT IN ('admin', 'team_lead') THEN
    RAISE EXCEPTION 'Only a Team Lead or Admin can reopen a location';
  END IF;
  IF COALESCE(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  UPDATE public.location SET status = 'open', signed_off_at = NULL, client_signature = NULL, updated_at = now()
  WHERE id = p_location AND status = 'signed_off';
  INSERT INTO public.audit_log (entity, record_id, field, old_value, new_value, reason, changed_by)
  VALUES ('location', p_location::text, 'status', 'signed_off', 'open', p_reason, auth.uid());
END;
$$;

-- 5e. Close the engagement (FR-29): Pending assets become Not Found with a reason, then lock
CREATE OR REPLACE FUNCTION public.close_engagement(p_engagement UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INTEGER;
BEGIN
  IF COALESCE(public.get_current_user_role(), '') NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Only a Manager or Admin can close the engagement';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.engagement WHERE id = p_engagement AND status = 'active') THEN
    RAISE EXCEPTION 'Engagement is not active';
  END IF;

  INSERT INTO public.verification (engagement_id, tag_no, found, counter_id, location_id, remarks, count_date)
  SELECT a.engagement_id, a.tag_no, 'No', auth.uid(), NULL,
         'Marked Not Found at engagement close: no verification was recorded', CURRENT_DATE
  FROM public.asset a
  WHERE a.engagement_id = p_engagement AND a.cost > 0
    AND NOT EXISTS (SELECT 1 FROM public.verification v WHERE v.tag_no = a.tag_no)
    AND NOT EXISTS (SELECT 1 FROM public.doc_check d WHERE d.tag_no = a.tag_no);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.engagement SET status = 'locked', count_end_date = COALESCE(count_end_date, CURRENT_DATE), updated_at = now()
  WHERE id = p_engagement;

  INSERT INTO public.audit_log (entity, record_id, field, old_value, new_value, reason, changed_by)
  VALUES ('engagement', p_engagement::text, 'status', 'active', 'locked',
          v_count || ' pending assets marked Not Found; engagement locked', auth.uid());
  RETURN v_count;
END;
$$;

-- 5f. Live dashboard numbers (Reviewer and above; includes cost)
CREATE OR REPLACE FUNCTION public.dashboard_stats()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r JSONB;
BEGIN
  IF NOT public.is_reviewer_or_above() THEN RAISE EXCEPTION 'Not authorised'; END IF;

  WITH counted AS (SELECT DISTINCT tag_no FROM public.verification),
  cls AS (
    SELECT a.asset_class,
           count(*) AS total, COALESCE(sum(a.cost), 0) AS cost,
           count(c.tag_no) AS verified,
           COALESCE(sum(a.cost) FILTER (WHERE c.tag_no IS NOT NULL), 0) AS verified_cost
    FROM public.asset a LEFT JOIN counted c ON c.tag_no = a.tag_no
    WHERE a.method <> 'Document' AND a.cost > 0
    GROUP BY a.asset_class ORDER BY a.asset_class
  )
  SELECT jsonb_build_object(
    'engagement', (SELECT to_jsonb(e) FROM public.engagement e ORDER BY created_at LIMIT 1),
    'totals', (SELECT jsonb_build_object(
        'assets', count(*), 'cost', COALESCE(sum(cost), 0),
        'verifiable', count(*) FILTER (WHERE method <> 'Document'),
        'verifiable_cost', COALESCE(sum(cost) FILTER (WHERE method <> 'Document'), 0),
        'document', count(*) FILTER (WHERE method = 'Document'))
      FROM public.asset WHERE cost > 0),
    'verified', (SELECT jsonb_build_object('assets', count(*), 'cost', COALESCE(sum(a.cost), 0))
      FROM counted c JOIN public.asset a ON a.tag_no = c.tag_no WHERE a.method <> 'Document'),
    'results', (SELECT COALESCE(jsonb_object_agg(result, n), '{}'::jsonb)
      FROM (SELECT result, count(*) n FROM public.verification GROUP BY result) t),
    'conditions', (SELECT COALESCE(jsonb_object_agg(condition, n), '{}'::jsonb)
      FROM (SELECT condition, count(*) n FROM public.verification v WHERE v.found = 'Yes' GROUP BY condition) t),
    'by_class', (SELECT COALESCE(jsonb_agg(to_jsonb(cls)), '[]'::jsonb) FROM cls),
    'by_location', (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT l.id, l.building, l.floor, l.room, l.status, p.full_name AS counter,
               (SELECT count(*) FROM public.verification v WHERE v.location_id = l.id) AS verified
        FROM public.location l LEFT JOIN public.profiles p ON p.id = l.assigned_counter
        ORDER BY l.building, l.floor, l.room) t),
    'counters', (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT p.full_name AS name, count(*) AS total,
               count(*) FILTER (WHERE v.count_date = CURRENT_DATE) AS today
        FROM public.verification v JOIN public.profiles p ON p.id = v.counter_id
        GROUP BY p.full_name ORDER BY count(*) DESC) t),
    'review', jsonb_build_object(
        'pending', (SELECT count(*) FROM public.verification WHERE review_status = 'pending'),
        'sent_back', (SELECT count(*) FROM public.verification WHERE review_status = 'sent_back'),
        'approved', (SELECT count(*) FROM public.verification WHERE review_status = 'approved'),
        'found_not_in_far', (SELECT count(*) FROM public.found_not_in_far),
        'movements', (SELECT count(*) FROM public.movement),
        'duplicate_flags', (SELECT count(*) FROM public.audit_log WHERE field = 'duplicate_tag_flag'),
        'doc_checked', (SELECT count(DISTINCT tag_no) FROM public.doc_check)),
    'zero_cost', (SELECT count(*) FROM public.asset WHERE cost <= 0)
  ) INTO r;
  RETURN r;
END;
$$;

-- RPCs are for signed-in users only
REVOKE EXECUTE ON FUNCTION public.lookup_tag_status(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.flag_duplicate_tag(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.close_location(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reopen_location(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.close_engagement(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_stats() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_current_user_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_reviewer_or_above() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_tag_status(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flag_duplicate_tag(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_location(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_location(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_engagement(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_reviewer_or_above() TO authenticated;

-- --------------------------------------------------------------------
-- 6. Extra policies the app needs
-- --------------------------------------------------------------------
-- Reviewers see all photos / need to update found_not_in_far explanations (policy added in 05)
-- Photos are evidence: insert only, tied to a verification the user can see
DROP POLICY IF EXISTS "Users insert photo" ON public.photo;
CREATE POLICY "Users insert photo" ON public.photo FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.verification v WHERE v.id = verification_id));

-- Reviewers also read asset cost/NBV through the existing "Auditors above counter select asset" policy.

-- --------------------------------------------------------------------
-- 7. Private evidence bucket + policies (was missing from COMPLETE_SETUP.sql, so photo upload failed)
-- --------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('evidence', 'evidence', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880;

DROP POLICY IF EXISTS "Auditors can upload evidence photos" ON storage.objects;
CREATE POLICY "Auditors can upload evidence photos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'evidence');

DROP POLICY IF EXISTS "Auditors can view evidence photos" ON storage.objects;
CREATE POLICY "Auditors can view evidence photos" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'evidence');
-- Note: no UPDATE or DELETE policy on purpose. Evidence photos are never overwritten or removed.

-- --------------------------------------------------------------------
-- 8. Make the API see the new functions immediately (fixes "Could not find the function ... in the schema cache")
-- --------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
