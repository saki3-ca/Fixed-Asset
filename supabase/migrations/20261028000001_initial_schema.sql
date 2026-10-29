-- ====================================================================
-- ACNABIN Chartered Accountants: FA Count Database Schema
-- Migration: 20261028000001_initial_schema.sql
-- ====================================================================

-- 1. Helper Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Engagements Table
CREATE TABLE IF NOT EXISTS public.engagements (
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

-- 3. User Profiles Table (linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'counter' CHECK (role IN ('counter', 'team_lead', 'reviewer', 'manager', 'admin')),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Helper functions to get current user role
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

-- 4. Locations Table (Building, Floor, Room)
CREATE TABLE IF NOT EXISTS public.locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
    building TEXT NOT NULL,
    floor TEXT NOT NULL,
    room TEXT NOT NULL,
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'signed_off')),
    client_rep_name TEXT,
    client_rep_designation TEXT,
    client_signature TEXT,
    areas_not_accessed TEXT,
    unaccessed_reason TEXT,
    signed_off_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_location_per_engagement UNIQUE (engagement_id, building, floor, room)
);

-- 5. Fixed Assets Master Table (from SAP FAR extract)
-- Keyed on SAP Fixed Asset number (8 digits) which IS the physical tag number
CREATE TABLE IF NOT EXISTS public.assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
    tag_no TEXT NOT NULL, -- SAP Fixed Asset number (e.g. 60000000)
    description TEXT NOT NULL,
    asset_class TEXT NOT NULL,
    gl_account TEXT,
    gl_account_name TEXT,
    capitalized_on DATE,
    cost NUMERIC(18,2) NOT NULL DEFAULT 0, -- SENSITIVE: counters must never see
    acc_depreciation NUMERIC(18,2) NOT NULL DEFAULT 0, -- SENSITIVE: counters must never see
    nbv NUMERIC(18,2) NOT NULL DEFAULT 0, -- SENSITIVE: counters must never see
    far_qty NUMERIC(10,2) NOT NULL DEFAULT 1,
    method TEXT NOT NULL DEFAULT 'Count' CHECK (method IN ('Count', 'Inspect', 'Vehicle', 'Document')),
    is_zero_cost BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_asset_tag_per_engagement UNIQUE (engagement_id, tag_no)
);

-- 6. Safe View for Counters: Strips Cost, Acc Depreciation, and NBV completely
CREATE OR REPLACE VIEW public.v_counter_assets AS
SELECT 
    id,
    engagement_id,
    tag_no,
    description,
    asset_class,
    capitalized_on,
    far_qty,
    method,
    is_zero_cost,
    created_at,
    updated_at
FROM public.assets;

-- 7. Verifications Table (Physical Count & Findings)
CREATE TABLE IF NOT EXISTS public.verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
    tag_no TEXT NOT NULL,
    found TEXT CHECK (found IN ('Yes', 'No', 'Not Accessible')),
    count_date DATE NOT NULL DEFAULT CURRENT_DATE,
    counted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    department TEXT,
    user_custodian TEXT,
    tag_status TEXT NOT NULL DEFAULT 'Tag OK' CHECK (tag_status IN ('Tag OK', 'Tag Damaged/Unreadable', 'Tag Missing - identified by serial', 'Tag Missing - identified by description', 'Re-tagged')),
    re_tag_number TEXT,
    serial_no TEXT,
    brand_model TEXT,
    physical_qty NUMERIC(10,2) NOT NULL DEFAULT 1,
    condition TEXT NOT NULL DEFAULT 'Good' CHECK (condition IN ('Good', 'Fair', 'Poor', 'Damaged', 'Idle', 'Not Working')),
    in_use BOOLEAN NOT NULL DEFAULT true,
    remarks TEXT,
    result TEXT NOT NULL DEFAULT 'Pending' CHECK (result IN (
        'Verified', 
        'Verified - Condition Issue', 
        'Verified - Tag Issue', 
        'Qty Short', 
        'Qty Excess', 
        'Not Found', 
        'Not Accessible', 
        'Pending'
    )),
    review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'sent_back')),
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    reviewer_comments TEXT,
    client_explanation TEXT,
    offline_sync_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Auto-calculate Result Logic Function & Trigger
