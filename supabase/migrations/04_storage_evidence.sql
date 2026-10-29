-- ====================================================================
-- ACNABIN FA Count - Step 5: Storage Bucket for Evidence Photos
-- File: supabase/migrations/04_storage_evidence.sql
-- ====================================================================

-- 1. Create the private 'evidence' storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'evidence', 
    'evidence', 
    false, 
    5242880, -- 5MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 5242880;

-- 2. Storage RLS Policies: Authenticated auditors can upload and view evidence photos
DROP POLICY IF EXISTS "Auditors can upload evidence photos" ON storage.objects;
CREATE POLICY "Auditors can upload evidence photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'evidence');

DROP POLICY IF EXISTS "Auditors can view evidence photos" ON storage.objects;
CREATE POLICY "Auditors can view evidence photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'evidence');

DROP POLICY IF EXISTS "Auditors can update evidence photos" ON storage.objects;
CREATE POLICY "Auditors can update evidence photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'evidence');

