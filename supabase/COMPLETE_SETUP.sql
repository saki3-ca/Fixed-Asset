-- ====================================================================
-- ACNABIN Chartered Accountants: FA Count
-- COMPLETE DATABASE SETUP SCRIPT (Run Once in Supabase SQL Editor)
-- Project: https://supabase.com/dashboard/project/jeccxujgvezkkdvuoyxk/sql/new
-- ====================================================================

-- 1. Helper Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. User Profiles Table (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'counter' CHECK (role IN ('admin', 'team_lead', 'counter', 'reviewer', 'manager')),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: Auto-create profile when a user signs up or is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'counter'),
    true
  )
  ON CONFLICT (id) DO UPDATE 
  SET full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      role = COALESCE(EXCLUDED.role, profiles.role);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper function to get current user role
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

-- 3. Engagement Table
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

-- Default Engagement row for Marico / Remarks HB Limited
INSERT INTO public.engagement (id, client_name, financial_year, far_cutoff_date, status)
VALUES ('11111111-1111-1111-1111-111111111111', 'Remarks HB Limited', 'FY25', '2025-06-30', 'active')
ON CONFLICT (id) DO NOTHING;

-- 4. Location Table
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

-- Seed initial default rooms
INSERT INTO public.location (engagement_id, building, floor, room, status)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Head Office', '2nd Floor', 'Room 202', 'open'),
  ('11111111-1111-1111-1111-111111111111', 'Head Office', '2nd Floor', 'Server Room', 'open'),
  ('11111111-1111-1111-1111-111111111111', 'Head Office', '3rd Floor', 'Finance Department', 'open'),
  ('11111111-1111-1111-1111-111111111111', 'Factory Plant', 'Ground Floor', 'Main Production Line', 'open')
ON CONFLICT (building, floor, room) DO NOTHING;

-- 5. Asset Master Table (tag_no PK = 8-digit SAP number)
CREATE TABLE IF NOT EXISTS public.asset (
    tag_no TEXT PRIMARY KEY,
    engagement_id UUID REFERENCES public.engagement(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    asset_class TEXT NOT NULL,
    gl_account TEXT,
    capitalized_on DATE,
    cost NUMERIC(18,2) NOT NULL DEFAULT 0,
    acc_dep NUMERIC(18,2) NOT NULL DEFAULT 0,
    nbv NUMERIC(18,2) NOT NULL DEFAULT 0,
    far_qty NUMERIC(10,2) NOT NULL DEFAULT 1,
    method TEXT NOT NULL DEFAULT 'Count' CHECK (method IN ('Count', 'Inspect', 'Vehicle', 'Document')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Safe View for Counters (No Cost, Acc Dep, or NBV)
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

-- 7. Verification Table
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

-- Auto-result calculation function
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

-- Trigger to calculate result automatically
CREATE OR REPLACE FUNCTION public.trg_auto_set_verification_result()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_far_qty NUMERIC(10,2) := 1;
BEGIN
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

-- 11. Doc Check Table
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

-- 12. Audit Log Table
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

-- Audit Trigger function
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
    IF r_new ? 'tag_no' THEN
        v_record_id := r_new->>'tag_no';
    ELSIF r_new ? 'id' THEN
        v_record_id := r_new->>'id';
    ELSE
        v_record_id := 'unknown';
    END IF;

    v_changed_by := auth.uid();

    FOR col_name IN SELECT jsonb_object_keys(r_new)
    LOOP
        IF col_name NOT IN ('updated_at') THEN
            v_old_val := r_old->>col_name;
            v_new_val := r_new->>col_name;

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

DROP TRIGGER IF EXISTS trg_audit_verification ON public.verification;
CREATE TRIGGER trg_audit_verification
    AFTER UPDATE ON public.verification
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_record_update();

-- 13. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.found_not_in_far ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movement ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_check ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- 14. Core RLS Policies
DROP POLICY IF EXISTS "Authenticated users read profiles" ON public.profiles;
CREATE POLICY "Authenticated users read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "All users read location" ON public.location;
CREATE POLICY "All users read location" ON public.location FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Only admin writes location" ON public.location;
CREATE POLICY "Only admin writes location" ON public.location FOR ALL TO authenticated USING (public.get_current_user_role() = 'admin') WITH CHECK (public.get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "Auditors above counter select asset" ON public.asset;
CREATE POLICY "Auditors above counter select asset" ON public.asset FOR SELECT TO authenticated USING (public.is_reviewer_or_above());

DROP POLICY IF EXISTS "Only admin writes asset" ON public.asset;
CREATE POLICY "Only admin writes asset" ON public.asset FOR ALL TO authenticated USING (public.get_current_user_role() = 'admin') WITH CHECK (public.get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "Supervisors read all verifications" ON public.verification;
CREATE POLICY "Supervisors read all verifications" ON public.verification FOR SELECT TO authenticated USING (public.is_reviewer_or_above());

DROP POLICY IF EXISTS "Counters read own verifications" ON public.verification;
CREATE POLICY "Counters read own verifications" ON public.verification FOR SELECT TO authenticated USING (counter_id = auth.uid());

DROP POLICY IF EXISTS "Counters write own verifications" ON public.verification;
CREATE POLICY "Counters write own verifications" ON public.verification FOR INSERT TO authenticated WITH CHECK (counter_id = auth.uid() OR public.is_reviewer_or_above());

DROP POLICY IF EXISTS "Counters update own verifications" ON public.verification;
CREATE POLICY "Counters update own verifications" ON public.verification FOR UPDATE TO authenticated USING (counter_id = auth.uid() OR public.is_reviewer_or_above());

DROP POLICY IF EXISTS "All users read photo" ON public.photo;
CREATE POLICY "All users read photo" ON public.photo FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users insert photo" ON public.photo;
CREATE POLICY "Users insert photo" ON public.photo FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "All users read found not in far" ON public.found_not_in_far;
CREATE POLICY "All users read found not in far" ON public.found_not_in_far FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users insert found not in far" ON public.found_not_in_far;
CREATE POLICY "Users insert found not in far" ON public.found_not_in_far FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "All users read movement" ON public.movement;
CREATE POLICY "All users read movement" ON public.movement FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users insert movement" ON public.movement;
CREATE POLICY "Users insert movement" ON public.movement FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "All users read doc check" ON public.doc_check;
CREATE POLICY "All users read doc check" ON public.doc_check FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Supervisors read audit log" ON public.audit_log;
CREATE POLICY "Supervisors read audit log" ON public.audit_log FOR SELECT TO authenticated USING (public.is_reviewer_or_above());

-- Backfill existing auth users into profiles
INSERT INTO public.profiles (id, email, full_name, role, active)
SELECT 
    id, 
    email, 
    COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)), 
    COALESCE(raw_user_meta_data->>'role', 'admin'), 
    true
FROM auth.users
ON CONFLICT (id) DO UPDATE 
SET email = EXCLUDED.email,
    role = EXCLUDED.role;
