-- ====================================================================
-- ACNABIN FA Count - Step 2: Database Schema & Audit Engine
-- File: supabase/migrations/02_core_schema.sql
-- ====================================================================

-- 1. Helper Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Ensure profiles table exists from Step 1
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'counter' CHECK (role IN ('admin', 'team_lead', 'counter', 'reviewer', 'manager')),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Helper functions for user role evaluation
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_reviewer_or_above()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
      AND role IN ('team_lead', 'reviewer', 'manager', 'admin')
      AND active = true
  );
$$;

-- 2. Engagement Table
CREATE TABLE IF NOT EXISTS public.engagement (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_name TEXT NOT NULL,
    financial_year TEXT NOT NULL,
    far_cutoff_date DATE NOT NULL,
    count_start_date DATE,
    count_end_date DATE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'locked', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Location Table
CREATE TABLE IF NOT EXISTS public.location (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID REFERENCES public.engagement(id) ON DELETE CASCADE,
    building TEXT NOT NULL,
    floor TEXT NOT NULL,
    room TEXT NOT NULL,
    assigned_counter UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'signed_off')),
    areas_not_accessed TEXT,
    unaccessed_reason TEXT,
    client_rep_name TEXT,
    client_rep_designation TEXT,
    client_signature TEXT,
    signed_off_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_location_room UNIQUE (building, floor, room)
);

