-- ====================================================================
-- Field locations: auditors add and complete locations while counting.
-- Run AFTER 06_logic_fixes.sql. Safe to re-run.
-- ====================================================================

ALTER TABLE public.location
  ADD COLUMN IF NOT EXISTS custodian TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- A location can start as just a building ("Building 4"); floor and room are filled in later.
-- Empty text (not NULL) keeps the existing (building, floor, room) uniqueness working.
ALTER TABLE public.location ALTER COLUMN floor SET DEFAULT '';
ALTER TABLE public.location ALTER COLUMN room SET DEFAULT '';

-- Add a location, or return the one that already exists with the same building / floor / room.
CREATE OR REPLACE FUNCTION public.add_location(
  p_building TEXT, p_floor TEXT, p_room TEXT, p_custodian TEXT
) RETURNS public.location
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role TEXT;
  v_eng UUID;
  v_loc public.location%ROWTYPE;
BEGIN
  v_role := public.get_current_user_role();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'team_lead', 'counter') THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF COALESCE(trim(p_building), '') = '' THEN RAISE EXCEPTION 'Building / site name is required'; END IF;

  SELECT id INTO v_eng FROM public.engagement ORDER BY created_at LIMIT 1;

  INSERT INTO public.location (engagement_id, building, floor, room, custodian, assigned_counter, created_by, status)
  VALUES (v_eng, trim(p_building), COALESCE(trim(p_floor), ''), COALESCE(trim(p_room), ''),
          NULLIF(trim(p_custodian), ''), auth.uid(), auth.uid(), 'open')
  ON CONFLICT (building, floor, room) DO UPDATE
    SET custodian = COALESCE(NULLIF(trim(p_custodian), ''), public.location.custodian)
    WHERE public.location.status <> 'signed_off'
  RETURNING * INTO v_loc;

  -- Signed-off rooms are never modified: return the existing row unchanged
  IF NOT FOUND THEN
    SELECT * INTO v_loc FROM public.location
    WHERE building = trim(p_building) AND floor = COALESCE(trim(p_floor), '') AND room = COALESCE(trim(p_room), '');
  END IF;

  RETURN v_loc;
END;
$$;

-- Fill in details later: "floor 2", "Admin Office", "user Mr X".
CREATE OR REPLACE FUNCTION public.update_location_details(
  p_location UUID, p_floor TEXT, p_room TEXT, p_custodian TEXT
) RETURNS public.location
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_loc public.location%ROWTYPE;
BEGIN
  IF COALESCE(public.get_current_user_role(), '') NOT IN ('admin', 'team_lead', 'counter') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  SELECT * INTO v_loc FROM public.location WHERE id = p_location;
  IF NOT FOUND THEN RAISE EXCEPTION 'Location not found'; END IF;
  IF v_loc.status = 'signed_off' THEN RAISE EXCEPTION 'This location is signed off. Ask a Team Lead to reopen it.'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.location
    WHERE building = v_loc.building AND floor = COALESCE(trim(p_floor), '') AND room = COALESCE(trim(p_room), '')
      AND id <> p_location
  ) THEN
    RAISE EXCEPTION 'That floor / room already exists in % . Select it from the list instead.', v_loc.building;
  END IF;

  UPDATE public.location SET
    floor = COALESCE(trim(p_floor), ''),
    room = COALESCE(trim(p_room), ''),
    custodian = NULLIF(trim(p_custodian), ''),
    updated_at = now()
  WHERE id = p_location
  RETURNING * INTO v_loc;

  INSERT INTO public.audit_log (entity, record_id, field, old_value, new_value, reason, changed_by)
  VALUES ('location', p_location::text, 'details', NULL,
          concat_ws(' / ', NULLIF(v_loc.floor, ''), NULLIF(v_loc.room, ''), v_loc.custodian),
          'Location details updated in the field', auth.uid());

  RETURN v_loc;
END;
$$;

-- Any active counter may close a room in the field (the client signs on their device)
CREATE OR REPLACE FUNCTION public.close_location(
  p_location UUID, p_areas TEXT, p_reason TEXT,
  p_rep_name TEXT, p_rep_designation TEXT, p_signature TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role TEXT; v_loc public.location%ROWTYPE;
BEGIN
  v_role := public.get_current_user_role();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'team_lead', 'counter') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  SELECT * INTO v_loc FROM public.location WHERE id = p_location;
  IF NOT FOUND THEN RAISE EXCEPTION 'Location not found'; END IF;
  IF v_loc.status = 'signed_off' THEN RAISE EXCEPTION 'This location is already signed off'; END IF;
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

REVOKE EXECUTE ON FUNCTION public.add_location(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_location_details(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_location(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_location_details(UUID, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