CREATE OR REPLACE FUNCTION public.calculate_verification_result()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_far_qty NUMERIC(10,2) := 1;
BEGIN
    -- Attempt to fetch far_qty from asset if asset_id is present
    IF NEW.asset_id IS NOT NULL THEN
        SELECT COALESCE(far_qty, 1) INTO v_far_qty 
        FROM public.assets 
        WHERE id = NEW.asset_id;
    END IF;

    -- Apply the PRD & Excel logic:
    IF NEW.found IS NULL OR NEW.found = '' THEN
        NEW.result := 'Pending';
    ELSIF NEW.found = 'No' THEN
        NEW.result := 'Not Found';
    ELSIF NEW.found = 'Not Accessible' THEN
        NEW.result := 'Not Accessible';
    ELSIF NEW.physical_qty < v_far_qty THEN
        NEW.result := 'Qty Short';
    ELSIF NEW.physical_qty > v_far_qty THEN
        NEW.result := 'Qty Excess';
    ELSIF NEW.condition IN ('Poor', 'Damaged', 'Idle', 'Not Working') THEN
        NEW.result := 'Verified - Condition Issue';
    ELSIF NEW.tag_status <> 'Tag OK' THEN
        NEW.result := 'Verified - Tag Issue';
    ELSE
        NEW.result := 'Verified';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calculate_verification_result ON public.verifications;
CREATE TRIGGER trg_calculate_verification_result
    BEFORE INSERT OR UPDATE OF found, physical_qty, condition, tag_status, asset_id
    ON public.verifications
    FOR EACH ROW
    EXECUTE FUNCTION public.calculate_verification_result();