-- 4. Asset Table (tag_no IS the Primary Key = 8-digit SAP number)
CREATE TABLE IF NOT EXISTS public.asset (
    tag_no TEXT PRIMARY KEY,
    engagement_id UUID REFERENCES public.engagement(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    asset_class TEXT NOT NULL,
    gl_account TEXT,
    capitalized_on DATE,
    cost NUMERIC(18,2) NOT NULL DEFAULT 0,       -- SENSITIVE: Hidden from counters
    acc_dep NUMERIC(18,2) NOT NULL DEFAULT 0,    -- SENSITIVE: Hidden from counters
    nbv NUMERIC(18,2) NOT NULL DEFAULT 0,        -- SENSITIVE: Hidden from counters
    far_qty NUMERIC(10,2) NOT NULL DEFAULT 1,
    method TEXT NOT NULL DEFAULT 'Count' CHECK (method IN ('Count', 'Inspect', 'Vehicle', 'Document')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Safe View for Counters: asset_counter_view (Cost, Acc Dep, and NBV completely excluded)
CREATE OR REPLACE VIEW public.asset_counter_view AS
SELECT 
    tag_no,
    engagement_id,
    description,
    asset_class,
    gl_account,
    capitalized_on,
    far_qty,
    method,
    created_at,
    updated_at
FROM public.asset;

-- 6. Verification Table (Count findings, photos, GPS)
CREATE TABLE IF NOT EXISTS public.verification (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID REFERENCES public.engagement(id) ON DELETE CASCADE,
    tag_no TEXT NOT NULL REFERENCES public.asset(tag_no) ON UPDATE CASCADE,
    found TEXT CHECK (found IN ('Yes', 'No', 'Not Accessible')),
    count_date DATE NOT NULL DEFAULT CURRENT_DATE,
    counter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    location_id UUID REFERENCES public.location(id) ON DELETE SET NULL,
    department TEXT,
    custodian TEXT,
    tag_status TEXT NOT NULL DEFAULT 'Tag OK',
    serial_no TEXT,
    brand_model TEXT,
    physical_qty NUMERIC(10,2) NOT NULL DEFAULT 1,
    condition TEXT NOT NULL DEFAULT 'Good',
    in_use BOOLEAN NOT NULL DEFAULT true,
    remarks TEXT,
    result TEXT NOT NULL DEFAULT 'Pending',
    review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'sent_back')),
    gps_lat NUMERIC(10,7),
    gps_lng NUMERIC(10,7),
    gps_accuracy NUMERIC(8,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Postgres Function to calculate Result exactly as PRD "Result logic"
-- Logic:
--   blank Found = Pending
--   No = Not Found
--   Not Accessible = Not Accessible
--   physical qty below FAR qty = Qty Short
--   physical qty above FAR qty = Qty Excess
--   condition Poor, Damaged, Idle or Not Working = Verified - Condition Issue
--   tag status other than Tag OK = Verified - Tag Issue
--   otherwise Verified
CREATE OR REPLACE FUNCTION public.calculate_verification_result(
    p_found TEXT,
    p_physical_qty NUMERIC,
    p_far_qty NUMERIC,
    p_condition TEXT,
    p_tag_status TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF p_found IS NULL OR TRIM(p_found) = '' THEN
        RETURN 'Pending';
    ELSIF p_found = 'No' THEN
        RETURN 'Not Found';
    ELSIF p_found = 'Not Accessible' THEN
        RETURN 'Not Accessible';
    ELSIF COALESCE(p_physical_qty, 1) < COALESCE(p_far_qty, 1) THEN
        RETURN 'Qty Short';
    ELSIF COALESCE(p_physical_qty, 1) > COALESCE(p_far_qty, 1) THEN
        RETURN 'Qty Excess';
    ELSIF p_condition IN ('Poor', 'Damaged', 'Idle', 'Not Working') THEN
        RETURN 'Verified - Condition Issue';
    ELSIF p_tag_status NOT IN ('Tag OK', 'OK') THEN
        RETURN 'Verified - Tag Issue';
    ELSE
        RETURN 'Verified';
    END IF;
END;
$$;

-- Trigger to automatically populate `result` before insert/update on `verification`
CREATE OR REPLACE FUNCTION public.trg_auto_set_verification_result()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_far_qty NUMERIC(10,2) := 1;
BEGIN
    -- Look up far_qty from asset master table
    SELECT COALESCE(far_qty, 1) INTO v_far_qty
    FROM public.asset
    WHERE tag_no = NEW.tag_no;

    NEW.result := public.calculate_verification_result(
        NEW.found,
        NEW.physical_qty,
        v_far_qty,
        NEW.condition,
        NEW.tag_status
    );

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verification_result ON public.verification;
CREATE TRIGGER trg_verification_result
    BEFORE INSERT OR UPDATE OF found, physical_qty, condition, tag_status, tag_no
    ON public.verification
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_auto_set_verification_result();

-- 8. Photo Table
CREATE TABLE IF NOT EXISTS public.photo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_id UUID NOT NULL REFERENCES public.verification(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_hash TEXT,
    photo_type TEXT NOT NULL DEFAULT 'asset' CHECK (photo_type IN ('asset', 'tag', 'damage', 'general')),
    taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    gps_lat NUMERIC(10,7),
    gps_lng NUMERIC(10,7),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Found Not in FAR Table
CREATE TABLE IF NOT EXISTS public.found_not_in_far (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID REFERENCES public.engagement(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.location(id) ON DELETE SET NULL,
    tag_found TEXT,
    description TEXT NOT NULL,
    brand_model TEXT,
    serial_no TEXT,
    probable_class TEXT,
    qty NUMERIC(10,2) NOT NULL DEFAULT 1,
    condition TEXT NOT NULL DEFAULT 'Good',
    in_use BOOLEAN NOT NULL DEFAULT true,
    photo_path TEXT,
    client_explanation TEXT,
    resolution TEXT,
    logged_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Movement Table
CREATE TABLE IF NOT EXISTS public.movement (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID REFERENCES public.engagement(id) ON DELETE CASCADE,
    tag_no TEXT NOT NULL,
    from_location_id UUID REFERENCES public.location(id) ON DELETE SET NULL,
    to_location_id UUID REFERENCES public.location(id) ON DELETE SET NULL,
    issue_date DATE,
    receive_date DATE,
    qty NUMERIC(10,2) NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'In Transit' CHECK (status IN ('In Transit', 'Received', 'Returned')),
    gate_pass_no TEXT,
    authorized_by TEXT,
    remarks TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. Doc Check Table (Land, AUC, Clearing)
CREATE TABLE IF NOT EXISTS public.doc_check (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID REFERENCES public.engagement(id) ON DELETE CASCADE,
    tag_no TEXT NOT NULL,
    check_type TEXT NOT NULL,
    document_ref TEXT,
    check_date DATE NOT NULL DEFAULT CURRENT_DATE,
    progress_pct NUMERIC(5,2),
    remarks TEXT,
    checked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. Audit Log Table (Tracking all updates: old_value, new_value, user, timestamp, reason)
CREATE TABLE IF NOT EXISTS public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity TEXT NOT NULL,
    record_id TEXT NOT NULL,
    field TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    reason TEXT,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. Audit Trigger: Writes old/new values to audit_log on every UPDATE
CREATE OR REPLACE FUNCTION public.audit_record_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    r_old JSONB := to_jsonb(OLD);
    r_new JSONB := to_jsonb(NEW);
    col_name TEXT;
    v_old_val TEXT;
    v_new_val TEXT;
    v_record_id TEXT;
    v_changed_by UUID;
BEGIN
    -- Determine record identifier: tag_no if present, otherwise id
    IF r_new ? 'tag_no' THEN
        v_record_id := r_new->>'tag_no';
    ELSIF r_new ? 'id' THEN
        v_record_id := r_new->>'id';
    ELSE
        v_record_id := 'unknown';
    END IF;

    v_changed_by := auth.uid();

    -- Iterate through each modified field
    FOR col_name IN SELECT jsonb_object_keys(r_new)
    LOOP
        -- Ignore internal timestamp columns that change automatically
        IF col_name NOT IN ('updated_at') THEN
            v_old_val := r_old->>col_name;
            v_new_val := r_new->>col_name;

            -- Only log when value has actually changed
            IF (v_old_val IS DISTINCT FROM v_new_val) THEN
                INSERT INTO public.audit_log (
                    entity,
                    record_id,
                    field,
                    old_value,
                    new_value,
                    reason,
                    changed_by,
                    changed_at
                ) VALUES (
                    TG_TABLE_NAME,
                    v_record_id,
                    col_name,
                    v_old_val,
                    v_new_val,
                    'Record updated',
                    v_changed_by,
                    now()
                );
            END IF;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

-- Attach Audit Trigger to tables
DROP TRIGGER IF EXISTS trg_audit_verification ON public.verification;
CREATE TRIGGER trg_audit_verification
    AFTER UPDATE ON public.verification
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_record_update();

DROP TRIGGER IF EXISTS trg_audit_asset ON public.asset;
CREATE TRIGGER trg_audit_asset
    AFTER UPDATE ON public.asset
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_record_update();

DROP TRIGGER IF EXISTS trg_audit_location ON public.location;
CREATE TRIGGER trg_audit_location
    AFTER UPDATE ON public.location
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_record_update();

DROP TRIGGER IF EXISTS trg_audit_movement ON public.movement;
CREATE TRIGGER trg_audit_movement
    AFTER UPDATE ON public.movement
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_record_update();

DROP TRIGGER IF EXISTS trg_audit_found_not_in_far ON public.found_not_in_far;
CREATE TRIGGER trg_audit_found_not_in_far
    AFTER UPDATE ON public.found_not_in_far
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_record_update();

-- 14. Row Level Security (RLS) Configuration

ALTER TABLE public.engagement ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.found_not_in_far ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movement ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_check ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- 14.1 Asset RLS
-- Reviewer / Manager / Admin read all columns including cost and NBV
DROP POLICY IF EXISTS "Auditors above counter can select asset" ON public.asset;
CREATE POLICY "Auditors above counter can select asset"
    ON public.asset FOR SELECT
    TO authenticated
    USING (public.get_current_user_role() IN ('admin', 'manager', 'reviewer', 'team_lead'));

-- Counters read asset through asset_counter_view (View runs as owner without cost/nbv)
-- Only admin writes asset
DROP POLICY IF EXISTS "Only admin writes asset" ON public.asset;
CREATE POLICY "Only admin writes asset"
    ON public.asset FOR ALL
    TO authenticated
    USING (public.get_current_user_role() = 'admin')
    WITH CHECK (public.get_current_user_role() = 'admin');

-- 14.2 Location RLS
-- Everyone can read location
DROP POLICY IF EXISTS "All authenticated users read location" ON public.location;
CREATE POLICY "All authenticated users read location"
    ON public.location FOR SELECT
    TO authenticated
    USING (true);

-- Only admin writes location
DROP POLICY IF EXISTS "Only admin writes location" ON public.location;
CREATE POLICY "Only admin writes location"
    ON public.location FOR ALL
    TO authenticated
    USING (public.get_current_user_role() = 'admin')
    WITH CHECK (public.get_current_user_role() = 'admin');

-- 14.3 Verification RLS
-- Reviewer / Manager / Admin read all verifications
DROP POLICY IF EXISTS "Supervisors read all verifications" ON public.verification;
CREATE POLICY "Supervisors read all verifications"
    ON public.verification FOR SELECT
    TO authenticated
    USING (public.get_current_user_role() IN ('admin', 'manager', 'reviewer', 'team_lead'));

-- Counters read only their own verifications
DROP POLICY IF EXISTS "Counters read own verifications" ON public.verification;
CREATE POLICY "Counters read own verifications"
    ON public.verification FOR SELECT
    TO authenticated
    USING (counter_id = auth.uid());

-- Counters write only their own verifications
DROP POLICY IF EXISTS "Counters write own verifications" ON public.verification;
CREATE POLICY "Counters write own verifications"
    ON public.verification FOR INSERT
    TO authenticated
    WITH CHECK (counter_id = auth.uid() OR public.get_current_user_role() IN ('admin', 'manager', 'reviewer', 'team_lead'));

DROP POLICY IF EXISTS "Counters update own verifications" ON public.verification;
CREATE POLICY "Counters update own verifications"
    ON public.verification FOR UPDATE
    TO authenticated
    USING (counter_id = auth.uid() OR public.get_current_user_role() IN ('admin', 'manager', 'reviewer', 'team_lead'))
    WITH CHECK (counter_id = auth.uid() OR public.get_current_user_role() IN ('admin', 'manager', 'reviewer', 'team_lead'));

-- 14.4 Other Tables RLS
-- Engagement
DROP POLICY IF EXISTS "All users read engagement" ON public.engagement;
CREATE POLICY "All users read engagement"
    ON public.engagement FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Admin and Manager manage engagement" ON public.engagement;
CREATE POLICY "Admin and Manager manage engagement"
    ON public.engagement FOR ALL
    TO authenticated
    USING (public.get_current_user_role() IN ('admin', 'manager'));

-- Photo
DROP POLICY IF EXISTS "All users read photo" ON public.photo;
CREATE POLICY "All users read photo"
    ON public.photo FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Users can insert photo" ON public.photo;
CREATE POLICY "Users can insert photo"
    ON public.photo FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Found Not In FAR
DROP POLICY IF EXISTS "All users read found not in far" ON public.found_not_in_far;
CREATE POLICY "All users read found not in far"
    ON public.found_not_in_far FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Users can insert found not in far" ON public.found_not_in_far;
CREATE POLICY "Users can insert found not in far"
    ON public.found_not_in_far FOR INSERT
    TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Supervisors update found not in far" ON public.found_not_in_far;
CREATE POLICY "Supervisors update found not in far"
    ON public.found_not_in_far FOR UPDATE
    TO authenticated
    USING (public.is_reviewer_or_above());

-- Movement
DROP POLICY IF EXISTS "All users read movement" ON public.movement;
CREATE POLICY "All users read movement"
    ON public.movement FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Users can insert movement" ON public.movement;
CREATE POLICY "Users can insert movement"
    ON public.movement FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Doc Check
DROP POLICY IF EXISTS "All users read doc check" ON public.doc_check;
CREATE POLICY "All users read doc check"
    ON public.doc_check FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Supervisors manage doc check" ON public.doc_check;
CREATE POLICY "Supervisors manage doc check"
    ON public.doc_check FOR ALL
    TO authenticated
    USING (public.is_reviewer_or_above());

-- Audit Log
DROP POLICY IF EXISTS "Supervisors read audit log" ON public.audit_log;
CREATE POLICY "Supervisors read audit log"
    ON public.audit_log FOR SELECT
    TO authenticated
    USING (public.is_reviewer_or_above());

-- 15. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_asset_tag_no ON public.asset(tag_no);
CREATE INDEX IF NOT EXISTS idx_asset_class ON public.asset(asset_class);
CREATE INDEX IF NOT EXISTS idx_verification_tag_no ON public.verification(tag_no);
CREATE INDEX IF NOT EXISTS idx_verification_counter ON public.verification(counter_id);
CREATE INDEX IF NOT EXISTS idx_verification_location ON public.verification(location_id);
CREATE INDEX IF NOT EXISTS idx_verification_result ON public.verification(result);
CREATE INDEX IF NOT EXISTS idx_photo_verification ON public.photo(verification_id);
CREATE INDEX IF NOT EXISTS idx_location_assigned ON public.location(assigned_counter);