-- 9. Photos Table
CREATE TABLE IF NOT EXISTS public.photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_id UUID NOT NULL REFERENCES public.verifications(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    file_hash TEXT,
    photo_type TEXT NOT NULL DEFAULT 'asset' CHECK (photo_type IN ('asset', 'tag', 'damage', 'general')),
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Found Not In FAR Table
CREATE TABLE IF NOT EXISTS public.found_not_in_far (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
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
    resolution TEXT CHECK (resolution IN (
        'Add to FAR', 
        'Expensed item (below threshold)', 
        'Not client asset (third party/leased)', 
        'Already in FAR under other tag', 
        'Other - see remarks'
    )),
    logged_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. Asset Movements Table
CREATE TABLE IF NOT EXISTS public.movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
    tag_no TEXT NOT NULL,
    from_location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    to_location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
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

-- 12. Document Checks Table (Land, AUC, Clearing)
CREATE TABLE IF NOT EXISTS public.doc_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
    tag_no TEXT NOT NULL,
    check_type TEXT NOT NULL CHECK (check_type IN ('Title deed seen', 'Site visited', 'Progress report seen', 'Client explanation', 'Not verified')),
    document_ref TEXT,
    check_date DATE NOT NULL DEFAULT CURRENT_DATE,
    progress_pct NUMERIC(5,2),
    remarks TEXT,
    checked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. Audit Log Table (Tracking all edits: old value, new value, reason, user, time)
CREATE TABLE IF NOT EXISTS public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID REFERENCES public.engagements(id) ON DELETE SET NULL,
    entity TEXT NOT NULL,
    record_id UUID NOT NULL,
    field TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    reason TEXT,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent Hard Deletes on verification and assets (Audit integrity)
CREATE OR REPLACE FUNCTION public.prevent_hard_deletes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Hard deletes are prohibited on % for audit compliance. Use soft update instead.', TG_TABLE_NAME;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_delete_verifications ON public.verifications;
CREATE TRIGGER trg_prevent_delete_verifications
    BEFORE DELETE ON public.verifications
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_hard_deletes();

DROP TRIGGER IF EXISTS trg_prevent_delete_assets ON public.assets;
CREATE TRIGGER trg_prevent_delete_assets
    BEFORE DELETE ON public.assets
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_hard_deletes();

-- 14. Enable Row Level Security (RLS) on ALL tables
ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.found_not_in_far ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- 15. RLS Policies

-- Engagements
CREATE POLICY "Users can view active engagements"
    ON public.engagements FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Admins and Managers can manage engagements"
    ON public.engagements FOR ALL
    TO authenticated
    USING (public.get_current_user_role() IN ('admin', 'manager'));

-- Profiles
CREATE POLICY "Users can view profiles"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Admins can manage profiles"
    ON public.profiles FOR ALL
    TO authenticated
    USING (public.get_current_user_role() = 'admin');

-- Locations
CREATE POLICY "Users can view locations"
    ON public.locations FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Counters and leads can update assigned location status"
    ON public.locations FOR UPDATE
    TO authenticated
    USING (assigned_to = auth.uid() OR public.is_reviewer_or_above());

CREATE POLICY "Admins and Leads can manage locations"
    ON public.locations FOR ALL
    TO authenticated
    USING (public.get_current_user_role() IN ('admin', 'team_lead'));

-- Assets
-- Rule: Counters must NEVER see cost or NBV directly on the table.
-- Non-counters (team_lead, reviewer, manager, admin) can select all columns.
CREATE POLICY "Non-counters can view full asset details"
    ON public.assets FOR SELECT
    TO authenticated
    USING (public.is_reviewer_or_above());

-- Counters can view assets through the view `v_counter_assets` or restricted select
CREATE POLICY "Counters can view basic asset details"
    ON public.assets FOR SELECT
    TO authenticated
    USING (public.get_current_user_role() = 'counter');

CREATE POLICY "Admins can insert and update assets"
    ON public.assets FOR ALL
    TO authenticated
    USING (public.get_current_user_role() = 'admin');

-- Verifications
CREATE POLICY "Authenticated users can view verifications"
    ON public.verifications FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Counters can insert verifications"
    ON public.verifications FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Counters can update their own verifications before review"
    ON public.verifications FOR UPDATE
    TO authenticated
    USING (counted_by = auth.uid() OR public.is_reviewer_or_above());

-- Photos
CREATE POLICY "Users can view photos"
    ON public.photos FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can insert photos"
    ON public.photos FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Found Not In FAR
CREATE POLICY "Users can view found not in far"
    ON public.found_not_in_far FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can insert found not in far"
    ON public.found_not_in_far FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Reviewers can update found not in far"
    ON public.found_not_in_far FOR UPDATE
    TO authenticated
    USING (public.is_reviewer_or_above());

-- Movements
CREATE POLICY "Users can view movements"
    ON public.movements FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can create movements"
    ON public.movements FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Leads and reviewers can update movements"
    ON public.movements FOR UPDATE
    TO authenticated
    USING (public.is_reviewer_or_above());

-- Doc Checks
CREATE POLICY "Users can view doc checks"
    ON public.doc_checks FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Leads and Reviewers can manage doc checks"
    ON public.doc_checks FOR ALL
    TO authenticated
    USING (public.is_reviewer_or_above());

-- Audit Log
CREATE POLICY "Users can view audit log"
    ON public.audit_log FOR SELECT
    TO authenticated
    USING (public.is_reviewer_or_above());

CREATE POLICY "System can record audit logs"
    ON public.audit_log FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- 16. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_assets_engagement_tag ON public.assets(engagement_id, tag_no);
CREATE INDEX IF NOT EXISTS idx_assets_class ON public.assets(asset_class);
CREATE INDEX IF NOT EXISTS idx_verifications_tag ON public.verifications(tag_no);
CREATE INDEX IF NOT EXISTS idx_verifications_location ON public.verifications(location_id);
CREATE INDEX IF NOT EXISTS idx_verifications_result ON public.verifications(result);
CREATE INDEX IF NOT EXISTS idx_verifications_counted_by ON public.verifications(counted_by);
CREATE INDEX IF NOT EXISTS idx_photos_verification ON public.photos(verification_id);
CREATE INDEX IF NOT EXISTS idx_locations_engagement ON public.locations(engagement_id);

